// Background Service Worker for FocusGuard Extension
class BackgroundTimer {
    constructor() {
        this.timerId = null;
        this.injectedTabs = new Set(); // Track which tabs have content scripts
        this.setupMessageListeners();
        this.setupAlarmListeners();
        this.initializeTimer();
        this.setupTabListeners(); // Add tab monitoring
    }

    setupMessageListeners() {
        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'SESSION_COMPLETE':
                    this.handleSessionComplete(message.data);
                    break;
                case 'GET_TIMER_STATE':
                    this.getTimerState().then(sendResponse);
                    return true; // Async response
                case 'CHECK_FOCUS_MODE':
                    this.checkFocusMode().then(sendResponse);
                    return true; // Async response
                case 'REQUEST_CURRENT_STATUS':
                    this.broadcastCurrentStatusToTabs();
                    break;
                case 'SHOW_NOTIFICATION':
                    // Show Windows notification directly
                    const title = this.getNotificationTitle(message.data.type);
                    this.showWindowsNotification(title, message.data.message, message.data.type).then(notificationId => {
                        sendResponse({ success: true, notificationId });
                    });
                    return true; // Async response
                case 'BROADCAST_TOAST':
                    // Legacy support - redirect to Windows notifications
                    this.broadcastToastToAllTabs(message.data);
                    sendResponse({ success: true });
                    break;
                case 'CONTENT_SCRIPT_READY':
                    // Track that content script is ready on this tab
                    if (sender.tab?.id) {
                        this.injectedTabs.add(sender.tab.id);
                    }
                    sendResponse({ success: true });
                    break;
            }
        });
    }

    setupTabListeners() {
        // Monitor tab updates and inject content script if needed
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            if (changeInfo.status === 'loading' && tab.url && this.isValidUrl(tab.url)) {
                // Wait a bit for the page to start loading, then try injection
                setTimeout(() => {
                    this.ensureContentScriptInjected(tabId, tab.url);
                }, 1000);
            }
        });

        // Clean up when tabs are removed
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.injectedTabs.delete(tabId);
        });
    }

    isValidUrl(url) {
        // Check if URL is valid for content script injection
        return url && (url.startsWith('http://') || url.startsWith('https://')) &&
               !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') &&
               !url.startsWith('edge://') && !url.startsWith('about:');
    }

    async ensureContentScriptInjected(tabId, url) {
        try {
            // Try to ping the content script first
            try {
                const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                if (response && response.success) {
                    this.injectedTabs.add(tabId);
                    return;
                }
            } catch (error) {
                // Content script not responding, inject it
            }

            // If ping failed, inject the content script programmatically
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            
            // Wait a bit then verify injection worked
            setTimeout(async () => {
                try {
                    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                    if (response && response.success) {
                        this.injectedTabs.add(tabId);
                    }
                } catch (error) {
                    // Injection verification failed - ignore
                }
            }, 500);

        } catch (error) {
            // Some sites block all injection, that's expected
            if (error.message.includes('Cannot access') || error.message.includes('blocked')) {
                // Expected behavior for some sites
            }
        }
    }

    async showWindowsNotification(title, message, type = 'basic', requireInteraction = false) {
        try {
            const notificationId = `focusguard-${Date.now()}`;
            
            const notificationOptions = {
                type: 'basic',
                iconUrl: 'assets/icons/icon48.png',
                title: title,
                message: message,
                requireInteraction: requireInteraction,
                priority: type === 'session' ? 2 : 1
            };

            await chrome.notifications.create(notificationId, notificationOptions);
            
            // Auto-clear notifications after 6 seconds unless they require interaction
            if (!requireInteraction) {
                setTimeout(() => {
                    chrome.notifications.clear(notificationId);
                }, 6000);
            }
            
            return notificationId;
        } catch (error) {
            console.error('Error showing Windows notification:', error);
        }
    }

    // Replace toast system with Windows notifications
    async broadcastToastToAllTabs(toastData) {
        // Convert toast data to Windows notification
        const title = this.getNotificationTitle(toastData.type);
        const requireInteraction = toastData.type === 'session' || toastData.duration > 5000;
        
        return this.showWindowsNotification(title, toastData.message, toastData.type, requireInteraction);
    }

    getNotificationTitle(type) {
        switch(type) {
            case 'success': return 'FocusGuard - Session Complete';
            case 'warning': return 'FocusGuard - Session Paused';
            case 'info': return 'FocusGuard - Session Started';
            case 'session': return 'FocusGuard - Session Active';
            default: return 'FocusGuard';
        }
    }

    async broadcastCurrentStatusToTabs() {
        try {
            const result = await chrome.storage.sync.get({
                isRunning: false,
                timeLeft: 25 * 60,
                isFocusSession: true
            });

            if (result.isRunning) {
                const sessionName = result.isFocusSession ? 'Focus' : 'Break';
                const emoji = result.isFocusSession ? 'Focus' : 'Break';
                const minutes = Math.floor(result.timeLeft / 60);
                const seconds = result.timeLeft % 60;
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                const type = result.isFocusSession ? 'info' : 'success';

                // Use the new broadcast method
                await this.broadcastToastToAllTabs({
                    message: `${emoji} ${sessionName} session active (${timeStr} remaining)`,
                    type: type,
                    duration: 3000
                });
            }
        } catch (error) {
            console.error('Error broadcasting current status:', error);
        }
    }

    setupAlarmListeners() {
        // Handle alarms for timer notifications
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'pomodoroTimer') {
                this.handleTimerComplete();
            }
        });
    }

    async initializeTimer() {
        try {
            const result = await chrome.storage.sync.get({
                isRunning: false,
                endTime: null,
                isFocusSession: true,
                focusDuration: 25 * 60,
                breakDuration: 5 * 60
            });

            // If timer was running when extension was reloaded, resume it
            if (result.isRunning && result.endTime) {
                const now = Date.now();
                const timeLeft = Math.max(0, result.endTime - now);
                
                if (timeLeft > 0) {
                    // Set alarm for remaining time
                    chrome.alarms.create('pomodoroTimer', {
                        when: result.endTime
                    });
                } else {
                    // Timer should have completed
                    await this.handleTimerComplete();
                }
            }
        } catch (error) {
            console.error('Failed to initialize background timer:', error);
        }
    }

    async handleSessionComplete(data) {
        try {
            // Show Chrome notification
            await this.showNotification(data);
            
            // Update badge to show session count
            await this.updateBadge(data.sessionsToday);
            
            // Broadcast completion toast
            await this.broadcastToastToAllTabs({
                message: `${data.completedSession} session complete! Great work!`,
                type: 'success',
                duration: 5000
            });
            
        } catch (error) {
            console.error('Failed to handle session complete:', error);
        }
    }

    async handleTimerComplete() {
        try {
            const result = await chrome.storage.sync.get({
                isFocusSession: true,
                focusDuration: 25 * 60,
                breakDuration: 5 * 60,
                sessionsToday: 0,
                totalFocusTime: 0,
                soundEnabled: true
            });

            const completedSession = result.isFocusSession ? 'Focus' : 'Break';

            // Update stats
            let sessionsToday = result.sessionsToday;
            let totalFocusTime = result.totalFocusTime;
            
            if (result.isFocusSession) {
                sessionsToday++;
                totalFocusTime += result.focusDuration;
            }

            // Switch session type
            const newIsFocusSession = !result.isFocusSession;
            const newTimeLeft = newIsFocusSession ? result.focusDuration : result.breakDuration;
            const nextSession = newIsFocusSession ? 'Focus' : 'Break';

            // Calculate next end time
            const nextEndTime = Date.now() + (newTimeLeft * 1000);

            // Update storage with RUNNING next session
            await chrome.storage.sync.set({
                isRunning: true, // AUTOMATICALLY START THE NEXT SESSION
                timeLeft: newTimeLeft,
                isFocusSession: newIsFocusSession,
                endTime: nextEndTime, // SET END TIME FOR NEXT SESSION
                sessionsToday: sessionsToday,
                totalFocusTime: totalFocusTime
            });

            // Set alarm for next session completion
            chrome.alarms.create('pomodoroTimer', {
                when: nextEndTime
            });

            // Play completion sound by broadcasting to content scripts
            await this.broadcastSoundToAllTabs();

            // Show completion notification for previous session
            await this.showNotification({
                completedSession: completedSession,
                nextSession: nextSession.toLowerCase(),
                sessionsToday: sessionsToday
            });

            // Update badge
            await this.updateBadge(sessionsToday);

            // Broadcast completion toast
            await this.broadcastToastToAllTabs({
                message: `${completedSession} completed! ${nextSession} started automatically!`,
                type: 'success',
                duration: 4000
            });

        } catch (error) {
            console.error('Failed to handle timer complete:', error);
        }
    }

    async showNotification(data) {
        try {
            const title = `${data.completedSession} Session Complete!`;
            const message = `Great work! Ready for your ${data.nextSession} session? (${data.sessionsToday} sessions today)`;

            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/icon48.png',
                title: title,
                message: message,
                priority: 2
            });
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    }

    async updateBadge(sessionsToday) {
        try {
            const badgeText = sessionsToday > 0 ? sessionsToday.toString() : '';
            await chrome.action.setBadgeText({ text: badgeText });
            await chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
        } catch (error) {
            console.error('Failed to update badge:', error);
        }
    }

    async getTimerState() {
        try {
            const result = await chrome.storage.sync.get({
                isRunning: false,
                timeLeft: 25 * 60,
                isFocusSession: true,
                endTime: null
            });

            // Calculate current time left if running
            if (result.isRunning && result.endTime) {
                const now = Date.now();
                const timeLeft = Math.max(0, Math.floor((result.endTime - now) / 1000));
                return {
                    ...result,
                    timeLeft: timeLeft
                };
            }

            return result;
        } catch (error) {
            console.error('Failed to get timer state:', error);
            return {
                isRunning: false,
                timeLeft: 25 * 60,
                isFocusSession: true,
                endTime: null
            };
        }
    }

    async checkFocusMode() {
        try {
            const result = await chrome.storage.sync.get({
                isFocusSession: true,
                isRunning: false
            });

            const isFocusMode = result.isFocusSession && result.isRunning;

            return { isFocusMode };
        } catch (error) {
            console.error('Failed to check focus mode:', error);
            return { isFocusMode: false };
        }
    }

    async broadcastSoundToAllTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            const validTabs = tabs.filter(tab => this.isValidUrl(tab.url));
            
            const promises = validTabs.map(async (tab) => {
                try {
                    // Ensure content script is injected first
                    await this.ensureContentScriptInjected(tab.id, tab.url);
                    
                    // Small delay to let injection complete
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        type: 'PLAY_SOUND'
                    });
                    
                    return { tabId: tab.id, success: true, response };
                } catch (error) {
                    return { tabId: tab.id, success: false, error: error.message };
                }
            });
            
            await Promise.allSettled(promises);
            
        } catch (error) {
            console.error('Error broadcasting sound play request:', error);
        }
    }
}

// Storage change listener to sync timer updates
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
        // Handle timer start/stop from popup
        if (changes.isRunning) {
            if (changes.isRunning.newValue && changes.endTime) {
                // Timer started - set alarm
                chrome.alarms.create('pomodoroTimer', {
                    when: changes.endTime.newValue
                });
            } else if (!changes.isRunning.newValue) {
                // Timer stopped - clear alarm
                chrome.alarms.clear('pomodoroTimer');
            }
        }
    }
});

// Initialize background timer
const backgroundTimer = new BackgroundTimer();

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        if (details.reason === 'install') {
            // Set up default settings on first install
            await chrome.storage.sync.set({
                blockedSites: [
                    'youtube.com',
                    'twitter.com',
                    'instagram.com',
                    'reddit.com',
                    'facebook.com',
                    'tiktok.com'
                ],
                focusDuration: 25 * 60,
                breakDuration: 5 * 60,
                soundEnabled: true
            });

            // Show welcome notification
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/icon48.png',
                title: 'Welcome to FocusGuard!',
                message: 'Click the extension icon to start your first Pomodoro session.',
                priority: 1
            });
        }

        // Force inject content scripts on all existing tabs after install/update
        if (details.reason === 'install' || details.reason === 'update') {
            setTimeout(async () => {
                try {
                    const tabs = await chrome.tabs.query({});
                    const validTabs = tabs.filter(tab => backgroundTimer.isValidUrl(tab.url));
                    
                    for (const tab of validTabs) {
                        backgroundTimer.ensureContentScriptInjected(tab.id, tab.url);
                    }
                } catch (error) {
                    console.error('Error force-injecting to existing tabs:', error);
                }
            }, 2000);
        }
        
    } catch (error) {
        console.error('Failed to handle installation:', error);
    }
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
    // Extension started
});

// Handle tab updates for blocking logic
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url) {
        // The content script will handle the blocking logic
        // This is just for monitoring purposes
    }
}); 