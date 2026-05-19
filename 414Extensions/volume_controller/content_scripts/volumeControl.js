// KylesChromeExtensions/volume_controller/content_scripts/volumeControl.js
(function() {
    if (window.hasVolumeControlInjected) return;
    window.hasVolumeControlInjected = true;

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const VOLUME_MODULE_VISIBLE_KEY = 'isVolumeModuleVisible';

    chrome.storage.local.get([GLOBAL_MASTER_SWITCH_ENABLED_KEY, VOLUME_MODULE_VISIBLE_KEY], (result) => {
        if (result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] === false || result[VOLUME_MODULE_VISIBLE_KEY] === false) {
            return;
        }

        startVolumeControl();
    });

    function startVolumeControl() {
        let currentVolume = 1.0;

        // Relay messages to the MAIN world
        function updateMainWorldVolume(volume) {
            window.postMessage({
                type: 'SET_VOLUME_BOOST',
                volume: volume
            }, '*');
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

        // Periodically re-sync to handle late-loading main world script or context resets
        setInterval(() => updateMainWorldVolume(currentVolume), 5000);
    }

})();
