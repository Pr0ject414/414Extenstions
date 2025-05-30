// KylesChromeExtensions/shared_modules/coreConstants.js

// Master on/off switch for the entire extension
export const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';

// Master On/Off Switch for the FAB Module (managed globally as it affects global listeners)
export const FAB_MODULE_ENABLED_KEY = 'isFabModuleEnabled';

// Global rate limiting
export const RATE_LIMIT_COOL_DOWN_UNTIL_KEY = 'rateLimitCoolDownUntil';

// Retry and Backoff Parameters (for shared fetchUtils.js)
export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_INITIAL_DELAY_MS = 30000; // 30 seconds
export const MAX_DELAY_MS = 5 * 60 * 1000; // 5 minutes