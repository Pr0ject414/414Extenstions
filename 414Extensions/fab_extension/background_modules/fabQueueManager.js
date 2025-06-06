// KylesChromeExtensions/fab_extension/background_modules/fabQueueManager.js
import * as FabConstants from './fabConstants.js';
import * as FabState from './fabState.js';
import { addOpenedItemToVerificationQueue } from './fabVerification.js';

// For reading global conditions
import * as AppState from '../../../shared_modules/appState.js';

export function getListingIdFromUrl(fabUrl) {
    try {
        const urlObject = new URL(fabUrl);
        const match = urlObject.pathname.match(/\/listings\/([a-f0-9-]+)/i);
        return (match && match[1]) ? match[1] : null;
    } catch (e) {
        console.error("FabQueueManager: Error parsing URL for listing ID:", fabUrl, e);
        return null;
    }
}

export async function processFabTabQueue() {
    if (!AppState.globalMasterSwitchEnabled) {
        console.log(`FabQueueManager: Global Master switch is OFF. Queue processing paused.`);
        return;
    }
    if (!AppState.fabModuleEnabled) {
        console.log(`FabQueueManager: FAB Module switch is OFF. FAB queue processing paused. Queue length: ${FabState.getFabUrlQueueSize()}`);
        return;
    }
    // New check for queue processing being enabled
    if (!FabState.fabQueueProcessingEnabled) {
        console.log(`FabQueueManager: FAB Queue Processing is DISABLED. Queue processing paused. Queue length: ${FabState.getFabUrlQueueSize()}`);
        return;
    }

    // autoProcessingSuspended is a FAB-specific state
    if (FabState.autoProcessingSuspended) {
        console.log(`FabQueueManager: Auto-processing is suspended. Queue length: ${FabState.getFabUrlQueueSize()}`);
        return;
    }

    if (AppState.isRateLimited()) {
        console.log(`FabQueueManager: Processing paused due to global rate limit. Cool down until: ${new Date(AppState.rateLimitCoolDownUntil).toLocaleTimeString()}`);
        // Ensure the constant name matches what's in fabConstants.js
        chrome.alarms.create(FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME, { when: AppState.rateLimitCoolDownUntil + 1000 });
        return;
    }

    let stateChangedInLoop = false; // To track if any URL was actually processed from the queue
    while (FabState.activeFabProcessingTabs < FabState.fabMaxConcurrentTabs && FabState.getFabUrlQueueSize() > 0) { // Use dynamic max concurrent tabs
        if (!AppState.globalMasterSwitchEnabled) {
            console.log(`FabQueueManager: Global Master switch turned OFF mid-batch. Pausing.`);
            break;
        }
        if (!AppState.fabModuleEnabled) {
            console.log(`FabQueueManager: FAB Module switch turned OFF mid-batch. Pausing FAB queue.`);
            break;
        }
        if (!FabState.fabQueueProcessingEnabled) { // Re-check if it got disabled mid-batch
            console.log(`FabQueueManager: FAB Queue Processing turned DISABLED mid-batch. Pausing.`);
            break;
        }

        if (AppState.isRateLimited()) {
            console.log(`FabQueueManager: Processing paused mid-batch due to global rate limit.`);
            chrome.alarms.create(FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME, { when: AppState.rateLimitCoolDownUntil + 1000 });
            break;
        }
        
        // Use the new FabState function to get the next URL
        const urlToOpen = FabState.getNextUrlFromFabQueue();
        // getNextUrlFromFabQueue already implies stateChangedInLoop if urlToOpen is not null

        if (urlToOpen) {
            stateChangedInLoop = true; // A URL is being processed

            const listingId = getListingIdFromUrl(urlToOpen);

            if (!listingId) {
                console.error("FabQueueManager: Could not get listingId for URL, skipping:", urlToOpen);
                continue;
            }

            FabState.incrementActiveTabs();

            // Retry logic for creating tab
            const MAX_RETRIES = 3; // Keep this hardcoded for tab creation for now, or make configurable later.
            let retryCount = 0;

            const attemptTabCreate = (url, tabId) => {
                chrome.tabs.create({ url: url, active: false }, (newTab) => {
                    if (chrome.runtime.lastError) {
                        const errorMessage = chrome.runtime.lastError.message;
                        if (errorMessage.includes("Tabs cannot be edited right now") && retryCount < MAX_RETRIES) {
                            retryCount++;
                            console.warn(`FabQueueManager: Retrying tab creation for ${url} (Attempt ${retryCount}/${MAX_RETRIES}):`, errorMessage);
                            setTimeout(() => attemptTabCreate(url, tabId), 500); // Retry after 500ms
                        } else {
                            console.error(`FabQueueManager: Error opening new tab for ${url} after ${retryCount} retries:`, errorMessage);
                            FabState.decrementActiveTabs(); // Only decrement if giving up
                        }
                    } else if (newTab && newTab.id) {
                        console.log(`FabQueueManager: Opened ${url} in new tab ID: ${newTab.id}. Listing ID: ${listingId}. Active tabs: ${FabState.activeFabProcessingTabs}`);
                        addOpenedItemToVerificationQueue({
                            url: url,
                            listingId: listingId,
                            tabId: newTab.id,
                            status: 'opened',
                            openTime: Date.now()
                        });
                    } else {
                        console.error(`FabQueueManager: Tab creation failed for ${url} (newTab or newTab.id is undefined) and no chrome.runtime.lastError reported.`);
                        FabState.decrementActiveTabs(); // Decrement if no tab was created
                    }
                    FabState.saveFabState(); // Save state after each attempt's outcome
                });
            };
            attemptTabCreate(urlToOpen, null); // Start initial attempt

            if (FabState.getFabUrlQueueSize() > 0 && (FabState.activeFabProcessingTabs) < FabState.fabMaxConcurrentTabs) { // Use dynamic max concurrent tabs
                console.log(`FabQueueManager: Delaying ${FabState.fabDelayBetweenTabOpenMs / 1000}s before next tab open.`); // Use dynamic delay
                await new Promise(resolve => setTimeout(resolve, FabState.fabDelayBetweenTabOpenMs)); // Use dynamic delay
            }
        } else {
            // No URL was returned from the queue, so break the loop.
            break;
        }
    }

    if (stateChangedInLoop && FabState.getFabUrlQueueSize() === 0) {
        await FabState.saveFabState();
    }
}

/**
 * Adds a URL to the FAB processing queue.
 * This function now leverages FabState.addUrlToFabQueue for encapsulation.
 * @param {string} url - The URL to add.
 * @returns {boolean} True if the URL was added, false otherwise.
 */
export function addUrlToQueue(url) {
    const added = FabState.addUrlToFabQueue(url);
    if (added) {
        console.log(`FabQueueManager: URL added to queue via FabState. Queue length: ${FabState.getFabUrlQueueSize()}`);
    } else {
        if (typeof url !== 'string') console.warn(`FabQueueManager: Attempted to add invalid URL to queue:`, url);
        else console.log(`FabQueueManager: URL already in queue or invalid (checked by FabState): ${url}`);
    }
    return added;
}