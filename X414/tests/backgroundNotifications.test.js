// D:\Dev\X414\tests\backgroundNotifications.test.js
import { jest } from '@jest/globals';
import {
    buildNotificationsFromSyncDiff,
    dispatchLocalNotifications,
    ensureNotificationPermissions,
    executeBackgroundSyncPass,
    X414_NOTIFICATION_CHANNEL_ID,
    X414_REGULAR_X_CHANNEL_ID
} from '../src/services/BackgroundSyncTask.js';
import { XHostCoordinator } from '../src/bridge/XHostCoordinator.js';

describe('BackgroundSyncTask & Pixel Notifications', () => {
    test('buildNotificationsFromSyncDiff and dispatchLocalNotifications should request runtime permissions and schedule notifications for forced posts and invites', async () => {
        const syncDiff = {
            newForcedPosts: [
                {
                    tweetId: '1850000000000000999',
                    forcedBy: ['Alice (alice@example.com)'],
                    meta: {
                        text: 'Breaking news from Alice!',
                        permalink: 'https://x.com/alice/status/1850000000000000999'
                    }
                }
            ],
            newInvites: [
                {
                    email: 'charlie@example.com',
                    displayName: 'Charlie'
                }
            ]
        };

        const built = buildNotificationsFromSyncDiff(syncDiff);
        expect(built).toHaveLength(2);
        expect(built[0].title).toContain('⚡ Forced by Alice (alice@example.com)');
        expect(built[0].body).toBe('Breaking news from Alice!');
        expect(built[1].title).toContain('👋 New X414 Friend Invite');
        expect(built[1].body).toContain('Charlie (charlie@example.com)');

        const mockNotificationsApi = {
            AndroidImportance: { HIGH: 4 },
            getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined' })),
            requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
            setNotificationChannelAsync: jest.fn(async () => {}),
            scheduleNotificationAsync: jest.fn(async () => 'notif_id')
        };

        const res = await dispatchLocalNotifications(syncDiff, mockNotificationsApi);
        expect(res.sent).toBe(2);
        expect(mockNotificationsApi.getPermissionsAsync).toHaveBeenCalledTimes(1);
        expect(mockNotificationsApi.requestPermissionsAsync).toHaveBeenCalledTimes(1);
        expect(mockNotificationsApi.setNotificationChannelAsync).toHaveBeenCalledWith(
            X414_NOTIFICATION_CHANNEL_ID,
            expect.objectContaining({ importance: 4 })
        );
        expect(mockNotificationsApi.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });

    test('ensureNotificationPermissions and dispatchLocalNotifications should respect denied permissions and executeBackgroundSyncPass should run headlessly when App is unmounted', async () => {
        const deniedNotificationsApi = {
            getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied' })),
            requestPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied' })),
            scheduleNotificationAsync: jest.fn(async () => 'notif_id')
        };

        const perm = await ensureNotificationPermissions(deniedNotificationsApi);
        expect(perm.granted).toBe(false);

        const skipped = await dispatchLocalNotifications({
            newForcedPosts: [{ tweetId: '123', forcedBy: ['Bob'] }]
        }, deniedNotificationsApi);
        expect(skipped.sent).toBe(0);
        expect(skipped.permissionDenied).toBe(true);
        expect(deniedNotificationsApi.scheduleNotificationAsync).not.toHaveBeenCalled();

        // Headless execution when getCoordinatorFn returns null (App unmounted in background)
        const result = await executeBackgroundSyncPass(async () => null, {
            relays: [],
            BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 }
        });
        expect(result).toBe(1);
    });

    test('XHostCoordinator should dispatch regular X notifications (unread bell count, DMs, Web Push) and test notifications', async () => {
        const capturedDiffs = [];
        const coordinator = new XHostCoordinator({
            relays: [],
            onNotification: async (diff) => {
                capturedDiffs.push(diff);
            }
        });
        await coordinator.init();

        // 1. Incoming unread X notification + DM count
        const res1 = await coordinator.dispatchRuntimeMessage({
            action: 'X_SYNC_REGULAR_NOTIFICATIONS',
            payload: {
                unreadNotificationsCount: 2,
                unreadDmCount: 1,
                latestPreviewText: '@alice replied to your post'
            }
        });
        expect(res1.success).toBe(true);
        expect(res1.notified).toBe(2);
        expect(capturedDiffs).toHaveLength(1);

        const built = buildNotificationsFromSyncDiff(capturedDiffs[0]);
        expect(built).toHaveLength(2);
        expect(built[0].channelId).toBe(X414_REGULAR_X_CHANNEL_ID);
        expect(built[0].title).toBe('🔔 2 Unread X Notifications');
        expect(built[0].body).toBe('@alice replied to your post');
        expect(built[0].data.url).toBe('https://x.com/notifications');
        expect(built[1].title).toBe('💬 1 New Direct Message on X');
        expect(built[1].data.url).toBe('https://x.com/messages');

        // 2. Duplicate poll with same counts should not re-notify
        const res2 = await coordinator.dispatchRuntimeMessage({
            action: 'X_SYNC_REGULAR_NOTIFICATIONS',
            payload: {
                unreadNotificationsCount: 2,
                unreadDmCount: 1
            }
        });
        expect(res2.notified).toBe(0);
        expect(capturedDiffs).toHaveLength(1);

        // 3. Test notification button
        const resTest = await coordinator.dispatchRuntimeMessage({
            action: 'X_SEND_TEST_NOTIFICATION'
        });
        expect(resTest.success).toBe(true);
        expect(capturedDiffs).toHaveLength(2);
        expect(capturedDiffs[1].newXNotifications[0].title).toContain('X414 Pixel Notifications Active');
    });
});
