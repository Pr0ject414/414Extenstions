// KylesChromeExtensions/fab_extension/background_modules/fabState.js
import * as FabConstants from './fabConstants.js';

// --- FAB Specific State ---
export let fabUrlQueue = [];
export let queuedUrlSet = new Set();
export let verificationQueue = [];
export let autoProcessingSuspended = false;
export let activeFabProcessingTabs = 0;

// Configurable FAB settings (loaded from storage)
export let fabQueueProcessingEnabled = false;
export let fabMaxConcurrentTabs = 2;
export let fabDelayBetweenVerificationChecksMs = 5000;
export let fabDelayBetweenTabOpenMs = 2000;
// New configurable settings for browse page behavior
export let fabBrowsePageScanIntervalMs = 5000; // Default
export let fabFreeItemGraceCycles = 4;      // Default


// --- FAB State Modifiers ---
export function addUrlToFabQueue(url) {
    if (typeof url === 'string' && !queuedUrlSet.has(url)) {
        fabUrlQueue.push(url);
        queuedUrlSet.add(url);
        return true;
    }
    return false;
}

export function getNextUrlFromFabQueue() {
    const url = fabUrlQueue.shift();
    if (url) {
        queuedUrlSet.delete(url);
    }
    return url;
}

export function getFabUrlQueueSize() {
    return fabUrlQueue.length;
}

export function isUrlInFabQueue(url) {
    return queuedUrlSet.has(url);
}

export function addOpenedItemToVerificationQueue(itemDetails) {
    verificationQueue.push(itemDetails);
}

export function setVerificationQueue(newQueue) {
    if (Array.isArray(newQueue)) {
        verificationQueue = newQueue;
    } else {
        console.warn('FabState: Invalid value for setVerificationQueue. Expected array.');
    }
}

export function incrementActiveTabs() {
    activeFabProcessingTabs++;
}

export function decrementActiveTabs() {
    if (activeFabProcessingTabs > 0) {
        activeFabProcessingTabs--;
    }
}

export function resetActiveTabs() {
    activeFabProcessingTabs = 0;
}

export function setSuspended(value) {
    if (typeof value === 'boolean') {
        autoProcessingSuspended = value;
    } else {
        console.warn('FabState: Invalid value for setSuspended. Expected boolean.');
    }
}

export function setFabQueueProcessingEnabled(value) {
    if (typeof value === 'boolean') {
        fabQueueProcessingEnabled = value;
    } else {
        console.warn('FabState: Invalid value for setFabQueueProcessingEnabled. Expected boolean.');
    }
}

// --- Persistence Functions for FAB State ---
export async function saveFabState() {
    return new Promise(resolve => {
        const stateToSave = {
            [FabConstants.FAB_URL_QUEUE_KEY]: fabUrlQueue,
            [FabConstants.FAB_QUEUED_URL_SET_KEY]: Array.from(queuedUrlSet),
            [FabConstants.FAB_VERIFICATION_QUEUE_KEY]: verificationQueue,
            [FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY]: autoProcessingSuspended,
            [FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY]: fabQueueProcessingEnabled,
            [FabConstants.FAB_MAX_CONCURRENT_TABS_KEY]: fabMaxConcurrentTabs,
            [FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY]: fabDelayBetweenVerificationChecksMs,
            [FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY]: fabDelayBetweenTabOpenMs,
            // Save new settings
            [FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY]: fabBrowsePageScanIntervalMs,
            [FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY]: fabFreeItemGraceCycles,
        };
        chrome.storage.local.set(stateToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("FabState: Error saving FAB state:", chrome.runtime.lastError.message, stateToSave);
            }
            resolve();
        });
    });
}

export async function loadFabState() {
    console.log("FabState: Attempting to load FAB state...");
    return new Promise((resolve) => {
        chrome.storage.local.get([
            FabConstants.FAB_URL_QUEUE_KEY,
            FabConstants.FAB_QUEUED_URL_SET_KEY,
            FabConstants.FAB_VERIFICATION_QUEUE_KEY,
            FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY,
            FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY,
            FabConstants.FAB_MAX_CONCURRENT_TABS_KEY,
            FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY,
            FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY,
            // Add new keys to load
            FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY,
            FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY
        ], (result) => {
            if (chrome.runtime.lastError) {
                console.error("FabState: Error loading FAB state:", chrome.runtime.lastError.message);
            }

            fabUrlQueue = result[FabConstants.FAB_URL_QUEUE_KEY] || [];
            queuedUrlSet = new Set(result[FabConstants.FAB_QUEUED_URL_SET_KEY] || []);
            verificationQueue = result[FabConstants.FAB_VERIFICATION_QUEUE_KEY] || [];
            autoProcessingSuspended = result[FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY] || false;
            
            fabQueueProcessingEnabled = result[FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY] === undefined ? false : result[FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY];
            fabMaxConcurrentTabs = result[FabConstants.FAB_MAX_CONCURRENT_TABS_KEY] === undefined ? 2 : result[FabConstants.FAB_MAX_CONCURRENT_TABS_KEY];
            fabDelayBetweenVerificationChecksMs = result[FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY] === undefined ? 5000 : result[FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY];
            fabDelayBetweenTabOpenMs = result[FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY] === undefined ? 2000 : result[FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY];
            
            // Load new configurable FAB settings with defaults
            fabBrowsePageScanIntervalMs = result[FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY] === undefined ? 5000 : result[FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY];
            fabFreeItemGraceCycles = result[FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY] === undefined ? 4 : result[FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY];

            activeFabProcessingTabs = 0;

            console.log("FabState: FAB state loaded.", {
                fabUrlQueueSize: fabUrlQueue.length,
                queuedUrlSetSize: queuedUrlSet.size,
                verificationQueueSize: verificationQueue.length,
                autoProcessingSuspended,
                fabQueueProcessingEnabled,
                fabMaxConcurrentTabs,
                fabDelayBetweenVerificationChecksMs,
                fabDelayBetweenTabOpenMs,
                fabBrowsePageScanIntervalMs, // Log new settings
                fabFreeItemGraceCycles       // Log new settings
            });
            resolve();
        });
    });
}