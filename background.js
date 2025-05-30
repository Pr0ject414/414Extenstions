// KylesChromeExtensions/background.js
import * as CoreConstants from './shared_modules/coreConstants.js';
import * as AppState from './shared_modules/appState.js';
import * as LanguageManager from './shared_modules/languageManager.js';
// FetchUtils might be imported if used directly by the coordinator, otherwise, it's used by other modules.

// Import feature-specific background handlers & their constants if needed for routing/setup
import * as FabBackground from './fab_extension/fabBackground.js';
import * as FabConstants from './fab_extension/background_modules/fabConstants.js'; // For alarm name checks, etc.

let lastBroadcastedRateLimitState = null; // Initialize with null to force first broadcast

// --- Utility to broadcast FAB content script status ---
// This remains global as it depends on global AppState (master switch, fab module switch, rate limit)
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
                    rateLimited: effectivelyPaused // Content script uses 'rateLimited' key for this status
                }).catch(error => {
                    // Optional: console.log(`Error sending message to tab ${tab.id}: ${error.message}`)
                });
            }
        });
    });
}


// --- Message Listener (Router) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Global actions handled by the coordinator
    if (request.action === "setGlobalMasterSwitch") {
        if (typeof request.enabled === 'boolean') {
            AppState.setGlobalMasterSwitchEnabled(request.enabled);
            AppState.saveGlobalState();
            console.log(`Background Coordinator: Global Master switch set to ${request.enabled}.`);
            broadcastFabContentScriptStatus(); // Update content scripts based on new global state
            sendResponse({ success: true, globalMasterSwitchEnabled: AppState.globalMasterSwitchEnabled });
        } else {
            sendResponse({ success: false, error: "Invalid 'enabled' value for GlobalMasterSwitch." });
        }
        return true; // Indicate async response or if further processing might occur
    }

    if (request.action === "setFabModuleEnabled") {
        if (typeof request.enabled === 'boolean') {
            AppState.setFabModuleEnabled(request.enabled);
            AppState.saveGlobalState();
            console.log(`Background Coordinator: FAB Module Enabled set to ${request.enabled}.`);
            broadcastFabContentScriptStatus(); // Update content scripts based on new module state
            sendResponse({ success: true, fabModuleEnabled: AppState.fabModuleEnabled });
        } else {
            sendResponse({ success: false, error: "Invalid 'enabled' value for FabModuleEnabled." });
        }
        return true;
    }

    if (request.action === 'getLanguages') {
        sendResponse({ languages: LanguageManager.getLanguagesArray() });
        return false; // Synchronous response
    }

    if (request.action === "getFabRateLimitStatus") { // Content scripts query this on startup
        sendResponse({ rateLimited: AppState.isRateLimited() });
        // Also inform based on module enabled status for initial content script setup
        // broadcastFabContentScriptStatus(); // Let content script decide based on the message it receives
        return false; // Synchronous response
    }

    // Route FAB-specific actions to FabBackground handler
    // A more robust routing might use a prefix or a dedicated 'module' field in the request
    const fabActions = [
        "getFabGlobalStats", "openTabInBackground", "closeFabTab", "item_add_rate_limited"
        // Add other FAB-specific action names here
    ];

    if (fabActions.includes(request.action) || (request.action && request.action.toLowerCase().includes('fab'))) { // Example heuristic
        return FabBackground.handleMessage(request, sender, sendResponse);
    }

    console.warn(`Background Coordinator: Unhandled message action: ${request.action}`);
    // sendResponse({ success: false, error: "Unknown action" }); // Optional: default response
    return false; // Or true if you want to keep the channel open by default
});

// --- Lifecycle Event Listeners ---
chrome.runtime.onStartup.addListener(async () => {
    console.log("Background Coordinator: Extension startup.");
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages(); // Assuming this is synchronous or handles its own async
    await FabBackground.onStartup(); // Delegate to FAB handler
    broadcastFabContentScriptStatus(); // Initial status broadcast
});

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("Background Coordinator: Extension installed/updated:", details.reason);
    await AppState.loadGlobalState(); // Load existing global state first
    LanguageManager.loadLanguages();

    // Initialize default global settings if not present
    const defaultGlobalSettings = {
        [CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY]: AppState.globalMasterSwitchEnabled, // Use loaded or default from AppState
        [CoreConstants.FAB_MODULE_ENABLED_KEY]: AppState.fabModuleEnabled, // Use loaded or default from AppState
    };
    let updateGlobalStateInStorage = false;
    if (AppState.globalMasterSwitchEnabled === undefined) { // Check if AppState had to use its hardcoded default
        defaultGlobalSettings[CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY] = true; // Explicit default
        AppState.setGlobalMasterSwitchEnabled(true);
        updateGlobalStateInStorage = true;
    }
    if (AppState.fabModuleEnabled === undefined) {
        defaultGlobalSettings[CoreConstants.FAB_MODULE_ENABLED_KEY] = true; // Explicit default
        AppState.setFabModuleEnabled(true);
        updateGlobalStateInStorage = true;
    }
    if (updateGlobalStateInStorage) {
        await AppState.saveGlobalState();
    }
    
    // Handle default settings for FAB module (these are simple storage flags, not part of fabState.js persisted objects)
    // These are typically toggled by the popup and read by content scripts.
    const fabDefaultUiSettingsKeys = {
        [FabConstants.FAB_FILTER_ENABLED_KEY]: false,
        [FabConstants.FAB_AUTO_OPEN_FREE_ENABLED_KEY]: false,
        [FabConstants.FAB_AUTO_ADD_ENABLED_KEY]: false,
    };
    chrome.storage.local.get(Object.keys(fabDefaultUiSettingsKeys), (result) => {
        let newFabUiSettingsToStore = {};
        for (const key in fabDefaultUiSettingsKeys) {
            if (result[key] === undefined) {
                newFabUiSettingsToStore[key] = fabDefaultUiSettingsKeys[key];
            }
        }
        if (Object.keys(newFabUiSettingsToStore).length > 0) {
            chrome.storage.local.set(newFabUiSettingsToStore, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Background Coordinator (onInstalled): Error setting default FAB UI settings:", chrome.runtime.lastError.message);
                } else {
                    console.log("Background Coordinator (onInstalled): Default FAB UI settings initialized.", newFabUiSettingsToStore);
                }
            });
        }
    });

    await FabBackground.onInstalled(details); // Delegate to FAB handler for its specific setup

    lastBroadcastedRateLimitState = null; // Reset to ensure broadcast
    broadcastFabContentScriptStatus();
});


// --- Tab Event Listeners ---
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // This is FAB-specific, delegate to FabBackground
    // It needs to know if global switches allow it to act
    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        FabBackground.handleTabRemoved(tabId, removeInfo);
    }
});

// --- Alarm Event Listeners ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log("Background Coordinator: Alarm triggered - ", alarm.name);

    if (!AppState.globalMasterSwitchEnabled) {
        console.log(`Background Coordinator: Global Master switch OFF. Skipping alarm: ${alarm.name}`);
        return;
    }

    const wasRateLimitedBeforeAlarm = AppState.isRateLimited();

    // Route FAB-specific alarms
    // Assuming FabConstants are available or alarm names are prefixed like "fab_"
    if (alarm.name.startsWith("fab")) { // Example routing
        if (!AppState.fabModuleEnabled) {
            console.log(`Background Coordinator: FAB Module switch OFF. Skipping FAB alarm: ${alarm.name}`);
            return;
        }
        await FabBackground.handleAlarm(alarm);
    }
    // Add routes for other module alarms here if any (e.g., else if (alarm.name.startsWith("youtube_")))

    // After alarm processing, check if rate limit status might have changed
    if (wasRateLimitedBeforeAlarm && !AppState.isRateLimited() && AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        console.log("Background Coordinator: Rate limit lifted after alarm. Broadcasting RESUME to FAB content scripts.");
        broadcastFabContentScriptStatus(); // Will broadcast false (resume)
    } else if (!wasRateLimitedBeforeAlarm && AppState.isRateLimited() && AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        console.log("Background Coordinator: Rate limit started during alarm. Broadcasting PAUSE to FAB content scripts.");
        broadcastFabContentScriptStatus(); // Will broadcast true (pause)
    }
});

// --- WebRequest Listener for 429 on Main Frame & XHR ---
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if ((details.type === "main_frame" || details.type === "xmlhttprequest") && details.statusCode === 429) {
            let coolDownSuccessfullySet = false;
            if (AppState.globalMasterSwitchEnabled) { // Global rate limit detection active if master switch is on
                const newCoolDownTarget = Date.now() + CoreConstants.MAX_DELAY_MS;
                if (AppState.setRateLimitCoolDown(newCoolDownTarget)) {
                    console.log(`Background Coordinator: Detected 429 on ${details.type} request to ${details.url}. Global cool-down state updated.`);
                    AppState.saveGlobalState();
                    coolDownSuccessfullySet = true;

                    // Clear FAB alarms if they would fire too soon
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
                broadcastFabContentScriptStatus(); // Will broadcast true (pause)
            }
        }
    },
    { urls: ["*://*.fab.com/*"], types: ["main_frame", "xmlhttprequest"] },
    ["responseHeaders"]
);

// --- Initial Load Logic ---
(async () => {
    console.log("Background Coordinator: Script evaluating. Loading initial state...");
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages(); // Assuming synchronous or self-managing async

    await FabBackground.init(); // Initialize FAB module

    lastBroadcastedRateLimitState = null; // Force initial broadcast
    broadcastFabContentScriptStatus(); // Broadcast initial effective status

    console.log("Background Coordinator: Initial global state and modules loaded.");
})();

console.log("Background Coordinator: Script loaded and event listeners attached.");