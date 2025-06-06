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

    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && FabState.fabQueueProcessingEnabled && !AppState.isRateLimited()) {
        FabQueueManager.processFabTabQueue();
    }
    console.log("FabBackground: Initialized.");
}

export async function onStartup() {
    console.log("FabBackground: onStartup sequence.");
    // Covered by init() in main background.js
}

export async function onInstalled(details) {
    console.log("FabBackground: onInstalled sequence. Reason:", details.reason);
    await FabState.loadFabState(); 
    FabVerification.setupVerificationAlarm(); 

    if (details.reason === "install" || details.reason === "update") {
        FabState.resetActiveTabs(); 
        console.log("FabBackground: Active FAB processing tabs reset due to install/update.");
    }
}

// --- Event Handlers ---

export function handleMessage(request, sender, sendResponse) {
    console.log("FabBackground: Received message", request.action);

    if (request.action === "getFabGlobalStats") {
        let operationalStatus;
        if (!AppState.globalMasterSwitchEnabled) {
            operationalStatus = "EXTENSION_DISABLED";
        } else if (!AppState.fabModuleEnabled) {
            operationalStatus = "FAB_DISABLED";
        } else if (!FabState.fabQueueProcessingEnabled) {
            operationalStatus = "QUEUE_DISABLED";
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
            hiddenOwnedCount: "N/A", 
            operationalStatus: operationalStatus,
            globalMasterSwitchEnabled: AppState.globalMasterSwitchEnabled,
            fabModuleEnabled: AppState.fabModuleEnabled,
            fabQueueProcessingEnabled: FabState.fabQueueProcessingEnabled,
        };

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn("FabBackground (getFabGlobalStats): Error querying active tab:", chrome.runtime.lastError.message);
                sendResponse(responseData);
                return;
            }
            if (tabs.length > 0 && tabs[0].id) {
                const activeTab = tabs[0];
                if (activeTab.url && activeTab.url.includes("fab.com")) { 
                    chrome.tabs.sendMessage(activeTab.id, { action: "getHiddenOwnedItemCount" }, (contentResponse) => {
                        if (chrome.runtime.lastError) {
                            // console.warn("FabBackground: Error getting hiddenOwnedCount:", chrome.runtime.lastError.message);
                        } else if (contentResponse && contentResponse.count !== undefined) {
                            responseData.hiddenOwnedCount = contentResponse.count;
                        }
                        sendResponse(responseData);
                    });
                    return; 
                } else {
                    sendResponse(responseData); 
                }
            } else {
                sendResponse(responseData); 
            }
        });
        return true; 

    } else if (request.action === "openTabInBackground" && request.url) {
        if (!AppState.globalMasterSwitchEnabled) {
            sendResponse({ status: "global_master_disabled" }); return true;
        }
        if (!AppState.fabModuleEnabled) {
            sendResponse({ status: "fab_module_disabled" }); return true;
        }

        let successfullyQueued = FabQueueManager.addUrlToQueue(request.url); 

        if (successfullyQueued) {
            FabState.saveFabState(); 

            if (!FabState.fabQueueProcessingEnabled) {
                console.log("FabBackground: Item queued but queue processing is disabled. URL:", request.url);
                sendResponse({ status: "queued_processing_disabled" }); 
                return true;
            }
            if (FabState.autoProcessingSuspended) { 
                sendResponse({ status: "suspended" }); return true;
            }
            
            if (!AppState.isRateLimited()) {
                FabQueueManager.processFabTabQueue();
            }
            // If processing is enabled and not suspended, the sendResponse from processFabTabQueue might be more relevant
            // or we can assume processing will start if conditions allow.
            sendResponse({ status: "queued_and_processing_attempted" }); // Status indicating queuing and attempt to process
        } else {
            sendResponse({ status: "already_queued_or_invalid" });
        }
        return true; 

    } else if (request.action === "closeFabTab") {
        if (sender.tab && sender.tab.id) {
            const tabIdToClose = sender.tab.id;
            FabVerification.markItemForVerificationOnTabClose(tabIdToClose); 
            if (FabState.activeFabProcessingTabs > 0) { 
                 FabState.decrementActiveTabs();
            }
            const MAX_RETRIES = 3;
            let retryCount = 0;

            const attemptTabClose = () => {
                chrome.tabs.remove(tabIdToClose, () => {
                    if (chrome.runtime.lastError) {
                        const errorMessage = chrome.runtime.lastError.message;
                        if (errorMessage.includes("Tabs cannot be edited right now") && retryCount < MAX_RETRIES) {
                            retryCount++;
                            console.warn(`FabBackground: Retrying tab close for ${tabIdToClose} (Attempt ${retryCount}/${MAX_RETRIES}):`, errorMessage);
                            setTimeout(attemptTabClose, 500); 
                        } else {
                            console.error(`FabBackground: Error closing tab ${tabIdToClose} after ${retryCount} retries:`, errorMessage);
                        }
                    } else {
                        console.log(`FabBackground: Tab ${tabIdToClose} closed successfully.`);
                    }
                    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && FabState.fabQueueProcessingEnabled && !AppState.isRateLimited()) {
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
            // Re-queue the item if queue processing is off, or if it's on and we want to retry later
            if (FabQueueManager.addUrlToQueue(request.url)) { 
                console.log(`FabBackground: Re-queued ${request.url} due to content script reported rate limit.`);
            }
            
            if (AppState.setRateLimitCoolDown(Date.now() + AppState.globalMaxDelayMs)) {
                AppState.saveGlobalState(); 
                console.log(`FabBackground: Global cooldown set due to item_add_rate_limited.`);
                needsGlobalBroadcast = true; 
            }
            FabState.saveFabState(); 
        }
        sendResponse({ status: "rate_limit_acknowledged_by_fab", needsGlobalBroadcast: needsGlobalBroadcast });
        return true;
    } else if (request.action === "setFabQueueProcessingEnabled") {
        if (typeof request.enabled === 'boolean') {
            FabState.setFabQueueProcessingEnabled(request.enabled);
            FabState.saveFabState();
            console.log(`FabBackground: FAB Queue Processing set to ${request.enabled}.`);
            if (request.enabled && AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && !AppState.isRateLimited()) {
                FabQueueManager.processFabTabQueue();
            }
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: "Invalid 'enabled' value for FabQueueProcessingEnabled." });
        }
        return true;
    } else if (request.action === "queueFabItemOnly" && request.url) { 
        if (!AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled) {
            sendResponse({ success: false, error: "Extension or FAB module is disabled." });
            return true;
        }
        if (FabQueueManager.addUrlToQueue(request.url)) { 
            FabState.saveFabState(); 
            console.log(`FabBackground: Successfully queued item for manual addition: ${request.url}`);
            sendResponse({ success: true, message: "Item queued successfully." });
        } else {
            sendResponse({ success: false, error: "Failed to queue item or already in queue." });
        }
        return true;
    }

    console.warn(`FabBackground: Unhandled message action: ${request.action}`);
    sendResponse({ success: false, error: "Unknown FAB action" });
    return false; 
}

export async function handleAlarm(alarm) {
    console.log("FabBackground: Handling alarm", alarm.name);

    if (!AppState.globalMasterSwitchEnabled) {
        console.log(`FabBackground: Global Master switch OFF. Skipping alarm: ${alarm.name}`);
        return;
    }
    if (!AppState.fabModuleEnabled) {
        console.log(`FabBackground: FAB Module switch OFF. Skipping FAB alarm: ${alarm.name}`);
        return;
    }
    
    // Verification alarms should run regardless of fabQueueProcessingEnabled
    if (alarm.name === FabConstants.FAB_VERIFICATION_ALARM_NAME ||
        alarm.name.startsWith(FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX)) {
        await FabVerification.handleVerificationAlarm();
    } 
    // Queue processing alarms should only run if queue processing is enabled
    else if (alarm.name === FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME) {
        if (!FabState.fabQueueProcessingEnabled) {
            console.log(`FabBackground: FAB Queue Processing DISABLED. Skipping queue-related alarm: ${alarm.name}`);
            return;
        }
        FabQueueManager.processFabTabQueue();
    }
}

export async function handleTabRemoved(tabId, removeInfo) {
    console.log(`FabBackground: Handling tab removal for tabId: ${tabId}`);

    const wasProcessing = FabVerification.markItemForVerificationOnTabClose(tabId); 
    if (wasProcessing) {
        if (FabState.activeFabProcessingTabs > 0) { 
            FabState.decrementActiveTabs();
        }
        await FabState.saveFabState();
        if (FabState.fabQueueProcessingEnabled && !AppState.isRateLimited()) {
            FabQueueManager.processFabTabQueue();
        }
    }
}