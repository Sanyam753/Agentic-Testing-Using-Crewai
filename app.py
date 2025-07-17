"""
Main Flask Application for Adversarial Testing Interface
"""
import os
import json
import tempfile
import threading
import time
import csv
import io
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_file
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Import our modular components
from config import *
from utils import (
    emit_log, add_activity, check_system_health, generate_performance_data,
    get_available_models, load_test_files_content, generate_pdf_report
)
from agents1 import execute_security_test, execute_coding_test

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Enable CORS and SocketIO
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Routes
@app.route('/')
def index():
    """Serve the main application page"""
    return render_template("index3.html")

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/get_models')
def get_models():
    """Get available models from LM Studio"""
    models = get_available_models()
    return jsonify({'models': models})

@app.route('/update_config', methods=['POST'])
def update_config():
    try:
        data = request.get_json()
        global current_config
        
        if 'aut_model' in data:
            current_config['aut_model'] = data['aut_model']
            emit_log(f"AUT model updated to: {data['aut_model']}", "success")
        
        if 'account_data_path' in data:
            current_config['account_data_path'] = data['account_data_path']
            emit_log(f"Account data path updated to: {data['account_data_path']}", "success")
        
        return jsonify({"success": True, "message": "Configuration updated"})
    
    except Exception as e:
        emit_log(f"Error updating configuration: {str(e)}", "error")
        return jsonify({"success": False, "error": str(e)}), 500

# ---- New Routes for Test Files Display and PDF Generation ----

@app.route('/api/test-files')
def get_test_files():
    """Get test files data for display"""
    return jsonify(test_files_data)

@app.route('/api/download-test-file/<file_type>')
def download_test_file(file_type):
    """Download specific test file"""
    try:
        file_mapping = {
            'prompts': test_files_data.get('prompts_file'),
            'responses': test_files_data.get('responses_file'),
            'report': test_files_data.get('report_file')
        }
        
        filename = file_mapping.get(file_type)
        if not filename or not os.path.exists(filename):
            return jsonify({"success": False, "error": f"{file_type} file not found"}), 404
        
        return send_file(
            filename,
            as_attachment=True,
            download_name=f"{file_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/download-test-file-content/<file_type>')
def download_test_file_content(file_type):
    """Download test file content as JSON response"""
    try:
        content_mapping = {
            'prompts': test_files_data.get('prompts_content'),
            'responses': test_files_data.get('responses_content'),
            'report': test_files_data.get('report_content')
        }
        
        content = content_mapping.get(file_type)
        if content is None:
            return jsonify({"success": False, "error": f"{file_type} content not available"}), 404
        
        filename = f"{file_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        return jsonify({
            "success": True,
            "filename": filename,
            "content": json.dumps(content, indent=2) if content else "{}"
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/generate-pdf-report', methods=['POST'])
def api_generate_pdf_report():
    """Generate and download PDF report"""
    try:
        pdf_path = generate_pdf_report()
        if pdf_path and os.path.exists(pdf_path):
            return send_file(
                pdf_path,
                as_attachment=True,
                download_name=f"adversarial_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            )
        else:
            return jsonify({"success": False, "error": "Failed to generate PDF report"}), 500
    
    except Exception as e:
        emit_log(f"Error generating PDF report: {str(e)}", "error")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/clear-test-files', methods=['POST'])
def clear_test_files():
    """Clear test files data"""
    global test_files_data
    
    try:
        test_files_data = {
            "prompts_file": None,
            "responses_file": None,
            "report_file": None,
            "prompts_content": None,
            "responses_content": None,
            "report_content": None
        }
        
        emit_log("Test files data cleared", "info")
        add_activity("Test files data cleared", "info")
        
        return jsonify({"success": True, "message": "Test files data cleared"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---- Coding Test Routes ----
@app.route('/start_coding_test', methods=['POST'])
def start_coding_test():
    """Start the coding agent test process"""
    global current_coding_execution
    
    if current_coding_execution and current_coding_execution.get('status') == 'running':
        return jsonify({"success": False, "error": "Coding test already in progress"}), 400
    
    try:
        data = request.get_json()
        prompt = data.get('prompt', '').strip()
        config = data.get('config', {})
        
        if not prompt:
            return jsonify({"success": False, "error": "No coding prompt provided"}), 400
        
        with execution_lock:
            current_coding_execution = {
                "status": "running",
                "start_time": datetime.now(),
                "progress": 0
            }
            
            socketio.emit('log_update', {"message": "Coding test started", "level": "info"})
            emit_log("Starting coding agent testing process...", "info")
            
            # Start coding test in background thread
            test_thread = threading.Thread(
                target=execute_coding_test, 
                args=(prompt, config)
            )
            test_thread.daemon = True
            test_thread.start()
            
            return jsonify({
                "success": True,
                "message": "Coding test started",
                "execution_id": str(current_coding_execution['start_time'].timestamp())
            })
    
    except Exception as e:
        current_coding_execution = {"status": "error", "error": str(e)}
        emit_log(f"Coding test failed to start: {str(e)}", "error")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/start_test', methods=['POST'])
def start_test():
    """Start the test process - handles both normal and coding tests"""
    global current_execution, execution_logs
    
    try:
        data = request.get_json()
        test_mode = data.get('mode', 'normal')
        
        # Handle coding test - redirect to specific coding test handler
        if test_mode == 'coding':
            return start_coding_test()
        
        # Check if normal test is already running
        if current_execution and current_execution.get('status') == 'running':
            return jsonify({"success": False, "error": "Test already in progress"}), 400
        
        # Handle normal adversarial test
        config = data.get('config', current_config)
        
        with execution_lock:
            execution_logs = []
            current_execution = {
                "status": "running",
                "start_time": datetime.now(),
                "progress": 0
            }
            
            socketio.emit('log_update', {"message": "Adversarial test started", "level": "info"})
            emit_log("Starting adversarial testing process...", "info")
            
            account_path = config.get('account_data_path', DEFAULT_ACCOUNT_DATA_PATH)
            if not os.path.isfile(account_path):
                emit_log(f"Account data file not found at: {account_path}", "error")
                current_execution = {"status": "error", "error": f"Account data file not found: {account_path}"}
                return jsonify({
                    "success": False,
                    "error": f"Account data file not found: {account_path}"
                }), 400
            
            test_thread = threading.Thread(target=execute_security_test, args=(config,))
            test_thread.daemon = True
            test_thread.start()
            
            return jsonify({
                "success": True,
                "message": "Adversarial testing started",
                "execution_id": str(current_execution['start_time'].timestamp())
            })
    
    except Exception as e:
        current_execution = {"status": "error", "error": str(e)}
        emit_log(f"Test failed to start: {str(e)}", "error")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/execution-status')
def get_execution_status():
    """Get current execution status"""
    return jsonify(current_execution or {"status": "idle"})

@app.route('/api/coding-execution-status')
def get_coding_execution_status():
    """Get current coding test execution status"""
    return jsonify(current_coding_execution or {"status": "idle"})

@app.route('/api/coding-results')
def get_coding_results():
    """Get coding test results"""
    return jsonify({
        "generated_codes": generated_codes_data,
        "reviews": code_reviews_data,
        "final_evaluation": final_evaluation_data
    })

@app.route('/api/download-generated-code/<int:code_id>')
def download_generated_code(code_id):
    """Download generated code file"""
    try:
        code_info = next((c for c in generated_codes_data if c['id'] == code_id), None)
        if not code_info:
            return jsonify({"success": False, "error": "Code not found"}), 404
        
        return jsonify({
            "success": True,
            "filename": f"generated_code_{code_id}.py",
            "content": code_info['generated_code']
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/download-code-reviews/<int:code_id>')
def download_code_reviews(code_id):
    """Download code reviews for specific code"""
    try:
        review_info = next((r for r in code_reviews_data if r['id'] == code_id), None)
        if not review_info:
            return jsonify({"success": False, "error": "Reviews not found"}), 404
        
        content = f"Code {code_id} Reviews\n\n"
        for review_type, review_data in review_info['reviews'].items():
            content += f"{review_type.title()} Review:\n"
            content += "=" * 50 + "\n"
            content += review_data['review_content'] + "\n\n"
        
        return jsonify({
            "success": True,
            "filename": f"code_{code_id}_reviews.txt",
            "content": content
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/download-evaluation')
def download_evaluation():
    """Download full evaluation report"""
    try:
        if not final_evaluation_data:
            return jsonify({"success": False, "error": "No evaluation data available"}), 404
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return jsonify({
            "success": True,
            "filename": f"coding_evaluation_{timestamp}.json",
            "content": json.dumps(final_evaluation_data, indent=2)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/logs')
def get_logs():
    """Get execution logs"""
    return jsonify(execution_logs)

@app.route('/api/config')
def get_config():
    """Get current configuration"""
    return jsonify(current_config)

@app.route('/api/system-health')
def get_system_health():
    """Get current system health status"""
    health = check_system_health()
    return jsonify(health)

@app.route('/api/activity')
def get_recent_activity():
    """Get recent activity feed"""
    return jsonify(recent_activity)

@app.route('/api/performance-data')
def get_performance_data():
    """Get performance data for charts"""
    if not performance_data:
        generate_performance_data()
    return jsonify(performance_data)

@app.route('/api/test-results')
def get_test_results():
    """Get test results"""
    return jsonify(test_results)

@app.route('/api/test-categories')
def get_test_categories():
    """Get test categories statistics"""
    return jsonify(test_categories_stats)

@app.route('/api/stop-test', methods=['POST'])
def stop_test():
    """Stop current test execution"""
    global current_execution
    
    try:
        if current_execution and current_execution.get('status') == 'running':
            current_execution['status'] = 'stopped'
            current_execution['end_time'] = datetime.now()
            emit_log("Test execution stopped by user", "warning")
            add_activity("Test execution stopped", "warning")
            
            socketio.emit('process_complete', {
                "success": False,
                "message": "Test stopped by user"
            })
            
            return jsonify({"success": True, "message": "Test stopped"})
        else:
            return jsonify({"success": False, "error": "No test running"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/stop-coding-test', methods=['POST'])
def stop_coding_test():
    """Stop current coding test execution"""
    global current_coding_execution
    
    try:
        if current_coding_execution and current_coding_execution.get('status') == 'running':
            current_coding_execution['status'] = 'stopped'
            current_coding_execution['end_time'] = datetime.now()
            emit_log("Coding test execution stopped by user", "warning")
            add_activity("Coding test execution stopped", "warning")
            
            socketio.emit('coding_complete', {
                "success": False,
                "message": "Coding test stopped by user"
            })
            
            return jsonify({"success": True, "message": "Coding test stopped"})
        else:
            return jsonify({"success": False, "error": "No coding test running"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/clear-coding-data', methods=['POST'])
def clear_coding_data():
    """Clear coding test data"""
    global generated_codes_data, code_reviews_data, final_evaluation_data
    
    try:
        generated_codes_data = []
        code_reviews_data = []
        final_evaluation_data = None
        
        emit_log("Coding test data cleared", "info")
        add_activity("Coding test data cleared", "info")
        
        return jsonify({"success": True, "message": "Coding test data cleared"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/export-results', methods=['POST'])
def export_results():
    """Export test results to CSV"""
    try:
        if not test_results:
            return jsonify({"success": False, "error": "No results to export"}), 400
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['Test ID', 'Category', 'Status', 'Score', 'Timestamp', 'Details'])
        
        for result in test_results:
            writer.writerow([
                result.get('id', ''),
                result.get('category', ''),
                result.get('status', ''),
                result.get('score', ''),
                result.get('timestamp', ''),
                result.get('details', '')
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        filename = f"test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        return jsonify({
            "success": True,
            "filename": filename,
            "content": csv_content
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/export-logs', methods=['POST'])
def export_logs():
    """Export logs to text file"""
    try:
        if not execution_logs:
            return jsonify({"success": False, "error": "No logs to export"}), 400
        
        log_content = ""
        for log in execution_logs:
            log_content += f"[{log['timestamp']}] {log['level'].upper()}: {log['message']}\n"
        
        filename = f"execution_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        return jsonify({
            "success": True,
            "filename": filename,
            "content": log_content
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/clear-logs', methods=['POST'])
def clear_logs():
    """Clear execution logs"""
    try:
        global execution_logs
        execution_logs = []
        emit_log("Logs cleared by user", "info")
        
        socketio.emit('logs_cleared')
        
        return jsonify({"success": True, "message": "Logs cleared"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/reset-config', methods=['POST'])
def reset_config():
    """Reset configuration to defaults"""
    try:
        global current_config
        current_config = {
            'aut_model': AUT_MODEL_NAME,
            'account_data_path': DEFAULT_ACCOUNT_DATA_PATH
        }
        
        emit_log("Configuration reset to defaults", "info")
        add_activity("Configuration reset to defaults", "info")
        
        return jsonify({"success": True, "message": "Configuration reset", "config": current_config})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/export-config', methods=['POST'])
def export_config():
    """Export current configuration"""
    try:
        config_content = json.dumps(current_config, indent=2)
        filename = f"config_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        return jsonify({
            "success": True,
            "filename": filename,
            "content": config_content
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/upload-file', methods=['POST'])
def upload_file():
    """Handle file upload for account data"""
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"}), 400
        
        if file and file.filename.endswith('.json'):
            uploads_dir = os.path.join(app.instance_path, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            filename = secure_filename(file.filename)
            file_path = os.path.join(uploads_dir, filename)
            file.save(file_path)
            
            current_config['account_data_path'] = file_path
            
            emit_log(f"Account data file uploaded: {filename}", "success")
            add_activity(f"Account data file uploaded: {filename}", "success")
            
            return jsonify({
                "success": True,
                "message": "File uploaded successfully",
                "path": file_path
            })
        else:
            return jsonify({"success": False, "error": "Only JSON files are allowed"}), 400
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/refresh-models', methods=['POST'])
def refresh_models():
    """Refresh available models list"""
    try:
        models = get_available_models()
        emit_log(f"Models refreshed: {len(models)} models found", "success")
        add_activity(f"Models refreshed: {len(models)} models found", "success")
        
        return jsonify({
            "success": True,
            "models": models,
            "message": "Models refreshed"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/analytics/<time_range>')
def get_analytics(time_range):
    """Get analytics data for specified time range"""
    try:
        now = datetime.now()
        
        if time_range == 'today':
            hours = 24
        elif time_range == 'week':
            hours = 24 * 7
        elif time_range == 'month':
            hours = 24 * 30
        else:  # all
            hours = 24 * 90
        
        analytics_data = {
            "security_metrics": {
                "confidentiality_breaches": test_categories_stats.get('confidentiality', 0),
                "integrity_violations": test_categories_stats.get('integrity', 0),
                "toxicity_incidents": test_categories_stats.get('toxicity', 0),
                "total_tests": len(test_results)
            },
            "performance_trends": [],
            "test_categories": test_categories_stats,
            "model_comparison": {
                "qwen3-8b": {"success_rate": 85, "avg_response_time": 250},
                "qwen3-14b": {"success_rate": 92, "avg_response_time": 300}
            }
        }
        
        for i in range(min(hours, 168)):
            time_point = now - timedelta(hours=i)
            analytics_data["performance_trends"].append({
                "timestamp": time_point.isoformat(),
                "success_rate": 85 + (i % 15),
                "response_time": 200 + (i % 100)
            })
        
        return jsonify(analytics_data)
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# SocketIO event handlers
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit_log("Client connected to real-time updates", "info")
    emit('connected', {"message": "Connected to Adversarial Testing Interface"})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    emit_log("Client disconnected", "info")

@socketio.on('request_logs')
def handle_request_logs():
    """Send current logs to client"""
    emit('logs_update', execution_logs)

@socketio.on('request_config')
def handle_request_config():
    """Send current configuration to client"""
    emit('config_update', current_config)

@socketio.on('request_health')
def handle_request_health():
    """Send system health to client"""
    health = check_system_health()
    emit('health_update', health)

@socketio.on('request_activity')
def handle_request_activity():
    """Send recent activity to client"""
    emit('activity_update', recent_activity)

@socketio.on('request_performance')
def handle_request_performance():
    """Send performance data to client"""
    if not performance_data:
        generate_performance_data()
    emit('performance_update', performance_data)

@socketio.on('request_test_files')
def handle_request_test_files():
    """Send test files data to client"""
    emit('test_files_update', test_files_data)

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs("generated", exist_ok=True)
    os.makedirs("templates", exist_ok=True)
    
    print("Starting Adversarial Testing Flask Backend...")
    print("Access the API at: http://localhost:5000")
    
    # Initialize some sample data
    generate_performance_data()
    check_system_health()
    
    # Run with SocketIO and disable reloader
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, use_reloader=False)