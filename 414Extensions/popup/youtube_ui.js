// KylesChromeExtensions/popup/youtube_ui.js
document.addEventListener('DOMContentLoaded', () => {
    // YouTube Helper Toggles
    const youTubeModulePowerToggle = document.getElementById('youTubeModulePowerToggle');
    const youTubeNoSuggestionsToggle = document.getElementById('youTubeNoSuggestionsToggle');

    // YouTube Stats display elements
    const youTubeOperationalStatusIndicator = document.getElementById('youTubeOperationalStatusIndicator');
    const youTubeOperationalStatusText = document.getElementById('youTubeOperationalStatusText');

    // Storage Keys
    const YOUTUBE_MODULE_ENABLED_KEY = 'isYouTubeModuleEnabled';
    const YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY = 'isYouTubeNoSuggestionsEnabled';

    // Load initial states
    chrome.storage.local.get([
        YOUTUBE_MODULE_ENABLED_KEY, YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY
    ], (result) => {
        youTubeModulePowerToggle.checked = result[YOUTUBE_MODULE_ENABLED_KEY] !== false;
        youTubeNoSuggestionsToggle.checked = result[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY] === true;
        updateYouTubeStatsDisplay();
    });

    // Event Listeners
    youTubeModulePowerToggle.addEventListener('change', () => {
        const isEnabled = youTubeModulePowerToggle.checked;
        chrome.storage.local.set({ [YOUTUBE_MODULE_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setYouTubeModuleEnabled", enabled: isEnabled }, updateYouTubeStatsDisplay);
    });

    youTubeNoSuggestionsToggle.addEventListener('change', () => {
        const isEnabled = youTubeNoSuggestionsToggle.checked;
        chrome.storage.local.set({ [YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]: isEnabled });
        chrome.runtime.sendMessage({ action: "setYouTubeNoSuggestionsEnabled", enabled: isEnabled }, updateYouTubeStatsDisplay);
    });

    // --- New Auto HD Controls ---
    const youTubeQualitySelect = document.getElementById('youTubeQualitySelect');
    const youTubeEnhancedBitrateToggle = document.getElementById('youTubeEnhancedBitrateToggle');

    // Load HD settings
    chrome.storage.local.get(['preferredQuality', 'isEnhancedBitrate'], (result) => {
        if (result.preferredQuality) {
            youTubeQualitySelect.value = result.preferredQuality;
        }
        if (result.isEnhancedBitrate !== undefined) {
            youTubeEnhancedBitrateToggle.checked = result.isEnhancedBitrate;
        }
    });

    youTubeQualitySelect.addEventListener('change', () => {
        const val = youTubeQualitySelect.value;
        chrome.storage.local.set({ preferredQuality: val });
        // Optional: Notify if needed, but storage listener in content script handles it
    });

    youTubeEnhancedBitrateToggle.addEventListener('change', () => {
        const val = youTubeEnhancedBitrateToggle.checked;
        chrome.storage.local.set({ isEnhancedBitrate: val });
    });

    function updateYouTubeStatsDisplay() {
        chrome.runtime.sendMessage({ action: "getYouTubeGlobalStats" }, (response) => {
            if (chrome.runtime.lastError) {
                youTubeOperationalStatusText.textContent = "Error";
                youTubeOperationalStatusIndicator.className = 'status-error';
                return;
            }
            if (response) {
                window.updateStatusIndicator(youTubeOperationalStatusIndicator, youTubeOperationalStatusText, response.operationalStatus);
            }
        });
    }

    // Expose the function to the window so popup.js can call it
    window.updateYouTubeStatsDisplay = updateYouTubeStatsDisplay;

    // Set up interval to update stats
    const youtubeStatsInterval = setInterval(updateYouTubeStatsDisplay, 3000);
    window.addEventListener('unload', () => clearInterval(youtubeStatsInterval));
});