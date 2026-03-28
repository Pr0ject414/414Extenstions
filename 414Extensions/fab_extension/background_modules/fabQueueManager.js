// KylesChromeExtensions/fab_extension/background_modules/fabQueueManager.js
import * as FabConstants from './fabConstants.js';
import * as FabState from './fabState.js';
import { addOpenedItemToVerificationQueue } from './fabVerification.js';

// For reading global conditions
import * as AppState from '../../shared_modules/appState.js';

/**
 * A new, consolidated function to handle requests from content scripts.
 * It adds a URL to the queue and attempts to process the queue immediately.
 * @param {string} url - The URL to be added and processed.
 * @returns {{status: string, error?: string}} A status object for the sendResponse callback.
 */
export function addUrlToQueueAndProcess(url) {
    if (!AppState.globalMasterSwitchEnabled) {
        return { status: "global_master_disabled" };
    }
    if (!AppState.fabModuleEnabled) {
        return { status: "fab_module_disabled" };
    }

    const successfullyQueued = FabState.addUrlToFabQueue(url);

    if (successfullyQueued) {
        FabState.saveFabState();

        if (!FabState.fabQueueProcessingEnabled) {
            return { status: "queued_processing_disabled" };
        }
        if (FabState.autoProcessingSuspended) {
            return { status: "suspended" };
        }
        
        if (!AppState.isRateLimited()) {
            processFabTabQueue(); // Fire and forget is fine here
        }
        
        return { status: "queued_and_processing_attempted" };
    } else {
        return { status: "already_queued_or_invalid" };
    }
}


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

let processingScheduled = false;

export async function processFabTabQueue() {
    if (!AppState.globalMasterSwitchEnabled) {
        console.log(`FabQueueManager: Global Master switch is OFF. Queue processing paused.`);
        return;
    }
    if (!AppState.fabModuleEnabled) {
        console.log(`FabQueueManager: FAB Module switch is OFF. FAB queue processing paused. Queue length: ${FabState.getFabUrlQueueSize()}`);
        return;
    }
    if (!FabState.fabQueueProcessingEnabled) {
        console.log(`FabQueueManager: FAB Queue Processing is DISABLED. Queue processing paused. Queue length: ${FabState.getFabUrlQueueSize()}`);
        return;
    }
    if (FabState.autoProcessingSuspended) {
        console.log(`FabQueueManager: Auto-processing is suspended. Queue length: ${FabState.getFabUrlQueueSize()}`);
        return;
    }
    if (AppState.isRateLimited()) {
        console.log(`FabQueueManager: Processing paused due to global rate limit. Cool down until: ${new Date(AppState.rateLimitCoolDownUntil).toLocaleTimeString()}`);
        chrome.alarms.create(FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME, { when: AppState.rateLimitCoolDownUntil + 1000 });
        return;
    }

    if (FabState.activeFabProcessingTabs >= FabState.fabMaxConcurrentTabs || FabState.getFabUrlQueueSize() === 0) {
        return;
    }

    let urlToOpen = null;
    let listingId = null;

    // Use a loop to skip URLs without a valid listingId
    while (FabState.getFabUrlQueueSize() > 0) {
        const nextUrl = FabState.getNextUrlFromFabQueue();
        if (!nextUrl) break;

        const nextId = getListingIdFromUrl(nextUrl);
        if (nextId) {
            urlToOpen = nextUrl;
            listingId = nextId;
            break;
        } else {
            console.error("FabQueueManager: Could not get listingId for URL, skipping:", nextUrl);
        }
    }

    if (!urlToOpen || !listingId) {
        // Queue is empty after skipping invalid URLs
        await FabState.saveFabState();
        return;
    }

    FabState.incrementActiveTabs();

    try {
        const newTab = await chrome.tabs.create({ url: urlToOpen, active: false });
        if (newTab && newTab.id) {
            console.log(`FabQueueManager: Opened ${urlToOpen} in new tab ID: ${newTab.id}. Listing ID: ${listingId}. Active tabs: ${FabState.activeFabProcessingTabs}`);
            addOpenedItemToVerificationQueue({
                url: urlToOpen,
                listingId: listingId,
                tabId: newTab.id,
                status: 'opened',
                openTime: Date.now()
            });
        } else {
            console.error(`FabQueueManager: Tab creation failed for ${urlToOpen} (newTab or newTab.id is undefined).`);
            FabState.decrementActiveTabs();
        }
    } catch (error) {
        console.error(`FabQueueManager: Error opening new tab for ${urlToOpen}:`, error);
        FabState.decrementActiveTabs();
    }

    await FabState.saveFabState();

    // Schedule next processing step if needed
    if (FabState.getFabUrlQueueSize() > 0 && FabState.activeFabProcessingTabs < FabState.fabMaxConcurrentTabs) {
        if (!processingScheduled) {
            processingScheduled = true;
            console.log(`FabQueueManager: Delaying ${FabState.fabDelayBetweenTabOpenMs / 1000}s before next tab open.`);
            setTimeout(() => {
                processingScheduled = false;
                processFabTabQueue();
            }, FabState.fabDelayBetweenTabOpenMs);
        }
    }
}
