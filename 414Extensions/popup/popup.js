// KylesChromeExtensions/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Global Elements ---
    const globalMasterSwitchToggle = document.getElementById('globalMasterSwitchToggle');
    const openOptionsPageLink = document.getElementById('openOptionsPageLink');
    
    // --- Volume Control Elements ---
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValueDisplay = document.getElementById('volumeValueDisplay');
    const volumeResetBtn = document.getElementById('volumeResetBtn');
    
    // --- VSC Elements ---
    const vscPowerToggle = document.getElementById('vscPowerToggle');
    const vscPopupKeySpeed = document.getElementById('vscPopupKeySpeed');
    const vscSaveSpeedBtn = document.getElementById('vscSaveSpeedBtn');
    const vscAddBlacklistBtn = document.getElementById('vscAddBlacklistBtn');
    const vscPopupStatus = document.getElementById('vscPopupStatus');

    // --- Global Storage Key ---
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';

    // --- Load Global State ---
    chrome.storage.local.get([GLOBAL_MASTER_SWITCH_ENABLED_KEY], (result) => {
        globalMasterSwitchToggle.checked = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
        setDependentModulesState();
        setDependentModulesState();
    });
    
    // --- VSC Storage Keys (Duplicated from controller.js/settings.js for independence) ---
    const VSC_STORAGE_KEYS = {
      BLACKLIST: 'vsc_blacklist',
      IS_ENABLED: 'vsc_is_enabled',
      OPTIONS: 'vsc_options'
    };
    
    // --- Load VSC State ---
    chrome.storage.local.get([VSC_STORAGE_KEYS.IS_ENABLED, VSC_STORAGE_KEYS.OPTIONS], (result) => {
        // Default Enabled if not present
        const isVscEnabled = result[VSC_STORAGE_KEYS.IS_ENABLED] !== false;
        if (vscPowerToggle) vscPowerToggle.checked = isVscEnabled;
        
        const vscOptions = result[VSC_STORAGE_KEYS.OPTIONS] || {};
        if (vscPopupKeySpeed) vscPopupKeySpeed.value = vscOptions.keySpeed || 2.0;
    });

   // --- Global Event Listeners ---
    globalMasterSwitchToggle.addEventListener('change', () => {
        const isEnabled = globalMasterSwitchToggle.checked;
        chrome.storage.local.set({ [GLOBAL_MASTER_SWITCH_ENABLED_KEY]: isEnabled });
        
        // The message now has a callback that explicitly tells the module UIs to refresh
        chrome.runtime.sendMessage({ action: "setGlobalMasterSwitch", enabled: isEnabled }, () => {
            setDependentModulesState();
            // Manually trigger the status updates for each module
            if (window.updateFabStatsDisplay) window.updateFabStatsDisplay();
            if (window.updateYouTubeStatsDisplay) window.updateYouTubeStatsDisplay();
        });
    });

    if (openOptionsPageLink) {
        openOptionsPageLink.addEventListener('click', (event) => {
            event.preventDefault();
            chrome.runtime.openOptionsPage ? chrome.runtime.openOptionsPage() : chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
        });
    }

    // --- Volume Control Logic ---
    if (volumeSlider && volumeValueDisplay) {
        const updateVolumeDisplay = (val) => {
            volumeValueDisplay.textContent = `${val}%`;
            // Visual feedback - color change based on volume
            if (val > 100) volumeValueDisplay.style.color = '#ff9800'; // Orange for boost
            else volumeValueDisplay.style.color = '#4caf50'; // Green for normal
        };

        volumeSlider.addEventListener('input', () => {
             const val = volumeSlider.value;
             updateVolumeDisplay(val);
        });

        volumeSlider.addEventListener('change', () => {
            const val = volumeSlider.value;
            // Get current active tab to send message
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const volumeFloat = parseFloat(val) / 100; // Convert 100 -> 1.0
                    chrome.runtime.sendMessage({ 
                        action: "updateVolume", 
                        tabId: tabs[0].id, 
                        volume: volumeFloat 
                    });
                }
            });
        });

        if (volumeResetBtn) {
            volumeResetBtn.addEventListener('click', () => {
                volumeSlider.value = 100;
                updateVolumeDisplay(100);
                // Trigger change logic
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs.length > 0) {
                        chrome.runtime.sendMessage({ 
                            action: "updateVolume", 
                            tabId: tabs[0].id, 
                            volume: 1.0 
                        });
                    }
                });
            });
        }

        // Initialize Volume State
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                 chrome.runtime.sendMessage({ 
                    action: "getCurrentVolumeForPopup", 
                    tabId: tabs[0].id 
                }, (response) => {
                    if (response && response.volume !== undefined) {
                        const volPercent = Math.round(response.volume * 100);
                        volumeSlider.value = volPercent;
                        updateVolumeDisplay(volPercent);
                    }
                });
            }
        });
    }

    // --- VSC Logic ---
    if (vscPowerToggle) {
        vscPowerToggle.addEventListener('change', () => {
            const isEnabled = vscPowerToggle.checked;
            chrome.storage.local.set({ [VSC_STORAGE_KEYS.IS_ENABLED]: isEnabled });
            // Since controller.js checks on page load/init, we might want to reload active tabs or send message
            // For now, simpler to just save. User might need to refresh.
        });
    }

    if (vscSaveSpeedBtn) {
        vscSaveSpeedBtn.addEventListener('click', () => {
            const newSpeed = parseFloat(vscPopupKeySpeed.value);
            if (isNaN(newSpeed) || newSpeed < 0.1 || newSpeed > 16) {
                if (vscPopupStatus) {
                   vscPopupStatus.textContent = "Invalid speed (0.1 - 16)";
                   vscPopupStatus.className = "status-message error";
                }
                return;
            }
            
            // Allow partial update of options
            chrome.storage.local.get([VSC_STORAGE_KEYS.OPTIONS], (result) => {
                const options = result[VSC_STORAGE_KEYS.OPTIONS] || {};
                options.keySpeed = newSpeed;
                chrome.storage.local.set({ [VSC_STORAGE_KEYS.OPTIONS]: options }, () => {
                   if (vscPopupStatus) {
                       vscPopupStatus.textContent = "Speed saved!";
                       vscPopupStatus.className = "status-message success";
                       setTimeout(() => vscPopupStatus.textContent = "", 2000);
                   } 
                });
            });
        });
    }

    if (vscAddBlacklistBtn) {
        vscAddBlacklistBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) return;
                const tab = tabs[0];
                if (!tab.url) return;
                
                try {
                    const url = new URL(tab.url);
                    const hostname = url.hostname;
                    
                    chrome.storage.local.get([VSC_STORAGE_KEYS.BLACKLIST], (result) => {
                        let blacklist = result[VSC_STORAGE_KEYS.BLACKLIST] || '';
                        // Simple check if already there
                        if (blacklist.includes(hostname)) {
                            if (vscPopupStatus) {
                                vscPopupStatus.textContent = "Site already blacklisted";
                                vscPopupStatus.className = "status-message warning";
                            }
                            return;
                        }
                        
                        blacklist = blacklist + '\n' + hostname;
                        chrome.storage.local.set({ [VSC_STORAGE_KEYS.BLACKLIST]: blacklist }, () => {
                             if (vscPopupStatus) {
                                vscPopupStatus.textContent = `Added ${hostname}`;
                                vscPopupStatus.className = "status-message success";
                             }
                        });
                    });
                } catch (e) {
                    if (vscPopupStatus) {
                        vscPopupStatus.textContent = "Invalid URL";
                        vscPopupStatus.className = "status-message error";
                    }
                }
            });
        });
    }


    // --- Functions Accessible by Module UI Scripts ---
    
    // This function can be called by module scripts to correctly set their disabled state.
    function setDependentModulesState() {
        const isGlobalOn = globalMasterSwitchToggle.checked;
        document.getElementById('fab-controls').classList.toggle('effectively-disabled', !isGlobalOn);
        document.getElementById('youtube-controls').classList.toggle('effectively-disabled', !isGlobalOn);
        // Also disable the power toggles themselves
        document.getElementById('fabModulePowerToggle').disabled = !isGlobalOn;
        document.getElementById('youTubeModulePowerToggle').disabled = !isGlobalOn;
    }

    // Attach a global status indicator updater to the window object
    window.updateStatusIndicator = (indicator, textElement, status) => {
        if (!indicator || !textElement) return;
        indicator.className = ''; // Clear previous
        let statusTextValue = "Unknown";
         switch (status) {
            case "EXTENSION_DISABLED":
                indicator.classList.add('status-extension-disabled');
                statusTextValue = "Ext. Disabled";
                break;
            case "FAB_DISABLED":
            case "YOUTUBE_DISABLED":
                indicator.classList.add('status-fab-disabled');
                statusTextValue = "Mod. Disabled";
                break;
            case "OK_ACTIVE":
                indicator.classList.add('status-ok-active');
                statusTextValue = "Active";
                break;
            case "OK_IDLE":
                indicator.classList.add('status-ok-idle');
                statusTextValue = "Idle";
                break;
            case "SUSPENDED":
                indicator.classList.add('status-suspended');
                statusTextValue = "Suspended";
                break;
            case "QUEUE_DISABLED":
                indicator.classList.add('status-fab-disabled');
                statusTextValue = "Queue Off";
                break;
            default:
                // Check for dynamic statuses
                if (status.startsWith("Rate Limited")) {
                    indicator.classList.add('status-rate-limited');
                    statusTextValue = status; // Use the dynamic string (e.g. "Rate Limited (45s)")
                } else {
                    indicator.classList.add('status-error');
                    statusTextValue = "Status N/A";
                }
        }
        textElement.textContent = statusTextValue;
    };


    // --- Tab Switching Logic ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    const switchTab = (tabId) => {
        const targetButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const targetContent = document.getElementById(tabId);
        
        if (targetButton && targetContent) {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            targetButton.classList.add('active');
            targetContent.classList.add('active');
        }
    };

    // Restore last active tab
    chrome.storage.session.get(['lastActiveTab'], (result) => {
        if (result.lastActiveTab) {
            switchTab(result.lastActiveTab);
        }
    });

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
            chrome.storage.session.set({ lastActiveTab: targetTab });
        });
    });
});