// KylesChromeExtensions/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Global Elements ---
    const globalMasterSwitchToggle = document.getElementById('globalMasterSwitchToggle');
    const openOptionsPageLink = document.getElementById('openOptionsPageLink');
    
    // --- Volume Control Elements ---
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValueDisplay = document.getElementById('volumeValueDisplay');
    const volumeResetBtn = document.getElementById('volumeResetBtn');

    // --- Global Storage Key ---
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';

    // --- Load Global State ---
    chrome.storage.local.get([GLOBAL_MASTER_SWITCH_ENABLED_KEY], (result) => {
        globalMasterSwitchToggle.checked = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
        setDependentModulesState();
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
            case "RATE_LIMITED":
                indicator.classList.add('status-rate-limited');
                statusTextValue = "Rate Limited";
                break;
            case "QUEUE_DISABLED":
                indicator.classList.add('status-fab-disabled');
                statusTextValue = "Queue Off";
                break;
            default:
                indicator.classList.add('status-error');
                statusTextValue = "Status N/A";
        }
        textElement.textContent = statusTextValue;
    };


    // --- Tab Switching Logic ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => content.classList.remove('active'));
            const targetTab = button.getAttribute('data-tab');
            const targetElement = document.getElementById(targetTab);
            if (targetElement) {
                 targetElement.classList.add('active');
            }
        });
    });
});