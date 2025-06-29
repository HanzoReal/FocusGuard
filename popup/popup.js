// Popup JavaScript for FocusGuard Extension
class PomodoroTimer {
    constructor() {
        this.isRunning = false;
        this.timeLeft = 25 * 60;
        this.isFocusSession = true;
        this.focusDuration = 25 * 60;
        this.breakDuration = 5 * 60;
        this.soundEnabled = true;
        this.sessionsToday = 0;
        this.totalFocusTime = 0;
        this.syncInterval = null;

        this.initializeElements();
        this.loadSettings();
        this.setupEventListeners();
        this.startSync();
    }

    initializeElements() {
        // Timer display elements
        this.timerDisplay = document.getElementById('timerDisplay');
        this.sessionType = document.getElementById('sessionType');
        this.progressCircle = document.getElementById('progressCircle');
        
        // Control buttons
        this.startBtn = document.getElementById('startBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        
        // Timer duration inputs
        this.focusHoursInput = document.getElementById('focusHours');
        this.focusMinutesInput = document.getElementById('focusMinutes');
        this.breakHoursInput = document.getElementById('breakHours');
        this.breakMinutesInput = document.getElementById('breakMinutes');
        
        // Stats elements
        this.sessionsTodayEl = document.getElementById('sessionsToday');
        this.focusTimeEl = document.getElementById('focusTime');
        
        // Settings
        this.soundToggle = document.getElementById('soundToggle');
        this.optionsBtn = document.getElementById('optionsBtn');
    }

    setupEventListeners() {
        // Timer controls
        this.startBtn.addEventListener('click', () => this.startTimer());
        this.pauseBtn.addEventListener('click', () => this.pauseTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());
        
        // Timer duration inputs - Focus
        const updateFocusDuration = () => {
            const hours = parseInt(this.focusHoursInput.value) || 0;
            const minutes = parseInt(this.focusMinutesInput.value) || 1;
            if (this.isValidTime(hours, minutes)) {
                this.focusDuration = (hours * 3600) + (minutes * 60);
                if (!this.isRunning && this.isFocusSession) {
                    this.timeLeft = this.focusDuration;
                }
                this.updateDisplay();
                this.saveSettings();
            }
        };
        
        this.focusHoursInput.addEventListener('change', () => {
            this.validateAndFixInput(this.focusHoursInput, 0, 23, 0);
            updateFocusDuration();
        });
        this.focusMinutesInput.addEventListener('change', () => {
            this.validateAndFixInput(this.focusMinutesInput, 1, 59, 1);
            updateFocusDuration();
        });
        this.focusHoursInput.addEventListener('blur', () => {
            this.validateAndFixInput(this.focusHoursInput, 0, 23, 0);
            updateFocusDuration();
        });
        this.focusMinutesInput.addEventListener('blur', () => {
            this.validateAndFixInput(this.focusMinutesInput, 1, 59, 1);
            updateFocusDuration();
        });
        this.focusHoursInput.addEventListener('input', () => {
            this.restrictInputRange(this.focusHoursInput, 0, 23);
            if (!this.isRunning && this.isFocusSession) updateFocusDuration();
        });
        this.focusMinutesInput.addEventListener('input', () => {
            this.restrictInputRange(this.focusMinutesInput, 1, 59);
            if (!this.isRunning && this.isFocusSession) updateFocusDuration();
        });
        
        // Timer duration inputs - Break
        const updateBreakDuration = () => {
            const hours = parseInt(this.breakHoursInput.value) || 0;
            const minutes = parseInt(this.breakMinutesInput.value) || 1;
            if (this.isValidTime(hours, minutes)) {
                this.breakDuration = (hours * 3600) + (minutes * 60);
                if (!this.isRunning && !this.isFocusSession) {
                    this.timeLeft = this.breakDuration;
                }
                this.updateDisplay();
                this.saveSettings();
            }
        };
        
        this.breakHoursInput.addEventListener('change', () => {
            this.validateAndFixInput(this.breakHoursInput, 0, 23, 0);
            updateBreakDuration();
        });
        this.breakMinutesInput.addEventListener('change', () => {
            this.validateAndFixInput(this.breakMinutesInput, 1, 59, 1);
            updateBreakDuration();
        });
        this.breakHoursInput.addEventListener('blur', () => {
            this.validateAndFixInput(this.breakHoursInput, 0, 23, 0);
            updateBreakDuration();
        });
        this.breakMinutesInput.addEventListener('blur', () => {
            this.validateAndFixInput(this.breakMinutesInput, 1, 59, 1);
            updateBreakDuration();
        });
        this.breakHoursInput.addEventListener('input', () => {
            this.restrictInputRange(this.breakHoursInput, 0, 23);
            if (!this.isRunning && !this.isFocusSession) updateBreakDuration();
        });
        this.breakMinutesInput.addEventListener('input', () => {
            this.restrictInputRange(this.breakMinutesInput, 1, 59);
            if (!this.isRunning && !this.isFocusSession) updateBreakDuration();
        });

        // Sound toggle
        this.soundToggle.addEventListener('change', (e) => {
            this.soundEnabled = e.target.checked;
            this.saveSettings();
        });
        
        // Options button
        this.optionsBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        // Handle window resize for responsive circle sizing
        window.addEventListener('resize', () => {
            this.updateDisplay();
        });
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get({
                // Timer state
                isRunning: false,
                timeLeft: 25 * 60,
                isFocusSession: true,
                endTime: null,
                
                // Settings
                focusDuration: 25 * 60,
                breakDuration: 5 * 60,
                soundEnabled: true,
                
                // User data
                sessionsToday: 0,
                totalFocusTime: 0,
                lastResetDate: new Date().toDateString()
            });

            // Reset daily stats if it's a new day
            const today = new Date().toDateString();
            if (result.lastResetDate !== today) {
                this.sessionsToday = 0;
                this.totalFocusTime = 0;
                await chrome.storage.sync.set({
                    sessionsToday: 0,
                    totalFocusTime: 0,
                    lastResetDate: today
                });
            } else {
                this.sessionsToday = result.sessionsToday;
                this.totalFocusTime = result.totalFocusTime;
            }

            // Load settings
            this.isRunning = result.isRunning;
            this.timeLeft = result.timeLeft;
            this.isFocusSession = result.isFocusSession;
            this.focusDuration = result.focusDuration;
            this.breakDuration = result.breakDuration;
            this.soundEnabled = result.soundEnabled;

            // Update UI
            this.soundToggle.checked = this.soundEnabled;
            
            // Update timer duration inputs
            this.updateTimeInputs();
            
            // Handle running timer
            if (this.isRunning && result.endTime) {
                const now = Date.now();
                const remaining = Math.max(0, result.endTime - now);
                this.timeLeft = Math.floor(remaining / 1000);
                
                // Start background sync to display current timer state
                this.startBackgroundSync();
                
                // Update button states for running timer
                this.startBtn.disabled = true;
                this.pauseBtn.disabled = false;
                this.startBtn.textContent = 'Running...';
                document.querySelector('.timer-display').classList.add('active');
                
            } else if (!this.isRunning) {
                // If not running, ensure timeLeft shows the correct duration for current session
                this.timeLeft = this.isFocusSession ? this.focusDuration : this.breakDuration;
            }
            
            this.updateDisplay();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set({
                isRunning: this.isRunning,
                timeLeft: this.timeLeft,
                isFocusSession: this.isFocusSession,
                endTime: this.isRunning ? Date.now() + (this.timeLeft * 1000) : null,
                focusDuration: this.focusDuration,
                breakDuration: this.breakDuration,
                soundEnabled: this.soundEnabled,
                sessionsToday: this.sessionsToday,
                totalFocusTime: this.totalFocusTime
            });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    startTimer(reset = true, showToast = true) {
        if (reset) {
            // Use the current duration settings for the current session type
            this.timeLeft = this.isFocusSession ? this.focusDuration : this.breakDuration;
        }
        
        this.isRunning = true;
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;
        
        // Add active class for animation
        document.querySelector('.timer-display').classList.add('active');
        
        // Show toast notification for session start (only if requested)
        if (showToast) {
            const sessionName = this.isFocusSession ? 'Focus' : 'Break';
            const sessionType = this.isFocusSession ? 'info' : 'success';
            this.broadcastToast(`${sessionName} session started!`, sessionType);
        }
        
        // Save settings to storage (background script will handle the actual timer)
        this.saveSettings();
        this.updateDisplay();
        
        // Start syncing with background script instead of running our own timer
        this.startBackgroundSync();
    }

    startBackgroundSync() {
        // Clear any existing sync interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Sync with background script every second
        this.syncInterval = setInterval(async () => {
            try {
                // Get current timer state from background script
                const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
                
                if (response) {
                    // Update local state from background
                    const wasRunning = this.isRunning;
                    this.isRunning = response.isRunning;
                    this.timeLeft = response.timeLeft;
                    this.isFocusSession = response.isFocusSession;
                    
                    // Update display
                    this.updateDisplay();
                    
                    // Check if timer completed in background
                    if (wasRunning && !this.isRunning && this.timeLeft <= 0) {
                        // Timer completed in background, just update display
                        this.updateDisplay();
                    }
                }
            } catch (error) {
                console.error('Background sync error:', error);
            }
        }, 1000);
    }

    pauseTimer() {
        this.isRunning = false;
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        
        // Remove active class
        document.querySelector('.timer-display').classList.remove('active');
        
        // Clear sync interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        // Show pause notification (only if paused manually, not during session completion)
        if (this.timeLeft > 0) {
            const sessionName = this.isFocusSession ? 'Focus' : 'Break';
            this.broadcastToast(`${sessionName} session paused`, 'warning');
        }
        
        this.saveSettings();
    }

    resetTimer() {
        const wasRunning = this.isRunning;
        this.pauseTimer();
        
        // Reset should always go back to focus session (start from beginning)
        this.isFocusSession = true;
        this.timeLeft = this.focusDuration;
        
        // Show reset notification
        this.broadcastToast(`Timer reset to Focus session`, 'info');
        
        this.updateDisplay();
        this.saveSettings();
    }

    async completeSession() {
        // This method is no longer needed since background script handles completion
        // Just update the display
        this.updateDisplay();
    }

    playNotificationSound() {
        if (!this.soundEnabled) {
            return;
        }
        
        // Try synthetic beep first (most reliable)
        this.playAlternativeSound();
        
        // Try MP3 file as backup
        try {
            const audioUrl = chrome.runtime.getURL('assets/sounds/beep.MP3');
            const audio = new Audio(audioUrl);
            audio.volume = 0.7;
            
            audio.addEventListener('canplaythrough', () => {
                audio.play()
                    .then(() => {})
                    .catch(() => {});
            }, { once: true });
            
            audio.addEventListener('error', () => {
                // MP3 load failed
            }, { once: true });
            
            audio.load();
        } catch (error) {
            // MP3 setup failed
        }
    }

    playAlternativeSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();
            
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800; // 800 Hz beep
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
        } catch (error) {
            // Synthetic beep failed - ignore
        }
    }

    updateDisplay() {
        // Update timer display
        const displayHours = Math.floor(this.timeLeft / 3600);
        const displayMinutes = Math.floor((this.timeLeft % 3600) / 60);
        const displaySeconds = this.timeLeft % 60;
        
        // Get progress ring container for responsive sizing
        const progressRing = document.querySelector('.progress-ring');
        
        // Show hours only if there are hours to display
        if (displayHours > 0) {
            this.timerDisplay.textContent = `${displayHours}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            // Add large class for hours display
            progressRing.classList.add('large');
        } else {
            this.timerDisplay.textContent = `${displayMinutes}:${displaySeconds.toString().padStart(2, '0')}`;
            // Remove large class for minutes-only display
            progressRing.classList.remove('large');
        }
        
        // Update session type
        this.sessionType.textContent = this.isFocusSession ? 'Focus Session' : 'Break Time';
        this.sessionType.style.color = this.isFocusSession ? '#3E5879' : '#D8C4B6';
        
        // Update progress circle with appropriate circumference
        const totalDuration = this.isFocusSession ? this.focusDuration : this.breakDuration;
        const progress = (totalDuration - this.timeLeft) / totalDuration;
        
        // Use different circumference based on circle size and screen size
        const isLarge = progressRing.classList.contains('large');
        const isMobile = window.innerWidth <= 340;
        
        let circumference;
        if (isMobile) {
            // Mobile circumferences
            circumference = isLarge ? 339.292 : 282.743; // Large mobile: 2 * π * 54, Normal mobile: 2 * π * 45
        } else {
            // Desktop circumferences  
            circumference = isLarge ? 424.115 : 339.292; // Large: 2 * π * 67.5, Normal: 2 * π * 54
        }
        
        const offset = circumference * (1 - progress);
        this.progressCircle.style.strokeDashoffset = offset;
        
        // Update button states
        if (this.isRunning) {
            this.startBtn.textContent = 'Running...';
            this.startBtn.disabled = true;
            this.pauseBtn.disabled = false;
            // Disable timer settings while running
            this.focusHoursInput.disabled = true;
            this.focusMinutesInput.disabled = true;
            this.breakHoursInput.disabled = true;
            this.breakMinutesInput.disabled = true;
        } else {
            this.startBtn.textContent = 'Start';
            this.startBtn.disabled = false;
            this.pauseBtn.disabled = true;
            // Enable timer settings when stopped
            this.focusHoursInput.disabled = false;
            this.focusMinutesInput.disabled = false;
            this.breakHoursInput.disabled = false;
            this.breakMinutesInput.disabled = false;
        }
        
        // Update stats
        this.sessionsTodayEl.textContent = this.sessionsToday;
        const statsHours = Math.floor(this.totalFocusTime / 3600);
        const statsMins = Math.floor((this.totalFocusTime % 3600) / 60);
        this.focusTimeEl.textContent = `${statsHours}h ${statsMins}m`;
    }

    async showNotification(message, type = 'info') {
        try {
            // Send to background script to show Windows notification
            const response = await chrome.runtime.sendMessage({
                type: 'SHOW_NOTIFICATION',
                data: {
                    message: message,
                    type: type
                }
            });
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }

    // Keep the method name for compatibility but use Windows notifications
    async broadcastToast(message, type = 'info', duration = 4000) {
        return this.showNotification(message, type);
    }

    async broadcastCurrentStatus() {
        if (this.isRunning) {
            const sessionName = this.isFocusSession ? 'Focus' : 'Break';
            const emoji = this.isFocusSession ? 'Focus' : 'Break';
            const minutes = Math.floor(this.timeLeft / 60);
            const seconds = this.timeLeft % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const type = this.isFocusSession ? 'info' : 'success';
            
            this.broadcastToast(`${emoji} ${sessionName} session active (${timeStr} remaining)`, type, 3000);
        }
    }

    // Sync with background script every second
    startSync() {
        // Start continuous background sync to stay updated with timer state
        this.startBackgroundSync();
    }

    // Helper methods
    validateAndFixInput(inputElement, min, max, defaultValue) {
        let value = parseInt(inputElement.value);
        
        // Handle empty or invalid input
        if (isNaN(value) || inputElement.value === '') {
            inputElement.value = defaultValue.toString().padStart(2, '0');
            return;
        }
        
        // Clamp value to valid range
        if (value < min) {
            inputElement.value = min.toString().padStart(2, '0');
        } else if (value > max) {
            inputElement.value = max.toString().padStart(2, '0');
        } else {
            // Ensure proper formatting (pad with zero)
            inputElement.value = value.toString().padStart(2, '0');
        }
    }

    restrictInputRange(inputElement, min, max) {
        let value = parseInt(inputElement.value);
        
        // Don't restrict while user is still typing, just prevent extremely large values
        if (!isNaN(value) && value > max) {
            inputElement.value = max.toString();
        }
    }

    isValidTime(hours, minutes) {
        return hours >= 0 && hours <= 23 && minutes >= 1 && minutes <= 59;
    }

    updateTimeInputs() {
        // Update focus duration inputs
        const focusHours = Math.floor(this.focusDuration / 3600);
        const focusMinutes = Math.max(1, Math.floor((this.focusDuration % 3600) / 60)); // Ensure minimum 1 minute
        this.focusHoursInput.value = focusHours.toString().padStart(2, '0');
        this.focusMinutesInput.value = focusMinutes.toString().padStart(2, '0');

        // Update break duration inputs  
        const breakHours = Math.floor(this.breakDuration / 3600);
        const breakMinutes = Math.max(1, Math.floor((this.breakDuration % 3600) / 60)); // Ensure minimum 1 minute
        this.breakHoursInput.value = breakHours.toString().padStart(2, '0');
        this.breakMinutesInput.value = breakMinutes.toString().padStart(2, '0');
    }
}

// Initialize the timer when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new PomodoroTimer();
}); 