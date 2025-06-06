// KylesChromeExtensions/background.js
import { moduleManager } from './shared_modules/moduleManager.js';
import * as AppState from './shared_modules/appState.js';
import * as LanguageManager from './shared_modules/languageManager.js';

// Import Module Handlers
import * as FabBackground from './fab_extension/fabBackground.js';
import * as YouTubeBackground from './youtube_extension/youtubeBackground.js';

// --- Module Registration ---

moduleManager.register(FabBackground, {
    actions: [
        "getFabGlobalStats", "openTabInBackground", "closeFabTab", "item_add_rate_limited",
        "setFabQueueProcessingEnabled", "queueFabItemOnly"
    ]
});

moduleManager.register(YouTubeBackground, {
    actions: ["getYouTubeGlobalStats", "setYouTubeNoSuggestionsEnabled"]
});


// --- Global Event Listeners ---

let lastBroadcastedRateLimitState = null;

function broadcastFabContentScriptStatus() {
    const effectivelyPaused = !AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || AppState.isRateLimited();

    if (lastBroadcastedRateLimitState === effectivelyPaused && lastBroadcastedRateLimitState !== null) {
        return;
    }
    lastBroadcastedRateLimitState = effectivelyPaused;

    console.log(`Background Coordinator: Broadcasting FAB content script status. EffectivelyPaused: ${effectivelyPaused}`);
    chrome.tabs.query({ url: "*://*.fab.com/*" }, (tabs) => {
        tabs.forEach(tab => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "fab_content_scripts_status",
                    rateLimited: effectivelyPaused
                }).catch(error => { /* Suppress errors from closed tabs */ });
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // --- Global Actions ---
    if (request.action === "setGlobalMasterSwitch") {
        AppState.setGlobalMasterSwitchEnabled(request.enabled);
        AppState.saveGlobalState();
        broadcastFabContentScriptStatus(); // FAB is affected by global switch
        sendResponse({ success: true });
        return true;
    }
    if (request.action === 'getLanguages') {
        sendResponse({ languages: LanguageManager.getLanguagesArray() });
        return true;
    }
     if (request.action === "getFabRateLimitStatus") {
        sendResponse({ rateLimited: AppState.isRateLimited() });
        return true;
    }
    if (request.action === "settingsUpdated") {
        (async () => {
            await AppState.loadGlobalState();
            await moduleManager.initializeAll(); // Re-initialize all modules to pick up changes
            console.log("Background Coordinator: All states reloaded after settings update.");
        })();
        sendResponse({ success: true });
        return true;
    }
    
    // --- Delegated Actions ---
    // Let the module manager route the message to the correct module
    const handled = moduleManager.routeMessage(request, sender, sendResponse);
    if (request.action === 'setFabModuleEnabled') {
        broadcastFabContentScriptStatus(); // Also broadcast on FAB module state change
    }
    // Return true if the message is being handled asynchronously, otherwise false.
    return handled;
});

chrome.runtime.onStartup.addListener(async () => {
    console.log("Background Coordinator: Extension startup.");
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages();
    await moduleManager.handleOnStartup();
    broadcastFabContentScriptStatus();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("Background Coordinator: Extension installed/updated:", details.reason);
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages();
    await moduleManager.handleOnInstalled(details);
    lastBroadcastedRateLimitState = null;
    broadcastFabContentScriptStatus();
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // This is FAB-specific, so we can call it directly for now.
    // If other modules need it, this could be integrated into the module manager.
    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        FabBackground.handleTabRemoved(tabId, removeInfo);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!AppState.globalMasterSwitchEnabled) return;

    const wasRateLimitedBeforeAlarm = AppState.isRateLimited();

    if (alarm.name.startsWith("fab")) {
        if (AppState.fabModuleEnabled) {
            await FabBackground.handleAlarm(alarm);
        }
    }
    // Add other module alarm handling here, e.g., if (alarm.name.startsWith("youtube"))

    // Check if rate limit status changed and broadcast if needed
    if (wasRateLimitedBeforeAlarm !== AppState.isRateLimited()) {
         console.log("Background Coordinator: Rate limit status changed during alarm processing. Broadcasting.");
         broadcastFabContentScriptStatus();
    }
});

// This listener is highly specific to FAB, so it can remain here.
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.statusCode === 429) {
             if (AppState.globalMasterSwitchEnabled) {
                if (AppState.setRateLimitCoolDown(Date.now() + AppState.globalMaxDelayMs)) {
                    AppState.saveGlobalState();
                    if (AppState.fabModuleEnabled) {
                         broadcastFabContentScriptStatus();
                    }
                }
            }
        }
    },
    { urls: ["*://*.fab.com/*"], types: ["main_frame", "xmlhttprequest"] },
    ["responseHeaders"]
);


// --- Initial Load ---
(async () => {
    console.log("Background Coordinator: Script evaluating. Loading initial state...");
    await AppState.loadGlobalState();
    LanguageManager.loadLanguages();
    await moduleManager.initializeAll(); // Initialize all registered modules
    lastBroadcastedRateLimitState = null;
    broadcastFabContentScriptStatus();
    console.log("Background Coordinator: Initial global state and modules loaded.");
})();