// KylesChromeExtensions/fab_extension/fabBackground.js
import * as FabConstants from './background_modules/fabConstants.js';
import * as FabState from './background_modules/fabState.js';
import * as FabQueueManager from './background_modules/fabQueueManager.js';
import * as FabVerification from './background_modules/fabVerification.js';

// Import AppState for reading global conditions and for item_add_rate_limited to set global cooldown
import * as AppState from '../../shared_modules/appState.js';
import * as CoreConstants from '../../shared_modules/coreConstants.js'; // For MAX_DELAY_MS

// --- Lifecycle Functions ---

export async function init() {
    console.log("FabBackground: Initializing...");
    await FabState.loadFabState();
    FabVerification.setupVerificationAlarm(); // Sets up the main verification alarm

    // Initial queue processing if conditions allow
    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && !AppState.isRateLimited()) {
        FabQueueManager.processFabTabQueue();
    }
    console.log("FabBackground: Initialized.");
}

export async function onStartup() {
    console.log("FabBackground: onStartup sequence.");
    // Most initialization is covered by init(), which should be called after AppState is loaded.
    // If there's anything specific to startup beyond the initial load, add it here.
    // For now, init() covers load, alarm setup, and initial queue processing.
    // Ensure init is called if not already by the main background.js onStartup logic.
    // Typically, the main background.js calls init() after loading AppState.
}

export async function onInstalled(details) {
    console.log("FabBackground: onInstalled sequence. Reason:", details.reason);
    // Load state and set up alarms (init() might cover this, or call parts of it)
    await FabState.loadFabState(); // Ensure state is loaded
    FabVerification.setupVerificationAlarm(); // Ensure alarm is set

    if (details.reason === "install" || details.reason === "update") {
        FabState.resetActiveTabs(); // Reset runtime counter
        console.log("FabBackground: Active FAB processing tabs reset due to install/update.");
    }
}

// --- Event Handlers ---

export function handleMessage(request, sender, sendResponse) {
    console.log("FabBackground: Received message", request.action);

    if (request.action === "getFabGlobalStats") {
        // Construct response using FabState and AppState (read-only for AppState here)
        let operationalStatus;
        if (!AppState.globalMasterSwitchEnabled) {
            operationalStatus = "EXTENSION_DISABLED";
        } else if (!AppState.fabModuleEnabled) {
            operationalStatus = "FAB_DISABLED";
        } else if (FabState.autoProcessingSuspended) {
            operationalStatus = "SUSPENDED";
        } else if (AppState.isRateLimited()) {
            operationalStatus = "RATE_LIMITED";
        } else if (FabState.getFabUrlQueueSize() > 0 || FabState.activeFabProcessingTabs > 0) {
            operationalStatus = "OK_ACTIVE";
        } else {
            operationalStatus = "OK_IDLE";
        }

        let responseData = {
            queueSize: FabState.getFabUrlQueueSize(),
            hiddenOwnedCount: "N/A", // This part needs to message the active content script
            operationalStatus: operationalStatus,
            // These global states are for the popup to reflect the coordinator's state
            globalMasterSwitchEnabled: AppState.globalMasterSwitchEnabled,
            fabModuleEnabled: AppState.fabModuleEnabled
        };

        // Query active tab for hiddenOwnedCount (similar to original background.js)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn("FabBackground (getFabGlobalStats): Error querying active tab:", chrome.runtime.lastError.message);
                sendResponse(responseData); // Send with default hiddenOwnedCount
                return;
            }
            if (tabs.length > 0 && tabs[0].id) {
                const activeTab = tabs[0];
                if (activeTab.url && activeTab.url.includes("fab.com")) { // Check if it's a FAB page
                    chrome.tabs.sendMessage(activeTab.id, { action: "getHiddenOwnedItemCount" }, (contentResponse) => {
                        if (chrome.runtime.lastError) {
                            // console.warn("FabBackground: Error getting hiddenOwnedCount:", chrome.runtime.lastError.message);
                        } else if (contentResponse && contentResponse.count !== undefined) {
                            responseData.hiddenOwnedCount = contentResponse.count;
                        }
                        sendResponse(responseData);
                    });
                    return; // Keep channel open for async response
                } else {
                    sendResponse(responseData); // Not on a FAB page or no URL
                }
            } else {
                sendResponse(responseData); // No active tab found
            }
        });
        return true; // Crucial for asynchronous sendResponse

    } else if (request.action === "openTabInBackground" && request.url) {
        if (!AppState.globalMasterSwitchEnabled) {
            sendResponse({ status: "global_master_disabled" }); return true;
        }
        if (!AppState.fabModuleEnabled) {
            sendResponse({ status: "fab_module_disabled" }); return true;
        }
        if (FabState.autoProcessingSuspended) {
            sendResponse({ status: "suspended" }); return true;
        }
        // Rate limit check is done by FabQueueManager.processFabTabQueue via AppState.isRateLimited()

        if (FabQueueManager.addUrlToQueue(request.url)) { // addUrlToQueue now uses FabState
            FabState.saveFabState();
            if (!AppState.isRateLimited()) { // Check global rate limit before processing
                FabQueueManager.processFabTabQueue();
            }
            sendResponse({ status: "queued" });
        } else {
            sendResponse({ status: "already_queued_or_invalid" });
        }
        return true;

    } else if (request.action === "closeFabTab") {
        if (sender.tab && sender.tab.id) {
            const tabIdToClose = sender.tab.id;
            FabVerification.markItemForVerificationOnTabClose(tabIdToClose); // Uses FabState
            if (FabState.activeFabProcessingTabs > 0) { // Check before decrement
                 FabState.decrementActiveTabs();
            }
            // Retry logic for closing tab
            const MAX_RETRIES = 3;
            let retryCount = 0;

            const attemptTabClose = () => {
                chrome.tabs.remove(tabIdToClose, () => {
                    if (chrome.runtime.lastError) {
                        const errorMessage = chrome.runtime.lastError.message;
                        if (errorMessage.includes("Tabs cannot be edited right now") && retryCount < MAX_RETRIES) {
                            retryCount++;
                            console.warn(`FabBackground: Retrying tab close for ${tabIdToClose} (Attempt ${retryCount}/${MAX_RETRIES}):`, errorMessage);
                            setTimeout(attemptTabClose, 500); // Retry after 500ms
                        } else {
                            console.error(`FabBackground: Error closing tab ${tabIdToClose} after ${retryCount} retries:`, errorMessage);
                        }
                    } else {
                        console.log(`FabBackground: Tab ${tabIdToClose} closed successfully.`);
                    }
                    // This block runs after the final attempt (success or max retries reached)
                    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && !AppState.isRateLimited()) {
                        FabQueueManager.processFabTabQueue();
                    }
                });
            };

            FabState.saveFabState().then(() => {
                attemptTabClose();
            });
            sendResponse({ status: "tab_close_initiated" });
        } else {
            sendResponse({ status: "error", message: "No tab ID provided for closing." });
        }
        return true;

    } else if (request.action === "item_add_rate_limited" && request.url && request.listingId) {
        console.log(`FabBackground: item_add_rate_limited from content script for Listing: ${request.listingId}, URL: ${request.url}.`);
        let needsGlobalBroadcast = false;
        if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled) {
            if (FabQueueManager.addUrlToQueue(request.url)) { // Uses FabState
                console.log(`FabBackground: Re-queued ${request.url} due to content script reported rate limit.`);
            }
            // This message implies a 429 was hit by a content script; update global cooldown.
            if (AppState.setRateLimitCoolDown(Date.now() + CoreConstants.MAX_DELAY_MS)) {
                AppState.saveGlobalState(); // Save the AppState with the new cooldown
                console.log(`FabBackground: Global cooldown set due to item_add_rate_limited.`);
                needsGlobalBroadcast = true; // Signal coordinator to broadcast
            }
            FabState.saveFabState(); // Save FabState as queue might have changed
        }
        // The coordinator (main background.js) will be responsible for broadcasting the new global state.
        // We signal it if a broadcast is immediately warranted due to this action changing the global cooldown.
        sendResponse({ status: "rate_limit_acknowledged_by_fab", needsGlobalBroadcast: needsGlobalBroadcast });
        return true;
    }

    // Default for unhandled FAB actions
    console.warn(`FabBackground: Unhandled message action: ${request.action}`);
    sendResponse({ success: false, error: "Unknown FAB action" });
    return false; // Or true if there's a possibility of async handling later
}

export async function handleAlarm(alarm) {
    console.log("FabBackground: Handling alarm", alarm.name);
    // Assumes main background.js has already checked globalMasterSwitchEnabled and fabModuleEnabled before routing here.

    const wasRateLimitedBeforeAlarm = AppState.isRateLimited(); // Check global rate limit

    if (alarm.name === FabConstants.FAB_VERIFICATION_ALARM_NAME ||
        alarm.name.startsWith(FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX)) {
        await FabVerification.handleVerificationAlarm(); // This function internally checks AppState.isRateLimited
    } else if (alarm.name === FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME) {
        // FabQueueManager.processFabTabQueue also internally checks AppState.isRateLimited
        FabQueueManager.processFabTabQueue();
    }

    // The main background.js coordinator will handle broadcasting changes in rate limit status after this handler.
}

export async function handleTabRemoved(tabId, removeInfo) {
    console.log(`FabBackground: Handling tab removal for tabId: ${tabId}`);
    // Assumes main background.js has checked globalMasterSwitchEnabled and fabModuleEnabled.

    const wasProcessing = FabVerification.markItemForVerificationOnTabClose(tabId); // Uses FabState
    if (wasProcessing) {
        if (FabState.activeFabProcessingTabs > 0) { // Check before decrement
            FabState.decrementActiveTabs();
        }
        await FabState.saveFabState();
        if (!AppState.isRateLimited()) { // Check global rate limit before processing queue
            FabQueueManager.processFabTabQueue();
        }
    }
}