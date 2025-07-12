// main.js - Main initialization and navigation
import { SocketManager } from './socket-manager.js';
import { TestManager } from './test-manager.js';
import { UIManager } from './ui-manager.js';
import { Utils } from './utils.js';

// Global instances
window.socketManager = null;
window.testManager = null;
window.uiManager = null;
window.utils = new Utils();

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize managers
    window.socketManager = new SocketManager();
    window.testManager = new TestManager();
    window.uiManager = new UIManager();
    
    // Initialize components
    initializeApp();
    setupEventListeners();
    initializeTheme();
    
    // Start periodic updates
    setInterval(updateDashboardStats, 30000);
    setInterval(updateSystemTime, 1000);
    setInterval(checkServerConnection, 30000);
    
    // Show initial section
    showSection('dashboard');
});

function initializeApp() {
    // Initialize socket connection
    window.socketManager.initialize();
    
    // Initialize UI components
    window.uiManager.initializeCharts();
    window.uiManager.injectTestFilesStyles();
    
    // Load initial data
    loadAvailableModels();
    updateDashboardStats();
    window.testManager.loadTestFiles();
    updateResults();
}

function setupEventListeners() {
    // Navigation listeners
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            if (section) {
                showSection(section);
            }
        });
    });
    
    // Configuration change listeners
    const configInputs = ['autModel', 'autRole', 'autBackstory', 'autSystemPrompt'];
    configInputs.forEach(inputId => {
        const element = document.getElementById(inputId);
        if (element) {
            element.addEventListener('change', function() {
                window.uiManager.updateStatus('Configuration changed', 'info');
            });
        }
    });
    
    // Handle page unload
    window.addEventListener('beforeunload', function() {
        if (window.socketManager && window.socketManager.socket) {
            window.socketManager.socket.disconnect();
        }
    });
}

// Theme Management
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Navigation
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

// Dashboard functions
function updateDashboardStats() {
    // Update system health
    fetch('/api/system-health')
        .then(response => response.json())
        .then(data => {
            window.uiManager.updateSystemHealth(data);
        })
        .catch(error => {
            console.error('Error updating system health:', error);
        });
    
    // Update test categories
    fetch('/api/test-categories')
        .then(response => response.json())
        .then(data => {
            window.uiManager.updateTestCategories(data);
        })
        .catch(error => {
            console.error('Error updating test categories:', error);
        });
    
    // Update recent activity
    fetch('/api/activity')
        .then(response => response.json())
        .then(data => {
            window.uiManager.updateActivityFeed(data);
        })
        .catch(error => {
            console.error('Error updating activity feed:', error);
        });
}

function updateSystemTime() {
    const timeElement = document.getElementById('systemTime');
    if (timeElement) {
        timeElement.textContent = new Date().toLocaleTimeString();
    }
}

function checkServerConnection() {
    fetch('/api/health')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'healthy') {
                window.uiManager.updateStatus('Server connection healthy', 'success');
            }
        })
        .catch(error => {
            window.uiManager.updateStatus('Server connection lost', 'error');
        });
}

// Model Management
function loadAvailableModels() {
    fetch('/get_models')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('autModel');
            if (select) {
                select.innerHTML = '';
                
                if (data.models && data.models.length > 0) {
                    data.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model;
                        option.textContent = model;
                        select.appendChild(option);
                    });
                    window.uiManager.updateStatus('Models loaded successfully', 'success');
                } else {
                    const option = document.createElement('option');
                    option.value = 'qwen/qwen3-8b';
                    option.textContent = 'qwen/qwen3-8b (default)';
                    select.appendChild(option);
                    window.uiManager.updateStatus('No models found, using default', 'warning');
                }
            }
        })
        .catch(error => {
            console.error('Error loading models:', error);
            window.uiManager.updateStatus('Error loading models: ' + error.message, 'error');
            
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

function refreshModels() {
    window.uiManager.showNotification('Refreshing models...', 'info');
    
    fetch('/api/refresh-models', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const autModel = document.getElementById('autModel');
            const testerModel = document.getElementById('testerModel');
            
            if (autModel) autModel.innerHTML = '';
            if (testerModel) testerModel.innerHTML = '';
            
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
            
            window.uiManager.showNotification('Models refreshed successfully', 'success');
        } else {
            window.uiManager.showNotification('Failed to refresh models: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error refreshing models: ' + error, 'error');
    });
}

// Configuration functions
function loadConfiguration() {
    fetch('/api/config')
        .then(response => response.json())
        .then(data => {
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

function saveConfig() {
    const config = window.testManager.getCurrentConfig();
    
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
            window.uiManager.showNotification('Configuration saved successfully', 'success');
        } else {
            window.uiManager.showNotification('Failed to save configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error saving configuration: ' + error, 'error');
    });
}

function resetConfig() {
    fetch('/api/reset-config', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadConfiguration();
            window.uiManager.showNotification('Configuration reset to defaults', 'success');
        } else {
            window.uiManager.showNotification('Failed to reset configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error resetting configuration: ' + error, 'error');
    });
}

function exportConfig() {
    fetch('/api/export-config', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.utils.downloadFile(data.content, data.filename, 'application/json');
            window.uiManager.showNotification('Configuration exported successfully', 'success');
        } else {
            window.uiManager.showNotification('Failed to export configuration: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error exporting configuration: ' + error, 'error');
    });
}

function browseFile() {
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
                    window.uiManager.showNotification('File uploaded successfully', 'success');
                } else {
                    window.uiManager.showNotification('Failed to upload file: ' + data.error, 'error');
                }
            })
            .catch(error => {
                window.uiManager.showNotification('Error uploading file: ' + error, 'error');
            });
        }
    };
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// Analytics functions
function loadAnalytics(timeRange = 'today') {
    fetch(`/api/analytics/${timeRange}`)
        .then(response => response.json())
        .then(data => {
            if (data.success !== false) {
                window.uiManager.updateAnalyticsDashboard(data);
            } else {
                window.uiManager.showNotification('Failed to load analytics: ' + data.error, 'error');
            }
        })
        .catch(error => {
            console.error('Error loading analytics:', error);
            window.uiManager.showNotification('Error loading analytics', 'error');
        });
}

function updateAnalytics() {
    const timeRange = document.getElementById('timeRange')?.value || 'today';
    loadAnalytics(timeRange);
}

// Results functions
function updateResults() {
    fetch('/api/test-results')
        .then(response => response.json())
        .then(data => {
            window.uiManager.displayResults(data);
            window.uiManager.updateResultsSummary(data);
            updateDashboardStats();
        })
        .catch(error => {
            console.error('Error loading test results:', error);
            window.uiManager.showNotification('Error loading test results', 'error');
        });
    
    fetch('/api/test-categories')
        .then(response => response.json())
        .then(data => {
            window.uiManager.updateTestCategories(data);
        })
        .catch(error => {
            console.error('Error loading test categories:', error);
        });
    
    window.testManager.loadTestFiles();
}

function refreshResults() {
    fetch('/api/test-results')
        .then(response => response.json())
        .then(data => {
            window.uiManager.displayResults(data);
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
            window.utils.downloadFile(data.content, data.filename, 'text/csv');
            window.uiManager.showNotification('Results exported successfully', 'success');
        } else {
            window.uiManager.showNotification('Failed to export results: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error exporting results: ' + error, 'error');
    });
}

function shareResults() {
    if (navigator.share) {
        navigator.share({
            title: 'Test Results',
            text: 'AI Agent Test Results',
            url: window.location.href
        });
    } else {
        navigator.clipboard.writeText(window.location.href).then(() => {
            window.uiManager.showNotification('URL copied to clipboard', 'success');
        });
    }
}

// Logs functions
function loadLogs() {
    fetch('/api/logs')
        .then(response => response.json())
        .then(data => {
            const logOutput = document.getElementById('logOutput');
            if (logOutput) {
                logOutput.innerHTML = '';
                data.forEach(log => {
                    window.uiManager.appendLog(log);
                });
            }
        })
        .catch(error => {
            console.error('Error loading logs:', error);
        });
}

function clearLogs() {
    fetch('/api/clear-logs', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.uiManager.showNotification('Logs cleared successfully', 'success');
        } else {
            window.uiManager.showNotification('Failed to clear logs: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error clearing logs: ' + error, 'error');
    });
}

function exportLogs() {
    fetch('/api/export-logs', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.utils.downloadFile(data.content, data.filename, 'text/plain');
            window.uiManager.showNotification('Logs exported successfully', 'success');
        } else {
            window.uiManager.showNotification('Failed to export logs: ' + data.error, 'error');
        }
    })
    .catch(error => {
        window.uiManager.showNotification('Error exporting logs: ' + error, 'error');
    });
}

// Dashboard quick actions
function quickTest() {
    showSection('testing');
    const quickRadio = document.querySelector('input[name="testMode"][value="quick"]');
    if (quickRadio) {
        quickRadio.checked = true;
        window.testManager.toggleTestMode();
    }
    window.testManager.startTest();
}

function openConfig() {
    showSection('config');
}

function viewLastResults() {
    showSection('results');
    refreshResults();
}

// Export functions to global scope for HTML onclick handlers
window.toggleTheme = toggleTheme;
window.showSection = showSection;
window.refreshModels = refreshModels;
window.saveConfig = saveConfig;
window.resetConfig = resetConfig;
window.exportConfig = exportConfig;
window.browseFile = browseFile;
window.updateAnalytics = updateAnalytics;
window.refreshResults = refreshResults;
window.exportResults = exportResults;
window.shareResults = shareResults;
window.clearLogs = clearLogs;
window.exportLogs = exportLogs;
window.quickTest = quickTest;
window.openConfig = openConfig;
window.viewLastResults = viewLastResults;
window.startTest = function() {
    window.testManager.startTest();
};