// KylesChromeExtensions/shared_modules/coreConstants.js

// Master on/off switch for the entire extension
export const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';

// Master On/Off Switch for the FAB Module (managed globally as it affects global listeners)
export const FAB_MODULE_ENABLED_KEY = 'isFabModuleEnabled';

// Master On/Off Switch for the YouTube Module
export const YOUTUBE_MODULE_ENABLED_KEY = 'isYouTubeModuleEnabled';

// Master On/Off Switch for the Volume Booster Module
export const VOLUME_MODULE_ENABLED_KEY = 'isVolumeModuleEnabled';

// Master On/Off Switch for the Video Speed Controller Module
export const VSC_MODULE_ENABLED_KEY = 'vsc_is_enabled';

// Master On/Off Switch for the X (Twitter) Module
export const X_MODULE_ENABLED_KEY = 'isXModuleEnabled';
// Specific feature toggle for X
export const X_ALWAYS_MUTE_KEY = 'isXAlwaysMuteEnabled';
// Volume Persistence Key
export const X_VOLUME_LEVEL_KEY = 'xVolumeLevel';
// Location & Device Feature Keys for X
export const X_LOCATION_MODULE_ENABLED_KEY = 'isXLocationEnabled';
export const X_PREFER_DEVICE_FLAG_KEY = 'preferDeviceFlag';
export const X_SHOW_VPN_WARN_KEY = 'showVpnWarn';
export const X_ENABLE_COMMUNITY_CACHE_KEY = 'enableCommunityCache';
export const X_BLOCKED_COUNTRIES_KEY = 'blockedCountries';
export const X_BLOCKED_DEVICE_REGIONS_KEY = 'blockedDeviceRegions';
export const X_FRIENDS_SYNC_ENABLED_KEY = 'isXFriendsSyncEnabled';
export const X_FRIENDS_STATE_KEY = 'x_friends_sync_state_v1';

// Master On/Off Switch for the Crunchyroll Module
export const CRUNCHYROLL_MODULE_ENABLED_KEY = 'isCrunchyrollModuleEnabled';
export const CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY = 'isCrunchyrollAutoCloseEndSlateEnabled';
export const CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY = 'isCrunchyrollHideControlsOnSpeedEnabled';

// Global rate limiting
export const RATE_LIMIT_COOL_DOWN_UNTIL_KEY = 'rateLimitCoolDownUntil';

// Module Visibility Keys
export const VOLUME_MODULE_VISIBLE_KEY = 'isVolumeModuleVisible';
export const VSC_MODULE_VISIBLE_KEY = 'isVscModuleVisible';
export const FAB_MODULE_VISIBLE_KEY = 'isFabModuleVisible';
export const YOUTUBE_MODULE_VISIBLE_KEY = 'isYouTubeModuleVisible';
export const X_MODULE_VISIBLE_KEY = 'isXModuleVisible';
export const CRUNCHYROLL_MODULE_VISIBLE_KEY = 'isCrunchyrollModuleVisible';

// Configurable global network settings keys (values loaded from storage)
export const GLOBAL_MAX_RETRIES_KEY = 'maxRetries';
export const GLOBAL_INITIAL_DELAY_MS_KEY = 'initialDelayMs';
export const GLOBAL_MAX_DELAY_MS_KEY = 'maxDelayMs';