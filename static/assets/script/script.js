// Global variables
let socket;
let isTestRunning = false;

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