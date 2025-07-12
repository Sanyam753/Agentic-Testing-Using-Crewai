// socket-manager.js - Socket.IO connection and event handling
export class SocketManager {
    constructor() {
        this.socket = null;
    }

    initialize() {
        this.socket = io();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
            window.uiManager.updateStatus('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
            window.uiManager.updateStatus('Disconnected from server', 'error');
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