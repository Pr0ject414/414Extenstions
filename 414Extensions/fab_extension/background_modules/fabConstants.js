// KylesChromeExtensions/fab_extension/background_modules/fabConstants.js

// Settings Keys for FAB features (from original background.js, used by popup/content scripts)
export const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled';
export const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
export const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';
export const FAB_QUEUE_PROCESSING_ENABLED_KEY = 'isFabQueueProcessingEnabled';

// Storage Keys for FAB Queues and State
export const FAB_URL_QUEUE_KEY = 'fabUrlQueue';
export const FAB_QUEUED_URL_SET_KEY = 'fabQueuedUrlSet';
export const FAB_VERIFICATION_QUEUE_KEY = 'fabVerificationQueue';
export const FAB_AUTO_PROCESSING_SUSPENDED_KEY = 'fabAutoProcessingSuspended';
export const FAB_SHOW_FREE_ONLY_KEY = 'isFabShowFreeOnlyEnabled';

// FAB Alarm Names
export const FAB_VERIFICATION_ALARM_NAME = 'fabVerificationAlarm';
export const FAB_QUEUE_PROCESS_RETRY_ALARM_NAME = 'fabQueueProcessRetryAlarm';
export const FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX = "_resumeVerification";
export const FAB_RATE_LIMIT_EXPIRY_ALARM_NAME = 'fabRateLimitExpiryAlarm';

// Configurable FAB Processing Limits and Delays (values loaded from storage)
export const FAB_MAX_CONCURRENT_TABS_KEY = 'maxConcurrentFabTabs';
export const FAB_DELAY_BETWEEN_VERIFICATION_CHECKS_MS_KEY = 'delayBetweenVerificationChecksMs';
export const FAB_DELAY_BETWEEN_TAB_OPEN_MS_KEY = 'delayBetweenTabOpenMs';

// New Configurable settings for fabBrowsePage.js behavior
export const FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY = 'fabBrowsePageScanIntervalMs';
export const FAB_FREE_ITEM_GRACE_CYCLES_KEY = 'fabFreeItemGraceCycles';