// Options page JavaScript for FocusGuard Extension
document.addEventListener('DOMContentLoaded', () => {
    const optionsManager = new OptionsManager();
});

class OptionsManager {
    constructor() {
        this.initializeElements();
        this.loadSettings();
        this.setupEventListeners();
    }

    initializeElements() {
        // Timer settings
        this.focusDurationInput = document.getElementById('focusDuration');
        this.breakDurationInput = document.getElementById('breakDuration');
        this.soundEnabledCheckbox = document.getElementById('soundEnabled');
        
        // Blocked sites
        this.newSiteInput = document.getElementById('newSiteInput');
        this.addSiteBtn = document.getElementById('addSiteBtn');
        this.sitesList = document.getElementById('sitesList');
        
        // Stats
        this.totalSessionsEl = document.getElementById('totalSessions');
        this.totalFocusTimeEl = document.getElementById('totalFocusTime');
        
        // Data management
        this.resetStatsBtn = document.getElementById('resetStatsBtn');
        this.exportDataBtn = document.getElementById('exportDataBtn');
        this.importDataBtn = document.getElementById('importDataBtn');
        this.importFile = document.getElementById('importFile');
        
        // Footer actions
        this.resetAllBtn = document.getElementById('resetAllBtn');
        this.closeBtn = document.getElementById('closeBtn');
        this.saveStatus = document.getElementById('saveStatus');
    }

    setupEventListeners() {
        // Auto-save timer settings
        this.focusDurationInput.addEventListener('change', () => this.saveTimerSettings());
        this.breakDurationInput.addEventListener('change', () => this.saveTimerSettings());
        this.soundEnabledCheckbox.addEventListener('change', () => this.saveTimerSettings());
        
        // Blocked sites management
        this.addSiteBtn.addEventListener('click', () => this.addBlockedSite());
        this.newSiteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addBlockedSite();
            }
        });
        
        // Data management
        this.resetStatsBtn.addEventListener('click', () => this.resetStatistics());
        this.exportDataBtn.addEventListener('click', () => this.exportData());
        this.importDataBtn.addEventListener('click', () => this.importFile.click());
        this.importFile.addEventListener('change', () => this.importData());
        
        // Footer actions
        this.resetAllBtn.addEventListener('click', () => this.resetAllSettings());
        this.closeBtn.addEventListener('click', () => window.close());
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get({
                focusDuration: 25 * 60,
                breakDuration: 5 * 60,
                soundEnabled: true,
                blockedSites: ['youtube.com', 'twitter.com', 'instagram.com', 'reddit.com', 'facebook.com', 'tiktok.com'],
                sessionsToday: 0,
                totalFocusTime: 0
            });

            this.focusDurationInput.value = Math.floor(result.focusDuration / 60);
            this.breakDurationInput.value = Math.floor(result.breakDuration / 60);
            this.soundEnabledCheckbox.checked = result.soundEnabled;
            
            this.renderBlockedSites(result.blockedSites);
            this.updateStatisticsDisplay(result.sessionsToday, result.totalFocusTime);
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveTimerSettings() {
        try {
            const focusDuration = parseInt(this.focusDurationInput.value) * 60;
            const breakDuration = parseInt(this.breakDurationInput.value) * 60;
            
            await chrome.storage.sync.set({
                focusDuration: focusDuration,
                breakDuration: breakDuration,
                soundEnabled: this.soundEnabledCheckbox.checked
            });
            
            this.showMessage('Timer settings saved');
        } catch (error) {
            console.error('Failed to save timer settings:', error);
        }
    }

    async addBlockedSite() {
        const siteUrl = this.newSiteInput.value.trim().toLowerCase();
        if (!siteUrl) return;
        
        const cleanUrl = siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        
        try {
            const result = await chrome.storage.sync.get({ blockedSites: [] });
            const blockedSites = result.blockedSites;
            
            if (!blockedSites.includes(cleanUrl)) {
                blockedSites.push(cleanUrl);
                await chrome.storage.sync.set({ blockedSites: blockedSites });
                this.renderBlockedSites(blockedSites);
                this.newSiteInput.value = '';
                this.showMessage('Site added');
            }
        } catch (error) {
            console.error('Failed to add site:', error);
        }
    }

    async removeBlockedSite(siteUrl) {
        try {
            const result = await chrome.storage.sync.get({ blockedSites: [] });
            const blockedSites = result.blockedSites.filter(site => site !== siteUrl);
            
            await chrome.storage.sync.set({ blockedSites: blockedSites });
            this.renderBlockedSites(blockedSites);
            this.showMessage('Site removed');
        } catch (error) {
            console.error('Failed to remove site:', error);
        }
    }

    renderBlockedSites(sites) {
        this.sitesList.innerHTML = '';
        
        sites.forEach(site => {
            const siteItem = document.createElement('div');
            siteItem.className = 'site-item';
            siteItem.innerHTML = `
                <span class="site-name">${site}</span>
                <button class="remove-site" data-site="${site}">Remove</button>
            `;
            
            siteItem.querySelector('.remove-site').addEventListener('click', () => this.removeBlockedSite(site));
            this.sitesList.appendChild(siteItem);
        });
    }

    updateStatisticsDisplay(sessionsToday, totalFocusTime) {
        this.totalSessionsEl.textContent = sessionsToday;
        const hours = Math.floor(totalFocusTime / 3600);
        const minutes = Math.floor((totalFocusTime % 3600) / 60);
        this.totalFocusTimeEl.textContent = `${hours}h ${minutes}m`;
    }

    async resetStatistics() {
        if (!confirm('Reset all statistics?')) return;
        
        try {
            await chrome.storage.sync.set({
                sessionsToday: 0,
                totalFocusTime: 0,
                lastResetDate: new Date().toDateString()
            });
            
            this.updateStatisticsDisplay(0, 0);
            this.showMessage('Statistics reset');
        } catch (error) {
            console.error('Failed to reset statistics:', error);
        }
    }

    async exportData() {
        try {
            const data = await chrome.storage.sync.get(null);
            const exportData = {
                version: '1.0.0',
                exportDate: new Date().toISOString(),
                settings: data
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `focusguard-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showMessage('Settings exported');
        } catch (error) {
            console.error('Failed to export data:', error);
        }
    }

    async importData() {
        const file = this.importFile.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importData = JSON.parse(text);
            
            if (importData.settings && confirm('Overwrite current settings?')) {
                await chrome.storage.sync.set(importData.settings);
                this.loadSettings();
                this.showMessage('Settings imported');
            }
        } catch (error) {
            console.error('Failed to import data:', error);
        }
        
        this.importFile.value = '';
    }

    async resetAllSettings() {
        if (!confirm('Reset ALL settings? This cannot be undone.')) return;
        
        try {
            await chrome.storage.sync.clear();
            await chrome.storage.sync.set({
                focusDuration: 25 * 60,
                breakDuration: 5 * 60,
                soundEnabled: true,
                blockedSites: ['youtube.com', 'twitter.com', 'instagram.com', 'reddit.com', 'facebook.com', 'tiktok.com'],
                sessionsToday: 0,
                totalFocusTime: 0
            });
            
            this.loadSettings();
            this.showMessage('Settings reset');
        } catch (error) {
            console.error('Failed to reset settings:', error);
        }
    }

    showMessage(message) {
        const statusText = this.saveStatus.querySelector('.status-text');
        const originalText = statusText.textContent;
        
        statusText.textContent = message;
        setTimeout(() => {
            statusText.textContent = originalText;
        }, 2000);
    }
} 