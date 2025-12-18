// KylesChromeExtensions/fab_extension/fabBackground.js
import * as FabConstants from './background_modules/fabConstants.js';
import * as FabState from './background_modules/fabState.js';
import * as FabQueueManager from './background_modules/fabQueueManager.js';
import * as FabVerification from './background_modules/fabVerification.js';
import * as AppState from '../../shared_modules/appState.js';

let isWebRequestlistenerRegistered = false;

// This function will be called by the global background script's broadcast function
export function onGlobalStateChange() {
    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && AppState.fabModuleVisible) {
        registerWebRequestlistener();
    } else {
        unregisterWebRequestlistener();
    }
}

function handle429(details) {
    if (details.statusCode === 429) {
        console.log("FabBackground (webRequest): Detected a 429 status code.");
        
        let coolDownUntil = Date.now() + AppState.globalMaxDelayMs; // Default fallback

        // Attempt to parse Retry-After header
        const retryHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'retry-after') || 
                            details.responseHeaders?.find(h => h.name.toLowerCase() === 'x-ratelimit-reset'); // Some APIs use this

        if (retryHeader && retryHeader.value) {
            const val = retryHeader.value;
            // Retry-After can be seconds (integer) or a specific date (string)
            if (/^\d+$/.test(val)) {
                // It's seconds
                coolDownUntil = Date.now() + (parseInt(val, 10) * 1000);
            } else {
                // Try parsing as date
                const dateVal = Date.parse(val);
                if (!isNaN(dateVal)) {
                    coolDownUntil = dateVal;
                }
            }
            console.log(`FabBackground: Parsed Retry-After/RateLimit-Reset header: ${val}. Cooldown until ${new Date(coolDownUntil).toISOString()}`);
        } else {
            console.log("FabBackground: No Retry-After header found. Using default global cooldown.");
        }

        if (AppState.setRateLimitCoolDown(coolDownUntil)) {
            AppState.saveGlobalState();
            
            // Set an alarm to wake us up exactly when the cooldown expires
            chrome.alarms.create(FabConstants.FAB_RATE_LIMIT_EXPIRY_ALARM_NAME, {
                when: coolDownUntil
            });
            console.log(`FabBackground: Scheduled wake-up alarm for ${new Date(coolDownUntil).toISOString()}`);
            
            // The global coordinator will broadcast the state change to content scripts
        }
    }
}
function registerWebRequestlistener() {
    if (isWebRequestlistenerRegistered) return;
    chrome.webRequest.onHeadersReceived.addListener(
        handle429,
        { urls: ["*://*.fab.com/*"] }, // Catch ALL types (xmlhttprequest, main_frame, sub_frame, other, etc.)
        ["responseHeaders", "extraHeaders"] // Add extraHeaders to ensure we see everything
    );
    isWebRequestlistenerRegistered = true;
    console.log("FabBackground: WebRequest listener for 429s registered (Broadened).");
}

function unregisterWebRequestlistener() {
    if (!isWebRequestlistenerRegistered) return;
    chrome.webRequest.onHeadersReceived.removeListener(handle429);
    isWebRequestlistenerRegistered = false;
    console.log("FabBackground: WebRequest listener for 429s unregistered.");
}

// --- Lifecycle Functions ---

export async function init() {
    console.log("FabBackground: Initializing...");
    await FabState.loadFabState();
    FabVerification.setupVerificationAlarm();
    onGlobalStateChange(); // Register webRequest listener if enabled

    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && AppState.fabModuleVisible && FabState.fabQueueProcessingEnabled && !AppState.isRateLimited()) {
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
    // console.log("FabBackground: Received message", request.action); // Less noisy logging

    switch (request.action) {
        case "getFabGlobalStats": {
            let operationalStatus;
            if (!AppState.globalMasterSwitchEnabled) operationalStatus = "EXTENSION_DISABLED";
            else if (!AppState.fabModuleEnabled || !AppState.fabModuleVisible) operationalStatus = "FAB_DISABLED";
            else if (!FabState.fabQueueProcessingEnabled) operationalStatus = "QUEUE_DISABLED";
            else if (FabState.autoProcessingSuspended) operationalStatus = "SUSPENDED";
            else if (AppState.isRateLimited()) operationalStatus = "RATE_LIMITED";
            else if (FabState.getFabUrlQueueSize() > 0 || FabState.activeFabProcessingTabs > 0) operationalStatus = "OK_ACTIVE";
            else operationalStatus = "OK_IDLE";

            const responseData = {
                queueSize: FabState.getFabUrlQueueSize(),
                hiddenOwnedCount: "N/A",
                operationalStatus: operationalStatus,
                rateLimitCoolDownUntil: AppState.rateLimitCoolDownUntil // Added field
            };

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError || !tabs[0]?.id) {
                    sendResponse(responseData);
                    return;
                }
                const activeTab = tabs[0];
                if (activeTab.url && activeTab.url.includes("fab.com")) {
                    chrome.tabs.sendMessage(activeTab.id, { action: "getHiddenOwnedItemCount" })
                        .then(contentResponse => {
                            if (contentResponse && contentResponse.count !== undefined) {
                                responseData.hiddenOwnedCount = contentResponse.count;
                            }
                            sendResponse(responseData);
                        })
                        .catch(() => sendResponse(responseData));
                } else {
                    sendResponse(responseData);
                }
            });
            return true;
        }

        case "getFabRateLimitStatus": {
            const effectivelyPaused = !AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || !AppState.fabModuleVisible || AppState.isRateLimited();
            sendResponse({ rateLimited: effectivelyPaused });
            return true; // Required for asynchronous response
        }

        case "queueItemWithGracePeriod": {
            const { url, graceMs } = request;

            if (FabState.isUrlPendingOrQueued(url)) {
                sendResponse({ status: "already_pending_or_queued" });
                return true;
            }

            const timerId = setTimeout(() => {
                FabState.removeUrlFromPending(url);
                FabQueueManager.addUrlToQueueAndProcess(url);
            }, graceMs);

            FabState.addUrlToPending(url, timerId);
            console.log(`FabBackground: Item ${url} is now pending for ${graceMs}ms.`);
            sendResponse({ status: "pending_grace_period" });
            return true;
        }

        case "queueFabItemOnly": { // Handler for the settings page manual add
            const status = FabQueueManager.addUrlToQueueAndProcess(request.url);
            if (status.status.startsWith("queued")) {
                sendResponse({ success: true, message: `Item queued successfully.` });
            } else {
                sendResponse({ success: false, error: `Failed to queue item. Status: ${status.status}` });
            }
            return true;
        }

        case "openTabInBackground": {
            console.warn(`FabBackground: Received legacy 'openTabInBackground' request for ${request.url}`);
            const status = FabQueueManager.addUrlToQueueAndProcess(request.url);
            sendResponse(status);
            return true;
        }

        case "closeFabTab": {
            if (sender.tab?.id) {
                const tabIdToClose = sender.tab.id;
                FabVerification.markItemForVerificationOnTabClose(tabIdToClose);
                if (FabState.activeFabProcessingTabs > 0) FabState.decrementActiveTabs();
                
                FabState.saveFabState().then(() => {
                    chrome.tabs.remove(tabIdToClose).catch(e => console.error(`Failed to close tab ${tabIdToClose}`, e));
                    if (AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && AppState.fabModuleVisible && FabState.fabQueueProcessingEnabled && !AppState.isRateLimited()) {
                        FabQueueManager.processFabTabQueue();
                    }
                });
                sendResponse({ status: "tab_close_initiated" });
            } else {
                sendResponse({ status: "error", message: "No tab ID provided." });
            }
            return true;
        }
        
        case "setFabQueueProcessingEnabled": {
            if (typeof request.enabled === 'boolean') {
                FabState.setFabQueueProcessingEnabled(request.enabled);
                FabState.saveFabState();
                console.log(`FabBackground: FAB Queue Processing set to ${request.enabled}.`);
                if (request.enabled && AppState.globalMasterSwitchEnabled && AppState.fabModuleEnabled && AppState.fabModuleVisible && !AppState.isRateLimited()) {
                    FabQueueManager.processFabTabQueue();
                }
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: "Invalid 'enabled' value." });
            }
            return true;
        }

        case "item_add_rate_limited": {
            console.log(`FabBackground: Content script reported rate limit for ${request.listingId}. Applying global cool-down.`);
            if (AppState.setRateLimitCoolDown(Date.now() + AppState.globalMaxDelayMs)) {
                AppState.saveGlobalState();
                // The global coordinator will broadcast the state change automatically
            }
            sendResponse({ success: true });
            return true;
        }

        default:
            console.warn(`FabBackground: Unhandled message action: ${request.action}`);
            sendResponse({ success: false, error: "Unknown FAB action" });
            return false;
    }
}

export async function handleAlarm(alarm) {
    if (!AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || !AppState.fabModuleVisible) return;

    if (alarm.name === FabConstants.FAB_VERIFICATION_ALARM_NAME || alarm.name.startsWith(FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX)) {
        await FabVerification.handleVerificationAlarm();
    } else if (alarm.name === FabConstants.FAB_QUEUE_PROCESS_RETRY_ALARM_NAME) {
        if (FabState.fabQueueProcessingEnabled) {
            FabQueueManager.processFabTabQueue();
        }
    } else if (alarm.name === FabConstants.FAB_RATE_LIMIT_EXPIRY_ALARM_NAME) {
        console.log("FabBackground: Rate limit cooldown expired. Alarm fired.");
        if (FabState.fabQueueProcessingEnabled) {
             FabQueueManager.processFabTabQueue();
        }
    }
}

export async function handleTabRemoved(tabId) {
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