// Content Script for FocusGuard Extension - Site blocking and sound playback

// Only run in main frame (not iframes)
if (window.self !== window.top) {
    // Set up message listeners for communication
} else {

// Message listener for extension communication
try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
            if (request.type === 'GET_CURRENT_STATUS') {
                sendResponse({ success: true, message: 'Status request acknowledged' });
                
            } else if (request.type === 'PING') {
                sendResponse({ 
                    success: true, 
                    message: 'Content script active'
                });
                
            } else if (request.type === 'PLAY_SOUND') {
                playNotificationSound()
                    .then(() => {
                        sendResponse({ success: true, message: 'Sound played' });
                    })
                    .catch((error) => {
                        sendResponse({ success: false, error: error.message });
                    });
                return true; // Keep channel open for async response
                
            } else {
                sendResponse({ success: false, message: 'Unknown message type' });
            }
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        
        return true;
    });
} catch (error) {
    console.error('Error setting up message listener:', error);
}

// Notify background script that content script is ready
try {
    chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_READY',
        data: {
            url: window.location.href,
            hostname: window.location.hostname
        }
    }).catch(() => {
        // Ignore errors - background script may not be ready
    });
} catch (error) {
    // Ignore errors
}

} // End of main frame check 

// Sound playback functionality
async function playNotificationSound() {
    try {
        // Try MP3 file first
        const audioUrl = chrome.runtime.getURL('assets/sounds/beep.MP3');
        const audio = new Audio(audioUrl);
        audio.volume = 0.7;
        
        // Promise-based loading with timeout
        const soundPromise = new Promise((resolve, reject) => {
            let resolved = false;
            
            const cleanup = () => {
                audio.removeEventListener('canplaythrough', onCanPlay);
                audio.removeEventListener('error', onError);
            };
            
            const onCanPlay = () => {
                if (resolved) return;
                resolved = true;
                cleanup();
                
                audio.play()
                    .then(() => {
                        resolve();
                    })
                    .catch((e) => {
                        reject(e);
                    });
            };
            
            const onError = (e) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                reject(e);
            };
            
            audio.addEventListener('canplaythrough', onCanPlay, { once: true });
            audio.addEventListener('error', onError, { once: true });
            
            // Timeout after 1 second
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(new Error('Sound loading timeout'));
                }
            }, 1000);
        });
        
        // Start loading
        audio.load();
        
        // Wait for result
        await soundPromise;
        
    } catch (error) {
        // Try synthetic beep fallback
        playAlternativeSound();
    }
}

function playAlternativeSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContext();
        
        // Resume context if suspended (required for Chrome)
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
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
        // Ultimate fallback - do nothing (sound failed)
    }
}

// Website Blocking System
class SiteBlocker {
    constructor() {
        this.isBlocked = false;
        this.blocker = null;
        this.checkTimer = null;
        this.contextInvalidated = false;
        this.initialize();
    }

    async initialize() {
        // Wait for DOM to be ready
        await this.waitForDOM();
        
        // Check immediately
        await this.checkAndBlock();
        
        // Check periodically for focus mode changes
        this.checkTimer = setInterval(() => {
            this.checkAndBlock();
        }, 3000);
        
        // Listen for focus mode changes
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'FOCUS_MODE_CHANGED') {
                this.checkAndBlock();
            }
        });
    }

    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    isExtensionContextValid() {
        if (this.contextInvalidated) {
            return false;
        }
        
        try {
            const isValid = !!(chrome.runtime && chrome.runtime.id && chrome.storage);
            if (!isValid) {
                this.contextInvalidated = true;
            }
            return isValid;
        } catch (error) {
            this.contextInvalidated = true;
            return false;
        }
    }

    async checkAndBlock() {
        try {
            // Early exit if context already invalidated
            if (this.contextInvalidated) {
                return;
            }

            // Check if extension context is still valid
            if (!this.isExtensionContextValid()) {
                this.cleanup();
                return;
            }

            // Get current focus mode status
            const focusResponse = await chrome.runtime.sendMessage({ type: 'CHECK_FOCUS_MODE' });
            const isFocusMode = focusResponse?.isFocusMode || false;
            
            // Get blocked sites list
            const result = await chrome.storage.sync.get({ blockedSites: [] });
            const blockedSites = result.blockedSites || [];
            
            // Check if current site should be blocked
            const currentHostname = window.location.hostname.toLowerCase();
            const shouldBlock = isFocusMode && this.isCurrentSiteBlocked(currentHostname, blockedSites);
            
            if (shouldBlock && !this.isBlocked) {
                await this.showBlocker();
            } else if (!shouldBlock && this.isBlocked) {
                this.hideBlocker();
            }
            
        } catch (error) {
            if (error.message.includes('Extension context invalidated') || error.message.includes('Extension context')) {
                this.contextInvalidated = true;
                this.cleanup();
            }
        }
    }

    isCurrentSiteBlocked(hostname, blockedSites) {
        const result = blockedSites.some(blockedSite => {
            const cleanSite = blockedSite.toLowerCase().replace(/^www\./, '');
            const cleanHostname = hostname.replace(/^www\./, '');
            
            const exactMatch = cleanHostname === cleanSite;
            const subdomainMatch = cleanHostname.endsWith('.' + cleanSite);
            
            // Check exact match or subdomain match
            return exactMatch || subdomainMatch;
        });
        
        return result;
    }

    async showBlocker() {
        if (this.isBlocked) return;
        
        // Wait for document.head and document.body to be available
        await this.waitForDOM();
        
        if (!document.head || !document.body) {
            return;
        }
        
        this.isBlocked = true;
        
        // Create blocker overlay
        this.blocker = document.createElement('div');
        this.blocker.id = 'focusguard-site-blocker';
        this.blocker.innerHTML = `
            <div class="focusguard-blocker-content">
                <div class="focusguard-blocker-icon">
                    <img src="${chrome.runtime.getURL('assets/icons/icon48.png')}" alt="FocusGuard" />
                </div>
                <h1 class="focusguard-blocker-title">Focus Mode Active</h1>
                <p class="focusguard-blocker-message">This site is blocked during focus sessions.</p>
                <p class="focusguard-blocker-sub">Stay focused and complete your current session!</p>
                <div class="focusguard-blocker-timer" id="focusguard-session-info">Checking session status...</div>
            </div>
        `;
        
        // Add styles safely
        try {
            const style = document.createElement('style');
            style.id = 'focusguard-blocker-styles';
            style.textContent = `
                #focusguard-site-blocker {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: linear-gradient(135deg, #213555 0%, #3E5879 100%) !important;
                    z-index: 2147483647 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                }

                .focusguard-blocker-content {
                    text-align: center !important;
                    color: #F5EFE7 !important;
                    max-width: 500px !important;
                    padding: 40px !important;
                    margin: 0 !important;
                    background: rgba(245, 239, 231, 0.1) !important;
                    border-radius: 20px !important;
                    backdrop-filter: blur(20px) !important;
                    border: 1px solid rgba(245, 239, 231, 0.2) !important;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                }

                .focusguard-blocker-icon {
                    margin-bottom: 20px !important;
                    line-height: 1 !important;
                }
                
                .focusguard-blocker-icon img {
                    width: 64px !important;
                    height: 64px !important;
                    display: block !important;
                    margin: 0 auto !important;
                }

                .focusguard-blocker-title {
                    font-size: 32px !important;
                    font-weight: 700 !important;
                    margin: 0 0 16px 0 !important;
                    color: #F5EFE7 !important;
                }

                .focusguard-blocker-message {
                    font-size: 18px !important;
                    margin: 0 0 8px 0 !important;
                    opacity: 0.9 !important;
                    line-height: 1.5 !important;
                    color: #F5EFE7 !important;
                }

                .focusguard-blocker-sub {
                    font-size: 16px !important;
                    margin: 0 0 20px 0 !important;
                    opacity: 0.8 !important;
                    line-height: 1.4 !important;
                    color: #F5EFE7 !important;
                }

                .focusguard-blocker-timer {
                    font-size: 20px !important;
                    font-weight: 600 !important;
                    color: #213555 !important;
                    background: rgba(216, 196, 182, 0.9) !important;
                    padding: 12px 20px !important;
                    border-radius: 12px !important;
                    margin: 0 !important;
                    font-family: 'Courier New', monospace !important;
                }

                @media (max-width: 768px) {
                    .focusguard-blocker-content {
                        max-width: 90% !important;
                        padding: 30px 20px !important;
                    }
                    
                    .focusguard-blocker-icon img {
                        width: 48px !important;
                        height: 48px !important;
                    }
                    
                    .focusguard-blocker-title {
                        font-size: 24px !important;
                    }
                    
                    .focusguard-blocker-message {
                        font-size: 16px !important;
                    }
                    
                    .focusguard-blocker-timer {
                        font-size: 16px !important;
                    }
                }
            `;
            
            // Add to page safely
            if (document.head) {
                document.head.appendChild(style);
            } else {
                document.documentElement.appendChild(style);
            }
            
            if (document.body) {
                document.body.appendChild(this.blocker);
            } else {
                document.documentElement.appendChild(this.blocker);
            }
            
            // Update timer info periodically
            this.updateSessionInfo();
            this.sessionInfoTimer = setInterval(() => {
                this.updateSessionInfo();
            }, 1000);
            
        } catch (error) {
            // Ignore errors
        }
    }

    hideBlocker() {
        if (!this.isBlocked) return;
        
        this.isBlocked = false;
        
        // Clear session info timer
        if (this.sessionInfoTimer) {
            clearInterval(this.sessionInfoTimer);
            this.sessionInfoTimer = null;
        }
        
        // Remove blocker elements
        try {
            const blocker = document.getElementById('focusguard-site-blocker');
            const styles = document.getElementById('focusguard-blocker-styles');
            
            if (blocker) blocker.remove();
            if (styles) styles.remove();
            
            this.blocker = null;
        } catch (error) {
            // Ignore errors
        }
    }

    async updateSessionInfo() {
        try {
            // Early exit if context already invalidated
            if (this.contextInvalidated) {
                return;
            }
            
            if (!this.isExtensionContextValid()) {
                return;
            }
            
            const response = await chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' });
            const infoEl = document.getElementById('focusguard-session-info');
            
            if (response && infoEl) {
                if (response.isRunning && response.isFocusSession) {
                    const minutes = Math.floor(response.timeLeft / 60);
                    const seconds = response.timeLeft % 60;
                    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    infoEl.textContent = `Focus session: ${timeStr} remaining`;
                } else {
                    infoEl.textContent = 'Focus session not active';
                }
            }
        } catch (error) {
            if (error.message.includes('Extension context invalidated') || error.message.includes('Extension context')) {
                this.contextInvalidated = true;
                if (this.sessionInfoTimer) {
                    clearInterval(this.sessionInfoTimer);
                    this.sessionInfoTimer = null;
                }
            }
        }
    }

    cleanup() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        if (this.sessionInfoTimer) {
            clearInterval(this.sessionInfoTimer);
            this.sessionInfoTimer = null;
        }
        this.hideBlocker();
    }
}

// Initialize site blocker only in main frame and only for potentially blocked sites
let siteBlocker = null;
if (window.self === window.top) {
    // Only initialize if this might be a blocked site
    checkIfSiteNeedsBlocking().then(needsBlocking => {
        if (needsBlocking) {
            siteBlocker = new SiteBlocker();
        }
    }).catch(() => {
        // Ignore errors
    });
}

// Check if current site is in blocked list before initializing blocker
async function checkIfSiteNeedsBlocking() {
    try {
        // Quick extension context check
        if (!chrome.runtime?.id) {
            return false;
        }
        
        const result = await chrome.storage.sync.get({ blockedSites: [] });
        const blockedSites = result.blockedSites || [];
        const currentHostname = window.location.hostname.toLowerCase();
        
        // Check if current site is in blocked list
        const isBlocked = blockedSites.some(blockedSite => {
            const cleanSite = blockedSite.toLowerCase().replace(/^www\./, '');
            const cleanHostname = currentHostname.replace(/^www\./, '');
            return cleanHostname === cleanSite || cleanHostname.endsWith('.' + cleanSite);
        });
        
        return isBlocked;
    } catch (error) {
        return false;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (siteBlocker) {
        siteBlocker.cleanup();
    }
}); 