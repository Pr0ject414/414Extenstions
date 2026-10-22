// KylesChromeExtensions/background.js
import { moduleManager } from './shared_modules/moduleManager.js';
import * as AppState from './shared_modules/appState.js';

import * as FabBackground from './fab_extension/fabBackground.js';
import * as YouTubeBackground from './youtube_extension/youtubeBackground.js';
import * as XBackground from './x_extension/xBackground.js';
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
moduleManager.register(XBackground, {
    actions: [
        "X_START_DOWNLOAD",
        "X_CAPTURE_HEADERS",
        "X_FETCH_USER_INFO",
        "X_GET_LOCATION_STATS",
        "X_CLEAR_LOCATION_CACHE",
        "X_FRIENDS_GET_STATE",
        "X_FRIENDS_SET_IDENTITY",
        "X_FRIENDS_ADD",
        "X_FRIENDS_ACCEPT",
        "X_FRIENDS_REMOVE",
        "X_FRIENDS_FORCE_SYNC",
        "X_MARK_TWEETS_SEEN",
        "X_CHECK_TWEETS_SEEN",
        "X_FORCE_TWEET_TO_FRIENDS",
        "X_UNFORCE_TWEET",
        "X_DISMISS_FORCED_TWEET",
        "X_GET_FRIENDS_TIMELINE",
        "X_HYDRATE_TWEETS"
    ]
});

// --- Global Event Listeners & Functions ---
let lastBroadcastedRateLimitState = null;

function broadcastStateChanges() {
    const effectivelyPaused = !AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || !AppState.fabModuleVisible || AppState.isRateLimited();
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
        case "setXModuleEnabled":
            AppState.setXModuleEnabled(request.enabled);
            AppState.saveGlobalState();
            sendResponse({ success: true });
            return true;
        case "setCrunchyrollModuleEnabled":
            AppState.setCrunchyrollModuleEnabled(request.enabled);
            AppState.saveGlobalState();
            sendResponse({ success: true });
            return true;
        case "setVolumeModuleEnabled":
            AppState.setVolumeModuleEnabled(request.enabled);
            AppState.saveGlobalState();
            sendResponse({ success: true });
            return true;
        case "setVscModuleEnabled":
            AppState.setVscModuleEnabled(request.enabled);
            AppState.saveGlobalState();
            sendResponse({ success: true });
            return true;
        case "getGlobalAppState":
            sendResponse({
                globalMasterSwitchEnabled: AppState.globalMasterSwitchEnabled,
                fabModuleEnabled: AppState.fabModuleEnabled,
                youTubeModuleEnabled: AppState.youTubeModuleEnabled,
                xModuleEnabled: AppState.xModuleEnabled,
                crunchyrollModuleEnabled: AppState.crunchyrollModuleEnabled,
                volumeModuleEnabled: AppState.volumeModuleEnabled,
                vscModuleEnabled: AppState.vscModuleEnabled,
                fabModuleVisible: AppState.fabModuleVisible,
                youTubeModuleVisible: AppState.youTubeModuleVisible,
                xModuleVisible: AppState.xModuleVisible,
                crunchyrollModuleVisible: AppState.crunchyrollModuleVisible,
                volumeModuleVisible: AppState.volumeModuleVisible,
                vscModuleVisible: AppState.vscModuleVisible,
            });
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
    if (alarm.name.startsWith("x_") && AppState.xModuleEnabled && typeof XBackground.handleAlarm === 'function') {
        await XBackground.handleAlarm(alarm);
    }
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