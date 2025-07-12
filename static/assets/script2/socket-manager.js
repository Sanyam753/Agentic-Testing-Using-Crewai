// socket-manager.js - Socket.IO connection and event handling
export class SocketManager {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    initialize() {
        // Configure socket with reconnection options
        this.socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts,
            timeout: 20000
        });
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            window.uiManager.updateStatus('Connected to server', 'success');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.updateConnectionStatus(false);
            
            if (reason === 'io server disconnect') {
                // Server disconnected us, try to reconnect
                window.uiManager.updateStatus('Server disconnected. Attempting to reconnect...', 'warning');
                this.socket.connect();
            } else {
                window.uiManager.updateStatus('Disconnected from server: ' + reason, 'error');
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.reconnectAttempts++;
            
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                window.uiManager.updateStatus('Failed to connect to server. Please refresh the page.', 'error');
            } else {
                window.uiManager.updateStatus(`Connection error. Retrying... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'warning');
            }
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            window.uiManager.updateStatus('Reconnected to server', 'success');
            this.reconnectAttempts = 0;
        });

        this.socket.on('reconnect_failed', () => {
            console.error('Failed to reconnect');
            window.uiManager.updateStatus('Failed to reconnect to server. Please refresh the page.', 'error');
        });

        this.socket.on('connected', (data) => {
            console.log('Socket.IO connected:', data.message);
        });

        // Log events
        this.socket.on('log_update', (data) => {
            window.uiManager.appendLog(data);
        });

        this.socket.on('logs_cleared', () => {
            window.uiManager.clearLogOutput();
        });

        // Activity and health events
        this.socket.on('activity_update', (data) => {
            window.uiManager.updateActivityFeed(data);
        });

        this.socket.on('health_update', (data) => {
            window.uiManager.updateSystemHealth(data);
        });

        this.socket.on('performance_update', (data) => {
            window.uiManager.updatePerformanceChart(data);
        });

        // Test process events
        this.socket.on('process_complete', (data) => {
            window.testManager.handleTestComplete(data);

            if (data.success && data.test_files_data) {
                window.testManager.testFilesData = data.test_files_data;
                window.testManager.displayTestFiles();
            } else {
                setTimeout(() => window.testManager.loadTestFiles(), 1000);
            }
        });

        this.socket.on('test_files_update', (data) => {
            window.testManager.testFilesData = data;
            window.testManager.displayTestFiles();
        });

        // Coding test events
        this.socket.on('coding_progress', (data) => {
            window.uiManager.updateProgressText(data.message);
            if (data.progress) {
                window.uiManager.updateProgress(data.progress);
            }
        });

        this.socket.on('coding_complete', (data) => {
            if (data.success) {
                window.uiManager.showNotification('Coding test completed successfully', 'success');
                window.testManager.generatedCodes = data.generated_codes || [];
                window.testManager.codeReviews = data.reviews || [];
                window.uiManager.displayCodingResults(data);
                window.testManager.updateTestControls(false);
            } else {
                window.uiManager.showNotification(`Coding test failed: ${data.error}`, 'error');
                window.testManager.updateTestControls(false);
            }
        });

        // Test error events
        this.socket.on('test_error', (data) => {
            console.error('Test error:', data);
            window.uiManager.showNotification(`Test error: ${data.error || 'Unknown error'}`, 'error');
            window.testManager.handleTestComplete({success: false, error: data.error});
        });

        this.socket.on('llm_error', (data) => {
            console.error('LLM error:', data);
            window.uiManager.showNotification('LLM error: Model may have crashed. Please check LM Studio.', 'error');
            window.testManager.handleTestComplete({success: false, error: 'LLM model crashed'});
        });
    }

    updateConnectionStatus(connected) {
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

    emit(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        } else {
            console.error('Socket not connected');
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}