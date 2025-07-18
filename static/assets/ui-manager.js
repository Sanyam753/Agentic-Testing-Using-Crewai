// ui-manager.js - UI updates, charts, notifications
export class UIManager {
    constructor() {
        this.charts = {};
        this.autoScroll = true;
    }

    // Chart initialization
    initializeCharts() {
        // Initialize performance chart
        const performanceCtx = document.getElementById('performanceChart');
        if (performanceCtx) {
            this.charts.performance = new Chart(performanceCtx, {
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
            this.charts.categories = new Chart(categoriesCtx, {
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
            this.charts.security = new Chart(securityCtx, {
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

    // Status updates
    updateStatus(message, type = 'info') {
        const statusText = document.getElementById('statusText');
        if (!statusText) return;
        
        statusText.textContent = message;
        statusText.className = '';
        
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

    // Progress updates
    updateProgress(percentage) {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = percentage + '%';
        }
    }

    updateProgressText(message) {
        const progressText = document.getElementById('progressText');
        if (progressText) {
            progressText.textContent = message;
        }
    }

    // Notifications
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        const container = document.getElementById('notificationContainer') || document.body;
        container.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Log management
    appendLog(logData) {
        const logOutput = document.getElementById('logOutput');
        if (!logOutput) return;
        
        const logItem = document.createElement('div');
        logItem.className = `log-item ${logData.level}`;
        logItem.innerHTML = `
            <span class="log-timestamp">${logData.timestamp}</span>
            <span class="log-level">${logData.level.toUpperCase()}</span>
            <span class="log-message">${window.utils.escapeHtml(logData.message)}</span>
        `;
        
        logOutput.appendChild(logItem);
        
        if (this.autoScroll) {
            logOutput.scrollTop = logOutput.scrollHeight;
        }
        
        // Keep only last 1000 log entries
        while (logOutput.children.length > 1000) {
            logOutput.removeChild(logOutput.firstChild);
        }
    }

    appendLogMessage(message, level = 'info') {
        const logOutput = document.getElementById('logOutput');
        if (!logOutput) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level">[${level.toUpperCase()}]</span>
            <span class="log-message">${window.utils.escapeHtml(message)}</span>
        `;
        
        logOutput.appendChild(logEntry);
        if (this.autoScroll) {
            logOutput.scrollTop = logOutput.scrollHeight;
        }
    }

    clearLogs() {
        const logOutput = document.getElementById('logOutput');
        if (logOutput) {
            logOutput.innerHTML = '';
        }
    }

    clearLogOutput() {
        this.clearLogs();
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        const button = event.target;
        button.textContent = this.autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF';
        button.classList.toggle('active', this.autoScroll);
    }

    filterLogs() {
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

    searchLogs() {
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

    // Dashboard updates
    updateSystemHealth(data) {
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
        
        const systemHealth = document.getElementById('systemHealth');
        if (systemHealth) {
            const allHealthy = Object.values(data).every(status => status === 'healthy');
            systemHealth.className = `health-indicator ${allHealthy ? 'healthy' : 'healthy'}`;
        }
    }

    updateTestCategories(data) {
        Object.entries(data).forEach(([category, count]) => {
            const element = document.getElementById(`${category}Count`);
            if (element) {
                element.textContent = count;
            }
        });
        
        if (this.charts.categories) {
            this.updateCategoriesChart(data);
        }
    }

    updateActivityFeed(activities) {
        const feedContainer = document.getElementById('recentActivity');
        if (!feedContainer) return;
        
        if (!Array.isArray(activities)) {
            activities = [activities];
        }
        
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
        
        while (feedContainer.children.length > 10) {
            feedContainer.removeChild(feedContainer.lastChild);
        }
    }

    // Chart updates
    updatePerformanceChart(data) {
        if (!this.charts.performance || !data) return;
        
        const labels = data.map(d => d.time || d.timestamp);
        const successRates = data.map(d => d.success_rate || 0);
        const responseTimes = data.map(d => d.response_time || 0);
        
        this.charts.performance.data.labels = labels;
        this.charts.performance.data.datasets[0].data = successRates;
        this.charts.performance.data.datasets[1].data = responseTimes;
        this.charts.performance.update();
    }

    updateCategoriesChart(data) {
        if (!this.charts.categories || !data) return;
        
        const values = [
            data.confidentiality || 0,
            data.integrity || 0,
            data.inference || 0,
            data.toxicity || 0
        ];
        
        this.charts.categories.data.datasets[0].data = values;
        this.charts.categories.update();
    }

    updateModelComparison(data) {
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

    // Analytics dashboard
    updateAnalyticsDashboard(data) {
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
        
        if (data.performance_trends) {
            this.updatePerformanceChart(data.performance_trends);
        }
        
        if (data.test_categories) {
            this.updateCategoriesChart(data.test_categories);
        }
        
        if (data.model_comparison) {
            this.updateModelComparison(data.model_comparison);
        }
    }

    // Results display
    displayResults(results) {
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

    displayCodingResults(results) {
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
                            <button class="btn-sm" onclick="window.testManager.downloadCode(${index})">Download Code</button>
                            <button class="btn-sm" onclick="window.testManager.viewCodeDetails(${index})">View Details</button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="code-info">
                            <p><strong>Category:</strong> ${codeInfo.category}</p>
                            <p><strong>Difficulty:</strong> ${codeInfo.difficulty}</p>
                            <p><strong>Prompt:</strong> ${codeInfo.prompt}</p>
                        </div>
                        <div class="code-preview">
                            <pre><code>${window.utils.escapeHtml(codeInfo.generated_code.substring(0, 300))}...</code></pre>
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
                            <button class="btn-sm" onclick="window.testManager.downloadReviews(${review.id})">Download Reviews</button>
                        </div>
                        <div class="review-content">
                            <div class="review-tabs">
                                <button class="tab-btn active" onclick="window.testManager.showReviewTab(${review.id}, 'functionality')">Functionality</button>
                                <button class="tab-btn" onclick="window.testManager.showReviewTab(${review.id}, 'quality')">Quality</button>
                                <button class="tab-btn" onclick="window.testManager.showReviewTab(${review.id}, 'security')">Security</button>
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
                        <button class="btn-primary" onclick="window.testManager.downloadFullEvaluation()">Download Full Evaluation</button>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        resultsContainer.innerHTML = html;
    }

    updateResultsSummary(data) {
        // Implement results summary update if needed
        console.log('Updating results summary with:', data);
    }

    // Inject styles for test files
    injectTestFilesStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .test-files-container {
                margin-top: 2rem;
            }
            .test-file-card {
                transition: transform 0.2s;
            }
            .test-file-card:hover {
                transform: translateY(-2px);
            }
            .btn {
                padding: 0.5rem 1rem;
                border-radius: 0.375rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            .btn-primary {
                background-color: #3B82F6;
                color: white;
                border: none;
            }
            .btn-primary:hover {
                background-color: #2563EB;
            }
            .btn-outline {
                background-color: transparent;
                color: #6B7280;
                border: 1px solid #D1D5DB;
            }
            .btn-outline:hover {
                background-color: #F9FAFB;
            }
            .btn-sm {
                padding: 0.25rem 0.75rem;
                font-size: 0.875rem;
            }
        `;
        document.head.appendChild(style);
    }
}

// Export methods to global scope for HTML onclick handlers
window.UIManager = UIManager;
window.toggleAutoScroll = function() { window.uiManager.toggleAutoScroll(); };
window.filterLogs = function() { window.uiManager.filterLogs(); };
window.searchLogs = function() { window.uiManager.searchLogs(); };