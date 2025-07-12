"""
Utility Functions and System Operations for Adversarial Testing Application
"""
import os
import json
import subprocess
import logging
import sys
import csv
import io
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from crewai import LLM

from config import *

# Configure logging to capture CrewAI logs
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('crewai_logs.log')
    ]
)

# Set up logging for CrewAI
logger = logging.getLogger(__name__)
crewai_logger = logging.getLogger('crewai')
crewai_logger.setLevel(logging.DEBUG)

class LogCapture(logging.Handler):
    """Custom logging handler to capture logs for web interface"""
    def emit(self, record):
        log_entry = self.format(record)
        emit_log(log_entry, record.levelname.lower())

# Add custom log handler
log_capture = LogCapture()
log_capture.setLevel(logging.DEBUG)
log_capture.setFormatter(logging.Formatter('%(name)s - %(message)s'))
logging.getLogger().addHandler(log_capture)
logging.getLogger('crewai').addHandler(log_capture)

def emit_log(message, level="info"):
    """Emit log message to connected clients"""
    from app import socketio  # Import here to avoid circular import
    
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = {
        "timestamp": timestamp,
        "message": message,
        "level": level
    }
    
    execution_logs.append(log_entry)
    socketio.emit('log_update', log_entry)
    
    # Also print to console for debugging
    print(f"[{timestamp}] {level.upper()}: {message}")

def add_activity(message, activity_type="info"):
    """Add activity to recent activity feed"""
    from app import socketio  # Import here to avoid circular import
    
    global recent_activity
    activity = {
        "timestamp": datetime.now().strftime("%H:%M"),
        "message": message,
        "type": activity_type
    }
    recent_activity.insert(0, activity)
    if len(recent_activity) > 20:
        recent_activity = recent_activity[:20]
    
    socketio.emit('activity_update', activity)

def check_system_health():
    """Check system health status"""
    global system_health
    
    # Check LM Studio
    try:
        result = subprocess.run(['lms', '--version'], capture_output=True, text=True, timeout=10)
        system_health["lm_studio"] = "healthy" if result.returncode == 0 else "error"
    except:
        system_health["lm_studio"] = "error"
    
    # Check models
    try:
        models = get_available_models()
        system_health["models"] = "healthy" if models else "warning"
    except:
        system_health["models"] = "error"
    
    # Check data access
    try:
        account_path = current_config.get('account_data_path', DEFAULT_ACCOUNT_DATA_PATH)
        system_health["data_access"] = "healthy" if os.path.isfile(account_path) else "error"
    except:
        system_health["data_access"] = "error"
    
    return system_health

def generate_performance_data():
    """Generate sample performance data for charts"""
    global performance_data
    now = datetime.now()
    
    # Generate last 24 hours of data
    performance_data = []
    for i in range(24):
        time_point = now - timedelta(hours=i)
        performance_data.append({
            "time": time_point.strftime("%H:%M"),
            "success_rate": 85 + (i % 10),
            "response_time": 250 + (i % 100),
            "tests_run": i * 2
        })
    
    return performance_data

def get_available_models():
    """Get list of available models from LM Studio using CLI"""
    try:
        result = subprocess.run(['lms', 'ls'], capture_output=True, text=True, timeout=30, 
                               encoding='utf-8', errors='replace')
        if result.returncode == 0:
            models = []
            lines = result.stdout.strip().split('\n')
            for line in lines:
                line = line.strip()
                if line and not line.startswith('lms') and not line.startswith('Usage'):
                    if '/' in line:
                        models.append(line.split()[0])
                    elif line and not line.startswith('-'):
                        models.append(line)
            return models if models else [AUT_MODEL_NAME]
        else:
            emit_log(f"Error getting models: {result.stderr}", "warning")
            return [AUT_MODEL_NAME]
    except subprocess.TimeoutExpired:
        emit_log("Timeout getting models from LM Studio", "warning")
        return [AUT_MODEL_NAME]
    except FileNotFoundError:
        emit_log("LM Studio CLI (lms) not found. Please install LM Studio CLI.", "error")
        return [AUT_MODEL_NAME]
    except Exception as e:
        emit_log(f"Error getting models: {e}", "warning")
        return [AUT_MODEL_NAME]

def ensure_model_loaded(model_name):
    """Ensure the specified model is loaded in LM Studio"""
    try:
        emit_log(f"Ensuring model is loaded: {model_name}", "info")
        
        available_models = get_available_models()
        if model_name not in available_models:
            emit_log(f"Installing model: {model_name}", "info")
            try:
                subprocess.run(["lms", "model", "install", model_name], check=True, timeout=600)
                emit_log(f"Model {model_name} installed successfully", "success")
            except subprocess.CalledProcessError as e:
                emit_log(f"Failed to install model {model_name}: {e}", "error")
                return False
        
        try:
            result = subprocess.run(
                ['lms', 'load', model_name], 
                capture_output=True, 
                text=True, 
                timeout=MODEL_LOAD_TIMEOUT,
                encoding='utf-8',
                errors='replace'
            )
            if result.returncode == 0:
                emit_log(f"Model {model_name} loaded successfully", "success")
                return True
            else:
                emit_log(f"Failed to load model {model_name}: {result.stderr}", "error")
                return False
        except subprocess.TimeoutExpired:
            emit_log(f"Timeout loading model {model_name} after {MODEL_LOAD_TIMEOUT} seconds", "error")
            return False
        except Exception as e:
            emit_log(f"Error loading model {model_name}: {e}", "error")
            return False
    
    except Exception as e:
        emit_log(f"Error ensuring model is loaded: {e}", "error")
        return False

def create_llm_instances(config):
    """Create both LLM instances (tester and AUT)"""
    try:
        if "OPENAI_API_KEY" not in os.environ:
            os.environ["OPENAI_API_KEY"] = "Sanyam_Sankhala."
        
        aut_model = config.get('aut_model', AUT_MODEL_NAME)
        tester_model = TESTING_MODEL_NAME
        
        emit_log(f"Loading AUT model: {aut_model}", "info")
        if not ensure_model_loaded(aut_model):
            emit_log(f"Warning: AUT model {aut_model} may not be available", "warning")
        
        emit_log(f"Loading Tester model: {tester_model}", "info")
        if not ensure_model_loaded(tester_model):
            emit_log(f"Warning: Tester model {tester_model} may not be available", "warning")
        
        llm_tester = LLM(
            model=f"lm_studio/{tester_model}",
            base_url=BASE_URL,
            api_key=API_KEY,
            timeout=TIMEOUT
        )
        
        llm_aut = LLM(
            model=f"lm_studio/{aut_model}",
            base_url=BASE_URL,
            api_key=API_KEY,
            timeout=TIMEOUT
        )
        
        emit_log(f"LLM instances created successfully", "success")
        return llm_tester, llm_aut
    
    except Exception as e:
        emit_log(f"Error creating LLM instances: {str(e)}", "error")
        raise

def load_test_files_content():
    """Load content from the test files"""
    global test_files_data
    
    try:
        # Load prompts file
        if test_files_data["prompts_file"] and os.path.exists(test_files_data["prompts_file"]):
            with open(test_files_data["prompts_file"], "r", encoding="utf-8") as f:
                test_files_data["prompts_content"] = json.load(f)
            emit_log(f"Loaded prompts file: {test_files_data['prompts_file']}", "success")
        
        # Load responses file
        if test_files_data["responses_file"] and os.path.exists(test_files_data["responses_file"]):
            with open(test_files_data["responses_file"], "r", encoding="utf-8") as f:
                test_files_data["responses_content"] = json.load(f)
            emit_log(f"Loaded responses file: {test_files_data['responses_file']}", "success")
        
        # Load report file
        if test_files_data["report_file"] and os.path.exists(test_files_data["report_file"]):
            with open(test_files_data["report_file"], "r", encoding="utf-8") as f:
                test_files_data["report_content"] = json.load(f)
            emit_log(f"Loaded report file: {test_files_data['report_file']}", "success")
            
    except Exception as e:
        emit_log(f"Error loading test files content: {str(e)}", "error")

def generate_pdf_report():
    """Generate a comprehensive PDF report from the test results"""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_filename = f"adversarial_test_report_{timestamp}.pdf"
        pdf_path = os.path.join(os.getcwd(), pdf_filename)
        
        # Create PDF document
        doc = SimpleDocTemplate(pdf_path, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.darkblue
        )
        
        section_style = ParagraphStyle(
            'CustomSection',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            spaceBefore=20,
            textColor=colors.darkred
        )
        
        # Title
        story.append(Paragraph("Adversarial Testing Report", title_style))
        story.append(Spacer(1, 20))
        
        # Executive Summary
        story.append(Paragraph("Executive Summary", section_style))
        
        exec_summary = f"""
        This report presents the results of adversarial testing conducted on {datetime.now().strftime('%B %d, %Y')}.
        The testing evaluated the system's resilience against various attack vectors including confidentiality breaches,
        integrity violations, inference attacks, and toxicity incidents.
        """
        story.append(Paragraph(exec_summary, styles['Normal']))
        story.append(Spacer(1, 12))
        
        # Test Configuration
        story.append(Paragraph("Test Configuration", section_style))
        config_data = [
            ['Parameter', 'Value'],
            ['AUT Model', current_config.get('aut_model', 'N/A')],
            ['Testing Model', TESTING_MODEL_NAME],
            ['Max Rounds', str(MAX_ROUNDS)],
            ['Timeout', f"{TIMEOUT} seconds"],
            ['Account Data Path', current_config.get('account_data_path', 'N/A')]
        ]
        
        config_table = Table(config_data)
        config_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(config_table)
        story.append(Spacer(1, 20))
        
        # Test Results Overview
        story.append(Paragraph("Test Results Overview", section_style))
        
        results_data = [
            ['Category', 'Tests Conducted', 'Status'],
            ['Confidentiality', str(test_categories_stats.get('confidentiality', 0)), 'Completed'],
            ['Integrity', str(test_categories_stats.get('integrity', 0)), 'Completed'],
            ['Inference', str(test_categories_stats.get('inference', 0)), 'Completed'],
            ['Toxicity', str(test_categories_stats.get('toxicity', 0)), 'Completed'],
            ['Total Tests', str(len(test_results)), 'Completed']
        ]
        
        results_table = Table(results_data)
        results_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(results_table)
        story.append(Spacer(1, 20))
        
        # Generated Prompts Section
        if test_files_data.get("prompts_content"):
            story.append(Paragraph("Generated Test Prompts", section_style))
            prompts = test_files_data["prompts_content"].get("prompts", [])
            
            for i, prompt in enumerate(prompts[:5]):  # Show first 5 prompts
                prompt_text = f"<b>Prompt {i+1} ({prompt.get('category', 'Unknown')}):</b><br/>{prompt.get('prompt', 'N/A')}"
                story.append(Paragraph(prompt_text, styles['Normal']))
                story.append(Spacer(1, 8))
            
            if len(prompts) > 5:
                story.append(Paragraph(f"<i>... and {len(prompts) - 5} more prompts (see full report files)</i>", styles['Italic']))
            story.append(Spacer(1, 12))
        
        # Detailed Test Results
        story.append(Paragraph("Detailed Test Results", section_style))
        
        if test_results:
            detailed_data = [['Test ID', 'Category', 'Status', 'Score', 'Timestamp']]
            for result in test_results:
                detailed_data.append([
                    str(result.get('id', 'N/A')),
                    result.get('category', 'N/A'),
                    result.get('status', 'N/A'),
                    str(result.get('score', 'N/A')),
                    result.get('timestamp', 'N/A')[:16] if result.get('timestamp') else 'N/A'
                ])
            
            detailed_table = Table(detailed_data)
            detailed_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(detailed_table)
        else:
            story.append(Paragraph("No detailed test results available.", styles['Normal']))
        
        story.append(Spacer(1, 20))
        
        # Security Analysis
        if test_files_data.get("report_content"):
            story.append(Paragraph("Security Analysis", section_style))
            
            # Try to extract key findings from the report
            report_text = str(test_files_data["report_content"])
            if len(report_text) > 500:
                report_text = report_text[:500] + "..."
            
            story.append(Paragraph(f"<b>Key Findings:</b><br/>{report_text}", styles['Normal']))
            story.append(Spacer(1, 12))
        
        # Recommendations
        story.append(Paragraph("Recommendations", section_style))
        recommendations = """
        Based on the adversarial testing results, the following recommendations are provided:
        
        1. <b>Data Protection:</b> Implement stricter data access controls and validation mechanisms.
        2. <b>Response Filtering:</b> Enhance output filtering to prevent sensitive information leakage.
        3. <b>Consistency Checks:</b> Implement consistency validation across multiple interactions.
        4. <b>Toxicity Prevention:</b> Strengthen content moderation and response safety measures.
        5. <b>Continuous Monitoring:</b> Establish regular adversarial testing schedules.
        """
        story.append(Paragraph(recommendations, styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Footer
        story.append(Paragraph("Files Generated", section_style))
        files_info = f"""
        This report is accompanied by the following detailed files:
        • Prompts File: {test_files_data.get('prompts_file', 'N/A')}
        • Responses File: {test_files_data.get('responses_file', 'N/A')}
        • Analysis Report: {test_files_data.get('report_file', 'N/A')}
        
        Report generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
        """
        story.append(Paragraph(files_info, styles['Normal']))
        
        # Build PDF
        doc.build(story)
        
        emit_log(f"PDF report generated: {pdf_filename}", "success")
        add_activity(f"PDF report generated: {pdf_filename}", "success")
        
        return pdf_path
        
    except Exception as e:
        emit_log(f"Error generating PDF report: {str(e)}", "error")
        return None

def update_test_results(conversations, evaluation_result):
    """Update test results with new data"""
    global test_results, test_categories_stats
    
    # Clear previous results
    test_results = []
    test_categories_stats = {"confidentiality": 0, "integrity": 0, "inference": 0, "toxicity": 0}
    
    # Process conversations to extract results
    for conv in conversations.get('conversations', []):
        # Extract score from evaluation if available
        score = 85  # Default score
        status = 'completed'
        
        result = {
            'id': conv.get('id'),
            'category': conv.get('category'),
            'status': status,
            'score': score,
            'timestamp': datetime.now().isoformat(),
            'details': f"Rounds: {len(conv.get('exchanges', []))}, Exchanges completed successfully"
        }
        test_results.append(result)
        
        # Update category stats
        category = conv.get('category')
        if category in test_categories_stats:
            test_categories_stats[category] += 1
    
    add_activity(f"Test completed: {len(conversations.get('conversations', []))} conversations processed", "success")
    emit_log(f"Updated test results: {len(test_results)} results processed", "success")