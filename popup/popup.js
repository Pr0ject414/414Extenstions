// KylesChromeExtensions/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // Global elements
    const globalMasterSwitchToggle = document.getElementById('globalMasterSwitchToggle');

    // FAB Helper specific Toggles
    const fabModulePowerToggle = document.getElementById('fabModulePowerToggle');
    const fabFilterToggle = document.getElementById('fabFilterToggle');
    const fabAutoAddToggle = document.getElementById('fabAutoAddToggle');
    const fabAutoOpenFreeToggle = document.getElementById('fabAutoOpenFreeToggle');
    
    // Stats display elements
    const fabQueueSizeElement = document.getElementById('fabQueueSize');
    const fabHiddenOwnedCountElement = document.getElementById('fabHiddenOwnedCount');
    const operationalStatusIndicator = document.getElementById('operationalStatusIndicator');
    const operationalStatusText = document.getElementById('operationalStatusText');
    
    // Storage Keys - ensure these match constants.js
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const FAB_MODULE_ENABLED_KEY = 'isFabModuleEnabled';
    const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled'; // Note: In constants, these have _BG suffix
    const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
    const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';

    // Function to set toggle states based on other toggles
    function setDependentTogglesState() {
        const isGlobalOn = globalMasterSwitchToggle.checked;
        const isFabModuleOn = fabModulePowerToggle.checked;

        // FAB specific toggles depend on both Global and FAB Module switches
        const enableFabSpecific = isGlobalOn && isFabModuleOn;
        fabFilterToggle.disabled = !enableFabSpecific;
        fabAutoAddToggle.disabled = !enableFabSpecific;
        fabAutoOpenFreeToggle.disabled = !enableFabSpecific;

        // FAB Module toggle depends on Global switch
        fabModulePowerToggle.disabled = !isGlobalOn;

        // If Global is off, visually indicate FAB module is also effectively off (but retain its stored checked state)
        if (!isGlobalOn) {
            // You might add a class to grey out the FAB module section or its toggle specifically
            document.getElementById('fab-controls').classList.add('effectively-disabled');
        } else {
            document.getElementById('fab-controls').classList.remove('effectively-disabled');
        }
         // If FAB module is off (and global is on), disable its sub-settings
        if (!isFabModuleOn && isGlobalOn) {
             fabFilterToggle.disabled = true;
             fabAutoAddToggle.disabled = true;
             fabAutoOpenFreeToggle.disabled = true;
        }
    }


    // Load initial states for all toggles
    chrome.storage.local.get([
        GLOBAL_MASTER_SWITCH_ENABLED_KEY,
        FAB_MODULE_ENABLED_KEY,
        FAB_FILTER_ENABLED_KEY,
        FAB_AUTO_ADD_ENABLED_KEY,
        FAB_AUTO_OPEN_FREE_ENABLED_KEY
    ], (result) => {
        globalMasterSwitchToggle.checked = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] === undefined ? true : result[GLOBAL_MASTER_SWITCH_ENABLED_KEY];
        fabModulePowerToggle.checked = result[FAB_MODULE_ENABLED_KEY] === undefined ? true : result[FAB_MODULE_ENABLED_KEY];
        
        fabFilterToggle.checked = result[FAB_FILTER_ENABLED_KEY] === undefined ? false : result[FAB_FILTER_ENABLED_KEY];
        fabAutoAddToggle.checked = result[FAB_AUTO_ADD_ENABLED_KEY] === undefined ? false : result[FAB_AUTO_ADD_ENABLED_KEY];
        fabAutoOpenFreeToggle.checked = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === undefined ? false : result[FAB_AUTO_OPEN_FREE_ENABLED_KEY];
        
        setDependentTogglesState(); // Initial disable/enable state
        updateStatsDisplay(); // Initial stats fetch
    });

    // Event Listeners
    globalMasterSwitchToggle.addEventListener('change', () => {
        const isEnabled = globalMasterSwitchToggle.checked;
        chrome.storage.local.set({ [GLOBAL_MASTER_SWITCH_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setGlobalMasterSwitch", enabled: isEnabled }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) { /* console.error */ }
            setDependentTogglesState();
            updateStatsDisplay();
        });
    });

    fabModulePowerToggle.addEventListener('change', () => {
        const isEnabled = fabModulePowerToggle.checked;
        chrome.storage.local.set({ [FAB_MODULE_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setFabModuleEnabled", enabled: isEnabled }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) { /* console.error */ }
            setDependentTogglesState();
            updateStatsDisplay();
        });
    });

    fabFilterToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_FILTER_ENABLED_KEY]: fabFilterToggle.checked }));
    fabAutoAddToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_AUTO_ADD_ENABLED_KEY]: fabAutoAddToggle.checked }));
    fabAutoOpenFreeToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_AUTO_OPEN_FREE_ENABLED_KEY]: fabAutoOpenFreeToggle.checked }));


    function updateStatsDisplay() {
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            // Handle environments where sendMessage is not available
            fabQueueSizeElement.textContent = "Unavailable";
            fabHiddenOwnedCountElement.textContent = "Unavailable";
            operationalStatusIndicator.className = 'status-error';
            operationalStatusText.textContent = "Unavailable";
            return;
        }

        chrome.runtime.sendMessage({ action: "getFabGlobalStats" }, (response) => {
            if (chrome.runtime.lastError) {
                fabQueueSizeElement.textContent = "Error";
                fabHiddenOwnedCountElement.textContent = "Error";
                operationalStatusIndicator.className = 'status-error';
                operationalStatusText.textContent = "Error";
                setDependentTogglesState(); // Reflect potential desync if background is down
                return;
            }
            if (response) {
                fabQueueSizeElement.textContent = response.queueSize !== undefined ? response.queueSize : "N/A";
                fabHiddenOwnedCountElement.textContent = response.hiddenOwnedCount !== undefined ? response.hiddenOwnedCount : "N/A";
                
                // Update toggle states from background's perspective (source of truth for enabled state)
                if (response.globalMasterSwitchEnabled !== undefined && globalMasterSwitchToggle.checked !== response.globalMasterSwitchEnabled) {
                    globalMasterSwitchToggle.checked = response.globalMasterSwitchEnabled;
                }
                if (response.fabModuleEnabled !== undefined && fabModulePowerToggle.checked !== response.fabModuleEnabled) {
                    fabModulePowerToggle.checked = response.fabModuleEnabled;
                }
                setDependentTogglesState(); // After updating main toggles, ensure sub-toggles are correctly enabled/disabled.

                operationalStatusIndicator.className = ''; // Clear previous status classes
                let statusTextValue = "Unknown";
                switch (response.operationalStatus) {
                    case "EXTENSION_DISABLED":
                        operationalStatusIndicator.classList.add('status-extension-disabled');
                        statusTextValue = "Ext. Disabled";
                        break;
                    case "FAB_DISABLED":
                        operationalStatusIndicator.classList.add('status-fab-disabled');
                        statusTextValue = "FAB Disabled";
                        break;
                    case "OK_ACTIVE":
                        operationalStatusIndicator.classList.add('status-ok-active');
                        statusTextValue = "Active";
                        break;
                    case "OK_IDLE":
                        operationalStatusIndicator.classList.add('status-ok-idle');
                        statusTextValue = "Idle";
                        break;
                    case "SUSPENDED":
                        operationalStatusIndicator.classList.add('status-suspended');
                        statusTextValue = "Suspended";
                        break;
                    case "RATE_LIMITED":
                        operationalStatusIndicator.classList.add('status-rate-limited');
                        statusTextValue = "Rate Limited";
                        break;
                    default:
                        operationalStatusIndicator.classList.add('status-error'); // Default to error appearance
                        statusTextValue = "Status N/A";
                }
                operationalStatusText.textContent = statusTextValue;
            } else {
                fabQueueSizeElement.textContent = "N/A";
                fabHiddenOwnedCountElement.textContent = "N/A";
                operationalStatusIndicator.className = 'status-error';
                operationalStatusText.textContent = "N/A";
                setDependentTogglesState();
            }
        });
    }

    // Initial call and interval
    // updateStatsDisplay(); // Called after loading toggle states
    const statsUpdateInterval = setInterval(updateStatsDisplay, 3000);
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
            if (document.getElementById(targetTab)) { // Check if element exists
                 document.getElementById(targetTab).classList.add('active');
            }
        });
    });
});