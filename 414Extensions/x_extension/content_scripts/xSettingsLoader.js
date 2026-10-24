// KylesChromeExtensions/x_extension/content_scripts/xSettingsLoader.js
(function() {
    // Keys matched to coreConstants.js
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const X_MODULE_ENABLED_KEY = 'isXModuleEnabled';
    const X_ALWAYS_MUTE_KEY = 'isXAlwaysMuteEnabled';
    const X_MODULE_VISIBLE_KEY = 'isXModuleVisible';
    const X_VOLUME_LEVEL_KEY = 'xVolumeLevel';

    function postSettings() {
        chrome.storage.local.get([
            GLOBAL_MASTER_SWITCH_ENABLED_KEY, 
            X_MODULE_ENABLED_KEY, 
            X_ALWAYS_MUTE_KEY,
            X_MODULE_VISIBLE_KEY,
            X_VOLUME_LEVEL_KEY
        ], (result) => {
            const isGlobalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const isXEnabled = result[X_MODULE_ENABLED_KEY] !== false;
            const isAlwaysMute = result[X_ALWAYS_MUTE_KEY] !== false;
            const volumeLevel = result[X_VOLUME_LEVEL_KEY] !== undefined ? result[X_VOLUME_LEVEL_KEY] : 1.0;

            const isXVisible = result[X_MODULE_VISIBLE_KEY] !== false;

            // Effectively enabled if Global is ON logic + X Specific ON logic + X Visible
            const effectiveEnabled = isGlobalOn && isXEnabled && isXVisible;

            window.postMessage({
                type: 'X_SETTINGS_UPDATE',
                payload: {
                    isEnabled: effectiveEnabled,
                    alwaysMute: isAlwaysMute,
                    volumeLevel: volumeLevel
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
                changes[X_MODULE_VISIBLE_KEY] ||
                changes[X_VOLUME_LEVEL_KEY]) {
                postSettings();
            }
        }
    });

    // Listen for Messages from Main World
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        if (event.data && event.data.type === 'X_SAVE_VOLUME') {
            const newVolume = event.data.payload;
            if (typeof newVolume === 'number' && newVolume >= 0 && newVolume <= 1) {
                chrome.storage.local.get([X_VOLUME_LEVEL_KEY], (res) => {
                    if (res[X_VOLUME_LEVEL_KEY] !== newVolume) {
                        try {
                            chrome.storage.local.set({ [X_VOLUME_LEVEL_KEY]: newVolume });
                        } catch (error) {
                            // Ignore "Context invalidated" errors which happen if the extension
                            // was reloaded while this page is still open.
                            if (!error.message.includes("Extension context invalidated")) {
                                console.error("[X Settings] Storage set error:", error);
                            }
                        }
                    }
                });
            }
        }

        if (event.data && event.data.type === 'X_DOWNLOAD_REQUEST') {
            chrome.runtime.sendMessage({
                action: 'X_START_DOWNLOAD',
                payload: event.data.payload
            });
        }

        if (event.data && event.data.type === 'X_CAPTURE_HEADERS') {
            chrome.runtime.sendMessage({
                action: 'X_CAPTURE_HEADERS',
                payload: event.data.payload
            });
        }

        if (event.data && event.data.type === 'X_BADGE_COUNT_EVENT' && event.data.payload) {
            chrome.runtime.sendMessage({
                action: 'X_SYNC_REGULAR_NOTIFICATIONS',
                payload: {
                    unreadNotificationsCount: event.data.payload.ntabUnread,
                    unreadDmCount: event.data.payload.dmUnread,
                    source: 'badge_api'
                }
            });
        }

        if (event.data && event.data.type === 'X_WEB_NOTIFICATION_EVENT' && event.data.payload) {
            chrome.runtime.sendMessage({
                action: 'X_SYNC_REGULAR_NOTIFICATIONS',
                payload: {
                    webPushNotification: event.data.payload,
                    source: 'web_push'
                }
            });
        }
    });
    
    // Listen for Messages from Background Script (Bridge to MAIN world)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Forward all messages from background to MAIN world
        window.postMessage({
            type: 'X_BACKGROUND_EVENT',
            payload: request
        }, '*');
    });

})();
