// KylesChromeExtensions/fab_extension/background_modules/fabState.js
import * as FabConstants from './fabConstants.js';

// --- FAB Specific State ---
export let fabUrlQueue = [];
export let queuedUrlSet = new Set(); // Stores URLs currently in fabUrlQueue to prevent duplicates
export let verificationQueue = []; // Stores items pending ownership verification
export let autoProcessingSuspended = false; // Flag to suspend FAB auto-processing
export let activeFabProcessingTabs = 0; // Runtime count of active FAB processing tabs

// --- FAB State Modifiers ---
export function addUrlToFabQueue(url) {
    if (typeof url === 'string' && !queuedUrlSet.has(url)) {
        fabUrlQueue.push(url);
        queuedUrlSet.add(url);
        // console.log(`FabState: URL added to FAB queue. Queue length: ${fabUrlQueue.length}`);
        return true;
    }
    // console.warn(`FabState: URL already in FAB queue or invalid: ${url}`);
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
    // console.log(`FabState: Item added to verification queue. Listing ID: ${itemDetails.listingId}`);
}

// Allows replacing the entire verification queue, e.g., after filtering
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

// --- Persistence Functions for FAB State ---
export async function saveFabState() {
    return new Promise(resolve => {
        const stateToSave = {
            [FabConstants.FAB_URL_QUEUE_KEY]: fabUrlQueue,
            [FabConstants.FAB_QUEUED_URL_SET_KEY]: Array.from(queuedUrlSet),
            [FabConstants.FAB_VERIFICATION_QUEUE_KEY]: verificationQueue,
            [FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY]: autoProcessingSuspended,
        };
        // Note: activeFabProcessingTabs is not persisted as it's a runtime value.

        chrome.storage.local.set(stateToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("FabState: Error saving FAB state:", chrome.runtime.lastError.message, stateToSave);
            } else {
                // console.log("FabState: FAB state saved.");
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
            FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY
        ], (result) => {
            if (chrome.runtime.lastError) {
                console.error("FabState: Error loading FAB state:", chrome.runtime.lastError.message);
            }

            fabUrlQueue = result[FabConstants.FAB_URL_QUEUE_KEY] || [];
            queuedUrlSet = new Set(result[FabConstants.FAB_QUEUED_URL_SET_KEY] || []);
            verificationQueue = result[FabConstants.FAB_VERIFICATION_QUEUE_KEY] || [];
            autoProcessingSuspended = result[FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY] || false;
            
            // activeFabProcessingTabs is runtime, initialize to 0
            activeFabProcessingTabs = 0;

            console.log("FabState: FAB state loaded.", {
                fabUrlQueueSize: fabUrlQueue.length,
                queuedUrlSetSize: queuedUrlSet.size,
                verificationQueueSize: verificationQueue.length,
                autoProcessingSuspended
            });
            resolve();
        });
    });
}