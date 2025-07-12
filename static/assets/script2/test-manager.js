// test-manager.js - Test execution, monitoring, and results
export class TestManager {
    constructor() {
        this.isTestRunning = false;
        this.currentTestId = null;
        this.testTimer = null;
        this.testStartTime = null;
        this.codingTestMode = false;
        this.codingTestPrompt = '';
        this.generatedCodes = [];
        this.codeReviews = [];
        this.testFilesData = {
            prompts_file: null,
            responses_file: null,
            report_file: null,
            prompts_content: null,
            responses_content: null,
            report_content: null
        };
    }

    // Add method to check LLM health before starting test
    async checkLLMHealth() {
        try {
            const response = await fetch('/api/check-llm-health', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.getCurrentConfig().aut_model
                })
            });
            
            const data = await response.json();
            return data.healthy || false;
        } catch (error) {
            console.error('LLM health check failed:', error);
            return false;
        }
    }

    // Test execution methods
    async startTest() {
        if (this.isTestRunning) {
            return;
        }
        
        // Check LLM health first
        window.uiManager.updateStatus('Checking LLM health...', 'info');
        const isHealthy = await this.checkLLMHealth();
        
        if (!isHealthy) {
            window.uiManager.showNotification('LLM is not responding. Please check LM Studio is running and the model is loaded.', 'error');
            window.uiManager.updateStatus('LLM health check failed', 'error');
            return;
        }
        
        const mode = document.querySelector('input[name="testMode"]:checked')?.value || 'normal';
        
        if (mode === 'coding') {
            this.startCodingTest();
            return;
        }
        
        // Handle normal adversarial test
        this.isTestRunning = true;
        this.updateTestControls(true);
        
        // Clear previous logs and results
        window.uiManager.clearLogs();
        this.clearResults();
        
        // Get configuration
        const config = this.getCurrentConfig();
        
        // Validate configuration
        if (!config.aut_model || !config.aut_role || !config.aut_backstory || !config.aut_system_prompt) {
            window.uiManager.updateStatus('Please fill in all configuration fields', 'error');
            this.resetTestUI();
            return;
        }
        
        window.uiManager.appendLogMessage('Updating configuration...', 'info');
        
        // Update configuration on server first
        fetch('/update_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(`Server error: ${response.status} - ${text}`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                window.uiManager.appendLogMessage('Configuration updated successfully', 'success');
                // Start the normal test
                return fetch('/start_test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        mode: 'normal',
                        config: config
                    })
                });
            } else {
                throw new Error(data.error || 'Failed to update configuration');
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.uiManager.updateStatus('Adversarial test started successfully', 'success');
                window.uiManager.appendLogMessage('=== Adversarial Test Started ===', 'info');
                window.uiManager.appendLogMessage('Loading model and initializing agents...', 'info');
                
                // Start timer
                this.testStartTime = Date.now();
                this.testTimer = setInterval(() => this.updateTestTimer(), 1000);
                
                // Poll for progress updates
                this.pollTestProgress();
            } else {
                throw new Error(data.error || 'Failed to start test');
            }
        })
        .catch(error => {
            console.error('Error starting test:', error);
            window.uiManager.updateStatus('Error starting test: ' + error.message, 'error');
            window.uiManager.appendLogMessage('Error: ' + error.message, 'error');
            this.resetTestUI();
        });
    }

    startCodingTest() {
        const prompt = document.getElementById('codingPrompt')?.value.trim();
        if (!prompt) {
            window.uiManager.showNotification('Please enter a coding task/prompt', 'error');
            return;
        }
        
        this.isTestRunning = true;
        this.codingTestPrompt = prompt;
        this.updateTestControls(true);
        
        // Clear previous results
        this.clearResults();
        
        const config = this.getCurrentConfig();
        
        fetch('/start_coding_test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                config: config
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.uiManager.showNotification('Coding test started successfully', 'success');
                window.uiManager.updateProgressText('Generating code...');
                window.uiManager.appendLogMessage('=== Coding Test Started ===', 'info');
                window.uiManager.appendLogMessage(`Prompt: ${prompt}`, 'info');
                
                // Start timer
                this.testStartTime = Date.now();
                this.testTimer = setInterval(() => this.updateTestTimer(), 1000);
            } else {
                window.uiManager.showNotification(`Failed to start coding test: ${data.error}`, 'error');
                this.resetTestUI();
            }
        })
        .catch(error => {
            console.error('Error starting coding test:', error);
            window.uiManager.showNotification('Error starting coding test', 'error');
            this.resetTestUI();
        });
    }

    stopTest() {
        if (this.codingTestMode) {
            fetch('/api/stop-coding-test', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.uiManager.showNotification('Coding test stopped successfully', 'warning');
                } else {
                    window.uiManager.showNotification('Failed to stop coding test: ' + data.error, 'error');
                }
                this.resetTestUI();
            })
            .catch(error => {
                window.uiManager.showNotification('Error stopping coding test: ' + error, 'error');
                this.resetTestUI();
            });
        } else {
            fetch('/api/stop-test', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.uiManager.showNotification('Test stopped successfully', 'warning');
                } else {
                    window.uiManager.showNotification('Failed to stop test: ' + data.error, 'error');
                }
                this.resetTestUI();
            })
            .catch(error => {
                window.uiManager.showNotification('Error stopping test: ' + error, 'error');
                this.resetTestUI();
            });
        }
    }

    toggleTestMode() {
        const mode = document.querySelector('input[name="testMode"]:checked').value;
        const codingControls = document.getElementById('codingControls');
        const normalControls = document.getElementById('normalControls');
        const startTestText = document.getElementById('startTestText');
        
        if (mode === 'coding') {
            this.codingTestMode = true;
            if (codingControls) codingControls.style.display = 'block';
            if (normalControls) normalControls.style.display = 'none';
            if (startTestText) startTestText.textContent = 'Start Coding Test';
        } else {
            this.codingTestMode = false;
            if (codingControls) codingControls.style.display = 'none';
            if (normalControls) normalControls.style.display = 'block';
            if (startTestText) startTestText.textContent = 'Start Test';
        }
    }

    getCurrentConfig() {
        return {
            aut_model: document.getElementById('autModel')?.value || 'qwen/qwen3-8b',
            account_data_path: document.getElementById('accountDataPath')?.value || '',
            max_rounds: parseInt(document.getElementById('maxRounds')?.value || '4'),
            timeout: parseInt(document.getElementById('timeout')?.value || '3600'),
            aut_role: document.getElementById('autRole')?.value || '',
            aut_backstory: document.getElementById('autBackstory')?.value || '',
            aut_system_prompt: document.getElementById('autSystemPrompt')?.value || '',
            coding_difficulty: document.getElementById('codingDifficulty')?.value || 'medium',
            coding_category: document.getElementById('codingCategory')?.value || 'general'
        };
    }

    updateTestControls(isRunning) {
        const startBtn = document.getElementById('startTestBtn');
        const stopBtn = document.getElementById('stopTestBtn');
        const startText = document.getElementById('startTestText');
        
        if (startBtn && stopBtn) {
            if (isRunning) {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                if (startText) {
                    startText.textContent = this.codingTestMode ? 'Generating Code...' : 'Running Test...';
                }
            } else {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                if (startText) {
                    startText.textContent = this.codingTestMode ? 'Start Coding Test' : 'Start Test';
                }
            }
        }
    }

    pollTestProgress() {
        // Add max polling attempts to prevent infinite polling
        if (!this.pollAttempts) {
            this.pollAttempts = 0;
        }
        
        const maxPollAttempts = 300; // 10 minutes with 2-second intervals
        
        if (!this.isTestRunning || this.pollAttempts >= maxPollAttempts) {
            if (this.pollAttempts >= maxPollAttempts) {
                window.uiManager.showNotification('Test timed out. Please check if LM Studio is running properly.', 'error');
                this.handleTestComplete({success: false, error: 'Test execution timed out'});
            }
            this.pollAttempts = 0;
            return;
        }
        
        this.pollAttempts++;
        
        fetch('/api/execution-status')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'running') {
                // Continue polling
                setTimeout(() => this.pollTestProgress(), 2000);
            } else if (data.status === 'completed') {
                this.pollAttempts = 0;
                this.handleTestComplete({success: true, result: data.result});
            } else if (data.status === 'error' || data.status === 'failed') {
                this.pollAttempts = 0;
                this.handleTestComplete({success: false, error: data.error || 'Test execution failed'});
            } else {
                // Unknown status, continue polling but log it
                console.warn('Unknown test status:', data.status);
                setTimeout(() => this.pollTestProgress(), 2000);
            }
        })
        .catch(error => {
            console.error('Error polling test progress:', error);
            this.pollAttempts++;
            
            // If we get too many consecutive errors, stop polling
            if (this.pollAttempts > 10) {
                window.uiManager.showNotification('Lost connection to server. Test may have failed.', 'error');
                this.handleTestComplete({success: false, error: 'Lost connection to server'});
                this.pollAttempts = 0;
            } else if (this.isTestRunning) {
                // Continue polling despite error
                setTimeout(() => this.pollTestProgress(), 2000);
            }
        });
    }

    updateTestTimer() {
        if (!this.testStartTime) return;
        
        const elapsed = Math.floor((Date.now() - this.testStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        const timeElapsed = document.getElementById('timeElapsed');
        if (timeElapsed) {
            timeElapsed.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    handleTestComplete(data) {
        this.resetTestUI();
        
        if (data.success) {
            window.uiManager.updateProgress(100);
            window.uiManager.updateProgressText('Test completed successfully');
            window.uiManager.showNotification('Test completed successfully', 'success');
            
            // Update results
            window.refreshResults();
            
            // Update dashboard stats
            window.updateDashboardStats();
        } else {
            window.uiManager.updateProgress(0);
            window.uiManager.updateProgressText('Test failed');
            window.uiManager.showNotification('Test failed: ' + (data.error || 'Unknown error'), 'error');
        }
    }

    resetTestUI() {
        this.isTestRunning = false;
        this.updateTestControls(false);
        
        if (this.testTimer) {
            clearInterval(this.testTimer);
            this.testTimer = null;
        }
        
        this.currentTestId = null;
        this.testStartTime = null;
        this.pollAttempts = 0;  // Reset poll attempts
    }

    clearResults() {
        const testResults = document.getElementById('testResults');
        if (testResults) {
            testResults.innerHTML = '<p>Running test...</p>';
        }
    }

    // Test files management
    loadTestFiles() {
        fetch('/api/test-files')
            .then(response => response.json())
            .then(data => {
                this.testFilesData = data;
                this.displayTestFiles();
            })
            .catch(error => {
                console.error('Error loading test files:', error);
                window.uiManager.showNotification('Error loading test files', 'error');
            });
    }

    displayTestFiles() {
        const resultsSection = document.getElementById('results');
        if (!resultsSection) return;

        let testFilesContainer = document.getElementById('test-files-container');
        if (!testFilesContainer) {
            testFilesContainer = document.createElement('div');
            testFilesContainer.id = 'test-files-container';
            testFilesContainer.className = 'test-files-container mt-6';
            resultsSection.appendChild(testFilesContainer);
        }

        testFilesContainer.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-gray-800">Test Files & Reports</h3>
                    <div class="flex space-x-2">
                        <button onclick="window.testManager.generatePDFReport()" class="btn btn-primary">
                            <i class="fas fa-file-pdf"></i> Generate PDF Report
                        </button>
                        <button onclick="window.testManager.clearTestFiles()" class="btn btn-outline">
                            <i class="fas fa-trash"></i> Clear Files
                        </button>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    ${this.renderTestFileCard('prompts', 'Test Prompts', 'blue', 'question-circle')}
                    ${this.renderTestFileCard('responses', 'AUT Responses', 'green', 'comments')}
                    ${this.renderTestFileCard('report', 'Security Report', 'red', 'chart-line')}
                </div>
            </div>
        `;
    }

    renderTestFileCard(type, title, color, icon) {
        const content = this.testFilesData[`${type}_content`];
        const file = this.testFilesData[`${type}_file`];
        
        return `
            <div class="test-file-card">
                <div class="bg-${color}-50 rounded-lg p-4 border border-${color}-200">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="font-semibold text-${color}-800">
                            <i class="fas fa-${icon} text-${color}-600"></i>
                            ${title}
                        </h4>
                        <span class="text-xs px-2 py-1 bg-${color}-100 text-${color}-700 rounded-full">
                            ${content ? 'Available' : 'Not Available'}
                        </span>
                    </div>
                    
                    ${content ? `
                        <div class="text-sm text-gray-600 mb-3">
                            ${this.getFileInfo(type, content)}
                            <p><strong>File:</strong> ${file || 'N/A'}</p>
                        </div>
                        
                        <div class="mb-3">
                            <button onclick="window.testManager.viewFileContent('${type}')" class="btn btn-sm btn-outline w-full mb-2">
                                <i class="fas fa-eye"></i> View Content
                            </button>
                            <button onclick="window.testManager.downloadTestFile('${type}')" class="btn btn-sm btn-primary w-full">
                                <i class="fas fa-download"></i> Download JSON
                            </button>
                        </div>
                    ` : `
                        <p class="text-sm text-gray-500">No ${type} file available. Run a test to generate.</p>
                    `}
                </div>
            </div>
        `;
    }

    getFileInfo(type, content) {
        switch(type) {
            case 'prompts':
                return `<p><strong>Total Prompts:</strong> ${content.prompts ? content.prompts.length : 0}</p>`;
            case 'responses':
                return `<p><strong>Conversations:</strong> ${content.conversations ? content.conversations.length : 0}</p>`;
            case 'report':
                return `<p><strong>Analysis:</strong> Complete</p>`;
            default:
                return '';
        }
    }

    viewFileContent(fileType) {
        const content = this.testFilesData[`${fileType}_content`];
        if (!content) {
            window.uiManager.showNotification(`No ${fileType} content available`, 'error');
            return;
        }

        const formattedContent = JSON.stringify(content, null, 2);
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-4xl w-full max-h-90vh overflow-hidden">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-semibold">${fileType.charAt(0).toUpperCase() + fileType.slice(1)} Content</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="p-4 overflow-auto max-h-80vh">
                    <pre class="bg-gray-100 p-4 rounded text-sm overflow-auto"><code>${window.utils.escapeHtml(formattedContent)}</code></pre>
                </div>
                <div class="flex justify-end p-4 border-t space-x-2">
                    <button onclick="window.utils.copyToClipboard('${formattedContent.replace(/'/g, "\\'")}'); window.uiManager.showNotification('Content copied to clipboard', 'success')" class="btn btn-outline">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <button onclick="window.testManager.downloadTestFile('${fileType}')" class="btn btn-primary">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    downloadTestFile(fileType) {
        fetch(`/api/download-test-file-content/${fileType}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.utils.downloadFile(data.content, data.filename, 'application/json');
                    window.uiManager.showNotification(`${fileType} file downloaded successfully`, 'success');
                } else {
                    window.uiManager.showNotification(data.error || 'Download failed', 'error');
                }
            })
            .catch(error => {
                console.error('Download error:', error);
                window.uiManager.showNotification('Download failed', 'error');
            });
    }

    generatePDFReport() {
        window.uiManager.showNotification('Generating PDF report...', 'info');
        
        fetch('/api/generate-pdf-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                test_data: this.testFilesData
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('PDF generation failed');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `adversarial_test_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            window.uiManager.showNotification('PDF report generated and downloaded successfully', 'success');
        })
        .catch(error => {
            console.error('PDF generation error:', error);
            window.uiManager.showNotification('PDF generation failed. Please ensure test data is available.', 'error');
        });
    }

    clearTestFiles() {
        if (!confirm('Are you sure you want to clear all test files? This action cannot be undone.')) {
            return;
        }
        
        fetch('/api/clear-test-files', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.testFilesData = {
                    prompts_file: null,
                    responses_file: null,
                    report_file: null,
                    prompts_content: null,
                    responses_content: null,
                    report_content: null
                };
                this.displayTestFiles();
                window.uiManager.showNotification('Test files cleared successfully', 'success');
            } else {
                window.uiManager.showNotification(data.error || 'Failed to clear test files', 'error');
            }
        })
        .catch(error => {
            console.error('Clear files error:', error);
            window.uiManager.showNotification('Failed to clear test files', 'error');
        });
    }

    // Coding test result handlers
    downloadCode(index) {
        if (this.generatedCodes[index]) {
            const code = this.generatedCodes[index];
            window.utils.downloadFile(code.generated_code, `generated_code_${code.id}.py`, 'text/plain');
        }
    }

    downloadReviews(codeId) {
        const review = this.codeReviews.find(r => r.id === codeId);
        if (review) {
            let content = `Code ${codeId} Reviews\n\n`;
            content += `Functionality Review:\n${review.reviews.functionality.review_content}\n\n`;
            content += `Quality Review:\n${review.reviews.quality.review_content}\n\n`;
            content += `Security Review:\n${review.reviews.security.review_content}\n\n`;
            
            window.utils.downloadFile(content, `code_${codeId}_reviews.txt`, 'text/plain');
        }
    }

    downloadFullEvaluation() {
        fetch('/api/download-evaluation')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.utils.downloadFile(data.content, data.filename, 'application/json');
                }
            })
            .catch(error => console.error('Error downloading evaluation:', error));
    }

    viewCodeDetails(index) {
        const code = this.generatedCodes[index];
        if (code) {
            const modal = document.createElement('div');
            modal.className = 'code-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h4>Code Details - ${code.id}</h4>
                        <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="code-details">
                            <p><strong>Category:</strong> ${code.category}</p>
                            <p><strong>Difficulty:</strong> ${code.difficulty}</p>
                            <p><strong>Original Prompt:</strong> ${code.prompt}</p>
                        </div>
                        <div class="full-code">
                            <h5>Generated Code:</h5>
                            <pre><code>${window.utils.escapeHtml(code.generated_code)}</code></pre>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    }

    showReviewTab(codeId, type) {
        // Hide all review panels for this code
        document.querySelectorAll(`[id^="review-${codeId}-"]`).forEach(panel => {
            panel.classList.remove('active');
        });
        
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Show selected panel and activate tab
        const selectedPanel = document.getElementById(`review-${codeId}-${type}`);
        if (selectedPanel) {
            selectedPanel.classList.add('active');
        }
        event.target.classList.add('active');
    }
}

// Export methods to global scope for HTML onclick handlers
window.TestManager = TestManager;