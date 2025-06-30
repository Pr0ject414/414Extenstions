// KylesChromeExtensions/background.js
import { moduleManager } from './shared_modules/moduleManager.js';
import * as AppState from './shared_modules/appState.js';
import * as LanguageManager from './shared_modules/languageManager.js';

import * as FabBackground from './fab_extension/fabBackground.js';
import * as YouTubeBackground from './youtube_extension/youtubeBackground.js';

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Inject scripts when a FAB page has finished loading
    if (changeInfo.status === 'complete' && tab.url) {
        try {
            const url = new URL(tab.url);
            // Ensure we are on the correct website before injecting
            if (url.hostname === 'www.fab.com' || url.hostname === 'fab.com') {
                // Product Page Injection
                if (url.pathname.includes("/listings/")) {
                    console.log(`Coordinator: Injecting scripts into FAB Product Page: ${tabId}`);
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: [
                            'fab_extension/content_scripts/modules/productPageDomScraper.js',
                            'fab_extension/content_scripts/modules/contentApi.js',
                            'fab_extension/content_scripts/fabProductPage.js'
                        ]
                    }).catch(err => console.error("Failed to inject product page scripts:", err));
                } 
                // Browse Page Injection (any other FAB page)
                else {
                    console.log(`Coordinator: Injecting scripts into FAB Browse Page: ${tabId}`);
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: [
                            'fab_extension/content_scripts/modules/browsePageHider.js',
                            'fab_extension/content_scripts/modules/browsePageAutoOpener.js',
                            'fab_extension/content_scripts/fabBrowsePage.js'
                        ]
                    }).catch(err => console.error("Failed to inject browse page scripts:", err));
                }
            }
        } catch (e) {
            // Catches errors from creating a new URL object if tab.url is invalid
            console.error(`Could not parse URL for script injection: ${tab.url}`, e);
        }
    }
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