// KylesChromeExtensions/fab_extension/background_modules/fabVerification.js
import * as FabConstants from './fabConstants.js';
import * as FabState from './fabState.js';

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
        }
    });
}

export function addOpenedItemToVerificationQueue(itemDetails) {
    FabState.verificationQueue.push(itemDetails);
}

export function markItemForVerificationOnTabClose(tabId) {
    const vQueueIndex = FabState.verificationQueue.findIndex(item => item.tabId === tabId && item.status === 'opened');
    if (vQueueIndex > -1) {
        FabState.verificationQueue[vQueueIndex].status = 'pending_verification';
        FabState.verificationQueue[vQueueIndex].closeTime = Date.now();
        return true;
    }
    return false;
}

async function verifySingleItem(item) {
    if (!AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled) {
        return false;
    }

    if (AppState.isRateLimited()) {
        return false;
    }

    if (!item.listingId) {
        item.status = 'verification_error_no_id';
        return true;
    }

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
        );

        let ownsFreePersonalLicense = false;
        if (response.status === 429) {
            item.status = 'verification_error_rate_limit';
        } else if (response.ok) {
            if (response.status === 204) {
                // No specific licenses owned
            } else {
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const ownedLicenses = await response.json();
                    ownsFreePersonalLicense = ownedLicenses.some(
                        license => license.name && license.name.toLowerCase() === 'personal' && license.slug && license.slug.toLowerCase() === 'personal'
                    );
                }
            }
        } else {
            item.status = 'verification_error_api_fail';
        }

        if (ownsFreePersonalLicense) {
            item.status = 'verified_owned';
        } else if (![
            'verification_error_rate_limit',
            'verification_error_api_fail',
            'verification_error_exception',
            'verification_error_no_id'
        ].includes(item.status)) {
            item.status = 'verification_failed';
            FabState.setSuspended(true);

            chrome.notifications.create(`fab-verify-fail-${item.listingId}-${Date.now()}`, {
                type: 'basic',
                iconUrl: chrome.runtime.getURL("icons/default_icon.png"),
                title: 'FAB Helper - Verification Failed',
                message: `Item ${item.listingId} was NOT found in your library. Automatic processing is now suspended. Please check manually.`,
                priority: 2
            });
        }
    } catch (error) {
        item.status = 'verification_error_exception';
    }
    return true;
}

export async function handleVerificationAlarm() {
    if (!AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled) {
        return;
    }

    if (AppState.isRateLimited()) {
        const resumeAlarmName = FabConstants.FAB_VERIFICATION_ALARM_NAME + FabConstants.FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX;
        chrome.alarms.get(resumeAlarmName, (existingAlarm) => {
            if (!existingAlarm || (existingAlarm && existingAlarm.scheduledTime > AppState.rateLimitCoolDownUntil + 5000)) {
                 chrome.alarms.create(resumeAlarmName, {
                    when: AppState.rateLimitCoolDownUntil + 5000 
                });
            }
        });
        return;
    }

    let itemsDueForVerification = FabState.verificationQueue.filter(
        item => item.status === 'pending_verification' && (Date.now() - (item.closeTime || 0)) > 2 * 60 * 1000 
    );

    if (itemsDueForVerification.length === 0) {
        return;
    }

    let stateChangedDuringThisAlarmCycle = false;
    const concurrencyLimit = 5;
    const activePromises = [];

    for (const item of itemsDueForVerification) {
        if (!AppState.globalMasterSwitchEnabled || !AppState.fabModuleEnabled || AppState.isRateLimited()) {    
            break;
        }

        const p = verifySingleItem(item).then(changed => {
            if (changed) stateChangedDuringThisAlarmCycle = true;
            activePromises.splice(activePromises.indexOf(p), 1);
        });
        activePromises.push(p);

        if (activePromises.length >= concurrencyLimit) {
            await Promise.race(activePromises);
        }
    }
    await Promise.all(activePromises);

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
    FabState.setVerificationQueue(filteredQueue); 

    if (FabState.verificationQueue.length !== originalVQueueLength) {
        stateChangedDuringThisAlarmCycle = true;
    }

    const shouldBeSuspended = FabState.verificationQueue.find(item => item.status === 'verification_failed') !== undefined;
    if (stateChangedDuringThisAlarmCycle || FabState.autoProcessingSuspended !== shouldBeSuspended) {
        await FabState.saveFabState(); 
    }
}
