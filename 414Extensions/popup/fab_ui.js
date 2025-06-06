// KylesChromeExtensions/popup/fab_ui.js
document.addEventListener('DOMContentLoaded', () => {
    // FAB Helper Toggles
    const fabModulePowerToggle = document.getElementById('fabModulePowerToggle');
    const fabFilterToggle = document.getElementById('fabFilterToggle');
    const fabAutoAddToggle = document.getElementById('fabAutoAddToggle');
    const fabAutoOpenFreeToggle = document.getElementById('fabAutoOpenFreeToggle');
    const fabQueueProcessingToggle = document.getElementById('fabQueueProcessingToggle');

    // FAB Stats display elements
    const fabQueueSizeElement = document.getElementById('fabQueueSize');
    const fabHiddenOwnedCountElement = document.getElementById('fabHiddenOwnedCount');
    const fabOperationalStatusIndicator = document.getElementById('fabOperationalStatusIndicator');
    const fabOperationalStatusText = document.getElementById('fabOperationalStatusText');

    // Storage Keys
    const FAB_MODULE_ENABLED_KEY = 'isFabModuleEnabled';
    const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled';
    const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
    const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';
    const FAB_QUEUE_PROCESSING_ENABLED_KEY = 'isFabQueueProcessingEnabled';

    // Load initial states
    chrome.storage.local.get([
        FAB_MODULE_ENABLED_KEY, FAB_FILTER_ENABLED_KEY, FAB_AUTO_ADD_ENABLED_KEY,
        FAB_AUTO_OPEN_FREE_ENABLED_KEY, FAB_QUEUE_PROCESSING_ENABLED_KEY
    ], (result) => {
        fabModulePowerToggle.checked = result[FAB_MODULE_ENABLED_KEY] !== false;
        fabFilterToggle.checked = result[FAB_FILTER_ENABLED_KEY] === true;
        fabAutoAddToggle.checked = result[FAB_AUTO_ADD_ENABLED_KEY] === true;
        fabAutoOpenFreeToggle.checked = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === true;
        fabQueueProcessingToggle.checked = result[FAB_QUEUE_PROCESSING_ENABLED_KEY] === true;
        updateFabStatsDisplay();
    });

    // Event Listeners
    fabModulePowerToggle.addEventListener('change', () => {
        const isEnabled = fabModulePowerToggle.checked;
        chrome.storage.local.set({ [FAB_MODULE_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setFabModuleEnabled", enabled: isEnabled }, updateFabStatsDisplay);
    });

    fabFilterToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_FILTER_ENABLED_KEY]: fabFilterToggle.checked }));
    fabAutoAddToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_AUTO_ADD_ENABLED_KEY]: fabAutoAddToggle.checked }));
    fabAutoOpenFreeToggle.addEventListener('change', () => chrome.storage.local.set({ [FAB_AUTO_OPEN_FREE_ENABLED_KEY]: fabAutoOpenFreeToggle.checked }));
    
    fabQueueProcessingToggle.addEventListener('change', () => {
        const isEnabled = fabQueueProcessingToggle.checked;
        chrome.storage.local.set({ [FAB_QUEUE_PROCESSING_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setFabQueueProcessingEnabled", enabled: isEnabled }, updateFabStatsDisplay);
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
                window.updateStatusIndicator(fabOperationalStatusIndicator, fabOperationalStatusText, response.operationalStatus);
            }
        });
    }

    // Set up interval to update stats
    const fabStatsInterval = setInterval(updateFabStatsDisplay, 3000);
    window.addEventListener('unload', () => clearInterval(fabStatsInterval));
});