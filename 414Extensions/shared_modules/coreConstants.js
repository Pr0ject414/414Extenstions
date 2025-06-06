// KylesChromeExtensions/shared_modules/coreConstants.js

// Master on/off switch for the entire extension
export const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';

// Master On/Off Switch for the FAB Module (managed globally as it affects global listeners)
export const FAB_MODULE_ENABLED_KEY = 'isFabModuleEnabled';

// Master On/Off Switch for the YouTube Module
export const YOUTUBE_MODULE_ENABLED_KEY = 'isYouTubeModuleEnabled';

// Global rate limiting
export const RATE_LIMIT_COOL_DOWN_UNTIL_KEY = 'rateLimitCoolDownUntil';

// Configurable global network settings keys (values loaded from storage)
export const GLOBAL_MAX_RETRIES_KEY = 'maxRetries';
export const GLOBAL_INITIAL_DELAY_MS_KEY = 'initialDelayMs';
export const GLOBAL_MAX_DELAY_MS_KEY = 'maxDelayMs';