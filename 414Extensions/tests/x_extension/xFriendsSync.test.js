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
                        for (const ev of hub.events.values()) {
                            if (hub.matchesAnyFilter(ev, filters)) {
                                if (ws.onmessage) {
                                    ws.onmessage({ data: JSON.stringify(['EVENT', subId, ev]) });
                                }
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
});
