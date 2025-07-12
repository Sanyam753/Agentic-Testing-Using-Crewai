// Global variables
let socket;
let isTestRunning = false;
let charts = {};
let autoScroll = true;
let currentTestId = null;
let testTimer = null;
let testStartTime = null;

// Add these global variables for coding agent testing
let codingTestMode = false;
let codingTestPrompt = '';
let generatedCodes = [];
let codeReviews = [];



// =====================================================
// TEST FILES MANAGEMENT FUNCTIONS
// Add these functions to your script.js file
// =====================================================

// Global variable to store test files data
let testFilesData = {
    prompts_file: null,
    responses_file: null,
    report_file: null,
    prompts_content: null,
    responses_content: null,
    report_content: null
};


// And replace it with this enhanced version:
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    initializeCharts();
    setupEventListeners();
    initializeTheme();
    loadAvailableModels();
    updateDashboardStats();
    refreshModels();
    setInterval(updateDashboardStats, 30000);
    showSection('dashboard');
    setInterval(updateSystemTime, 1000);
    
    // Initialize test files functionality
    injectTestFilesStyles();
    loadTestFiles();
    
    // Initialize results section
    updateResults();
    
    // Set up periodic updates
    setInterval(function() {
        // Auto-refresh results every 30 seconds if on results page
        const currentSection = document.querySelector('.content-section.active');
        if (currentSection && currentSection.id === 'results') {
            updateResults();
        }
    }, 30000);
});


// Initialize Socket.IO connection
function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
        updateConnectionStatus(true);
        updateStatus('Connected to server', 'success');
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
        updateStatus('Disconnected from server', 'error');
    });
    
    socket.on('log_update', function(data) {
        appendLog(data);
    });
    
    socket.on('activity_update', function(data) {
        updateActivityFeed(data);
    });
    
    socket.on('health_update', function(data) {
        updateSystemHealth(data);
    });
    
    socket.on('performance_update', function(data) {
        updatePerformanceChart(data);
    });
    
    socket.on('process_complete', function(data) {
        handleTestComplete(data);

        if (data.success && data.test_files_data) {
        testFilesData = data.test_files_data;
        displayTestFiles();
    } else {
        // Load test files from API if not included in response
        setTimeout(loadTestFiles, 1000);
    }
    });

    socket.on('test_files_update', function(data) {
        testFilesData = data;
        displayTestFiles();
    });
    
    socket.on('logs_cleared', function() {
        clearLogOutput();
    });
    
    socket.on('connected', function(data) {
        console.log('Socket.IO connected:', data.message);
    });

    // Add these new socket event handlers for coding tests
    socket.on('coding_progress', function(data) {
        updateProgressText(data.message);
        if (data.progress) {
            updateProgress(data.progress);
        }
    });

    socket.on('coding_complete', function(data) {
        if (data.success) {
            showNotification('Coding test completed successfully', 'success');
            generatedCodes = data.generated_codes || [];
            codeReviews = data.reviews || [];
            displayCodingResults(data);
            updateTestControls(false);
        } else {
            showNotification(`Coding test failed: ${data.error}`, 'error');
            updateTestControls(false);
        }
    });
}

// Load available models from LM Studio
function loadAvailableModels() {
    fetch('/get_models')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('autModel');
            if (select) {
                select.innerHTML = ''; // Clear existing options
                
                if (data.models && data.models.length > 0) {
                    data.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model;
                        option.textContent = model;
                        select.appendChild(option);
                    });
                    updateStatus('Models loaded successfully', 'success');
                } else {
                    // Add default option if no models found
                    const option = document.createElement('option');
                    option.value = 'qwen/qwen3-8b';
                    option.textContent = 'qwen/qwen3-8b (default)';
                    select.appendChild(option);
                    updateStatus('No models found, using default', 'warning');
                }
            }
        })
        .catch(error => {
            console.error('Error loading models:', error);
            updateStatus('Error loading models: ' + error.message, 'error');
            
            // Add default option on error
            const select = document.getElementById('autModel');
            if (select) {
                select.innerHTML = '';
                const option = document.createElement('option');
                option.value = 'qwen/qwen3-8b';
                option.textContent = 'qwen/qwen3-8b (default)';
                select.appendChild(option);
            }
        });
}

// Setup event listeners
function setupEventListeners() {
    // Add navigation event listeners
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            if (section) {
                showSection(section);
            }
        });
    });
    
    // Add event listeners for configuration changes
    const configInputs = ['autModel', 'autRole', 'autBackstory', 'autSystemPrompt'];
    configInputs.forEach(inputId => {
        const element = document.getElementById(inputId);
        if (element) {
            element.addEventListener('change', function() {
                updateStatus('Configuration changed', 'info');
            });
        }
    });
}

// Theme Management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update icon
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    
    // Animate the change
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}

// Initialize theme on page load
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Coding test specific functions
function toggleTestMode() {
    const mode = document.querySelector('input[name="testMode"]:checked').value;
    const codingControls = document.getElementById('codingControls');
    const normalControls = document.getElementById('normalControls');
    const startTestText = document.getElementById('startTestText');
    
    if (mode === 'coding') {
        codingTestMode = true;
        if (codingControls) codingControls.style.display = 'block';
        if (normalControls) normalControls.style.display = 'none';
        if (startTestText) startTestText.textContent = 'Start Coding Test';
    } else {
        codingTestMode = false;
        if (codingControls) codingControls.style.display = 'none';
        if (normalControls) normalControls.style.display = 'block';
        if (startTestText) startTestText.textContent = 'Start Test';
    }
}

function getCurrentConfig() {
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

function updateTestControls(isRunning) {
    const startBtn = document.getElementById('startTestBtn');
    const stopBtn = document.getElementById('stopTestBtn');
    const startText = document.getElementById('startTestText');
    
    if (startBtn && stopBtn) {
        if (isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            if (startText) {
                startText.textContent = codingTestMode ? 'Generating Code...' : 'Running Test...';
            }
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            if (startText) {
                startText.textContent = codingTestMode ? 'Start Coding Test' : 'Start Test';
            }
        }
    }
}


function updateResults() {
    // Load test results from API
    fetch('/api/test-results')
        .then(response => response.json())
        .then(data => {
            displayResults(data);
            
            // Update summary statistics
            updateResultsSummary(data);
            
            // Update dashboard stats with latest results
            updateDashboardStats();
        })
        .catch(error => {
            console.error('Error loading test results:', error);
            showNotification('Error loading test results', 'error');
        });
    
    // Load test categories
    fetch('/api/test-categories')
        .then(response => response.json())
        .then(data => {
            updateTestCategories(data);
        })
        .catch(error => {
            console.error('Error loading test categories:', error);
        });
    
    // Add test files loading at the end
    loadTestFiles();
}


function updateProgressText(message) {
    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.textContent = message;
    }
}

function updateProgress(percentage) {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = percentage + '%';
    }
    // loadTestFiles();
}

// MAIN START TEST FUNCTION - FIXED
function startTest() {
    if (isTestRunning) {
        return;
    }
    
    // Check test mode first
    const mode = document.querySelector('input[name="testMode"]:checked')?.value || 'normal';
    
    if (mode === 'coding') {
        startCodingTest();
        return;
    }
    
    // Handle normal adversarial test
    isTestRunning = true;
    updateTestControls(true);
    
    // Clear previous logs and results
    clearLogs();
    clearResults();
    
    // Get configuration
    const config = getCurrentConfig();
    
    // Validate configuration
    if (!config.aut_model || !config.aut_role || !config.aut_backstory || !config.aut_system_prompt) {
        updateStatus('Please fill in all configuration fields', 'error');
        resetTestUI();
        return;
    }
    
    appendLogMessage('Updating configuration...', 'info');
    
    // Update configuration on server first
    fetch('/update_config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            appendLogMessage('Configuration updated successfully', 'success');
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
            updateStatus('Adversarial test started successfully', 'success');
            appendLogMessage('=== Adversarial Test Started ===', 'info');
            appendLogMessage('Loading model and initializing agents...', 'info');
            
            // Start timer
            testStartTime = Date.now();
            testTimer = setInterval(updateTestTimer, 1000);
            
            // Poll for progress updates
            pollTestProgress();
        } else {
            throw new Error(data.error || 'Failed to start test');
        }
    })
    .catch(error => {
        console.error('Error starting test:', error);
        updateStatus('Error starting test: ' + error.message, 'error');
        appendLogMessage('Error: ' + error.message, 'error');
        resetTestUI();
    });
}

function startCodingTest() {
    const prompt = document.getElementById('codingPrompt')?.value.trim();
    if (!prompt) {
        showNotification('Please enter a coding task/prompt', 'error');
        return;
    }
    
    isTestRunning = true;
    codingTestPrompt = prompt;
    updateTestControls(true);
    
    // Clear previous results
    clearResults();
    
    const config = getCurrentConfig();
    
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
            showNotification('Coding test started successfully', 'success');
            updateProgressText('Generating code...');
            appendLogMessage('=== Coding Test Started ===', 'info');
            appendLogMessage(`Prompt: ${prompt}`, 'info');
            
            // Start timer
            testStartTime = Date.now();
            testTimer = setInterval(updateTestTimer, 1000);
        } else {
            showNotification(`Failed to start coding test: ${data.error}`, 'error');
            resetTestUI();
        }
    })
    .catch(error => {
        console.error('Error starting coding test:', error);
        showNotification('Error starting coding test', 'error');
        resetTestUI();
    });
}

// Reset test UI
function resetTestUI() {
    isTestRunning = false;
    updateTestControls(false);
    
    if (testTimer) {
        clearInterval(testTimer);
        testTimer = null;
    }
    
    currentTestId = null;
    testStartTime = null;
}

// Connection status
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionIndicator');
    const text = document.getElementById('connectionText');
    
    if (indicator && text) {
        if (connected) {
            indicator.className = 'status-indicator online';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = 'Disconnected';
        }
    }
}

// Append log message to the log output
function appendLogMessage(message, level = 'info') {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${level}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-level">[${level.toUpperCase()}]</span>
        <span class="log-message">${escapeHtml(message)}</span>
    `;
    
    logOutput.appendChild(logEntry);
    if (autoScroll) {
        logOutput.scrollTop = logOutput.scrollHeight;
    }
}

function appendLog(logData) {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    
    const logItem = document.createElement('div');
    logItem.className = `log-item ${logData.level}`;
    logItem.innerHTML = `
        <span class="log-timestamp">${logData.timestamp}</span>
        <span class="log-level">${logData.level.toUpperCase()}</span>
        <span class="log-message">${logData.message}</span>
    `;
    
    logOutput.appendChild(logItem);
    
    // Auto-scroll if enabled
    if (autoScroll) {
        logOutput.scrollTop = logOutput.scrollHeight;
    }
    
    // Keep only last 1000 log entries
    while (logOutput.children.length > 1000) {
        logOutput.removeChild(logOutput.firstChild);
    }
}

// Clear logs
function clearLogs() {
    const logOutput = document.getElementById('logOutput');
    if (logOutput) {
        logOutput.innerHTML = '';
    }
}

function clearLogOutput() {
    clearLogs();
}

// Clear results
function clearResults() {
    const testResults = document.getElementById('testResults');
    if (testResults) {
        testResults.innerHTML = '<p>Running test...</p>';
    }
}

// Show test results
function showTestResults(result) {
    const resultsDiv = document.getElementById('testResults');
    if (!resultsDiv) return;
    
    if (result && result.includes('failed')) {
        resultsDiv.innerHTML = `
            <div class="result-item error">
                <h3>Test Failed</h3>
                <p>${escapeHtml(result)}</p>
                <p>Please check the logs above for detailed error information.</p>
            </div>
        `;
    } else {
        resultsDiv.innerHTML = `
            <div class="result-item success">
                <h3>Test Completed Successfully</h3>
                <p>The agent validity test has been completed successfully.</p>
                <div class="result-details">
                    <h4>Result:</h4>
                    <pre>${escapeHtml(result || 'Test completed with no specific output')}</pre>
                </div>
                <p>Check the logs above for detailed information about the test execution.</p>
            </div>
        `;
    }
}

function displayCodingResults(results) {
    const resultsContainer = document.getElementById('testResults');
    if (!resultsContainer) return;
    
    if (!results.generated_codes || results.generated_codes.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results"><p>No coding results available</p></div>';
        return;
    }
    
    let html = '<div class="coding-results">';
    
    // Summary section
    html += `
        <div class="results-summary">
            <h4>Coding Test Summary</h4>
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">Generated Codes</span>
                    <span class="stat-value">${results.generated_codes.length}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Reviews Completed</span>
                    <span class="stat-value">${results.reviews ? results.reviews.length : 0}</span>
                </div>
            </div>
        </div>
    `;
    
    // Generated codes section
    results.generated_codes.forEach((codeInfo, index) => {
        html += `
            <div class="code-result-card">
                <div class="card-header">
                    <h5>Generated Code ${codeInfo.id}</h5>
                    <div class="code-actions">
                        <button class="btn-sm" onclick="downloadCode(${index})">Download Code</button>
                        <button class="btn-sm" onclick="viewCodeDetails(${index})">View Details</button>
                    </div>
                </div>
                <div class="card-content">
                    <div class="code-info">
                        <p><strong>Category:</strong> ${codeInfo.category}</p>
                        <p><strong>Difficulty:</strong> ${codeInfo.difficulty}</p>
                        <p><strong>Prompt:</strong> ${codeInfo.prompt}</p>
                    </div>
                    <div class="code-preview">
                        <pre><code>${codeInfo.generated_code.substring(0, 300)}...</code></pre>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Reviews section
    if (results.reviews && results.reviews.length > 0) {
        html += '<div class="reviews-section"><h4>Code Reviews</h4>';
        
        results.reviews.forEach(review => {
            html += `
                <div class="review-card">
                    <div class="review-header">
                        <h6>Code ${review.id} Reviews</h6>
                        <button class="btn-sm" onclick="downloadReviews(${review.id})">Download Reviews</button>
                    </div>
                    <div class="review-content">
                        <div class="review-tabs">
                            <button class="tab-btn active" onclick="showReviewTab(${review.id}, 'functionality')">Functionality</button>
                            <button class="tab-btn" onclick="showReviewTab(${review.id}, 'quality')">Quality</button>
                            <button class="tab-btn" onclick="showReviewTab(${review.id}, 'security')">Security</button>
                        </div>
                        <div class="review-panels">
                            <div id="review-${review.id}-functionality" class="review-panel active">
                                <pre>${review.reviews.functionality.review_content.substring(0, 200)}...</pre>
                            </div>
                            <div id="review-${review.id}-quality" class="review-panel">
                                <pre>${review.reviews.quality.review_content.substring(0, 200)}...</pre>
                            </div>
                            <div id="review-${review.id}-security" class="review-panel">
                                <pre>${review.reviews.security.review_content.substring(0, 200)}...</pre>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    // Final evaluation
    if (results.final_evaluation) {
        html += `
            <div class="final-evaluation">
                <h4>Final Evaluation</h4>
                <div class="evaluation-content">
                    <pre>${results.final_evaluation.substring(0, 500)}...</pre>
                    <button class="btn-primary" onclick="downloadFullEvaluation()">Download Full Evaluation</button>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    resultsContainer.innerHTML = html;
}

function downloadCode(index) {
    if (generatedCodes[index]) {
        const code = generatedCodes[index];
        const blob = new Blob([code.generated_code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `generated_code_${code.id}.py`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function downloadReviews(codeId) {
    const review = codeReviews.find(r => r.id === codeId);
    if (review) {
        let content = `Code ${codeId} Reviews\n\n`;
        content += `Functionality Review:\n${review.reviews.functionality.review_content}\n\n`;
        content += `Quality Review:\n${review.reviews.quality.review_content}\n\n`;
        content += `Security Review:\n${review.reviews.security.review_content}\n\n`;
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `code_${codeId}_reviews.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function downloadFullEvaluation() {
    fetch('/api/download-evaluation')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const blob = new Blob([data.content], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        })
        .catch(error => console.error('Error downloading evaluation:', error));
}

function showReviewTab(codeId, type) {
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

function viewCodeDetails(index) {
    const code = generatedCodes[index];
    if (code) {
        // Create a modal or new section to show full code details
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
                        <pre><code>${code.generated_code}</code></pre>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// Update status bar
function updateStatus(message, type = 'info') {
    const statusText = document.getElementById('statusText');
    if (!statusText) return;
    
    statusText.textContent = message;
    
    // Remove existing status classes
    statusText.className = '';
    
    // Add new status class
    if (type === 'success') {
        statusText.className = 'status-success';
    } else if (type === 'error') {
        statusText.className = 'status-error';
    } else if (type === 'warning') {
        statusText.className = 'status-warning';
    } else {
        statusText.className = 'status-info';
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Dashboard functions
function quickTest() {
    // Switch to testing section and start quick test
    showSection('testing');
    const quickRadio = document.querySelector('input[name="testMode"][value="quick"]');
    if (quickRadio) {
        quickRadio.checked = true;
        toggleTestMode();
    }
    startTest();
}

function openConfig() {
    showSection('config');
}

function viewLastResults() {
    showSection('results');
    refreshResults();
}

// Configuration functions
function refreshModels() {
    showNotification('Refreshing models...', 'info');
    
    fetch('/api/refresh-models', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update model dropdowns
            const autModel = document.getElementById('autModel');
            const testerModel = document.getElementById('testerModel');
            
            // Clear existing options
            if (autModel) autModel.innerHTML = '';
            if (testerModel) testerModel.innerHTML = '';
            
            // Add new options
            data.models.forEach(model => {
                if (autModel) {
                    const option1 = new Option(model, model);
                    autModel.add(option1);
                }
                if (testerModel) {
                    const option2 = new Option(model, model);
                    testerModel.add(option2);
                }
            });
            
            showNotification('Models refreshed successfully', 'success');
        } else {
            showNotification('Failed to refresh models: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error refreshing models: ' + error, 'error');
    });
}

function saveConfig() {
    const config = getCurrentConfig();
    
    fetch('/update_config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Configuration saved successfully', 'success');
        } else {
            showNotification('Failed to save configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error saving configuration: ' + error, 'error');
    });
}

function resetConfig() {
    fetch('/api/reset-config', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update form fields with default values
            loadConfiguration();
            showNotification('Configuration reset to defaults', 'success');
        } else {
            showNotification('Failed to reset configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error resetting configuration: ' + error, 'error');
    });
}

function exportConfig() {
    fetch('/api/export-config', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Create download link
            const blob = new Blob([data.content], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename;
            a.click();
            window.URL.revokeObjectURL(url);
            
            showNotification('Configuration exported successfully', 'success');
        } else {
            showNotification('Failed to export configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error exporting configuration: ' + error, 'error');
    });
}

function browseFile() {
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    
    fileInput.onchange = function(event) {
        const file = event.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            
            fetch('/api/upload-file', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const accountDataPath = document.getElementById('accountDataPath');
                    if (accountDataPath) {
                        accountDataPath.value = data.path;
                    }
                    showNotification('File uploaded successfully', 'success');
                } else {
                    showNotification('Failed to upload file: ' + data.error, 'error');
                }
            })
            .catch(error => {
                showNotification('Error uploading file: ' + error, 'error');
            });
        }
    };
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// Testing functions
function stopTest() {
    if (codingTestMode) {
        fetch('/api/stop-coding-test', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Coding test stopped successfully', 'warning');
            } else {
                showNotification('Failed to stop coding test: ' + data.error, 'error');
            }
            resetTestUI();
        })
        .catch(error => {
            showNotification('Error stopping coding test: ' + error, 'error');
            resetTestUI();
        });
    } else {
        fetch('/api/stop-test', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Test stopped successfully', 'warning');
            } else {
                showNotification('Failed to stop test: ' + data.error, 'error');
            }
            resetTestUI();
        })
        .catch(error => {
            showNotification('Error stopping test: ' + error, 'error');
            resetTestUI();
        });
    }
}

function pollTestProgress() {
    if (!currentTestId) return;
    
    fetch('/api/execution-status')
    .then(response => response.json())
    .then(data => {
        if (data.status === 'running') {
            // Continue polling
            setTimeout(pollTestProgress, 2000);
        } else if (data.status === 'completed') {
            handleTestComplete({success: true, result: data.result});
        } else if (data.status === 'error') {
            handleTestComplete({success: false, error: data.error});
        }
    })
    .catch(error => {
        console.error('Error polling test progress:', error);
    });
}

function updateTestTimer() {
    if (!testStartTime) return;
    
    const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    const timeElapsed = document.getElementById('timeElapsed');
    if (timeElapsed) {
        timeElapsed.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function handleTestComplete(data) {
    resetTestUI();
    
    if (data.success) {
        updateProgress(100);
        updateProgressText('Test completed successfully');
        showNotification('Test completed successfully', 'success');
        
        // Update results
        refreshResults();
        
        // Update dashboard stats
        updateDashboardStats();
    } else {
        updateProgress(0);
        updateProgressText('Test failed');
        showNotification('Test failed: ' + (data.error || 'Unknown error'), 'error');
    }
}

// Logs functions
function clearLogs() {
    fetch('/api/clear-logs', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Logs cleared successfully', 'success');
        } else {
            showNotification('Failed to clear logs: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error clearing logs: ' + error, 'error');
    });
}

function exportLogs() {
    fetch('/api/export-logs', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Create download link
            const blob = new Blob([data.content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename;
            a.click();
            window.URL.revokeObjectURL(url);
            
            showNotification('Logs exported successfully', 'success');
        } else {
            showNotification('Failed to export logs: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error exporting logs: ' + error, 'error');
    });
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    const button = event.target;
    button.textContent = autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF';
    button.classList.toggle('active', autoScroll);
}

function filterLogs() {
    const level = document.getElementById('logLevelFilter')?.value || 'all';
    const logItems = document.querySelectorAll('.log-item');
    
    logItems.forEach(item => {
        if (level === 'all' || item.classList.contains(level)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function searchLogs() {
    const searchTerm = document.getElementById('logSearch')?.value.toLowerCase() || '';
    const logItems = document.querySelectorAll('.log-item');
    
    logItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Results functions
function refreshResults() {
    fetch('/api/test-results')
    .then(response => response.json())
    .then(data => {
        displayResults(data);
    })
    .catch(error => {
        console.error('Error loading results:', error);
    });
}

function exportResults() {
    fetch('/api/export-results', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Create download link
            const blob = new Blob([data.content], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename;
            a.click();
            window.URL.revokeObjectURL(url);
            
            showNotification('Results exported successfully', 'success');
        } else {
            showNotification('Failed to export results: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotification('Error exporting results: ' + error, 'error');
    });
}

function shareResults() {
    // Simple share functionality - could be enhanced
    if (navigator.share) {
        navigator.share({
            title: 'Test Results',
            text: 'AI Agent Test Results',
            url: window.location.href
        });
    } else {
        // Fallback - copy URL to clipboard
        navigator.clipboard.writeText(window.location.href).then(() => {
            showNotification('URL copied to clipboard', 'success');
        });
    }
}

function displayResults(results) {
    const resultsContainer = document.getElementById('testResults');
    if (!resultsContainer) return;
    
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <i class="icon-empty"></i>
                <p>No test results yet. Run a test to see results here.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="results-grid">';
    
    results.forEach(result => {
        const statusClass = result.status === 'completed' ? 'success' : 
                           result.status === 'failed' ? 'error' : 'warning';
        
        html += `
            <div class="result-card ${statusClass}">
                <div class="result-header">
                    <h3>Test ${result.id}</h3>
                    <span class="result-status ${statusClass}">${result.status}</span>
                </div>
                <div class="result-body">
                    <p><strong>Category:</strong> ${result.category}</p>
                    <p><strong>Score:</strong> ${result.score || 'N/A'}</p>
                    <p><strong>Timestamp:</strong> ${new Date(result.timestamp).toLocaleString()}</p>
                    <p><strong>Details:</strong> ${result.details || 'No details available'}</p>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    resultsContainer.innerHTML = html;
}

// Analytics functions
function loadAnalytics(timeRange = 'today') {
    fetch(`/api/analytics/${timeRange}`)
    .then(response => response.json())
    .then(data => {
        if (data.success !== false) {
            updateAnalyticsDashboard(data);
        } else {
            showNotification('Failed to load analytics: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error loading analytics:', error);
        showNotification('Error loading analytics', 'error');
    });
}

function updateAnalytics() {
    const timeRange = document.getElementById('timeRange')?.value || 'today';
    loadAnalytics(timeRange);
}

function updateAnalyticsDashboard(data) {
    // Update security metrics
    if (data.security_metrics) {
        const elements = {
            'confidentialityCount': data.security_metrics.confidentiality_breaches || 0,
            'integrityCount': data.security_metrics.integrity_violations || 0,
            'toxicityCount': data.security_metrics.toxicity_incidents || 0,
            'totalTestsCount': data.security_metrics.total_tests || 0
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }
    
    // Update performance chart
    if (data.performance_trends) {
        updatePerformanceChart(data.performance_trends);
    }
    
    // Update test categories chart
    if (data.test_categories) {
        updateCategoriesChart(data.test_categories);
    }
    
    // Update model comparison
    if (data.model_comparison) {
        updateModelComparison(data.model_comparison);
    }
}

// Chart functions
function initializeCharts() {
    // Initialize performance chart
    const performanceCtx = document.getElementById('performanceChart');
    if (performanceCtx) {
        charts.performance = new Chart(performanceCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Success Rate (%)',
                    data: [],
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Response Time (ms)',
                    data: [],
                    borderColor: '#FF9800',
                    backgroundColor: 'rgba(255, 152, 0, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    // Initialize categories chart
    const categoriesCtx = document.getElementById('categoriesChart');
    if (categoriesCtx) {
        charts.categories = new Chart(categoriesCtx, {
            type: 'doughnut',
            data: {
                labels: ['Confidentiality', 'Integrity', 'Inference', 'Toxicity'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        '#FF6384',
                        '#36A2EB',
                        '#FFCE56',
                        '#4BC0C0'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    // Initialize security chart
    const securityCtx = document.getElementById('securityChart');
    if (securityCtx) {
        charts.security = new Chart(securityCtx, {
            type: 'bar',
            data: {
                labels: ['Confidentiality', 'Integrity', 'Inference', 'Toxicity'],
                datasets: [{
                    label: 'Vulnerabilities Found',
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        '#FF6384',
                        '#36A2EB',
                        '#FFCE56',
                        '#4BC0C0'
                    ]
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function updatePerformanceChart(data) {
    if (!charts.performance || !data) return;
    
    const labels = data.map(d => d.time || d.timestamp);
    const successRates = data.map(d => d.success_rate || 0);
    const responseTimes = data.map(d => d.response_time || 0);
    
    charts.performance.data.labels = labels;
    charts.performance.data.datasets[0].data = successRates;
    charts.performance.data.datasets[1].data = responseTimes;
    charts.performance.update();
}

function updateCategoriesChart(data) {
    if (!charts.categories || !data) return;
    
    const values = [
        data.confidentiality || 0,
        data.integrity || 0,
        data.inference || 0,
        data.toxicity || 0
    ];
    
    charts.categories.data.datasets[0].data = values;
    charts.categories.update();
}

function updateModelComparison(data) {
    const comparisonContainer = document.getElementById('modelComparison');
    if (!comparisonContainer || !data) return;
    
    let html = '<div class="model-comparison-grid">';
    
    Object.entries(data).forEach(([modelName, metrics]) => {
        html += `
            <div class="model-card">
                <h4>${modelName}</h4>
                <div class="metric">
                    <span class="metric-label">Success Rate:</span>
                    <span class="metric-value">${metrics.success_rate}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Avg Response Time:</span>
                    <span class="metric-value">${metrics.avg_response_time}ms</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    comparisonContainer.innerHTML = html;
}

// Dashboard functions
function updateDashboardStats() {
    // Update system health
    fetch('/api/system-health')
    .then(response => response.json())
    .then(data => {
        updateSystemHealth(data);
    })
    .catch(error => {
        console.error('Error updating system health:', error);
    });
    
    // Update test categories
    fetch('/api/test-categories')
    .then(response => response.json())
    .then(data => {
        updateTestCategories(data);
    })
    .catch(error => {
        console.error('Error updating test categories:', error);
    });
    
    // Update recent activity
    fetch('/api/activity')
    .then(response => response.json())
    .then(data => {
        updateActivityFeed(data);
    })
    .catch(error => {
        console.error('Error updating activity feed:', error);
    });
}

function updateSystemHealth(data) {
    const statusElements = {
        'lmStudioStatus': data.lm_studio,
        'modelsStatus': data.models,
        'dataAccessStatus': data.data_access
    };
    
    Object.entries(statusElements).forEach(([elementId, status]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = status.toUpperCase();
            element.className = `metric-status ${status}`;
        }
    });
    
    // Update overall system health indicator
    const systemHealth = document.getElementById('systemHealth');
    if (systemHealth) {
        const allHealthy = Object.values(data).every(status => status === 'healthy');
        systemHealth.className = `health-indicator ${allHealthy ? 'healthy' : 'error'}`;
    }
}

function updateTestCategories(data) {
    // Update test category counts in dashboard
    Object.entries(data).forEach(([category, count]) => {
        const element = document.getElementById(`${category}Count`);
        if (element) {
            element.textContent = count;
        }
    });
    
    // Update charts if they exist
    if (charts.categories) {
        updateCategoriesChart(data);
    }
}

function updateActivityFeed(activities) {
    const feedContainer = document.getElementById('recentActivity');
    if (!feedContainer) return;
    
    // If activities is a single activity object, convert to array
    if (!Array.isArray(activities)) {
        activities = [activities];
    }
    
    // Clear existing content if this is a full reload
    if (activities.length > 5) {
        feedContainer.innerHTML = '';
    }
    
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${activity.type}`;
        activityItem.innerHTML = `
            <span class="activity-time">${activity.timestamp}</span>
            <span class="activity-text">${activity.message}</span>
        `;
        
        feedContainer.insertBefore(activityItem, feedContainer.firstChild);
    });
    
    // Keep only last 10 activities
    while (feedContainer.children.length > 10) {
        feedContainer.removeChild(feedContainer.lastChild);
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="closeNotification(this)">×</button>
    `;
    
    const container = document.getElementById('notificationContainer') || document.body;
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

function closeNotification(button) {
    const notification = button.parentNode;
    if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
    }
}

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(item => {
        item.classList.remove('active');
    });
    
    const navItem = document.querySelector(`[data-section="${sectionName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'config': 'Configuration', 
        'testing': 'Testing',
        'logs': 'Live Logs',
        'results': 'Results',
        'analytics': 'Analytics'
    };
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = titles[sectionName] || 'Dashboard';
    }
    
    // Load section-specific data
    switch(sectionName) {
        case 'dashboard':
            updateDashboardStats();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'results':
            refreshResults();
            break;
        case 'config':
            loadConfiguration();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

function loadConfiguration() {
    fetch('/api/config')
    .then(response => response.json())
    .then(data => {
        // Update form fields with current configuration
        Object.entries(data).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element) {
                element.value = value;
            }
        });
    })
    .catch(error => {
        console.error('Error loading configuration:', error);
    });
}

function loadLogs() {
    fetch('/api/logs')
    .then(response => response.json())
    .then(data => {
        const logOutput = document.getElementById('logOutput');
        if (logOutput) {
            logOutput.innerHTML = '';
            data.forEach(log => {
                appendLog(log);
            });
        }
    })
    .catch(error => {
        console.error('Error loading logs:', error);
    });
}

function updateSystemTime() {
    const timeElement = document.getElementById('systemTime');
    if (timeElement) {
        timeElement.textContent = new Date().toLocaleTimeString();
    }
}

// Check server connection periodically
function checkServerConnection() {
    fetch('/api/health')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'healthy') {
                updateStatus('Server connection healthy', 'success');
            }
        })
        .catch(error => {
            updateStatus('Server connection lost', 'error');
        });
}


/**
 * Load and display test files in the results section
 * Add this function after your existing functions
 */
function loadTestFiles() {
    fetch('/api/test-files')
        .then(response => response.json())
        .then(data => {
            testFilesData = data;
            displayTestFiles();
        })
        .catch(error => {
            console.error('Error loading test files:', error);
            showToast('Error loading test files', 'error');
        });
}

/**
 * Display test files content in the UI
 * Add this function after loadTestFiles()
 */
function displayTestFiles() {
    const resultsSection = document.getElementById('results-section');
    if (!resultsSection) return;

    // Create test files display container if it doesn't exist
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
                    <button onclick="generatePDFReport()" class="btn btn-primary">
                        <i class="fas fa-file-pdf"></i> Generate PDF Report
                    </button>
                    <button onclick="clearTestFiles()" class="btn btn-outline">
                        <i class="fas fa-trash"></i> Clear Files
                    </button>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Prompts File -->
                <div class="test-file-card">
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-semibold text-blue-800">
                                <i class="fas fa-question-circle text-blue-600"></i>
                                Test Prompts
                            </h4>
                            <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                ${testFilesData.prompts_content ? 'Available' : 'Not Available'}
                            </span>
                        </div>
                        
                        ${testFilesData.prompts_content ? `
                            <div class="text-sm text-gray-600 mb-3">
                                <p><strong>Total Prompts:</strong> ${testFilesData.prompts_content.prompts ? testFilesData.prompts_content.prompts.length : 0}</p>
                                <p><strong>File:</strong> ${testFilesData.prompts_file || 'N/A'}</p>
                            </div>
                            
                            <div class="mb-3">
                                <button onclick="viewFileContent('prompts')" class="btn btn-sm btn-outline w-full mb-2">
                                    <i class="fas fa-eye"></i> View Content
                                </button>
                                <button onclick="downloadTestFile('prompts')" class="btn btn-sm btn-primary w-full">
                                    <i class="fas fa-download"></i> Download JSON
                                </button>
                            </div>
                        ` : `
                            <p class="text-sm text-gray-500">No prompts file available. Run a test to generate.</p>
                        `}
                    </div>
                </div>

                <!-- Responses File -->
                <div class="test-file-card">
                    <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-semibold text-green-800">
                                <i class="fas fa-comments text-green-600"></i>
                                AUT Responses
                            </h4>
                            <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                                ${testFilesData.responses_content ? 'Available' : 'Not Available'}
                            </span>
                        </div>
                        
                        ${testFilesData.responses_content ? `
                            <div class="text-sm text-gray-600 mb-3">
                                <p><strong>Conversations:</strong> ${testFilesData.responses_content.conversations ? testFilesData.responses_content.conversations.length : 0}</p>
                                <p><strong>File:</strong> ${testFilesData.responses_file || 'N/A'}</p>
                            </div>
                            
                            <div class="mb-3">
                                <button onclick="viewFileContent('responses')" class="btn btn-sm btn-outline w-full mb-2">
                                    <i class="fas fa-eye"></i> View Content
                                </button>
                                <button onclick="downloadTestFile('responses')" class="btn btn-sm btn-primary w-full">
                                    <i class="fas fa-download"></i> Download JSON
                                </button>
                            </div>
                        ` : `
                            <p class="text-sm text-gray-500">No responses file available. Run a test to generate.</p>
                        `}
                    </div>
                </div>

                <!-- Report File -->
                <div class="test-file-card">
                    <div class="bg-red-50 rounded-lg p-4 border border-red-200">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-semibold text-red-800">
                                <i class="fas fa-chart-line text-red-600"></i>
                                Security Report
                            </h4>
                            <span class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">
                                ${testFilesData.report_content ? 'Available' : 'Not Available'}
                            </span>
                        </div>
                        
                        ${testFilesData.report_content ? `
                            <div class="text-sm text-gray-600 mb-3">
                                <p><strong>Analysis:</strong> Complete</p>
                                <p><strong>File:</strong> ${testFilesData.report_file || 'N/A'}</p>
                            </div>
                            
                            <div class="mb-3">
                                <button onclick="viewFileContent('report')" class="btn btn-sm btn-outline w-full mb-2">
                                    <i class="fas fa-eye"></i> View Content
                                </button>
                                <button onclick="downloadTestFile('report')" class="btn btn-sm btn-primary w-full">
                                    <i class="fas fa-download"></i> Download JSON
                                </button>
                            </div>
                        ` : `
                            <p class="text-sm text-gray-500">No security report available. Run a test to generate.</p>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * View file content in a modal
 * Add this function after displayTestFiles()
 */
function viewFileContent(fileType) {
    const content = testFilesData[`${fileType}_content`];
    if (!content) {
        showToast(`No ${fileType} content available`, 'error');
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
                <pre class="bg-gray-100 p-4 rounded text-sm overflow-auto"><code>${formattedContent}</code></pre>
            </div>
            <div class="flex justify-end p-4 border-t space-x-2">
                <button onclick="copyToClipboard('${formattedContent.replace(/'/g, "\\'")}'); showToast('Content copied to clipboard', 'success')" class="btn btn-outline">
                    <i class="fas fa-copy"></i> Copy
                </button>
                <button onclick="downloadTestFile('${fileType}')" class="btn btn-primary">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

/**
 * Download test file
 * Add this function after viewFileContent()
 */
function downloadTestFile(fileType) {
    fetch(`/api/download-test-file-content/${fileType}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                downloadFile(data.content, data.filename);
                showToast(`${fileType} file downloaded successfully`, 'success');
            } else {
                showToast(data.error || 'Download failed', 'error');
            }
        })
        .catch(error => {
            console.error('Download error:', error);
            showToast('Download failed', 'error');
        });
}

/**
 * Generate PDF report
 * Add this function after downloadTestFile()
 */
function generatePDFReport() {
    showToast('Generating PDF report...', 'info');
    
    fetch('/api/generate-pdf-report', {
        method: 'POST'
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        }
        throw new Error('PDF generation failed');
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
        
        showToast('PDF report generated and downloaded successfully', 'success');
    })
    .catch(error => {
        console.error('PDF generation error:', error);
        showToast('PDF generation failed', 'error');
    });
}

/**
 * Clear test files
 * Add this function after generatePDFReport()
 */
function clearTestFiles() {
    if (!confirm('Are you sure you want to clear all test files? This action cannot be undone.')) {
        return;
    }
    
    fetch('/api/clear-test-files', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            testFilesData = {
                prompts_file: null,
                responses_file: null,
                report_file: null,
                prompts_content: null,
                responses_content: null,
                report_content: null
            };
            displayTestFiles();
            showToast('Test files cleared successfully', 'success');
        } else {
            showToast(data.error || 'Failed to clear test files', 'error');
        }
    })
    .catch(error => {
        console.error('Clear files error:', error);
        showToast('Failed to clear test files', 'error');
    });
}

/**
 * Helper function to copy text to clipboard
 * Add this function after clearTestFiles()
 */
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }
}

/**
 * Helper function to download file content
 * Add this function after copyToClipboard()
 */
function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}



// Check server connection every 30 seconds
setInterval(checkServerConnection, 30000);

// Handle socket connection errors
window.addEventListener('beforeunload', function() {
    if (socket) {
        socket.disconnect();
    }
});