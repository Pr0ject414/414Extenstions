// KylesChromeExtensions/background.js
import { moduleManager } from './shared_modules/moduleManager.js';
import * as AppState from './shared_modules/appState.js';
import * as LanguageManager from './shared_modules/languageManager.js';

import * as FabBackground from './fab_extension/fabBackground.js';
import * as YouTubeBackground from './youtube_extension/youtubeBackground.js';
import { VolumeBackground } from './volume_controller/volumeBackground.js';

// --- Module Registration ---
moduleManager.register(FabBackground, {
    actions: [
        "getFabGlobalStats", "openTabInBackground", "closeFabTab", "item_add_rate_limited",
        "setFabQueueProcessingEnabled", "queueItemWithGracePeriod", "queueFabItemOnly",
        "getFabRateLimitStatus"
    ]
});
moduleManager.register(YouTubeBackground, {
    actions: [
        "getYouTubeGlobalStats",
        "setYouTubeNoSuggestionsEnabled",
        "getYouTubeModuleStatus"
    ]
});
moduleManager.register(VolumeBackground, {
    actions: [
        "getStoredVolume", "updateVolume", "getCurrentVolumeForPopup"
    ]
});

// --- Global Event Listeners & Functions ---
let lastBroadcastedRateLimitState = null;

function broadcastStateChanges() {
    const effectivelyPaused = !AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || AppState.isRateLimited();
    if (lastBroadcastedRateLimitState === effectivelyPaused) return;
    
    lastBroadcastedRateLimitState = effectivelyPaused;
    console.log(`Coordinator: Broadcasting FAB content script status. Paused: ${effectivelyPaused}`);
    chrome.tabs.query({ url: "*://*.fab.com/*" }, (tabs) => {
        tabs.forEach(tab => {
            if (tab.id) chrome.tabs.sendMessage(tab.id, { action: "fab_content_scripts_status", rateLimited: effectivelyPaused }).catch(() => {});
        });
    });
    if (typeof FabBackground.onGlobalStateChange === 'function') FabBackground.onGlobalStateChange();
}

// --- Event Handlers ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "setGlobalMasterSwitch":
            AppState.setGlobalMasterSwitchEnabled(request.enabled);
            AppState.saveGlobalState().then(broadcastStateChanges);
            sendResponse({ success: true });
            return true;
        case "setFabModuleEnabled":
             AppState.setFabModuleEnabled(request.enabled);
             AppState.saveGlobalState().then(broadcastStateChanges);
             sendResponse({ success: true });
             return true;
        case "setYouTubeModuleEnabled":
             AppState.setYouTubeModuleEnabled(request.enabled);
             AppState.saveGlobalState();
             sendResponse({ success: true });
             return true;
        case "settingsUpdated":
            (async () => {
                await AppState.loadGlobalState();
                await moduleManager.initializeAll();
                broadcastStateChanges();
            })();
            sendResponse({ success: true });
            return true;
    }
    return moduleManager.routeMessage(request, sender, sendResponse);
});

chrome.runtime.onStartup.addListener(async () => {
    await AppState.loadGlobalState();
    await moduleManager.handleOnStartup();
    broadcastStateChanges();
});

chrome.runtime.onInstalled.addListener(async (details) => {
    await AppState.loadGlobalState();
    await moduleManager.handleOnInstalled(details);
    lastBroadcastedRateLimitState = null;
    broadcastStateChanges();
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
        FabBackground.handleTabRemoved(tabId);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!AppState.globalMasterSwitchEnabled) return;
    const wasLimited = AppState.isRateLimited();
    if (alarm.name.startsWith("fab") && AppState.fabModuleEnabled) await FabBackground.handleAlarm(alarm);
    if (wasLimited !== AppState.isRateLimited()) broadcastStateChanges();
});

// --- Initial Load ---
(async () => {
    await AppState.loadGlobalState();
    await moduleManager.initializeAll();
    lastBroadcastedRateLimitState = null;
    broadcastStateChanges();
    console.log("Background Coordinator: Initial load complete.");
})();