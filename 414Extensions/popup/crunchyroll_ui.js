// KylesChromeExtensions/popup/crunchyroll_ui.js
document.addEventListener('DOMContentLoaded', () => {
    const crunchyrollModulePowerToggle = document.getElementById('crunchyrollModulePowerToggle');
    const crunchyrollAutoCloseEndSlateToggle = document.getElementById('crunchyrollAutoCloseEndSlateToggle');
    const crunchyrollHideControlsOnSpeedToggle = document.getElementById('crunchyrollHideControlsOnSpeedToggle');

    const CRUNCHYROLL_MODULE_ENABLED_KEY = 'isCrunchyrollModuleEnabled';
    const CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY = 'isCrunchyrollAutoCloseEndSlateEnabled';
    const CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY = 'isCrunchyrollHideControlsOnSpeedEnabled';

    // Load initial state
    if (crunchyrollModulePowerToggle) {
        chrome.storage.local.get([
            CRUNCHYROLL_MODULE_ENABLED_KEY,
            CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY,
            CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY
        ], (result) => {
            crunchyrollModulePowerToggle.checked = result[CRUNCHYROLL_MODULE_ENABLED_KEY] !== false;
            if (crunchyrollAutoCloseEndSlateToggle) {
                crunchyrollAutoCloseEndSlateToggle.checked = result[CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY] !== false;
            }
            if (crunchyrollHideControlsOnSpeedToggle) {
                crunchyrollHideControlsOnSpeedToggle.checked = result[CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY] !== false;
            }
        });

        crunchyrollModulePowerToggle.addEventListener('change', () => {
            const isEnabled = crunchyrollModulePowerToggle.checked;
            chrome.storage.local.set({ [CRUNCHYROLL_MODULE_ENABLED_KEY]: isEnabled });
            chrome.runtime.sendMessage({ action: "setCrunchyrollModuleEnabled", enabled: isEnabled });
        });

        if (crunchyrollAutoCloseEndSlateToggle) {
            crunchyrollAutoCloseEndSlateToggle.addEventListener('change', () => {
                const isEnabled = crunchyrollAutoCloseEndSlateToggle.checked;
                chrome.storage.local.set({ [CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY]: isEnabled });
            });
        }

        if (crunchyrollHideControlsOnSpeedToggle) {
            crunchyrollHideControlsOnSpeedToggle.addEventListener('change', () => {
                const isEnabled = crunchyrollHideControlsOnSpeedToggle.checked;
                chrome.storage.local.set({ [CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY]: isEnabled });
            });
        }
    }
});
