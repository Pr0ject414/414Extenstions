// D:\Dev\X414\src\services\BackgroundSyncTask.js
// Android Pixel Background Nostr Sync & Local Push Notifications for Forced Posts (⚡), Friend Invites & Regular X Notifications
import '../bridge/cryptoPolyfill.js';

export const X414_BACKGROUND_SYNC_TASK = 'X414_BACKGROUND_NOSTR_SYNC';
export const X414_NOTIFICATION_CHANNEL_ID = 'x414-friends-sync';
export const X414_REGULAR_X_CHANNEL_ID = 'x414-x-notifications';

let notificationHandlerConfigured = false;

export function configureForegroundNotificationHandler(notificationsApi = null) {
    let Notifications = notificationsApi;
    if (!Notifications) {
        try {
            // eslint-disable-next-line global-require
            Notifications = require('expo-notifications');
        } catch (e) {
            return false;
        }
    }
    try {
        if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldShowBanner: true,
                    shouldShowList: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                    priority: Notifications.AndroidNotificationPriority?.MAX
                })
            });
            notificationHandlerConfigured = true;
            return true;
        }
    } catch (e) {}
    return false;
}

configureForegroundNotificationHandler();

export async function ensureAndroidNotificationChannels(notificationsApi = null) {
    let Notifications = notificationsApi;
    if (!Notifications) {
        try {
            // eslint-disable-next-line global-require
            Notifications = require('expo-notifications');
        } catch (e) {
            return false;
        }
    }
    try {
        if (Notifications && typeof Notifications.setNotificationChannelAsync === 'function') {
            const highImportance = Notifications.AndroidImportance?.MAX || Notifications.AndroidImportance?.HIGH || 4;
            await Notifications.setNotificationChannelAsync(X414_NOTIFICATION_CHANNEL_ID, {
                name: 'X414 Friends & Forced Posts',
                importance: highImportance,
                lightColor: '#F59E0B',
                vibrationPattern: [0, 180, 120, 180],
                enableVibrate: true,
                showBadge: true
            });
            await Notifications.setNotificationChannelAsync(X414_REGULAR_X_CHANNEL_ID, {
                name: 'X Notifications & Direct Messages',
                importance: highImportance,
                lightColor: '#1D9BF0',
                vibrationPattern: [0, 140, 100, 140],
                enableVibrate: true,
                showBadge: true
            });
            return true;
        }
    } catch (e) {}
    return false;
}

export function buildNotificationsFromSyncDiff(syncDiff = {}) {
    const notifications = [];
    const newForced = Array.isArray(syncDiff.newForcedPosts) ? syncDiff.newForcedPosts : [];
    const newInvites = Array.isArray(syncDiff.newInvites) ? syncDiff.newInvites : [];
    const newXNotifs = Array.isArray(syncDiff.newXNotifications) ? syncDiff.newXNotifications : [];

    for (const item of newForced) {
        const sender = Array.isArray(item.forcedBy) && item.forcedBy.length > 0
            ? item.forcedBy[0]
            : 'A friend';
        const authorPrefix = item.meta?.screenName ? `@${item.meta.screenName}: ` : '';
        const rawText = item.meta?.text ? `${authorPrefix}${item.meta.text}` : '';
        const snippet = rawText
            ? (rawText.length > 110 ? `${rawText.slice(0, 107)}...` : rawText)
            : `Tap to view forced post #${item.tweetId} in X414`;
        notifications.push({
            title: `⚡ Forced by ${sender}`,
            body: snippet,
            channelId: X414_NOTIFICATION_CHANNEL_ID,
            color: '#F59E0B',
            data: {
                type: 'forced_post',
                tweetId: item.tweetId,
                url: item.meta?.permalink || `https://x.com/i/status/${item.tweetId}`
            }
        });
    }

    for (const invite of newInvites) {
        const senderName = invite.displayName && invite.displayName !== invite.email
            ? `${invite.displayName} (${invite.email})`
            : invite.email;
        notifications.push({
            title: '👋 New X414 Friend Invite',
            body: `${senderName} wants to sync seen & forced posts with you.`,
            channelId: X414_NOTIFICATION_CHANNEL_ID,
            color: '#10B981',
            data: {
                type: 'friend_invite',
                email: invite.email,
                openSettings: true
            }
        });
    }

    for (const xItem of newXNotifs) {
        if (!xItem || (!xItem.title && !xItem.body)) continue;
        notifications.push({
            title: xItem.title || '🔔 New X Notification',
            body: xItem.body || 'Tap to view your notifications on X',
            channelId: X414_REGULAR_X_CHANNEL_ID,
            color: '#1D9BF0',
            data: {
                type: xItem.kind || 'x_notification',
                url: xItem.url || 'https://x.com/notifications'
            }
        });
    }

    return notifications;
}

export async function ensureNotificationPermissions(notificationsApi = null) {
    let Notifications = notificationsApi;
    if (!Notifications) {
        try {
            // eslint-disable-next-line global-require
            Notifications = require('expo-notifications');
        } catch (e) {
            return { granted: false };
        }
    }

    try {
        // On Android 13+, create notification channels first so the OS registers the app's notification capability
        await ensureAndroidNotificationChannels(Notifications);

        if (typeof Notifications.getPermissionsAsync === 'function') {
            const existing = await Notifications.getPermissionsAsync();
            if (existing && (existing.granted || existing.status === 'granted')) {
                return { granted: true, status: 'granted' };
            }
            if (typeof Notifications.requestPermissionsAsync === 'function') {
                const requested = await Notifications.requestPermissionsAsync();
                const granted = Boolean(requested && (requested.granted || requested.status === 'granted'));
                if (granted) {
                    return { granted: true, status: 'granted' };
                }
                // Fallback to React Native PermissionsAndroid for Android 13+ (API 33+) when using real Expo module
                if (!notificationsApi) {
                    try {
                        // eslint-disable-next-line global-require
                        const { Platform, PermissionsAndroid } = require('react-native');
                        if (Platform && Platform.OS === 'android' && Number(Platform.Version) >= 33 && PermissionsAndroid?.PERMISSIONS?.POST_NOTIFICATIONS) {
                            const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
                            if (res === PermissionsAndroid.RESULTS.GRANTED) {
                                return { granted: true, status: 'granted' };
                            }
                        }
                    } catch (e) {}
                }
                return { granted: false, status: requested?.status || 'denied' };
            }
            return { granted: false, status: existing?.status || 'denied' };
        }

        return { granted: true, status: 'granted' };
    } catch (err) {
        return { granted: false, error: err.message };
    }
}

export async function dispatchLocalNotifications(syncDiff, notificationsApi = null) {
    const items = buildNotificationsFromSyncDiff(syncDiff);
    if (items.length === 0) return { sent: 0, items: [] };

    let Notifications = notificationsApi;
    if (!Notifications) {
        try {
            // eslint-disable-next-line global-require
            Notifications = require('expo-notifications');
        } catch (e) {
            return { sent: 0, items };
        }
    }

    try {
        if (!notificationHandlerConfigured || notificationsApi) {
            configureForegroundNotificationHandler(Notifications);
        }

        const perm = await ensureNotificationPermissions(Notifications);
        if (perm && perm.granted === false) {
            return { sent: 0, items, permissionDenied: true };
        }

        await ensureAndroidNotificationChannels(Notifications);

        let sent = 0;
        for (const item of items) {
            const targetChannel = item.channelId || X414_NOTIFICATION_CHANNEL_ID;
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: item.title,
                    body: item.body,
                    data: item.data,
                    color: item.color || '#F59E0B',
                    sound: 'default',
                    priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
                    channelId: targetChannel
                },
                trigger: null
            });
            sent++;
        }
        return { sent, items };
    } catch (err) {
        console.warn('X414 Notifications: Failed to schedule notification', err);
        return { sent: 0, items };
    }
}

let activeCoordinatorGetter = null;

export async function executeBackgroundSyncPass(getCoordinatorFn = activeCoordinatorGetter, options = {}) {
    const BackgroundFetchResult = options.BackgroundFetchResult || {
        NoData: 1,
        NewData: 2,
        Failed: 3
    };

    try {
        let coordinator = typeof getCoordinatorFn === 'function' ? await getCoordinatorFn() : null;
        if (!coordinator) {
            const { XHostCoordinator } = await import('../bridge/XHostCoordinator.js');
            let asyncStorage = options.asyncStorage || null;
            if (!asyncStorage) {
                try {
                    // eslint-disable-next-line global-require
                    const mod = require('@react-native-async-storage/async-storage');
                    asyncStorage = mod?.default || mod;
                } catch (e) {}
            }
            coordinator = new XHostCoordinator({
                asyncStorage,
                relays: options.relays,
                webSocketFactory: options.webSocketFactory,
                onNotification: async (diff) => {
                    await dispatchLocalNotifications(diff, options.notificationsApi || null);
                }
            });
        }

        await coordinator.init();
        const prefs = await coordinator.storageAdapter.get(['isXFriendsSyncEnabled', 'isXNotificationsEnabled']);
        if (prefs.isXFriendsSyncEnabled === false && prefs.isXNotificationsEnabled === false) {
            return BackgroundFetchResult.NoData;
        }
        await coordinator.friendsSync.syncWithRelays();
        const diff = coordinator.friendsSync.lastSyncNotifications;
        const hasNew = Boolean(
            diff && (
                (Array.isArray(diff.newForcedPosts) && diff.newForcedPosts.length > 0) ||
                (Array.isArray(diff.newInvites) && diff.newInvites.length > 0)
            )
        );
        return hasNew ? BackgroundFetchResult.NewData : BackgroundFetchResult.NoData;
    } catch (err) {
        return BackgroundFetchResult.Failed;
    }
}

function tryDefineTaskAtModuleScope() {
    try {
        // eslint-disable-next-line global-require
        const TaskManager = require('expo-task-manager');
        // eslint-disable-next-line global-require
        const BackgroundFetch = require('expo-background-fetch');
        if (TaskManager && typeof TaskManager.isTaskDefined === 'function' && !TaskManager.isTaskDefined(X414_BACKGROUND_SYNC_TASK)) {
            TaskManager.defineTask(X414_BACKGROUND_SYNC_TASK, async () => {
                return executeBackgroundSyncPass(activeCoordinatorGetter, {
                    BackgroundFetchResult: BackgroundFetch?.BackgroundFetchResult
                });
            });
        }
    } catch (e) {
        // Ignore in non-native test environments
    }
}

tryDefineTaskAtModuleScope();

export async function registerBackgroundSyncTask(getCoordinatorFn) {
    if (typeof getCoordinatorFn === 'function') {
        activeCoordinatorGetter = getCoordinatorFn;
    }
    try {
        // eslint-disable-next-line global-require
        const Notifications = require('expo-notifications');
        configureForegroundNotificationHandler(Notifications);
        await ensureNotificationPermissions(Notifications);
    } catch (e) {}

    try {
        // eslint-disable-next-line global-require
        const TaskManager = require('expo-task-manager');
        // eslint-disable-next-line global-require
        const BackgroundFetch = require('expo-background-fetch');

        if (TaskManager && typeof TaskManager.isTaskDefined === 'function' && !TaskManager.isTaskDefined(X414_BACKGROUND_SYNC_TASK)) {
            TaskManager.defineTask(X414_BACKGROUND_SYNC_TASK, async () => {
                return executeBackgroundSyncPass(activeCoordinatorGetter, {
                    BackgroundFetchResult: BackgroundFetch?.BackgroundFetchResult
                });
            });
        }

        if (BackgroundFetch && typeof BackgroundFetch.registerTaskAsync === 'function') {
            await BackgroundFetch.registerTaskAsync(X414_BACKGROUND_SYNC_TASK, {
                minimumInterval: 15 * 60, // 15 minutes
                stopOnTerminate: false,
                startOnBoot: true
            });
        }
        return true;
    } catch (err) {
        // Ignore in test / non-native environments
        return false;
    }
}
