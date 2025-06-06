// KylesChromeExtensions/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // Global elements
    const globalMasterSwitchToggle = document.getElementById('globalMasterSwitchToggle');

    // FAB Helper specific Toggles
    const fabModulePowerToggle = document.getElementById('fabModulePowerToggle');
    const fabFilterToggle = document.getElementById('fabFilterToggle');
    const fabAutoAddToggle = document.getElementById('fabAutoAddToggle');
    const fabAutoOpenFreeToggle = document.getElementById('fabAutoOpenFreeToggle');
    const fabQueueProcessingToggle = document.getElementById('fabQueueProcessingToggle');
    
    // YouTube Helper specific Toggles
    const youTubeModulePowerToggle = document.getElementById('youTubeModulePowerToggle');
    const youTubeNoSuggestionsToggle = document.getElementById('youTubeNoSuggestionsToggle');

    // FAB Stats display elements
    const fabQueueSizeElement = document.getElementById('fabQueueSize');
    const fabHiddenOwnedCountElement = document.getElementById('fabHiddenOwnedCount');
    const fabOperationalStatusIndicator = document.getElementById('fabOperationalStatusIndicator');
    const fabOperationalStatusText = document.getElementById('fabOperationalStatusText');
    
    // YouTube Stats display elements
    const youTubeOperationalStatusIndicator = document.getElementById('youTubeOperationalStatusIndicator');
    const youTubeOperationalStatusText = document.getElementById('youTubeOperationalStatusText');

    // Storage Keys
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const FAB_MODULE_ENABLED_KEY = 'isFabModuleEnabled';
    const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled';
    const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
    const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';
    const FAB_QUEUE_PROCESSING_ENABLED_KEY = 'isFabQueueProcessingEnabled';
    const YOUTUBE_MODULE_ENABLED_KEY = 'isYouTubeModuleEnabled';
    const YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY = 'isYouTubeNoSuggestionsEnabled';


    function setDependentTogglesState() {
        const isGlobalOn = globalMasterSwitchToggle.checked;
        
        // FAB Dependencies
        const isFabModuleOn = fabModulePowerToggle.checked;
        const enableFabSpecific = isGlobalOn && isFabModuleOn;
        fabFilterToggle.disabled = !enableFabSpecific;
        fabAutoAddToggle.disabled = !enableFabSpecific;
        fabAutoOpenFreeToggle.disabled = !enableFabSpecific;
        fabQueueProcessingToggle.disabled = !enableFabSpecific;
        fabModulePowerToggle.disabled = !isGlobalOn;

        // YouTube Dependencies
        const isYouTubeModuleOn = youTubeModulePowerToggle.checked;
        const enableYouTubeSpecific = isGlobalOn && isYouTubeModuleOn;
        youTubeNoSuggestionsToggle.disabled = !enableYouTubeSpecific;
        youTubeModulePowerToggle.disabled = !isGlobalOn;

        // Visual cues for disabled modules
        document.getElementById('fab-controls').classList.toggle('effectively-disabled', !isGlobalOn);
        document.getElementById('youtube-controls').classList.toggle('effectively-disabled', !isGlobalOn);
    }

    const openOptionsPageLink = document.getElementById('openOptionsPageLink');
    if (openOptionsPageLink) {
        openOptionsPageLink.addEventListener('click', (event) => {
            event.preventDefault();
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
            }
        });
    }

    // Load initial states for all toggles
    chrome.storage.local.get([
        GLOBAL_MASTER_SWITCH_ENABLED_KEY,
        FAB_MODULE_ENABLED_KEY,
        FAB_FILTER_ENABLED_KEY,
        FAB_AUTO_ADD_ENABLED_KEY,
        FAB_AUTO_OPEN_FREE_ENABLED_KEY,
        FAB_QUEUE_PROCESSING_ENABLED_KEY,
        YOUTUBE_MODULE_ENABLED_KEY,
        YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY
    ], (result) => {
        globalMasterSwitchToggle.checked = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
        fabModulePowerToggle.checked = result[FAB_MODULE_ENABLED_KEY] !== false;
        fabFilterToggle.checked = result[FAB_FILTER_ENABLED_KEY] === true;
        fabAutoAddToggle.checked = result[FAB_AUTO_ADD_ENABLED_KEY] === true;
        fabAutoOpenFreeToggle.checked = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === true;
        fabQueueProcessingToggle.checked = result[FAB_QUEUE_PROCESSING_ENABLED_KEY] === true;
        
        youTubeModulePowerToggle.checked = result[YOUTUBE_MODULE_ENABLED_KEY] !== false;
        youTubeNoSuggestionsToggle.checked = result[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY] === true;

        setDependentTogglesState();
        updateFabStatsDisplay();
        updateYouTubeStatsDisplay();
    });

    // Event Listeners
    globalMasterSwitchToggle.addEventListener('change', () => {
        const isEnabled = globalMasterSwitchToggle.checked;
        chrome.storage.local.set({ [GLOBAL_MASTER_SWITCH_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setGlobalMasterSwitch", enabled: isEnabled }, () => {
            setDependentTogglesState();
            updateFabStatsDisplay();
            updateYouTubeStatsDisplay();
        });
    });

    fabModulePowerToggle.addEventListener('change', () => {
        const isEnabled = fabModulePowerToggle.checked;
        chrome.storage.local.set({ [FAB_MODULE_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setFabModuleEnabled", enabled: isEnabled }, () => {
            setDependentTogglesState();
            updateFabStatsDisplay();
        });
    });

    youTubeModulePowerToggle.addEventListener('change', () => {
        const isEnabled = youTubeModulePowerToggle.checked;
        chrome.storage.local.set({ [YOUTUBE_MODULE_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setYouTubeModuleEnabled", enabled: isEnabled }, () => {
            setDependentTogglesState();
            updateYouTubeStatsDisplay();
        });
    });

    fabFilterToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_FILTER_ENABLED_KEY]: fabFilterToggle.checked }));
    fabAutoAddToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_AUTO_ADD_ENABLED_KEY]: fabAutoAddToggle.checked }));
    fabAutoOpenFreeToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_AUTO_OPEN_FREE_ENABLED_KEY]: fabAutoOpenFreeToggle.checked }));
    fabQueueProcessingToggle.addEventListener('change', () => {
        const isEnabled = fabQueueProcessingToggle.checked;
        chrome.storage.local.set({ [FAB_QUEUE_PROCESSING_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setFabQueueProcessingEnabled", enabled: isEnabled }, updateFabStatsDisplay);
    });
    
    youTubeNoSuggestionsToggle.addEventListener('change', () => {
        const isEnabled = youTubeNoSuggestionsToggle.checked;
        chrome.storage.local.set({ [YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setYouTubeNoSuggestionsEnabled", enabled: isEnabled }, updateYouTubeStatsDisplay);
    });


    function updateFabStatsDisplay() {
        chrome.runtime.sendMessage({ action: "getFabGlobalStats" }, (response) => {
            if (chrome.runtime.lastError) {
                fabOperationalStatusText.textContent = "Error";
                fabOperationalStatusIndicator.className = 'status-error';
                return;
            }
            if (response) {
                fabQueueSizeElement.textContent = response.queueSize ?? "N/A";
                fabHiddenOwnedCountElement.textContent = response.hiddenOwnedCount ?? "N/A";
                
                updateStatusIndicator(fabOperationalStatusIndicator, fabOperationalStatusText, response.operationalStatus);
            }
        });
    }

    function updateYouTubeStatsDisplay() {
        chrome.runtime.sendMessage({ action: "getYouTubeGlobalStats" }, (response) => {
            if (chrome.runtime.lastError) {
                youTubeOperationalStatusText.textContent = "Error";
                youTubeOperationalStatusIndicator.className = 'status-error';
                return;
            }
            if (response) {
                 updateStatusIndicator(youTubeOperationalStatusIndicator, youTubeOperationalStatusText, response.operationalStatus);
            }
        });
    }
    
    function updateStatusIndicator(indicator, textElement, status) {
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
    }

    const statsUpdateInterval = setInterval(() => {
        updateFabStatsDisplay();
        updateYouTubeStatsDisplay();
    }, 3000);
    window.addEventListener('unload', () => clearInterval(statsUpdateInterval));

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => content.classList.remove('active'));
            const targetTab = button.getAttribute('data-tab');
            if (document.getElementById(targetTab)) {
                 document.getElementById(targetTab).classList.add('active');
            }
        });
    });
});