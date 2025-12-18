// KylesChromeExtensions/x_extension/content_scripts/xSettingsLoader.js
(function() {
    // Keys matched to coreConstants.js
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const X_MODULE_ENABLED_KEY = 'isXModuleEnabled';
    const X_ALWAYS_MUTE_KEY = 'isXAlwaysMuteEnabled';
    const X_MODULE_VISIBLE_KEY = 'isXModuleVisible';

    function postSettings() {
        chrome.storage.local.get([
            GLOBAL_MASTER_SWITCH_ENABLED_KEY, 
            X_MODULE_ENABLED_KEY, 
            X_ALWAYS_MUTE_KEY,
            X_MODULE_VISIBLE_KEY
        ], (result) => {
            const isGlobalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const isXEnabled = result[X_MODULE_ENABLED_KEY] !== false;
            const isAlwaysMute = result[X_ALWAYS_MUTE_KEY] !== false;

            const isXVisible = result[X_MODULE_VISIBLE_KEY] !== false;

            // Effectively enabled if Global is ON logic + X Specific ON logic + X Visible
            const effectiveEnabled = isGlobalOn && isXEnabled && isXVisible;

            window.postMessage({
                type: 'X_SETTINGS_UPDATE',
                payload: {
                    isEnabled: effectiveEnabled,
                    alwaysMute: isAlwaysMute
                }
            }, '*');
        });
    }

    // Initial Load
    postSettings();

    // Listen for changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes[GLOBAL_MASTER_SWITCH_ENABLED_KEY] || 
                changes[X_MODULE_ENABLED_KEY] || 
                changes[X_ALWAYS_MUTE_KEY] ||
                changes[X_MODULE_VISIBLE_KEY]) {
                postSettings();
            }
        }
    });
})();
