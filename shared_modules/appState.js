// KylesChromeExtensions/shared_modules/appState.js
import * as CoreConstants from './coreConstants.js';

// --- Global Application State ---
export let rateLimitCoolDownUntil = 0; // Timestamp for global cool-down
export let globalMasterSwitchEnabled = true; // Default to ON for the entire extension
export let fabModuleEnabled = true; // Default to ON for the FAB module (managed globally)

// Configurable global network settings (loaded from storage)
export let globalMaxRetries = 5; // Default value
export let globalInitialDelayMs = 30000; // Default value (30 seconds)
export let globalMaxDelayMs = 300000; // Default value (5 minutes)

// --- Global State Modifiers ---

/**
 * Sets the global rate limit cool-down period.
 * @param {number} timestamp - The UNIX timestamp until which the cool-down is active.
 * @returns {boolean} True if the cool-down was newly set or extended to a future point, false otherwise.
 */
export function setRateLimitCoolDown(timestamp) {
    const now = Date.now();
    // Check if the new timestamp is actually in the future
    if (timestamp > now) {
        // Check if this new future timestamp extends the current cooldown period
        if (timestamp > rateLimitCoolDownUntil) {
            rateLimitCoolDownUntil = timestamp;
            console.log(`AppState: Global rate limit cool-down set/extended until: ${new Date(timestamp).toISOString()}`);
            return true; // Cooldown was set or extended
        }
    } else if (rateLimitCoolDownUntil > now) {
        // If timestamp is in the past, but we are still in an active cooldown, no change, not "newly set/extended"
        return false;
    }
    // If timestamp is in the past and we are not in cooldown, or if timestamp doesn't extend
    return false;
}

export function isRateLimited() {
    return Date.now() < rateLimitCoolDownUntil;
}

export function setGlobalMasterSwitchEnabled(value) {
    if (typeof value === 'boolean') {
        globalMasterSwitchEnabled = value;
    } else {
        console.warn('AppState: Invalid value for setGlobalMasterSwitchEnabled. Expected boolean.');
    }
}

export function setFabModuleEnabled(value) {
    if (typeof value === 'boolean') {
        fabModuleEnabled = value;
    } else {
        console.warn('AppState: Invalid value for setFabModuleEnabled. Expected boolean.');
    }
}

// --- Persistence Functions for Global State ---
export async function saveGlobalState() {
    return new Promise(resolve => {
        const stateToSave = {
            [CoreConstants.RATE_LIMIT_COOL_DOWN_UNTIL_KEY]: rateLimitCoolDownUntil,
            [CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY]: globalMasterSwitchEnabled,
            [CoreConstants.FAB_MODULE_ENABLED_KEY]: fabModuleEnabled,
            // Save configurable global network settings
            [CoreConstants.GLOBAL_MAX_RETRIES_KEY]: globalMaxRetries,
            [CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY]: globalInitialDelayMs,
            [CoreConstants.GLOBAL_MAX_DELAY_MS_KEY]: globalMaxDelayMs,
        };
        chrome.storage.local.set(stateToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("AppState: Error saving global state:", chrome.runtime.lastError.message, stateToSave);
            } else {
                // console.log("AppState: Global state saved.", stateToSave);
            }
            resolve();
        });
    });
}

export async function loadGlobalState() {
    console.log("AppState: Attempting to load global app state...");
    return new Promise((resolve) => {
        chrome.storage.local.get([
            CoreConstants.RATE_LIMIT_COOL_DOWN_UNTIL_KEY,
            CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY,
            CoreConstants.FAB_MODULE_ENABLED_KEY,
            CoreConstants.GLOBAL_MAX_RETRIES_KEY,
            CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY,
            CoreConstants.GLOBAL_MAX_DELAY_MS_KEY
        ], (result) => {
            if (chrome.runtime.lastError) {
                console.error("AppState: Error loading global state:", chrome.runtime.lastError.message);
            }

            rateLimitCoolDownUntil = result[CoreConstants.RATE_LIMIT_COOL_DOWN_UNTIL_KEY] || 0;
            
            // Preserve specific default logic for boolean switches
            globalMasterSwitchEnabled = result[CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY] === undefined ? true : result[CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY];
            fabModuleEnabled = result[CoreConstants.FAB_MODULE_ENABLED_KEY] === undefined ? true : result[CoreConstants.FAB_MODULE_ENABLED_KEY];

            // Load configurable global network settings with defaults
            globalMaxRetries = result[CoreConstants.GLOBAL_MAX_RETRIES_KEY] === undefined ? 5 : result[CoreConstants.GLOBAL_MAX_RETRIES_KEY]; //
            globalInitialDelayMs = result[CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY] === undefined ? 30000 : result[CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY]; //
            globalMaxDelayMs = result[CoreConstants.GLOBAL_MAX_DELAY_MS_KEY] === undefined ? 300000 : result[CoreConstants.GLOBAL_MAX_DELAY_MS_KEY]; //

            console.log("AppState: Global state loaded.", {
                globalMasterSwitchEnabled,
                fabModuleEnabled,
                rateLimitCoolDownUntil: rateLimitCoolDownUntil > 0 ? new Date(rateLimitCoolDownUntil).toISOString() : "Not set",
                globalMaxRetries,
                globalInitialDelayMs,
                globalMaxDelayMs
            });
            resolve();
        });
    });
}