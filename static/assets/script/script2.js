// Global variables
let socket;
let isTestRunning = false;

// Global variables

let charts = {};
let autoScroll = true;
let currentTestId = null;
let testTimer = null;
let testStartTime = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeSocketIO();
    loadAvailableModels();
    setupEventListeners();
});

// Initialize Socket.IO connection
function initializeSocketIO() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
        updateStatus('Connected to server', 'success');
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        updateStatus('Disconnected from server', 'error');
    });
    
    socket.on('log_update', function(data) {
        appendLog(data.message, data.level);
    });
    
    socket.on('process_complete', function(data) {
        isTestRunning = false;
        hideSpinner();
        
        if (data.success) {
            updateStatus('Test completed successfully', 'success');
            showTestResults(data.result);
        } else {
            updateStatus('Test failed: ' + (data.error || 'Unknown error'), 'error');
            showTestResults('Test failed: ' + (data.error || 'Unknown error'));
        }
        
        // Re-enable the start button
        document.getElementById('startTest').disabled = false;
        document.getElementById('startTest').textContent = 'Start Agent Validity Test';
    });
    
    socket.on('connected', function(data) {
        console.log('Socket.IO connected:', data.message);
    });
}

// Load available models from LM Studio
function loadAvailableModels() {
    fetch('/get_models')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('autModel');
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
        })
        .catch(error => {
            console.error('Error loading models:', error);
            updateStatus('Error loading models: ' + error.message, 'error');
            
            // Add default option on error
            const select = document.getElementById('autModel');
            select.innerHTML = '';
            const option = document.createElement('option');
            option.value = 'qwen/qwen3-8b';
            option.textContent = 'qwen/qwen3-8b (default)';
            select.appendChild(option);
        });
}

// Setup event listeners
function setupEventListeners() {
    const startTestBtn = document.getElementById('startTest');
    
    startTestBtn.addEventListener('click', function() {
        if (isTestRunning) {
            return;
        }
        
        startTest();
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

// Start the test process
function startTest() {
    if (isTestRunning) {
        return;
    }
    
    isTestRunning = true;
    
    // Update UI
    const startBtn = document.getElementById('startTest');
    startBtn.disabled = true;
    startBtn.textContent = 'Running Test...';
    
    // Show spinner
    showSpinner();
    
    // Clear previous logs and results
    clearLogs();
    clearResults();
    
    // Collect configuration
    const config = {
        aut_model: document.getElementById('autModel').value,
        aut_role: document.getElementById('autRole').value,
        aut_backstory: document.getElementById('autBackstory').value,
        aut_system_prompt: document.getElementById('autSystemPrompt').value
    };
    
    // Validate configuration
    if (!config.aut_model || !config.aut_role || !config.aut_backstory || !config.aut_system_prompt) {
        updateStatus('Please fill in all configuration fields', 'error');
        resetTestUI();
        return;
    }
    
    appendLog('Updating configuration...', 'info');
    
    // Update configuration on server
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
            appendLog('Configuration updated successfully', 'success');
            // Start the test
            return fetch('/start_test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            throw new Error(data.error || 'Failed to update configuration');
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateStatus('Test started successfully', 'success');
            appendLog('=== Test Started ===', 'info');
            appendLog('Loading model and initializing agent...', 'info');
        } else {
            throw new Error(data.error || 'Failed to start test');
        }
    })
    .catch(error => {
        console.error('Error starting test:', error);
        updateStatus('Error starting test: ' + error.message, 'error');
        appendLog('Error: ' + error.message, 'error');
        resetTestUI();
    });
}

// Reset test UI
function resetTestUI() {
    isTestRunning = false;
    hideSpinner();
    
    const startBtn = document.getElementById('startTest');
    startBtn.disabled = false;
    startBtn.textContent = 'Start Agent Validity Test';
}

// Append log message to the log output
function appendLog(message, level = 'info') {
    const logOutput = document.getElementById('logOutput');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${level}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-level">[${level.toUpperCase()}]</span>
        <span class="log-message">${escapeHtml(message)}</span>
    `;
    
    logOutput.appendChild(logEntry);
    logOutput.scrollTop = logOutput.scrollHeight;
}

// Clear logs
function clearLogs() {
    document.getElementById('logOutput').innerHTML = '';
}

// Clear results
function clearResults() {
    document.getElementById('testResults').innerHTML = '<p>Running test...</p>';
}

// Show test results
function showTestResults(result) {
    const resultsDiv = document.getElementById('testResults');
    
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

// Update status bar
function updateStatus(message, type = 'info') {
    const statusText = document.getElementById('statusText');
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

// Show loading spinner
function showSpinner() {
    document.getElementById('loadingSpinner').style.display = 'block';
}

// Hide loading spinner
function hideSpinner() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// Check server connection every 30 seconds
setInterval(checkServerConnection, 30000);


// Initialize socket connection
function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
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
    });
    
    socket.on('logs_cleared', function() {
        clearLogOutput();
    });
}

// Connection status
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionIndicator');
    const text = document.getElementById('connectionText');
    
    if (connected) {
        indicator.className = 'status-indicator online';
        text.textContent = 'Connected';
    } else {
        indicator.className = 'status-indicator offline';
        text.textContent = 'Disconnected';
    }
}

// Dashboard functions
function quickTest() {
    // Switch to testing section and start quick test
    showSection('testing');
    document.querySelector('input[name="testMode"][value="quick"]').checked = true;
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
            autModel.innerHTML = '';
            testerModel.innerHTML = '';
            
            // Add new options
            data.models.forEach(model => {
                const option1 = new Option(model, model);
                const option2 = new Option(model, model);
                autModel.add(option1);
                testerModel.add(option2);
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
    const config = {
        aut_model: document.getElementById('autModel').value,
        tester_model: document.getElementById('testerModel').value,
        aut_role: document.getElementById('autRole').value,
        aut_backstory: document.getElementById('autBackstory').value,
        aut_system_prompt: document.getElementById('autSystemPrompt').value,
        max_rounds: document.getElementById('maxRounds').value,
        timeout: document.getElementById('timeout').value,
        account_data_path: document.getElementById('accountDataPath').value
    };
    
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
                    document.getElementById('accountDataPath').value = data.path;
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
function startTest() {
    const startBtn = document.getElementById('startTestBtn');
    const stopBtn = document.getElementById('stopTestBtn');
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    // Get test configuration
    const testMode = document.querySelector('input[name="testMode"]:checked').value;
    const categories = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
                          .map(cb => cb.value);
    
    // Reset progress
    updateProgress(0, 'Starting test...');
    
    // Start timer
    testStartTime = Date.now();
    testTimer = setInterval(updateTestTimer, 1000);
    
    fetch('/start_test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            test_mode: testMode,
            categories: categories
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentTestId = data.execution_id;
            showNotification('Test started successfully', 'success');
            
            // Poll for progress updates
            pollTestProgress();
        } else {
            showNotification('Failed to start test: ' + data.error, 'error');
            resetTestUI();
        }
    })
    .catch(error => {
        showNotification('Error starting test: ' + error, 'error');
        resetTestUI();
    });
}

function stopTest() {
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

function updateProgress(percentage, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressFill.style.width = percentage + '%';
    progressText.textContent = text;
}

function updateTestTimer() {
    if (!testStartTime) return;
    
    const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    document.getElementById('timeElapsed').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function handleTestComplete(data) {
    resetTestUI();
    
    if (data.success) {
        updateProgress(100, 'Test completed successfully');
        showNotification('Test completed successfully', 'success');
        
        // Update results
        refreshResults();
        
        // Update dashboard stats
        updateDashboardStats();
    } else {
        updateProgress(0, 'Test failed');
        showNotification('Test failed: ' + (data.error || 'Unknown error'), 'error');
    }
}

function resetTestUI() {
    const startBtn = document.getElementById('startTestBtn');
    const stopBtn = document.getElementById('stopTestBtn');
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    if (testTimer) {
        clearInterval(testTimer);
        testTimer = null;
    }
    
    currentTestId = null;
    testStartTime = null;
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
    const level = document.getElementById('logLevelFilter').value;
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
    const searchTerm = document.getElementById('logSearch').value.toLowerCase();
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

function appendLog(logData) {
    const logOutput = document.getElementById('logOutput');
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

function clearLogOutput() {
    document.getElementById('logOutput').innerHTML = '';
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
// Continuation from the incomplete script.js

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

function displayResults(results) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) return;
    
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No test results available</div>';
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

function filterResults() {
    const filter = document.getElementById('resultsFilter').value;
    const cards = document.querySelectorAll('.result-card');
    
    cards.forEach(card => {
        if (filter === 'all' || card.classList.contains(filter)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
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

function updateAnalyticsDashboard(data) {
    // Update security metrics
    if (data.security_metrics) {
        document.getElementById('confidentialityCount').textContent = data.security_metrics.confidentiality_breaches || 0;
        document.getElementById('integrityCount').textContent = data.security_metrics.integrity_violations || 0;
        document.getElementById('toxicityCount').textContent = data.security_metrics.toxicity_incidents || 0;
        document.getElementById('totalTestsCount').textContent = data.security_metrics.total_tests || 0;
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

function changeAnalyticsTimeRange(timeRange) {
    // Update active button
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Load new data
    loadAnalytics(timeRange);
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
    
    // Initialize security trends chart
    const securityCtx = document.getElementById('securityTrendsChart');
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

function updateSecurityTrendsChart(data) {
    if (!charts.security || !data) return;
    
    const values = [
        data.confidentiality || 0,
        data.integrity || 0,
        data.inference || 0,
        data.toxicity || 0
    ];
    
    charts.security.data.datasets[0].data = values;
    charts.security.update();
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
    const healthIndicators = {
        'lm_studio': document.getElementById('lmStudioHealth'),
        'models': document.getElementById('modelsHealth'),
        'data_access': document.getElementById('dataAccessHealth')
    };
    
    Object.entries(data).forEach(([key, status]) => {
        const indicator = healthIndicators[key];
        if (indicator) {
            indicator.className = `health-indicator ${status}`;
            indicator.textContent = status.toUpperCase();
        }
    });
}

function updateTestCategories(data) {
    Object.entries(data).forEach(([category, count]) => {
        const element = document.getElementById(`${category}Count`);
        if (element) {
            element.textContent = count;
        }
    });
}

function updateActivityFeed(activities) {
    const feedContainer = document.getElementById('activityFeed');
    if (!feedContainer) return;
    
    // If activities is a single activity object, convert to array
    if (!Array.isArray(activities)) {
        activities = [activities];
    }
    
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${activity.type}`;
        activityItem.innerHTML = `
            <span class="activity-time">${activity.timestamp}</span>
            <span class="activity-message">${activity.message}</span>
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
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const navItem = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (navItem) {
        navItem.classList.add('active');
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
        if (data.aut_model) {
            const autModelSelect = document.getElementById('autModel');
            if (autModelSelect) {
                autModelSelect.value = data.aut_model;
            }
        }
        
        if (data.account_data_path) {
            const accountPathInput = document.getElementById('accountDataPath');
            if (accountPathInput) {
                accountPathInput.value = data.account_data_path;
            }
        }
        
        // Load additional configuration fields if they exist
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

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket connection
    initializeSocket();
    
    // Initialize charts
    initializeCharts();
    
    // Load initial data
    updateDashboardStats();
    
    // Load models for configuration
    refreshModels();
    
    // Set up periodic updates
    setInterval(updateDashboardStats, 30000); // Update every 30 seconds
    
    // Show dashboard by default
    showSection('dashboard');
});

// Global error handler
// window.addEventListener('error', function(e) {
//     console.error('Global error:', e);
//     showNotification('An unexpected error occurred', 'error');
// });

// Handle socket connection errors
window.addEventListener('beforeunload', function() {
    if (socket) {
        socket.disconnect();
    }
});