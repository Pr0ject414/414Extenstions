// D:\Dev\X414\src\bridge\XHostCoordinator.js
// Native Host Coordinator for X414 on Android Pixel
// Bridges WebView runtime messages, AsyncStorage, Nostr Friends Sync, Location Cache/API, and Video Downloads
import './cryptoPolyfill.js';
import { XLocationApiClient } from '../shared/xLocationApi.js';
import { XLocationCacheManager } from '../shared/xLocationCache.js';
import { XCloudCacheClient } from '../shared/xCloudCache.js';
import { XFriendsSyncManager, SELF_SYNC_PREF_KEYS } from '../shared/xFriendsSync.js';
import { FRIEND_SYNC_CONFIG } from '../shared/xLocationConstants.js';

const STORAGE_PREFIX = '@x414_store:';

export const DEFAULT_X414_SETTINGS = {
    isGlobalMasterSwitchEnabled: true,
    isXModuleEnabled: true,
    isXLocationEnabled: true,
    isXHideAdsEnabled: true,
    isXFriendsSyncEnabled: true,
    isXAlwaysMuteEnabled: false,
    isXNotificationsEnabled: true,
    xVolumeLevel: 1.0,
    blockedCountries: [],
    blockedDeviceRegions: [],
    blockedNameFlags: []
};

export class XHostStorageAdapter {
    constructor(asyncStorage = null) {
        this.asyncStorage = asyncStorage;
        this.memoryCache = { ...DEFAULT_X414_SETTINGS };
        this.listeners = new Set();
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return this.memoryCache;
        if (this.asyncStorage && typeof this.asyncStorage.getAllKeys === 'function') {
            try {
                const allKeys = await this.asyncStorage.getAllKeys();
                const ourKeys = (allKeys || []).filter(k => k.startsWith(STORAGE_PREFIX));
                if (ourKeys.length > 0) {
                    const pairs = await this.asyncStorage.multiGet(ourKeys);
                    for (const [fullKey, rawVal] of pairs) {
                        const shortKey = fullKey.slice(STORAGE_PREFIX.length);
                        if (rawVal !== null && rawVal !== undefined) {
                            try {
                                this.memoryCache[shortKey] = JSON.parse(rawVal);
                            } catch (e) {
                                this.memoryCache[shortKey] = rawVal;
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('XHostStorageAdapter: Failed to hydrate from AsyncStorage', err);
            }
        }
        this.initialized = true;
        return { ...this.memoryCache };
    }

    getSnapshot() {
        return { ...this.memoryCache };
    }

    async get(keys, callback) {
        await this.init();
        const result = {};
        if (!keys) {
            Object.assign(result, this.memoryCache);
        } else if (typeof keys === 'string') {
            if (keys in this.memoryCache) result[keys] = this.memoryCache[keys];
        } else if (Array.isArray(keys)) {
            for (const k of keys) {
                if (k in this.memoryCache) result[k] = this.memoryCache[k];
            }
        } else if (typeof keys === 'object') {
            for (const [k, defVal] of Object.entries(keys)) {
                result[k] = (k in this.memoryCache) ? this.memoryCache[k] : defVal;
            }
        }
        if (typeof callback === 'function') {
            try { callback(result); } catch (e) {}
        }
        return result;
    }

    async set(items, callback) {
        await this.init();
        if (!items || typeof items !== 'object') {
            if (typeof callback === 'function') callback();
            return;
        }
        const changes = {};
        const pairsToSave = [];
        for (const [k, v] of Object.entries(items)) {
            const oldVal = this.memoryCache[k];
            this.memoryCache[k] = v;
            changes[k] = { oldValue: oldVal, newValue: v };
            pairsToSave.push([`${STORAGE_PREFIX}${k}`, JSON.stringify(v)]);
        }

        if (this.asyncStorage && pairsToSave.length > 0) {
            try {
                if (typeof this.asyncStorage.multiSet === 'function') {
                    await this.asyncStorage.multiSet(pairsToSave);
                } else if (typeof this.asyncStorage.setItem === 'function') {
                    for (const [fullK, strV] of pairsToSave) {
                        await this.asyncStorage.setItem(fullK, strV);
                    }
                }
            } catch (err) {
                console.warn('XHostStorageAdapter: Failed to persist to AsyncStorage', err);
            }
        }

        for (const fn of this.listeners) {
            try { fn(changes, 'local'); } catch (e) {}
        }
        if (typeof callback === 'function') {
            try { callback(); } catch (e) {}
        }
    }

    async remove(keys, callback) {
        await this.init();
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        const fullKeys = [];
        for (const k of list) {
            if (k in this.memoryCache) {
                const oldVal = this.memoryCache[k];
                delete this.memoryCache[k];
                changes[k] = { oldValue: oldVal, newValue: undefined };
                fullKeys.push(`${STORAGE_PREFIX}${k}`);
            }
        }

        if (this.asyncStorage && fullKeys.length > 0) {
            try {
                if (typeof this.asyncStorage.multiRemove === 'function') {
                    await this.asyncStorage.multiRemove(fullKeys);
                } else if (typeof this.asyncStorage.removeItem === 'function') {
                    for (const fullK of fullKeys) {
                        await this.asyncStorage.removeItem(fullK);
                    }
                }
            } catch (err) {}
        }

        for (const fn of this.listeners) {
            try { fn(changes, 'local'); } catch (e) {}
        }
        if (typeof callback === 'function') {
            try { callback(); } catch (e) {}
        }
    }

    addChangeListener(fn) {
        if (typeof fn === 'function') this.listeners.add(fn);
    }

    removeChangeListener(fn) {
        this.listeners.delete(fn);
    }
}

export class XHostCoordinator {
    constructor(options = {}) {
        this.storageAdapter = options.storageAdapter || new XHostStorageAdapter(options.asyncStorage || null);
        this.sendToWebView = options.sendToWebView || (() => {});
        this.onOpenSettings = options.onOpenSettings || (() => {});
        this.onDownloadResult = options.onDownloadResult || (() => {});
        this.onNotification = options.onNotification || null;
        this.videoDownloader = options.videoDownloader || null;

        this.installGlobalChromeEnvironment();

        this.locationCache = options.locationCache || new XLocationCacheManager();
        this.apiClient = options.apiClient || new XLocationApiClient();
        this.cloudCache = options.cloudCache || new XCloudCacheClient();
        this.friendsSync = options.friendsSync || new XFriendsSyncManager({
            relays: options.relays,
            webSocketFactory: options.webSocketFactory,
            fetchFn: options.fetchFn,
            onNotification: async (notif) => {
                await this.handleSyncNotifications(notif);
            }
        });

        this.storageAdapter.addChangeListener((changes, areaName) => {
            if (areaName !== 'local' || !changes) return;
            // Forward storage changes to WebView
            this.sendToWebView({
                type: 'X_STORAGE_CHANGED',
                changes
            });
            // Trigger self-sync flush if user modified blocklists/preferences locally
            const hasPrefChange = SELF_SYNC_PREF_KEYS.some(key => Object.prototype.hasOwnProperty.call(changes, key));
            if (hasPrefChange && this.friendsSync && !this.friendsSync.isApplyingRemotePrefs) {
                this.friendsSync.scheduleSnapshotFlush();
            }
        });

        this.initialized = false;
    }

    installGlobalChromeEnvironment() {
        const self = this;
        globalThis.chrome = {
            runtime: {
                id: 'x414-native-host',
                lastError: null
            },
            cookies: {
                get: async (details, cb) => {
                    const csrf = self.apiClient?.headers?.['x-csrf-token'] || null;
                    const cookie = csrf ? { name: details?.name || 'ct0', value: csrf } : null;
                    if (typeof cb === 'function') {
                        try { cb(cookie); } catch (e) {}
                    }
                    return cookie;
                }
            },
            storage: {
                local: {
                    get: (keys, cb) => self.storageAdapter.get(keys, cb),
                    set: (items, cb) => self.storageAdapter.set(items, cb),
                    remove: (keys, cb) => self.storageAdapter.remove(keys, cb)
                },
                onChanged: {
                    addListener: (fn) => self.storageAdapter.addChangeListener(fn),
                    removeListener: (fn) => self.storageAdapter.removeChangeListener(fn)
                }
            },
            tabs: {
                query: (queryInfo, cb) => {
                    if (typeof cb === 'function') cb([{ id: 1, url: 'https://x.com/home' }]);
                },
                sendMessage: async (tabId, message) => {
                    self.sendToWebView({
                        type: 'X_RUNTIME_BROADCAST',
                        message
                    });
                    return {};
                }
            }
        };
    }

    async init() {
        if (this.initialized) return;
        this.installGlobalChromeEnvironment();
        await this.storageAdapter.init();
        await this.locationCache.init();
        await this.apiClient.loadHeadersFromStorage();
        await this.friendsSync.init();
        if (!this.friendsSync.state?.preferencesUpdatedAt && !this.friendsSync.lastKnownPrefsJson) {
            const defaultPrefs = {};
            for (const key of SELF_SYNC_PREF_KEYS) {
                if (Object.prototype.hasOwnProperty.call(DEFAULT_X414_SETTINGS, key)) {
                    defaultPrefs[key] = DEFAULT_X414_SETTINGS[key];
                }
            }
            this.friendsSync.lastKnownPrefsJson = JSON.stringify(defaultPrefs);
        }
        this.initialized = true;
    }

    async handleSyncNotifications(notif) {
        if (!notif) return;
        const stored = await this.storageAdapter.get(['isXNotificationsEnabled']);
        if (stored.isXNotificationsEnabled === false) return;

        // Hydrate any forced posts missing author/text metadata before dispatching Android notification
        if (Array.isArray(notif.newForcedPosts) && notif.newForcedPosts.length > 0 && this.friendsSync) {
            const missingIds = notif.newForcedPosts
                .filter(p => p && p.tweetId && !p.meta?.text)
                .map(p => String(p.tweetId));
            if (missingIds.length > 0 && typeof this.friendsSync.hydrateTweets === 'function') {
                try {
                    const hydrateRes = await this.friendsSync.hydrateTweets(missingIds);
                    const hydratedMap = hydrateRes?.hydrated || {};
                    for (const item of notif.newForcedPosts) {
                        if (item && item.tweetId && !item.meta?.text && hydratedMap[item.tweetId]) {
                            item.meta = hydratedMap[item.tweetId];
                        }
                    }
                } catch (e) {}
            }
        }

        if (typeof this.onNotification === 'function') {
            await this.onNotification(notif);
        }
    }

    async handleRegularXNotifications(payload = {}) {
        if (!payload || typeof payload !== 'object') return { notified: 0 };
        const stored = await this.storageAdapter.get(['isXNotificationsEnabled', 'xNotifTracking']);
        if (stored.isXNotificationsEnabled === false) return { notified: 0 };

        const prevTracking = (stored.xNotifTracking && typeof stored.xNotifTracking === 'object')
            ? stored.xNotifTracking
            : { lastUnreadCount: 0, lastDmCount: 0, recentPushKeys: {} };

        const tracking = {
            lastUnreadCount: Number(prevTracking.lastUnreadCount || 0),
            lastDmCount: Number(prevTracking.lastDmCount || 0),
            recentPushKeys: { ...(prevTracking.recentPushKeys || {}) }
        };

        const now = Date.now();
        // Prune push dedup keys older than 10 minutes
        for (const [k, ts] of Object.entries(tracking.recentPushKeys)) {
            if (now - Number(ts || 0) > 10 * 60 * 1000) {
                delete tracking.recentPushKeys[k];
            }
        }

        const newXNotifications = [];
        let trackingChanged = false;

        // 1. Direct Web Notification / ServiceWorker showNotification event from X
        if (payload.webPushNotification && typeof payload.webPushNotification === 'object') {
            const wp = payload.webPushNotification;
            const title = String(wp.title || '🔔 New X Notification').trim();
            const body = String(wp.body || 'Tap to view on X').trim();
            const dedupKey = `${title}|${body}`;
            if (!tracking.recentPushKeys[dedupKey]) {
                tracking.recentPushKeys[dedupKey] = now;
                trackingChanged = true;
                newXNotifications.push({
                    kind: 'x_web_push',
                    title: title.startsWith('🔔') ? title : `🔔 ${title}`,
                    body,
                    url: wp.url || 'https://x.com/notifications'
                });
            }
        }

        // 2. Unread X Notifications count (from /i/api/2/badge_count/badge_count.json or DOM nav badge)
        if (typeof payload.unreadNotificationsCount === 'number' && !Number.isNaN(payload.unreadNotificationsCount)) {
            const count = Math.max(0, Math.floor(payload.unreadNotificationsCount));
            if (count === 0) {
                if (tracking.lastUnreadCount !== 0) {
                    tracking.lastUnreadCount = 0;
                    trackingChanged = true;
                }
            } else if (count > tracking.lastUnreadCount) {
                const delta = count - tracking.lastUnreadCount;
                tracking.lastUnreadCount = count;
                trackingChanged = true;

                if (newXNotifications.length === 0) {
                    const preview = payload.latestPreviewText
                        ? String(payload.latestPreviewText).trim()
                        : '';
                    newXNotifications.push({
                        kind: 'x_notification',
                        title: count === 1 ? '🔔 1 New X Notification' : `🔔 ${count} Unread X Notifications`,
                        body: preview || (delta === 1
                            ? 'New mention, reply, or activity on X — tap to view'
                            : `${delta} new notifications on X — tap to view`),
                        url: 'https://x.com/notifications',
                        count
                    });
                }
            } else if (count < tracking.lastUnreadCount) {
                tracking.lastUnreadCount = count;
                trackingChanged = true;
            }
        }

        // 3. Unread Direct Messages count
        if (typeof payload.unreadDmCount === 'number' && !Number.isNaN(payload.unreadDmCount)) {
            const dmCount = Math.max(0, Math.floor(payload.unreadDmCount));
            if (dmCount === 0) {
                if (tracking.lastDmCount !== 0) {
                    tracking.lastDmCount = 0;
                    trackingChanged = true;
                }
            } else if (dmCount > tracking.lastDmCount) {
                const delta = dmCount - tracking.lastDmCount;
                tracking.lastDmCount = dmCount;
                trackingChanged = true;

                newXNotifications.push({
                    kind: 'x_dm',
                    title: dmCount === 1 ? '💬 1 New Direct Message on X' : `💬 ${dmCount} Unread Direct Messages on X`,
                    body: delta === 1
                        ? 'You received a new Direct Message on X — tap to open'
                        : `${delta} new Direct Messages on X — tap to open`,
                    url: 'https://x.com/messages',
                    count: dmCount
                });
            } else if (dmCount < tracking.lastDmCount) {
                tracking.lastDmCount = dmCount;
                trackingChanged = true;
            }
        }

        if (trackingChanged) {
            await this.storageAdapter.set({ xNotifTracking: tracking });
        }

        if (newXNotifications.length > 0 && typeof this.onNotification === 'function') {
            await this.onNotification({ newXNotifications });
        }

        return { notified: newXNotifications.length };
    }

    async handleWebViewPacket(rawPacket) {
        await this.init();
        let packet = rawPacket;
        if (typeof rawPacket === 'string') {
            try {
                packet = JSON.parse(rawPacket);
            } catch (e) {
                return null;
            }
        }
        if (!packet || typeof packet !== 'object') return null;

        if (packet.type === 'X_STORAGE_SET' && packet.payload) {
            await this.storageAdapter.set(packet.payload);
            return { ok: true };
        }
        if (packet.type === 'X_STORAGE_REMOVE' && packet.payload) {
            await this.storageAdapter.remove(packet.payload);
            return { ok: true };
        }
        if (packet.type === 'X_RUNTIME_MESSAGE' && packet.payload) {
            const response = await this.dispatchRuntimeMessage(packet.payload);
            if (packet.requestId) {
                this.sendToWebView({
                    type: 'X_RUNTIME_RESPONSE',
                    requestId: packet.requestId,
                    response
                });
            }
            return response;
        }
        return null;
    }

    async dispatchRuntimeMessage(request) {
        await this.init();
        this.installGlobalChromeEnvironment();
        if (!request || !request.action) {
            return { success: false, error: 'Missing action' };
        }

        const { action, payload } = request;

        switch (action) {
            case 'X_OPEN_NATIVE_SETTINGS': {
                this.onOpenSettings();
                return { success: true };
            }

            case 'X_SYNC_REGULAR_NOTIFICATIONS': {
                try {
                    const res = await this.handleRegularXNotifications(payload || {});
                    return { success: true, ...res };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_SEND_TEST_NOTIFICATION': {
                try {
                    if (typeof this.onNotification === 'function') {
                        await this.onNotification({
                            newXNotifications: [
                                {
                                    kind: 'x_test',
                                    title: '⚡ X414 Pixel Notifications Active',
                                    body: 'Forced friend posts (⚡), friend invites, and regular X notifications & DMs are working!',
                                    url: 'https://x.com/notifications'
                                }
                            ]
                        });
                    }
                    return { success: true };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_START_DOWNLOAD': {
                if (!this.videoDownloader) {
                    return { success: false, error: 'VideoDownloader not configured' };
                }
                try {
                    const res = await this.videoDownloader.downloadVideo(payload || {});
                    this.onDownloadResult(res);
                    return res;
                } catch (err) {
                    const failRes = { success: false, error: err.message };
                    this.onDownloadResult(failRes);
                    return failRes;
                }
            }

            case 'X_CAPTURE_HEADERS': {
                if (payload && payload.headers) {
                    this.apiClient.setHeaders(payload.headers);
                    return { success: true };
                }
                return { success: false, error: 'No headers provided' };
            }

            case 'X_FETCH_USER_INFO': {
                const screenName = payload?.screenName;
                if (!screenName) {
                    return { success: false, error: 'No screenName provided' };
                }
                try {
                    const cached = await this.locationCache.get(screenName);
                    if (cached) {
                        return { success: true, data: cached, fromCache: true };
                    }
                    const cloudLookupFn = typeof this.cloudCache?.lookup === 'function'
                        ? this.cloudCache.lookup.bind(this.cloudCache)
                        : (typeof this.cloudCache?.get === 'function' ? this.cloudCache.get.bind(this.cloudCache) : null);
                    const cloudHit = cloudLookupFn ? await cloudLookupFn(screenName) : null;
                    if (cloudHit) {
                        await this.locationCache.set(screenName, cloudHit);
                        return { success: true, data: cloudHit, fromCache: true, fromCloud: true };
                    }
                    const apiFetchFn = typeof this.apiClient?.fetchUserInfo === 'function'
                        ? this.apiClient.fetchUserInfo.bind(this.apiClient)
                        : (typeof this.apiClient?.enqueueLookup === 'function' ? this.apiClient.enqueueLookup.bind(this.apiClient) : null);
                    const freshData = apiFetchFn ? await apiFetchFn(screenName) : null;
                    if (freshData) {
                        await this.locationCache.set(screenName, freshData);
                        if (typeof this.cloudCache?.contribute === 'function') {
                            this.cloudCache.contribute(screenName, freshData);
                        } else if (typeof this.cloudCache?.put === 'function') {
                            Promise.resolve(this.cloudCache.put(screenName, freshData)).catch(() => {});
                        }
                        return { success: true, data: freshData, fromCache: false };
                    }
                    return { success: false, error: 'Location lookup returned null or rate limited' };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_GET_LOCATION_STATS': {
                const stats = await this.locationCache.getStats();
                return { success: true, stats };
            }

            case 'X_CLEAR_LOCATION_CACHE': {
                await this.locationCache.clear();
                return { success: true };
            }

            case 'X_FRIENDS_GET_STATE': {
                await this.friendsSync.init();
                return { success: true, state: this.friendsSync.getPublicState() };
            }

            case 'X_FRIENDS_SET_IDENTITY': {
                try {
                    const state = await this.friendsSync.setIdentity(
                        payload?.email,
                        payload?.displayName,
                        payload?.passphrase
                    );
                    return { success: true, state };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_FRIENDS_ADD': {
                try {
                    const state = await this.friendsSync.addFriend(payload?.email, payload?.displayName);
                    return { success: true, state };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_FRIENDS_ACCEPT': {
                try {
                    const state = await this.friendsSync.acceptFriend(payload?.email);
                    return { success: true, state };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_FRIENDS_REMOVE': {
                try {
                    const state = await this.friendsSync.removeFriend(payload?.email);
                    return { success: true, state };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_FRIENDS_FORCE_SYNC': {
                try {
                    const state = await this.friendsSync.syncWithRelays();
                    return { success: true, state };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_MARK_TWEETS_SEEN':
            case 'X_FRIENDS_MARK_SEEN': {
                try {
                    const res = await this.friendsSync.markTweetsSeen(
                        payload?.tweetIds || [],
                        payload?.tweetMetaMap || {}
                    );
                    return { success: true, ...res };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_CHECK_TWEETS_SEEN':
            case 'X_FRIENDS_CHECK_SEEN': {
                await this.friendsSync.init();
                const seenMap = this.friendsSync.checkTweetsSeen(payload?.tweetIds || []);
                const syncStatus = this.friendsSync.checkTweetsSyncStatus(payload?.tweetIds || []);
                return {
                    success: true,
                    seenMap,
                    forcedMap: syncStatus.forcedMap,
                    myForcedIds: syncStatus.myForcedIds
                };
            }

            case 'X_FORCE_TWEET_TO_FRIENDS':
            case 'X_FRIENDS_FORCE_TWEET': {
                try {
                    const res = await this.friendsSync.forceTweetToFriends(payload?.tweetId, payload?.meta);
                    return { success: true, ...res };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_UNFORCE_TWEET':
            case 'X_FRIENDS_UNFORCE_TWEET': {
                try {
                    const res = await this.friendsSync.unforceTweet(payload?.tweetId);
                    return { success: true, ...res };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_DISMISS_FORCED_TWEET':
            case 'X_FRIENDS_DISMISS_FORCED': {
                try {
                    const res = await this.friendsSync.dismissForcedTweet(payload?.tweetId);
                    return { success: true, ...res };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            case 'X_GET_FRIENDS_TIMELINE':
            case 'X_FRIENDS_GET_TIMELINE': {
                await this.friendsSync.init();
                const minAutoSyncInterval = FRIEND_SYNC_CONFIG.MIN_AUTO_SYNC_INTERVAL_MS || 30000;
                if (
                    this.friendsSync.state?.identity &&
                    !this.friendsSync.isSyncing &&
                    Date.now() - (this.friendsSync.lastSyncTime || 0) >= minAutoSyncInterval
                ) {
                    this.friendsSync.syncWithRelays().catch(() => {});
                }
                const data = this.friendsSync.getFriendsTimelineData();
                return { success: true, ...data, data };
            }

            case 'X_HYDRATE_TWEETS':
            case 'X_FRIENDS_HYDRATE_TWEETS': {
                try {
                    const res = await this.friendsSync.hydrateTweets(payload?.tweetIds || []);
                    return { success: true, ...res };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }

            default:
                return { success: false, error: `Unknown action: ${action}` };
        }
    }
}
