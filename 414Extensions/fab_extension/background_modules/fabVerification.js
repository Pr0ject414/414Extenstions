// KylesChromeExtensions/fab_extension/background_modules/fabVerification.js
import * as FabConstants from './fabConstants.js';
import * as FabState from './fabState.js'; // For verificationQueue, autoProcessingSuspended, etc.

// For reading global conditions
import * as AppState from '../../shared_modules/appState.js';
// Import fetchWithBackoff from its new shared location
import { fetchWithBackoff } from '../../shared_modules/fetchUtils.js';

export function setupVerificationAlarm() {
    chrome.alarms.get(FabConstants.FAB_VERIFICATION_ALARM_NAME, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(FabConstants.FAB_VERIFICATION_ALARM_NAME, {
                delayInMinutes: 1, // Start after 1 minute
                periodInMinutes: 1  // Check every 1 minute
            });
            console.log("Verification: Main alarm created.");
        }
    });
}

export function addOpenedItemToVerificationQueue(itemDetails) {
    // This correctly uses FabState as verificationQueue is FAB-specific
    FabState.verificationQueue.push(itemDetails);
}

export function markItemForVerificationOnTabClose(tabId) {
    // This correctly uses FabState
    const vQueueIndex = FabState.verificationQueue.findIndex(item => item.tabId === tabId && item.status === 'opened');
    if (vQueueIndex > -1) {
        FabState.verificationQueue[vQueueIndex].status = 'pending_verification';
        FabState.verificationQueue[vQueueIndex].closeTime = Date.now();
        console.log(`Verification: Item ${FabState.verificationQueue[vQueueIndex].listingId} (Tab ID: ${tabId}) marked for verification.`);
        return true;
    }
    return false;
}

export async function handleVerificationAlarm() {
    // Correctly use AppState for global switches and rate limiting
    if (!AppState.globalMasterSwitchEnabled) {
        console.log(`Verification: Global Master switch is OFF. Verification alarm handling paused.`);
        return;
    }
    if (!AppState.fabModuleEnabled) {
        console.log(`Verification: FAB Module switch is OFF. FAB verification alarm handling paused.`);
        return;
    }

    if (AppState.isRateLimited()) {
        console.log(`Verification: Paused due to global rate limit. Cool down until: ${new Date(AppState.rateLimitCoolDownUntil).toLocaleTimeString()}`);
        // Assuming FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX is correctly defined in FabConstants
        const resumeAlarmName = FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX;
        chrome.alarms.get(resumeAlarmName, (existingAlarm) => {
            if (!existingAlarm || (existingAlarm && existingAlarm.scheduledTime > AppState.rateLimitCoolDownUntil + 5000)) {
                 chrome.alarms.create(resumeAlarmName, {
                    when: AppState.rateLimitCoolDownUntil + 5000 // Try 5s after cooldown lifts
                });
            }
        });
        return;
    }
    
    // Correctly uses FabState.verificationQueue
    let itemsDueForVerification = FabState.verificationQueue.filter(
        item => item.status === 'pending_verification' && (Date.now() - (item.closeTime || 0)) > 2 * 60 * 1000 // 2 minutes past close time
    );

    if (itemsDueForVerification.length === 0) {
        return;
    }
    console.log(`Verification: Processing ${itemsDueForVerification.length} item(s) for verification.`);

    let stateChangedDuringThisAlarmCycle = false;

    for (let i = 0; i < itemsDueForVerification.length; i++) {
        const item = itemsDueForVerification[i];

        // Correctly use AppState for global switches
        if (!AppState.globalMasterSwitchEnabled) {
            console.log(`Verification: Global Master switch turned OFF mid-batch. Pausing verification.`);
            break;
        }
        if (!AppState.fabModuleEnabled) {
            console.log(`Verification: FAB Module switch turned OFF mid-batch. Pausing FAB verification.`);
            break;
        }

        if (i > 0) { // Delay between checks if processing multiple items
            // Use configurable delay from FabState
            await new Promise(resolve => setTimeout(resolve, FabState.fabDelayBetweenVerificationChecksMs));
        }

        // Correctly use AppState for rate limiting check and state
        if (AppState.isRateLimited()) {
            console.log("Verification: Global rate limit hit during batch processing. Pausing current batch.");
            const resumeAlarmName = FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX;
            chrome.alarms.get(resumeAlarmName, (existingAlarm) => {
                if (!existingAlarm || (existingAlarm && existingAlarm.scheduledTime > AppState.rateLimitCoolDownUntil + 5000)) {
                    chrome.alarms.create(resumeAlarmName, {
                       when: AppState.rateLimitCoolDownUntil + 5000
                   });
                }
            });
            break; // Exit loop for this alarm cycle
        }

        if (!item.listingId) {
            console.warn("Verification: Skipping item with no listingId:", item);
            item.status = 'verification_error_no_id';
            stateChangedDuringThisAlarmCycle = true;
            continue;
        }
        console.log(`Verification: Checking ownership for listing ${item.listingId} from URL ${item.url}`);
        try {
            const response = await fetchWithBackoff(
                `https://www.fab.com/i/listings/${item.listingId}/ownership`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'omit'
                }
                // fetchWithBackoff will use AppState internally to set global rate limits if needed
            );

            let ownsFreePersonalLicense = false;
            if (response.status === 429) {
                console.error(`Verification: Persistent 429 for ${item.listingId} after retries. Global cool-down likely active (set by fetchWithBackoff).`);
                item.status = 'verification_error_rate_limit';
            } else if (response.ok) {
                if (response.status === 204) {
                    console.log(`Verification: Ownership API for ${item.listingId}: No specific licenses owned (204).`);
                } else {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const ownedLicenses = await response.json();
                        ownsFreePersonalLicense = ownedLicenses.some(
                            license => license.name && license.name.toLowerCase() === 'personal' && license.slug && license.slug.toLowerCase() === 'personal'
                        );
                    } else {
                         console.log(`Verification: Ownership API for ${item.listingId}: Response not JSON. Status: ${response.status}, Content-Type: ${contentType}`);
                    }
                }
            } else {
                console.warn(`Verification: Ownership API call failed for ${item.listingId} with status: ${response.status} ${response.statusText}`);
                item.status = 'verification_error_api_fail';
            }

            if (ownsFreePersonalLicense) {
                console.log(`Verification: SUCCESS - Item ${item.listingId} is in library.`);
                item.status = 'verified_owned';
            } else if (item.status !== 'verification_error_rate_limit' && item.status !== 'verification_error_api_fail' && item.status !== 'verification_error_exception' && item.status !== 'verification_error_no_id') {
                console.error(`Verification: FAILED - Item ${item.listingId} was NOT found in library.`);
                item.status = 'verification_failed';
                FabState.setSuspended(true); // Correctly uses FabState to set FAB-specific suspension

                chrome.notifications.create(`fab-verify-fail-${item.listingId}-${Date.now()}`, {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL("icons/default_icon.png"), // Use chrome.runtime.getURL for icon path
                    title: 'FAB Helper - Verification Failed',
                    message: `Item ${item.listingId} was NOT found in your library. Automatic processing is now suspended. Please check manually.`,
                    priority: 2
                });
            }
        } catch (error) {
            console.error(`Verification: Exception during API call for ${item.listingId}:`, error);
            item.status = 'verification_error_exception';
        }
        stateChangedDuringThisAlarmCycle = true;
    }

    // Correctly uses FabState for queue management
    const originalVQueueLength = FabState.verificationQueue.length;
    const filteredQueue = FabState.verificationQueue.filter(item => {
        const isPermanentlyProcessed = [
            'verified_owned',
            'verification_failed',
            'verification_error_no_id',
            'verification_error_api_fail',
            'verification_error_exception',
            'verification_error_rate_limit'
        ].includes(item.status);

        const isStillPendingAndNotDue = item.status === 'pending_verification' && (Date.now() - (item.closeTime || 0)) <= 2 * 60 * 1000;
        const isOpened = item.status === 'opened';
        
        return isOpened || isStillPendingAndNotDue || !isPermanentlyProcessed;
    });
    FabState.setVerificationQueue(filteredQueue); // Correctly uses FabState

    if (FabState.verificationQueue.length !== originalVQueueLength) {
        stateChangedDuringThisAlarmCycle = true;
    }

    // Check if FAB's own autoProcessingSuspended state or queue has changed
    // The condition for autoProcessingSuspended itself is based on finding 'verification_failed' in FabState.verificationQueue
    const shouldBeSuspended = FabState.verificationQueue.find(item => item.status === 'verification_failed') !== undefined;
    if (stateChangedDuringThisAlarmCycle || FabState.autoProcessingSuspended !== shouldBeSuspended) {
        if (FabState.autoProcessingSuspended !== shouldBeSuspended) {
             // FabState.setSuspended(shouldBeSuspended); // setSuspended is already called above when a failure occurs
        }
        await FabState.saveFabState(); // Correctly save FAB-specific state
    }

    if (FabState.autoProcessingSuspended) {
        console.log("Verification: Auto-processing has been suspended due to failure(s).");
    }
}