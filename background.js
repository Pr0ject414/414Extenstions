// KylesChromeExtensions/background.js
import * as CoreConstants from './shared_modules/coreConstants.js';
import * as AppState from './shared_modules/appState.js';
import * as LanguageManager from './shared_modules/languageManager.js';

import * as FabBackground from './fab_extension/fabBackground.js';
import * as FabConstants from './fab_extension/background_modules/fabConstants.js';
import * as FabState from './fab_extension/background_modules/fabState.js';

let lastBroadcastedRateLimitState = null;

function broadcastFabContentScriptStatus() {
    const effectivelyPaused = !AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || AppState.isRateLimited();

    if (lastBroadcastedRateLimitState === effectivelyPaused && lastBroadcastedRateLimitState !== null) {
        return;
    }
    lastBroadcastedRateLimitState = effectivelyPaused;

    console.log(`Background Coordinator: Broadcasting FAB content script status. EffectivelyPaused: ${effectivelyPaused}`);
    chrome.tabs.query({ url: "*://*.fab.com/*" }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.warn("Background Coordinator: Error querying tabs for broadcast:", chrome.runtime.lastError.message);
            return;
        }
        tabs.forEach(tab => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "fab_content_scripts_status",
                    rateLimited: effectivelyPaused
                }).catch(error => {
                    // console.log(`Error sending message to tab ${tab.id}: ${error.message}`)
                });
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setGlobalMasterSwitch") {
        if (typeof request.enabled === 'boolean') {
            AppState.setGlobalMasterSwitchEnabled(request.enabled);
            AppState.saveGlobalState();
            console.log(`Background Coordinator: Global Master switch set to ${request.enabled}.`);
            broadcastFabContentScriptStatus();
            sendResponse({ success: true, globalMasterSwitchEnabled: AppState.globalMasterSwitchEnabled });
        } else {
            sendResponse({ success: false, error: "Invalid 'enabled' value for GlobalMasterSwitch." });
        }
        return true;
    }

    if (request.action === "setFabModuleEnabled") {
        if (typeof request.enabled === 'boolean') {
            AppState.setFabModuleEnabled(request.enabled);
            AppState.saveGlobalState();
            console.log(`Background Coordinator: FAB Module Enabled set to ${request.enabled}.`);
            broadcastFabContentScriptStatus();
            sendResponse({ success: true, fabModuleEnabled: AppState.fabModuleEnabled });
        } else {
            sendResponse({ success: false, error: "Invalid 'enabled' value for FabModuleEnabled." });
        }
        return true;
    }

    if (request.action === 'getLanguages') {
        sendResponse({ languages: LanguageManager.getLanguagesArray() });
        return false;
    }

    if (request.action === "getFabRateLimitStatus") {
        sendResponse({ rateLimited: AppState.isRateLimited() });
        return false;
    }
    
    if (request.action === "settingsUpdated") {
        console.log(`Background Coordinator: Settings of type '${request.type}' updated from options page. Reloading relevant states.`);
        (async () => {
            await AppState.loadGlobalState(); // Always reload global state
            if (request.type === "fab" || request.type === "global") { // FAB settings might depend on global, or be FAB specific
                await FabState.loadFabState(); // Reload FAB specific settings
                // If fabBrowsePage settings changed, content scripts will pick them up via storage.onChanged
            }
            // Potentially re-initialize or notify modules if needed after settings load
            // For now, assuming modules pick up changes from their state objects or storage listeners
            console.log("Background Coordinator: Relevant states reloaded after settings update.");
        })();
        sendResponse({ success: true, message: "States are being reloaded." });
        return true; // Indicate async potential if further actions were taken
    }

    const fabActions = [
        "getFabGlobalStats", "openTabInBackground", "closeFabTab", "item_add_rate_limited",
        "setFabQueueProcessingEnabled", "queueFabItemOnly"
    ];

    if (fabActions.includes(request.action)) {
        return FabBackground.handleMessage(request, sender, sendResponse);
    }

    console.warn(`Background Coordinator: Unhandled message action: ${request.action}`);
    return false;
});

chrome.runtime.onStartup.addListener(async () => {
    console.log("Background Coordinator: Extension startup.");
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages();
    await FabBackground.onStartup();
    broadcastFabContentScriptStatus();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("Background Coordinator: Extension installed/updated:", details.reason);
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages();

    const fabDefaultUiSettingsKeys = {
        [FabConstants.FAB_FILTER_ENABLED_KEY]: false,
        [FabConstants.FAB_AUTO_OPEN_FREE_ENABLED_KEY]: false,
        [FabConstants.FAB_AUTO_ADD_ENABLED_KEY]: false,
        [FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY]: false,
    };
    chrome.storage.local.get(Object.keys(fabDefaultUiSettingsKeys), (result) => {
        let newFabUiSettingsToStore = {};
        for (const key in fabDefaultUiSettingsKeys) {
            if (result[key] === undefined) {
                newFabUiSettingsToStore[key] = fabDefaultUiSettingsKeys[key];
            }
        }
        if (Object.keys(newFabUiSettingsToStore).length > 0) {
            chrome.storage.local.set(newFabUiSettingsToStore);
        }
    });

    const defaultGlobalConfigurableSettings = {
        [CoreConstants.GLOBAL_MAX_RETRIES_KEY]: 5,
        [CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY]: 30000,
        [CoreConstants.GLOBAL_MAX_DELAY_MS_KEY]: 300000
    };
    chrome.storage.local.get(Object.keys(defaultGlobalConfigurableSettings), (result) => {
        let newGlobalConfigSettingsToStore = {};
        for (const key in defaultGlobalConfigurableSettings) {
            if (result[key] === undefined) {
                newGlobalConfigSettingsToStore[key] = defaultGlobalConfigurableSettings[key];
            }
        }
        if (Object.keys(newGlobalConfigSettingsToStore).length > 0) {
            chrome.storage.local.set(newGlobalConfigSettingsToStore);
        }
    });

    const defaultFabConfigurableSettings = {
        [FabConstants.FAB_MAX_CONCURRENT_TABS_KEY]: 2,
        [FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY]: 5000,
        [FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY]: 2000,
        // Add new defaults
        [FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY]: 5000,
        [FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY]: 4
    };
    chrome.storage.local.get(Object.keys(defaultFabConfigurableSettings), (result) => {
        let newFabConfigSettingsToStore = {};
        for (const key in defaultFabConfigurableSettings) {
            if (result[key] === undefined) {
                newFabConfigSettingsToStore[key] = defaultFabConfigurableSettings[key];
            }
        }
        if (Object.keys(newFabConfigSettingsToStore).length > 0) {
            chrome.storage.local.set(newFabConfigSettingsToStore);
        }
    });

    await FabBackground.onInstalled(details);

    lastBroadcastedRateLimitState = null;
    broadcastFabContentScriptStatus();
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        FabBackground.handleTabRemoved(tabId, removeInfo);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("Background Coordinator: Alarm triggered - ", alarm.name);

    if (!AppState.globalMasterSwitchEnabled) {
        console.log(`Background Coordinator: Global Master switch OFF. Skipping alarm: ${alarm.name}`);
        return;
    }

    const wasRateLimitedBeforeAlarm = AppState.isRateLimited();

    if (alarm.name.startsWith("fab")) {
        if (!AppState.fabModuleEnabled) {
            console.log(`Background Coordinator: FAB Module switch OFF. Skipping FAB alarm: ${alarm.name}`);
            return;
        }
        await FabBackground.handleAlarm(alarm);
    }

    if (wasRateLimitedBeforeAlarm && !AppState.isRateLimited() && AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        console.log("Background Coordinator: Rate limit lifted after alarm. Broadcasting RESUME to FAB content scripts.");
        broadcastFabContentScriptStatus();
    } else if (!wasRateLimitedBeforeAlarm && AppState.isRateLimited() && AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        console.log("Background Coordinator: Rate limit started during alarm. Broadcasting PAUSE to FAB content scripts.");
        broadcastFabContentScriptStatus();
    }
});

chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if ((details.type === "main_frame" || details.type === "xmlhttprequest") && details.statusCode === 429) {
            let coolDownSuccessfullySet = false;
            if (AppState.globalMasterSwitchEnabled) {
                const newCoolDownTarget = Date.now() + AppState.globalMaxDelayMs;
                if (AppState.setRateLimitCoolDown(newCoolDownTarget)) {
                    console.log(`Background Coordinator: Detected 429 on ${details.type} request to ${details.url}. Global cool-down state updated.`);
                    AppState.saveGlobalState();
                    coolDownSuccessfullySet = true;

                    const verificationResumeAlarmName = FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX;
                    chrome.alarms.get(FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME, (alarm) => {
                        if (alarm && alarm.scheduledTime < newCoolDownTarget) {
                            chrome.alarms.clear(FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME);
                        }
                    });
                    chrome.alarms.get(verificationResumeAlarmName, (alarm) => {
                        if (alarm && alarm.scheduledTime < newCoolDownTarget) {
                            chrome.alarms.clear(verificationResumeAlarmName);
                        }
                    });
                }
            }

            if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && coolDownSuccessfullySet) {
                console.log(`Background Coordinator: FAB module is ON and rate limit activated/extended. Broadcasting PAUSE.`);
                broadcastFabContentScriptStatus();
            }
        }
    },
    { urls: ["*://*.fab.com/*"], types: ["main_frame", "xmlhttprequest"] },
    ["responseHeaders"]
);

(async () => {
    console.log("Background Coordinator: Script evaluating. Loading initial state...");
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages();
    await FabBackground.init();
    lastBroadcastedRateLimitState = null;
    broadcastFabContentScriptStatus();
    console.log("Background Coordinator: Initial global state and modules loaded.");
})();

console.log("Background Coordinator: Script loaded and event listeners attached.");