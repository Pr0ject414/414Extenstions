// KylesChromeExtensions/fab_extension/background_modules/fabState.js
import * as FabConstants from './fabConstants.js';
import { loadStateFromStorage, saveStateToStorage } from '../../../shared_modules/storageUtils.js';

// --- FAB Specific State ---
export let fabUrlQueue = [];
export let queuedUrlSet = new Set();
export let verificationQueue = [];
export let autoProcessingSuspended = false;
export let activeFabProcessingTabs = 0;
export let fabQueueProcessingEnabled = false;
export let fabMaxConcurrentTabs = 2;
export let fabDelayBetweenVerificationChecksMs = 5000;
export let fabDelayBetweenTabOpenMs = 2000;
export let fabBrowsePageScanIntervalMs = 5000;
export let fabFreeItemGraceCycles = 4;

// Object defining the state keys and their default values for storage.
const FAB_STATE_DEFAULTS = {
    [FabConstants.FAB_URL_QUEUE_KEY]: [],
    [FabConstants.FAB_QUEUED_URL_SET_KEY]: [], // Set is not directly storable, will be handled in load/save
    [FabConstants.FAB_VERIFICATION_QUEUE_KEY]: [],
    [FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY]: false,
    [FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY]: false,
    [FabConstants.FAB_MAX_CONCURRENT_TABS_KEY]: 2,
    [FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY]: 5000,
    [FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY]: 2000,
    [FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY]: 5000,
    [FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY]: 4,
};


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

export function getFabUrlQueueSize() { return fabUrlQueue.length; }
export function isUrlInFabQueue(url) { return queuedUrlSet.has(url); }
export function setVerificationQueue(newQueue) { if (Array.isArray(newQueue)) verificationQueue = newQueue; }
export function incrementActiveTabs() { activeFabProcessingTabs++; }
export function decrementActiveTabs() { if (activeFabProcessingTabs > 0) activeFabProcessingTabs--; }
export function resetActiveTabs() { activeFabProcessingTabs = 0; }
export function setSuspended(value) { autoProcessingSuspended = !!value; }
export function setFabQueueProcessingEnabled(value) { fabQueueProcessingEnabled = !!value; }


// --- Persistence Functions for FAB State ---
export async function saveFabState() {
    try {
        const stateToSave = {
            [FabConstants.FAB_URL_QUEUE_KEY]: fabUrlQueue,
            [FabConstants.FAB_QUEUED_URL_SET_KEY]: Array.from(queuedUrlSet), // Convert Set to Array for storage
            [FabConstants.FAB_VERIFICATION_QUEUE_KEY]: verificationQueue,
            [FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY]: autoProcessingSuspended,
            [FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY]: fabQueueProcessingEnabled,
            [FabConstants.FAB_MAX_CONCURRENT_TABS_KEY]: fabMaxConcurrentTabs,
            [FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY]: fabDelayBetweenVerificationChecksMs,
            [FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY]: fabDelayBetweenTabOpenMs,
            [FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY]: fabBrowsePageScanIntervalMs,
            [FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY]: fabFreeItemGraceCycles,
        };
        await saveStateToStorage(stateToSave);
    } catch (error) {
        console.error("FabState: Error saving FAB state:", error);
    }
}

export async function loadFabState() {
    try {
        console.log("FabState: Attempting to load FAB state...");
        const loadedState = await loadStateFromStorage(FAB_STATE_DEFAULTS);
        
        fabUrlQueue = loadedState[FabConstants.FAB_URL_QUEUE_KEY];
        queuedUrlSet = new Set(loadedState[FabConstants.FAB_QUEUED_URL_SET_KEY]); // Convert Array back to Set
        verificationQueue = loadedState[FabConstants.FAB_VERIFICATION_QUEUE_KEY];
        autoProcessingSuspended = loadedState[FabConstants.FAB_AUTO_PROCESSING_SUSPENDED_KEY];
        fabQueueProcessingEnabled = loadedState[FabConstants.FAB_QUEUE_PROCESSING_ENABLED_KEY];
        fabMaxConcurrentTabs = loadedState[FabConstants.FAB_MAX_CONCURRENT_TABS_KEY];
        fabDelayBetweenVerificationChecksMs = loadedState[FabConstants.FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY];
        fabDelayBetweenTabOpenMs = loadedState[FabConstants.FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY];
        fabBrowsePageScanIntervalMs = loadedState[FabConstants.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY];
        fabFreeItemGraceCycles = loadedState[FabConstants.FAB_FREE_ITEM_GRACE_CYCLES_KEY];
        
        activeFabProcessingTabs = 0; // Always reset on load

        console.log("FabState: FAB state loaded.", {
            fabUrlQueueSize: fabUrlQueue.length,
            verificationQueueSize: verificationQueue.length,
            autoProcessingSuspended,
            fabQueueProcessingEnabled,
            fabMaxConcurrentTabs
        });
    } catch (error) {
        console.error("FabState: Error loading FAB state:", error);
    }
}