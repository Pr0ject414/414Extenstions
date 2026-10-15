// KylesChromeExtensions/shared_modules/appState.js
import * as CoreConstants from './coreConstants.js';
import { loadStateFromStorage, saveStateToStorage } from './storageUtils.js';

// --- Global Application State ---
export let rateLimitCoolDownUntil = 0;
export let globalMasterSwitchEnabled = true;

// Module Enabled States (Power)
export let fabModuleEnabled = true;
export let youTubeModuleEnabled = true;
export let xModuleEnabled = true;
export let crunchyrollModuleEnabled = true;
export let volumeModuleEnabled = true;
export let vscModuleEnabled = true;

// Module Visible States (Popup Tabs)
export let fabModuleVisible = true;
export let youTubeModuleVisible = true;
export let xModuleVisible = true;
export let crunchyrollModuleVisible = true;
export let volumeModuleVisible = true;
export let vscModuleVisible = true;

// Global Network Configuration
export let globalMaxRetries = 5;
export let globalInitialDelayMs = 30000;
export let globalMaxDelayMs = 300000;

// Object defining all state keys and their default values.
const APP_STATE_DEFAULTS = {
    [CoreConstants.RATE_LIMIT_COOL_DOWN_UNTIL_KEY]: 0,
    [CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY]: true,
    [CoreConstants.FAB_MODULE_ENABLED_KEY]: true,
    [CoreConstants.YOUTUBE_MODULE_ENABLED_KEY]: true,
    [CoreConstants.X_MODULE_ENABLED_KEY]: true,
    [CoreConstants.CRUNCHYROLL_MODULE_ENABLED_KEY]: true,
    [CoreConstants.VOLUME_MODULE_ENABLED_KEY]: true,
    [CoreConstants.VSC_MODULE_ENABLED_KEY]: true,
    [CoreConstants.FAB_MODULE_VISIBLE_KEY]: true,
    [CoreConstants.YOUTUBE_MODULE_VISIBLE_KEY]: true,
    [CoreConstants.X_MODULE_VISIBLE_KEY]: true,
    [CoreConstants.CRUNCHYROLL_MODULE_VISIBLE_KEY]: true,
    [CoreConstants.VOLUME_MODULE_VISIBLE_KEY]: true,
    [CoreConstants.VSC_MODULE_VISIBLE_KEY]: true,
    [CoreConstants.GLOBAL_MAX_RETRIES_KEY]: 5,
    [CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY]: 30000,
    [CoreConstants.GLOBAL_MAX_DELAY_MS_KEY]: 300000,
};

// --- Global State Modifiers ---
export function setRateLimitCoolDown(timestamp) {
    const now = Date.now();
    if (timestamp > now && timestamp > rateLimitCoolDownUntil) {
        rateLimitCoolDownUntil = timestamp;
        console.log(`AppState: Global rate limit cool-down set/extended until: ${new Date(timestamp).toISOString()}`);
        return true;
    }
    return false;
}

export function isRateLimited() {
    return Date.now() < rateLimitCoolDownUntil;
}

export function resetRateLimitCoolDown() {
    rateLimitCoolDownUntil = 0;
}

export function setGlobalMasterSwitchEnabled(value) {
    globalMasterSwitchEnabled = !!value;
}

export function setFabModuleEnabled(value) {
    fabModuleEnabled = !!value;
}

export function setYouTubeModuleEnabled(value) {
    youTubeModuleEnabled = !!value;
}

export function setXModuleEnabled(value) {
    xModuleEnabled = !!value;
}

export function setCrunchyrollModuleEnabled(value) {
    crunchyrollModuleEnabled = !!value;
}

export function setVolumeModuleEnabled(value) {
    volumeModuleEnabled = !!value;
}

export function setVscModuleEnabled(value) {
    vscModuleEnabled = !!value;
}

export function setFabModuleVisible(value) {
    fabModuleVisible = !!value;
}

export function setYouTubeModuleVisible(value) {
    youTubeModuleVisible = !!value;
}

export function setXModuleVisible(value) {
    xModuleVisible = !!value;
}

export function setCrunchyrollModuleVisible(value) {
    crunchyrollModuleVisible = !!value;
}

export function setVolumeModuleVisible(value) {
    volumeModuleVisible = !!value;
}

export function setVscModuleVisible(value) {
    vscModuleVisible = !!value;
}

export function setGlobalMaxRetries(value) {
    globalMaxRetries = Number(value);
}

export function setGlobalInitialDelayMs(value) {
    globalInitialDelayMs = Number(value);
}

export function setGlobalMaxDelayMs(value) {
    globalMaxDelayMs = Number(value);
}

// --- Persistence Functions ---
export async function saveGlobalState() {
    try {
        const stateToSave = {
            [CoreConstants.RATE_LIMIT_COOL_DOWN_UNTIL_KEY]: rateLimitCoolDownUntil,
            [CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY]: globalMasterSwitchEnabled,
            [CoreConstants.FAB_MODULE_ENABLED_KEY]: fabModuleEnabled,
            [CoreConstants.YOUTUBE_MODULE_ENABLED_KEY]: youTubeModuleEnabled,
            [CoreConstants.X_MODULE_ENABLED_KEY]: xModuleEnabled,
            [CoreConstants.CRUNCHYROLL_MODULE_ENABLED_KEY]: crunchyrollModuleEnabled,
            [CoreConstants.VOLUME_MODULE_ENABLED_KEY]: volumeModuleEnabled,
            [CoreConstants.VSC_MODULE_ENABLED_KEY]: vscModuleEnabled,
            [CoreConstants.FAB_MODULE_VISIBLE_KEY]: fabModuleVisible,
            [CoreConstants.YOUTUBE_MODULE_VISIBLE_KEY]: youTubeModuleVisible,
            [CoreConstants.X_MODULE_VISIBLE_KEY]: xModuleVisible,
            [CoreConstants.CRUNCHYROLL_MODULE_VISIBLE_KEY]: crunchyrollModuleVisible,
            [CoreConstants.VOLUME_MODULE_VISIBLE_KEY]: volumeModuleVisible,
            [CoreConstants.VSC_MODULE_VISIBLE_KEY]: vscModuleVisible,
            [CoreConstants.GLOBAL_MAX_RETRIES_KEY]: globalMaxRetries,
            [CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY]: globalInitialDelayMs,
            [CoreConstants.GLOBAL_MAX_DELAY_MS_KEY]: globalMaxDelayMs,
        };
        await saveStateToStorage(stateToSave);
    } catch (error) {
        console.error("AppState: Error saving global state:", error);
    }
}

export async function loadGlobalState() {
    try {
        console.log("AppState: Attempting to load global app state...");
        const loadedState = await loadStateFromStorage(APP_STATE_DEFAULTS);
        
        rateLimitCoolDownUntil = loadedState[CoreConstants.RATE_LIMIT_COOL_DOWN_UNTIL_KEY];
        globalMasterSwitchEnabled = loadedState[CoreConstants.GLOBAL_MASTER_SWITCH_ENABLED_KEY];
        fabModuleEnabled = loadedState[CoreConstants.FAB_MODULE_ENABLED_KEY];
        youTubeModuleEnabled = loadedState[CoreConstants.YOUTUBE_MODULE_ENABLED_KEY];
        xModuleEnabled = loadedState[CoreConstants.X_MODULE_ENABLED_KEY];
        crunchyrollModuleEnabled = loadedState[CoreConstants.CRUNCHYROLL_MODULE_ENABLED_KEY];
        volumeModuleEnabled = loadedState[CoreConstants.VOLUME_MODULE_ENABLED_KEY];
        vscModuleEnabled = loadedState[CoreConstants.VSC_MODULE_ENABLED_KEY];
        fabModuleVisible = loadedState[CoreConstants.FAB_MODULE_VISIBLE_KEY];
        youTubeModuleVisible = loadedState[CoreConstants.YOUTUBE_MODULE_VISIBLE_KEY];
        xModuleVisible = loadedState[CoreConstants.X_MODULE_VISIBLE_KEY];
        crunchyrollModuleVisible = loadedState[CoreConstants.CRUNCHYROLL_MODULE_VISIBLE_KEY];
        volumeModuleVisible = loadedState[CoreConstants.VOLUME_MODULE_VISIBLE_KEY];
        vscModuleVisible = loadedState[CoreConstants.VSC_MODULE_VISIBLE_KEY];
        globalMaxRetries = loadedState[CoreConstants.GLOBAL_MAX_RETRIES_KEY];
        globalInitialDelayMs = loadedState[CoreConstants.GLOBAL_INITIAL_DELAY_MS_KEY];
        globalMaxDelayMs = loadedState[CoreConstants.GLOBAL_MAX_DELAY_MS_KEY];

        console.log("AppState: Global state loaded.", {
            globalMasterSwitchEnabled,
            fabModuleEnabled,
            youTubeModuleEnabled,
            xModuleEnabled,
            crunchyrollModuleEnabled,
            volumeModuleEnabled,
            vscModuleEnabled,
            rateLimitCoolDownUntil: rateLimitCoolDownUntil > 0 ? new Date(rateLimitCoolDownUntil).toISOString() : "Not set",
            globalMaxRetries,
            globalInitialDelayMs,
            globalMaxDelayMs
        });
    } catch (error) {
        console.error("AppState: Error loading global state:", error);
    }
}