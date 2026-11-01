// KylesChromeExtensions/popup/misc_ui.js
document.addEventListener('DOMContentLoaded', () => {
    const miscModulePowerToggle = document.getElementById('miscModulePowerToggle');
    const googleImagesHideSaveToggle = document.getElementById('googleImagesHideSaveToggle');

    const MISC_MODULE_ENABLED_KEY = 'isMiscModuleEnabled';
    const GOOGLE_IMAGES_HIDE_SAVE_KEY = 'isGoogleImagesHideSaveEnabled';

    if (miscModulePowerToggle) {
        chrome.storage.local.get([
            MISC_MODULE_ENABLED_KEY,
            GOOGLE_IMAGES_HIDE_SAVE_KEY
        ], (result) => {
            miscModulePowerToggle.checked = result[MISC_MODULE_ENABLED_KEY] !== false;
            if (googleImagesHideSaveToggle) {
                // Default to OFF (false) unless explicitly enabled
                googleImagesHideSaveToggle.checked = result[GOOGLE_IMAGES_HIDE_SAVE_KEY] === true;
            }
        });

        miscModulePowerToggle.addEventListener('change', () => {
            const isEnabled = miscModulePowerToggle.checked;
            chrome.storage.local.set({ [MISC_MODULE_ENABLED_KEY]: isEnabled });
            chrome.runtime.sendMessage({ action: "setMiscModuleEnabled", enabled: isEnabled });
        });

        if (googleImagesHideSaveToggle) {
            googleImagesHideSaveToggle.addEventListener('change', () => {
                const isEnabled = googleImagesHideSaveToggle.checked;
                chrome.storage.local.set({ [GOOGLE_IMAGES_HIDE_SAVE_KEY]: isEnabled });
            });
        }
    }
});
