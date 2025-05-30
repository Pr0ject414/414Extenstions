// KylesChromeExtensions/fab_extension/background_modules/fabConstants.js

// Settings Keys for FAB features (from original background.js, used by popup/content scripts)
export const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled'; // Note: Suffix _BG removed for clarity if these are the keys used by frontend/storage directly
export const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
export const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';

// Storage Keys for FAB Queues and State
export const FAB_URL_QUEUE_KEY = 'fabUrlQueue';
export const FAB_QUEUED_URL_SET_KEY = 'fabQueuedUrlSet';
export const FAB_VERIFICATION_QUEUE_KEY = 'fabVerificationQueue';
export const FAB_AUTO_PROCESSING_SUSPENDED_KEY = 'fabAutoProcessingSuspended';

// FAB Alarm Names
export const FAB_VERIFICATION_ALARM_NAME = 'fabVerificationAlarm';
export const FAB_QUEUE_PROCESS_RETRY_ALARM_NAME = 'fabQueueProcessRetryAlarm'; // Renamed from QUEUE_PROCESS_RETRY_ALARM_NAME for clarity
export const FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX = "_resumeVerification"; // Made more specific

// FAB Processing Limits
export const MAX_CONCURRENT_FAB_TABS = 2;

// FAB Specific Delays
export const DELAY_BETWEEN_VERIFICATION_CHECKS_MS = 5000; // 5 seconds
export const DELAY_BETWEEN_TAB_OPEN_MS = 2000; // 2 seconds