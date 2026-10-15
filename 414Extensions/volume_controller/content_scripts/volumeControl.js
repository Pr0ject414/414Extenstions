// KylesChromeExtensions/volume_controller/content_scripts/volumeControl.js
(function() {
    if (window.hasVolumeControlInjected) return;
    window.hasVolumeControlInjected = true;

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const VOLUME_MODULE_VISIBLE_KEY = 'isVolumeModuleVisible';
    const VOLUME_MODULE_ENABLED_KEY = 'isVolumeModuleEnabled';

    let isEnabled = true;
    let currentVolume = 1.0;

    // Relay messages to the MAIN world
    function updateMainWorldVolume(volume) {
        window.postMessage({
            type: 'SET_VOLUME_BOOST',
            volume: isEnabled ? volume : 1.0
        }, '*');
    }

    function checkState() {
        chrome.storage.local.get([GLOBAL_MASTER_SWITCH_ENABLED_KEY, VOLUME_MODULE_VISIBLE_KEY, VOLUME_MODULE_ENABLED_KEY], (result) => {
            const globalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const visible = result[VOLUME_MODULE_VISIBLE_KEY] !== false;
            const modEnabled = result[VOLUME_MODULE_ENABLED_KEY] !== false;

            const wasEnabled = isEnabled;
            isEnabled = globalOn && visible && modEnabled;

            if (wasEnabled !== isEnabled) {
                updateMainWorldVolume(currentVolume);
            }
        });
    }

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "setVolume") {
            const newVolume = parseFloat(request.volume);
            if (!isNaN(newVolume)) {
                currentVolume = newVolume;
                updateMainWorldVolume(currentVolume);
            }
        } else if (request.action === "getVolume") {
            sendResponse({ volume: currentVolume });
        }
    });

    // Ask background for initial volume and sync it
    chrome.runtime.sendMessage({ action: "getStoredVolume" }, (response) => {
        if (response && response.volume !== undefined) {
             currentVolume = response.volume;
             updateMainWorldVolume(currentVolume);
        }
    });

    // Listen for storage changes
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes[GLOBAL_MASTER_SWITCH_ENABLED_KEY] || changes[VOLUME_MODULE_VISIBLE_KEY] || changes[VOLUME_MODULE_ENABLED_KEY]) {
                    checkState();
                }
            }
        });
    }

    // Initial check
    checkState();

    // Periodically re-sync to handle late-loading main world script or context resets
    setInterval(() => {
        if (isEnabled && currentVolume !== 1.0) {
            updateMainWorldVolume(currentVolume);
        }
    }, 5000);

})();
