import { jest } from '@jest/globals';
import { webcrypto } from 'crypto';
import { XFriendsSyncManager } from '../../x_extension/xFriendsSync.js';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// In-memory Nostr relay simulator for end-to-end handshake and seen-post sync tests
class MockNostrRelayHub {
    constructor() {
        this.events = new Map(); // `${pubkey}:${kind}:${dTag}` -> event
    }

    createSocket() {
        const hub = this;
        const ws = {
            readyState: 0,
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send(raw) {
                const msg = JSON.parse(raw);
                const type = msg[0];
                if (type === 'EVENT') {
                    const ev = msg[1];
                    const dTag = (ev.tags || []).find(t => t[0] === 'd')?.[1] || '';
                    hub.events.set(`${ev.pubkey}:${ev.kind}:${dTag}`, ev);
                    setTimeout(() => {
                        if (ws.onmessage) {
                            ws.onmessage({ data: JSON.stringify(['OK', ev.id, true, '']) });
                        }
                    }, 5);
                } else if (type === 'REQ') {
                    const subId = msg[1];
                    const filters = msg.slice(2);
                    setTimeout(() => {
                        // Real Nostr relays return matching events newest-first (created_at DESC)
                        const matching = Array.from(hub.events.values())
                            .filter(ev => hub.matchesAnyFilter(ev, filters))
                            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                        for (const ev of matching) {
                            if (ws.onmessage) {
                                ws.onmessage({ data: JSON.stringify(['EVENT', subId, ev]) });
                            }
                        }
                        if (ws.onmessage) {
                            ws.onmessage({ data: JSON.stringify(['EOSE', subId]) });
                        }
                    }, 5);
                }
            },
            close() {
                ws.readyState = 3;
                if (ws.onclose) ws.onclose();
            }
        };
        setTimeout(() => {
            ws.readyState = 1;
            if (ws.onopen) ws.onopen();
        }, 2);
        return ws;
    }

    matchesAnyFilter(ev, filters) {
        return filters.some(f => {
            if (f.kinds && !f.kinds.includes(ev.kind)) return false;
            if (f.authors && !f.authors.includes(ev.pubkey)) return false;
            if (f['#d']) {
                const dVals = (ev.tags || []).filter(t => t[0] === 'd').map(t => t[1]);
                if (!f['#d'].some(reqD => dVals.includes(reqD))) return false;
            }
            if (f['#t']) {
                const tVals = (ev.tags || []).filter(t => t[0] === 't').map(t => t[1]);
                if (!f['#t'].some(reqT => tVals.includes(reqT))) return false;
            }
            return true;
        });
    }
}

describe('XFriendsSyncManager', () => {
    let storageMap;
    let relayHub;

    beforeEach(() => {
        storageMap = new Map();
        relayHub = new MockNostrRelayHub();

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn(async (keys) => {
                        const out = {};
                        const list = Array.isArray(keys) ? keys : [keys];
                        for (const k of list) {
                            if (storageMap.has(k)) out[k] = storageMap.get(k);
                        }
                        return out;
                    }),
                    set: jest.fn(async (obj) => {
                        for (const [k, v] of Object.entries(obj)) {
                            storageMap.set(k, JSON.parse(JSON.stringify(v)));
                        }
                    })
                }
            },
            tabs: {
                query: jest.fn((q, cb) => cb && cb([])),
                sendMessage: jest.fn().mockResolvedValue({})
            }
        };
    });

    test('should perform full mutual handshake and sync seen tweets between Alice and Bob over Nostr', async () => {
        const aliceManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });
        const bobManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });

        // 1. Alice sets her identity and marks two tweets as seen
        await aliceManager.setIdentity('alice@example.com', 'Alice');
        await aliceManager.markTweetsSeen(['1850000000000000001', '1850000000000000002']);
        await aliceManager.publishMySeenSnapshot();

        // 2. Alice invites Bob by email
        const aliceStateAfterInvite = await aliceManager.addFriend('bob@example.com');
        expect(aliceStateAfterInvite.friends).toEqual([
            expect.objectContaining({
                email: 'bob@example.com',
                status: 'pending_outgoing'
            })
        ]);

        // 3. Bob sets his identity and syncs -> should discover Alice's incoming invite
        storageMap.clear(); // Separate browser storage for Bob
        const bobState1 = await bobManager.setIdentity('bob@example.com', 'Bob');
        expect(bobState1.friends).toEqual([
            expect.objectContaining({
                email: 'alice@example.com',
                status: 'pending_incoming'
            })
        ]);

        // 4. Bob accepts Alice's request -> unlocks Alice's seenFeedKey and pulls her seen tweets!
        const bobState2 = await bobManager.acceptFriend('alice@example.com');
        expect(bobState2.friends).toEqual([
            expect.objectContaining({
                email: 'alice@example.com',
                status: 'connected',
                seenCount: 2
            })
        ]);

        // 5. Bob checks if tweets were seen by friends
        const seenLookup = bobManager.checkTweetsSeen([
            '1850000000000000001',
            '1850000000000000002',
            '9999999999999999999'
        ]);
        expect(seenLookup).toEqual({
            '1850000000000000001': ['Alice (alice@example.com)'],
            '1850000000000000002': ['Alice (alice@example.com)']
        });

        // 6. Alice syncs -> discovers Bob's reciprocal handshake and promotes Bob to connected
        const aliceStateConnected = await aliceManager.syncWithRelays();
        expect(aliceStateConnected.friends).toEqual([
            expect.objectContaining({
                email: 'bob@example.com',
                status: 'connected'
            })
        ]);
    });

    test('should prune expired Snowflake Tweet IDs older than 14 days while keeping recent ones', async () => {
        const manager = new XFriendsSyncManager({ relays: [] });
        await manager.init();

        const nowMs = Date.now();
        const recentSnowflake = String(((BigInt(nowMs - 1000 * 60 * 60) - 1288834974657n) << 22n));
        const expiredSnowflake = String(((BigInt(nowMs - 30 * 24 * 60 * 60 * 1000) - 1288834974657n) << 22n));

        expect(manager.isSnowflakeWithinAge(recentSnowflake, nowMs)).toBe(true);
        expect(manager.isSnowflakeWithinAge(expiredSnowflake, nowMs)).toBe(false);
        expect(manager.isValidRecentTweetId(recentSnowflake)).toBe(true);
        expect(manager.isValidRecentTweetId('not-a-tweet-id')).toBe(false);
    });

    test('should keep receiving updates when a friend reinstalls/rotates keys and relay returns newest handshake before old handshake', async () => {
        const aliceManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });
        const bobOldInstall = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });

        // Yesterday: Alice and Bob connect and Bob sees tweet 111
        await aliceManager.setIdentity('alice@example.com', 'Alice');
        await aliceManager.addFriend('bob@example.com');

        storageMap.clear();
        await bobOldInstall.setIdentity('bob@example.com', 'Bob');
        await bobOldInstall.acceptFriend('alice@example.com');
        await bobOldInstall.markTweetsSeen(['1850000000000000111']);
        await bobOldInstall.publishMySeenSnapshot();

        // Today: Bob reinstalls extension (fresh storage -> new pubkey & seenFeedKey) and sees tweet 222
        storageMap.clear();
        const bobNewInstall = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });
        await bobNewInstall.setIdentity('bob@example.com', 'Bob');
        await bobNewInstall.addFriend('alice@example.com');
        await bobNewInstall.markTweetsSeen(['1850000000000000222']);
        await bobNewInstall.publishMySeenSnapshot();

        // Alice syncs: relay returns Bob's NEW handshake first and Bob's OLD handshake second
        const aliceState = await aliceManager.syncWithRelays();
        expect(aliceState.friends[0].status).toBe('connected');
        expect(aliceState.friends[0].pubkeyHex).toBeUndefined(); // public state hides raw key
        expect(aliceManager.state.friends['bob@example.com'].pubkeyHex).toBe(bobNewInstall.state.identity.pubkeyHex);

        // Alice should see both Bob's new seen tweet (222) and old seen tweet (111)
        const seen = aliceManager.checkTweetsSeen(['1850000000000000111', '1850000000000000222']);
        expect(seen['1850000000000000222']).toEqual(['Bob (bob@example.com)']);
        expect(seen['1850000000000000111']).toEqual(['Bob (bob@example.com)']);
    });

    test('should sync forced posts and rich tweet metadata for the Friends Timeline and unseen Home injection', async () => {
        const aliceManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });
        const bobManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });

        await aliceManager.setIdentity('alice@example.com', 'Alice');
        await aliceManager.addFriend('bob@example.com');

        storageMap.clear();
        await bobManager.setIdentity('bob@example.com', 'Bob');
        await bobManager.acceptFriend('alice@example.com');
        await aliceManager.syncWithRelays();

        // Alice sees a normal post with metadata and forces a second post to Bob
        await aliceManager.markTweetsSeen(['1850000000000000500'], {
            '1850000000000000500': {
                screenName: 'technews',
                authorName: 'Tech News',
                text: 'Regular seen post about web browsers'
            }
        });
        await aliceManager.forceTweetToFriends('1850000000000000999', {
            screenName: 'breaking',
            authorName: 'Breaking Updates',
            text: 'Must-see post forced by Alice!',
            media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/sample.jpg' }]
        });

        // Bob syncs with relays
        await bobManager.syncWithRelays();

        const bobTimeline = bobManager.getFriendsTimelineData();
        expect(bobTimeline.timelinePosts.length).toBe(2);

        // Forced post should be sorted first and appear in unseenForcedPosts
        expect(bobTimeline.timelinePosts[0]).toEqual(expect.objectContaining({
            tweetId: '1850000000000000999',
            isForced: true,
            forcedBy: ['Alice (alice@example.com)'],
            seenBy: ['Alice (alice@example.com)'],
            isSeenByMe: false,
            meta: expect.objectContaining({
                screenName: 'breaking',
                authorName: 'Breaking Updates',
                text: 'Must-see post forced by Alice!'
            })
        }));

        expect(bobTimeline.unseenForcedPosts.length).toBe(1);
        expect(bobTimeline.unseenForcedPosts[0].tweetId).toBe('1850000000000000999');

        // When Bob sees the forced post, it must NOT disappear from unseenForcedPosts or timelinePosts —
        // it should remain in both with isSeenByMe: true until explicitly dismissed
        await bobManager.markTweetsSeen(['1850000000000000999']);
        const bobTimelineAfterSeen = bobManager.getFriendsTimelineData();
        expect(bobTimelineAfterSeen.unseenForcedPosts.length).toBe(1);
        expect(bobTimelineAfterSeen.unseenForcedPosts[0].tweetId).toBe('1850000000000000999');
        expect(bobTimelineAfterSeen.unseenForcedPosts[0].isSeenByMe).toBe(true);
        expect(bobTimelineAfterSeen.timelinePosts[0].tweetId).toBe('1850000000000000999');
        expect(bobTimelineAfterSeen.timelinePosts[0].isSeenByMe).toBe(true);

        // Bob dismisses the forced post from his Home feed -> removed from unseenForcedPosts and marked seen
        await bobManager.dismissForcedTweet('1850000000000000999');
        const bobTimelineAfterDismiss = bobManager.getFriendsTimelineData();
        expect(bobTimelineAfterDismiss.unseenForcedPosts.length).toBe(0);
        expect(bobTimelineAfterDismiss.timelinePosts[0].isSeenByMe).toBe(true);

        // Alice unforces the post -> Bob syncs and sees it is no longer forced
        await aliceManager.unforceTweet('1850000000000000999');
        await bobManager.syncWithRelays();
        const statusCheck = bobManager.checkTweetsSyncStatus(['1850000000000000999']);
        expect(statusCheck.forcedMap['1850000000000000999']).toBeUndefined();
    });

    test('hydrateTweets should fetch rich post metadata (text, playable video MP4, quoted tweet, parent reply) and filter out deleted tweets', async () => {
        const mockFetch = jest.fn(async (url) => {
            if (url.includes('id=2113362791734341682')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        id_str: '2113362791734341682',
                        created_at: 'Wed Oct 22 20:09:49 +0000 2026',
                        text: 'Watch this clip &amp; enjoy https://t.co/vidlink',
                        favorite_count: 1420,
                        conversation_count: 85,
                        user: {
                            name: 'Video Creator',
                            screen_name: 'vidcreator',
                            is_blue_verified: true,
                            profile_image_url_https: 'https://pbs.twimg.com/profile_images/1/avatar_normal.jpg'
                        },
                        entities: {
                            media: [{ url: 'https://t.co/vidlink' }],
                            urls: []
                        },
                        mediaDetails: [
                            {
                                type: 'video',
                                media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg',
                                video_info: {
                                    variants: [
                                        { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/low.mp4' },
                                        { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/high.mp4' }
                                    ]
                                }
                            }
                        ],
                        parent: {
                            id_str: '2113360000000000000',
                            text: 'Original thread starter',
                            user: {
                                name: 'Thread Starter',
                                screen_name: 'starter'
                            }
                        }
                    })
                };
            }
            if (url.includes('id=2113364772632838435')) {
                return {
                    ok: false,
                    status: 404
                };
            }
            return { ok: false, status: 500 };
        });

        const manager = new XFriendsSyncManager({
            relays: ['wss://relay1.test'],
            webSocketFactory: (url) => hub.connect(url),
            fetchFn: mockFetch
        });
        await manager.init();

        // Simulate friend having seen both a valid video tweet and a deleted tweet (bare IDs)
        manager.state.friends['morgkorg'] = {
            email: 'morgkorg',
            displayName: 'morgkorg',
            status: 'connected'
        };
        manager.state.friendSeenMap['morgkorg'] = ['2113362791734341682', '2113364772632838435'];
        manager.rebuildIndex();

        const res = await manager.hydrateTweets(['2113362791734341682', '2113364772632838435']);
        expect(res.hydrated['2113362791734341682']).toEqual(expect.objectContaining({
            id: '2113362791734341682',
            screenName: 'vidcreator',
            authorName: 'Video Creator',
            isVerified: true,
            text: 'Watch this clip & enjoy',
            favoriteCount: 1420,
            replyCount: 85,
            isHydrated: true,
            media: [
                expect.objectContaining({
                    type: 'video',
                    posterUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg',
                    videoUrl: 'https://video.twimg.com/high.mp4'
                })
            ],
            parentTweet: expect.objectContaining({
                screenName: 'starter',
                text: 'Original thread starter'
            })
        }));

        expect(res.hydrated['2113364772632838435'].isUnavailable).toBe(true);

        // Deleted/unavailable tweets should be excluded from getFriendsTimelineData()
        const timeline = manager.getFriendsTimelineData();
        expect(timeline.timelinePosts.map(p => p.tweetId)).toEqual(['2113362791734341682']);
    });

    test('should self-sync identity keys, friends, seen posts, forced posts, and filter preferences between Desktop and Mobile Pixel', async () => {
        const desktopManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });
        const friendBob = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket()
        });

        // 1. Desktop user configures blocklists/preferences and sets identity
        await global.chrome.storage.local.set({
            blockedCountries: ['India', 'Russia'],
            blockedDeviceRegions: ['Turkey Android App'],
            blockedNameFlags: ['🇺🇦', '🇮🇱'],
            isXLocationEnabled: true,
            isXHideAdsEnabled: true,
            isXAlwaysMuteEnabled: false,
            xVolumeLevel: 42
        });

        await desktopManager.setIdentity('kyle@pixel.dev', 'Kyle');
        await desktopManager.markTweetsSeen(['1850000000000000701']);
        await desktopManager.forceTweetToFriends('1850000000000000702', {
            screenName: 'kyle',
            authorName: 'Kyle',
            text: 'Forced from Desktop'
        });
        await desktopManager.addFriend('bob@example.com', 'Bob');

        const desktopKeys = { ...desktopManager.state.identity };

        // 2. Friend Bob accepts Kyle and forces a post to Kyle
        storageMap.clear();
        await friendBob.setIdentity('bob@example.com', 'Bob');
        await friendBob.acceptFriend('kyle@pixel.dev');
        await friendBob.forceTweetToFriends('1850000000000000888', {
            screenName: 'bob',
            authorName: 'Bob',
            text: 'Check this out on your Pixel!'
        });

        // 3. Mobile Pixel starts with empty storage and signs in with the same email 'kyle@pixel.dev'
        storageMap.clear();
        const notifications = [];
        const mobileManager = new XFriendsSyncManager({
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket(),
            onNotification: (notif) => notifications.push(notif)
        });

        const mobilePublicState = await mobileManager.setIdentity('kyle@pixel.dev');

        // Mobile should have automatically adopted Desktop's canonical Nostr keypair and seenFeedKeyHex
        expect(mobileManager.state.identity.privKeyHex).toBe(desktopKeys.privKeyHex);
        expect(mobileManager.state.identity.pubkeyHex).toBe(desktopKeys.pubkeyHex);
        expect(mobileManager.state.identity.seenFeedKeyHex).toBe(desktopKeys.seenFeedKeyHex);
        expect(mobileManager.state.identity.displayName).toBe('Kyle');

        // Mobile should have inherited Desktop's seen posts, forced posts, and connected friend Bob
        expect(mobileManager.mySeenSet.has('1850000000000000701')).toBe(true);
        expect(mobileManager.mySeenSet.has('1850000000000000702')).toBe(true);
        expect(mobileManager.state.myForcedMap['1850000000000000702']).toBeDefined();
        expect(mobilePublicState.friends).toEqual([
            expect.objectContaining({
                email: 'bob@example.com',
                status: 'connected'
            })
        ]);

        // Mobile should also have synced Desktop's blocklists and toggles into its local storage
        const mobilePrefs = await global.chrome.storage.local.get([
            'blockedCountries',
            'blockedDeviceRegions',
            'blockedNameFlags',
            'isXHideAdsEnabled',
            'xVolumeLevel'
        ]);
        expect(mobilePrefs.blockedCountries).toEqual(['India', 'Russia']);
        expect(mobilePrefs.blockedDeviceRegions).toEqual(['Turkey Android App']);
        expect(mobilePrefs.blockedNameFlags).toEqual(['🇺🇦', '🇮🇱']);
        expect(mobilePrefs.isXHideAdsEnabled).toBe(true);
        expect(mobilePrefs.xVolumeLevel).toBe(42);

        // Mobile should have detected Bob's newly forced post and fired onNotification
        expect(notifications.length).toBeGreaterThanOrEqual(1);
        expect(notifications[0].newForcedPosts).toEqual([
            expect.objectContaining({
                tweetId: '1850000000000000888',
                forcedBy: ['Bob (bob@example.com)']
            })
        ]);

        // 4. Removing a friend on Mobile rotates seenFeedKeyHex and bumps feedKeyUpdatedAt;
        // syncing on Desktop should adopt the rotated seenFeedKeyHex and remove Bob
        const oldFeedKey = mobileManager.state.identity.seenFeedKeyHex;
        await mobileManager.removeFriend('bob@example.com');
        const rotatedFeedKey = mobileManager.state.identity.seenFeedKeyHex;
        expect(rotatedFeedKey).not.toBe(oldFeedKey);

        await desktopManager.syncWithRelays();
        expect(desktopManager.state.identity.seenFeedKeyHex).toBe(rotatedFeedKey);
        expect(desktopManager.state.friends['bob@example.com']).toBeUndefined();
    });

    test('should enforce 1,000 seen cap, 14-day forced TTL, 250 local meta cap, and separate own forced posts (isSentOnly) from friend forced posts', async () => {
        const manager = new XFriendsSyncManager({ relays: [] });
        await manager.init();

        const now = Date.now();
        // 1. Insert 1,250 seen IDs -> should cap at 1,000 newest
        const manySeenIds = Array.from({ length: 1250 }, (_, i) => String(1850000000000100000n + BigInt(i)));
        for (const id of manySeenIds) {
            manager.mySeenSet.add(id);
        }

        // 2. Insert an expired forced post (20 days old) and a fresh own forced post
        const expiredForcedId = '1850000000000900001';
        const freshOwnForcedId = '1850000000000900002';
        manager.state.myForcedMap[expiredForcedId] = {
            id: expiredForcedId,
            forcedAt: now - (20 * 24 * 60 * 60 * 1000)
        };
        manager.state.myForcedMap[freshOwnForcedId] = {
            id: freshOwnForcedId,
            forcedAt: now - 5000
        };

        // 3. Insert a friend-forced post
        manager.state.friends['alice@example.com'] = {
            email: 'alice@example.com',
            displayName: 'Alice',
            status: 'connected'
        };
        manager.state.friendForcedMap['alice@example.com'] = [
            { id: '1850000000000900003', forcedAt: now - 1000 }
        ];

        // 4. Insert 310 postMetaMap items -> should cap at 250
        for (let i = 0; i < 310; i++) {
            const tid = String(1850000000000200000n + BigInt(i));
            manager.state.postMetaMap[tid] = {
                id: tid,
                screenName: 'user',
                text: `Post ${i}`,
                updatedAt: now - (310 - i) * 1000
            };
        }

        manager.pruneMySeenIds();
        manager.rebuildIndex();

        expect(manager.state.mySeenIds.length).toBe(1000);
        expect(manager.mySeenSet.size).toBe(1000);
        expect(manager.state.myForcedMap[expiredForcedId]).toBeUndefined();
        expect(manager.state.myForcedMap[freshOwnForcedId]).toBeDefined();
        expect(Object.keys(manager.state.postMetaMap).length).toBeLessThanOrEqual(250);

        const timeline = manager.getFriendsTimelineData();
        const friendForcedItem = timeline.timelinePosts.find(p => p.tweetId === '1850000000000900003');
        const ownForcedItem = timeline.timelinePosts.find(p => p.tweetId === freshOwnForcedId);

        expect(friendForcedItem.isForced).toBe(true);
        expect(friendForcedItem.isSentOnly).toBe(false);
        expect(ownForcedItem.isForced).toBe(false);
        expect(ownForcedItem.forcedByMe).toBe(true);
        expect(ownForcedItem.isSentOnly).toBe(true);
    });
});

