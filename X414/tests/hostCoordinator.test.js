// D:\Dev\X414\tests\hostCoordinator.test.js
import { jest } from '@jest/globals';
import { XHostCoordinator, XHostStorageAdapter } from '../src/bridge/XHostCoordinator.js';
import { XFriendsSyncManager } from '../src/shared/xFriendsSync.js';
import { buildWebViewInjectionScript } from '../src/shared/webviewInjectedBundle.js';

class MockAsyncStorage {
    constructor() {
        this.map = new Map();
    }
    async getAllKeys() {
        return Array.from(this.map.keys());
    }
    async multiGet(keys) {
        return keys.map(k => [k, this.map.has(k) ? this.map.get(k) : null]);
    }
    async multiSet(pairs) {
        for (const [k, v] of pairs) {
            this.map.set(k, v);
        }
    }
    async multiRemove(keys) {
        for (const k of keys) {
            this.map.delete(k);
        }
    }
}

class MockRelayHub {
    constructor() {
        this.events = new Map();
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
                if (msg[0] === 'EVENT') {
                    const ev = msg[1];
                    const dTag = (ev.tags || []).find(t => t[0] === 'd')?.[1] || '';
                    hub.events.set(`${ev.pubkey}:${ev.kind}:${dTag}`, ev);
                    setTimeout(() => {
                        if (ws.onmessage) ws.onmessage({ data: JSON.stringify(['OK', ev.id, true, '']) });
                    }, 3);
                } else if (msg[0] === 'REQ') {
                    const subId = msg[1];
                    const filters = msg.slice(2);
                    setTimeout(() => {
                        const matching = Array.from(hub.events.values())
                            .filter(ev => hub.matches(ev, filters))
                            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                        for (const ev of matching) {
                            if (ws.onmessage) ws.onmessage({ data: JSON.stringify(['EVENT', subId, ev]) });
                        }
                        if (ws.onmessage) ws.onmessage({ data: JSON.stringify(['EOSE', subId]) });
                    }, 3);
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
    matches(ev, filters) {
        return filters.some(f => {
            if (f.kinds && !f.kinds.includes(ev.kind)) return false;
            if (f.authors && !f.authors.includes(ev.pubkey)) return false;
            if (f['#d']) {
                const dVals = (ev.tags || []).filter(t => t[0] === 'd').map(t => t[1]);
                if (!f['#d'].some(d => dVals.includes(d))) return false;
            }
            if (f['#t']) {
                const tVals = (ev.tags || []).filter(t => t[0] === 't').map(t => t[1]);
                if (!f['#t'].some(t => tVals.includes(t))) return false;
            }
            return true;
        });
    }
}

describe('XHostCoordinator & WebView Bridge Integration', () => {
    test('XHostStorageAdapter should persist and hydrate settings from AsyncStorage', async () => {
        const mockAsync = new MockAsyncStorage();
        const adapter1 = new XHostStorageAdapter(mockAsync);
        await adapter1.init();

        await adapter1.set({
            blockedCountries: ['India', 'Russia'],
            xVolumeLevel: 0.5
        });

        // Second instance hydrates from the same AsyncStorage
        const adapter2 = new XHostStorageAdapter(mockAsync);
        const hydrated = await adapter2.get(['blockedCountries', 'xVolumeLevel', 'isXHideAdsEnabled']);
        expect(hydrated).toEqual({
            blockedCountries: ['India', 'Russia'],
            xVolumeLevel: 0.5,
            isXHideAdsEnabled: true
        });
    });

    test('XHostCoordinator should handle user location lookups, Nostr self-sync, and WebView bridge packets', async () => {
        const relayHub = new MockRelayHub();
        const mockAsync = new MockAsyncStorage();
        const sentToWebView = [];
        const openSettingsSpy = jest.fn();

        const mockApiClient = {
            loadHeadersFromStorage: jest.fn(async () => {}),
            setHeaders: jest.fn(),
            enqueueLookup: jest.fn(async (screenName) => ({
                screenName,
                location: 'Japan',
                device: 'Android App',
                meta: { name: 'Tokyo Dev', restId: '998877' }
            }))
        };
        const mockCloudCache = {
            get: jest.fn(async () => null),
            put: jest.fn(async () => {})
        };

        const coordinator = new XHostCoordinator({
            asyncStorage: mockAsync,
            apiClient: mockApiClient,
            cloudCache: mockCloudCache,
            relays: ['wss://mock.relay'],
            webSocketFactory: () => relayHub.createSocket(),
            sendToWebView: (pkt) => sentToWebView.push(pkt),
            onOpenSettings: openSettingsSpy
        });

        await coordinator.init();

        // 1. Test X_OPEN_NATIVE_SETTINGS packet from WebView
        await coordinator.handleWebViewPacket(JSON.stringify({
            type: 'X_RUNTIME_MESSAGE',
            requestId: 'req_1',
            payload: { action: 'X_OPEN_NATIVE_SETTINGS' }
        }));
        expect(openSettingsSpy).toHaveBeenCalledTimes(1);
        expect(sentToWebView).toContainEqual({
            type: 'X_RUNTIME_RESPONSE',
            requestId: 'req_1',
            response: { success: true }
        });

        // 2. Test X_FETCH_USER_INFO lookup + local cache hit on second call
        const locRes1 = await coordinator.dispatchRuntimeMessage({
            action: 'X_FETCH_USER_INFO',
            payload: { screenName: 'tokyodev' }
        });
        expect(locRes1.success).toBe(true);
        expect(locRes1.fromCache).toBe(false);
        expect(locRes1.data.location).toBe('Japan');

        const locRes2 = await coordinator.dispatchRuntimeMessage({
            action: 'X_FETCH_USER_INFO',
            payload: { screenName: 'tokyodev' }
        });
        expect(locRes2.success).toBe(true);
        expect(locRes2.fromCache).toBe(true);
        expect(mockApiClient.enqueueLookup).toHaveBeenCalledTimes(1);

        // 3. Test Nostr identity + seen/forced post sync through XHostCoordinator
        const idRes = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_SET_IDENTITY',
            payload: { email: 'pixel@x414.dev', displayName: 'PixelUser' }
        });
        expect(idRes.success).toBe(true);
        expect(idRes.state.identity.email).toBe('pixel@x414.dev');

        await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_FORCE_TWEET',
            payload: {
                tweetId: '1850000000000000901',
                meta: { screenName: 'pixel', authorName: 'Pixel', text: 'Forced from Pixel!' }
            }
        });

        const timelineRes = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_GET_TIMELINE'
        });
        expect(timelineRes.success).toBe(true);
        expect(timelineRes.data.timelinePosts.map(p => p.tweetId)).toContain('1850000000000000901');
    });

    test('buildWebViewInjectionScript should install window.chrome polyfill and inject 414 settings trigger in DOM', async () => {
        document.body.innerHTML = '<nav role="navigation" data-testid="BottomBar"></nav>';
        const postedMessages = [];
        window.ReactNativeWebView = {
            postMessage: (str) => postedMessages.push(JSON.parse(str))
        };

        const script = buildWebViewInjectionScript(
            { blockedCountries: ['Iran'], isXHideAdsEnabled: true },
            { pendingIncomingCount: 2 }
        );
        // eslint-disable-next-line no-eval
        eval(script);

        expect(window.__X414_MOBILE__).toBe(true);
        expect(window.chrome).toBeDefined();
        expect(window.chrome.storage).toBeDefined();
        expect(window.chrome.runtime).toBeDefined();

        const stored = await window.chrome.storage.local.get(['blockedCountries', 'isXHideAdsEnabled']);
        expect(stored).toEqual({
            blockedCountries: ['Iran'],
            isXHideAdsEnabled: true
        });

        // Trigger mobile settings button injection and click it
        const btn = window.XLocationUI.ensureMobileSettingsTrigger({ pendingIncomingCount: 2 });
        expect(btn).not.toBeNull();
        expect(btn.querySelector('.x-414-nav-unread-badge').textContent).toBe('2');

        btn.click();
        expect(postedMessages).toContainEqual(
            expect.objectContaining({
                type: 'X_RUNTIME_MESSAGE',
                payload: { action: 'X_OPEN_NATIVE_SETTINGS' }
            })
        );
    });

    test('ensureCryptoPolyfill should provide working SHA-256 and AES-256-GCM when native crypto.subtle is absent (Android Hermes)', async () => {
        const { ensureCryptoPolyfill } = await import('../src/bridge/cryptoPolyfill.js');
        const {
            generateSecretKeyHex,
            signEvent,
            verifyEvent,
            deriveSelfSyncInfo,
            encryptJson,
            decryptJson
        } = await import('../src/shared/xNostrCrypto.js');

        const originalSubtle = globalThis.crypto.subtle;
        try {
            Object.defineProperty(globalThis.crypto, 'subtle', {
                value: undefined,
                configurable: true,
                writable: true
            });
            ensureCryptoPolyfill();
            expect(globalThis.crypto.subtle).toBeDefined();

            const selfInfo = await deriveSelfSyncInfo('kyle@pixel.dev');
            const payload = { hello: 'pixel-hermes', list: [1, 2, 3] };
            const encrypted = await encryptJson(payload, selfInfo.selfKeyHex);
            const decrypted = await decryptJson(encrypted, selfInfo.selfKeyHex);
            expect(decrypted).toEqual(payload);

            const privKey = generateSecretKeyHex();
            const signed = await signEvent({
                kind: 30078,
                created_at: 1700000000,
                tags: [['d', '414x-self-v1']],
                content: encrypted
            }, privKey);
            expect(await verifyEvent(signed)).toBe(true);
        } finally {
            Object.defineProperty(globalThis.crypto, 'subtle', {
                value: originalSubtle,
                configurable: true,
                writable: true
            });
        }
    });

    test('XHostCoordinator should work with real XLocationApiClient and XCloudCacheClient and support all xObserver content-script action names', async () => {
        const relayHub = new MockRelayHub();
        const mockAsync = new MockAsyncStorage();
        const originalFetch = globalThis.fetch;

        globalThis.fetch = jest.fn(async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('AboutAccountQuery')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: {
                            user_result_by_screen_name: {
                                result: {
                                    rest_id: '777888',
                                    core: {
                                        name: 'Real API User',
                                        screen_name: 'realapiuser',
                                        created_at: 'Mon Jan 10 00:00:00 +0000 2022'
                                    },
                                    about_profile: {
                                        account_based_in: 'United Kingdom',
                                        source: 'UK Android App',
                                        location_accurate: true
                                    }
                                }
                            }
                        }
                    })
                };
            }
            if (urlStr.includes('cdn.syndication.twimg.com/tweet-result')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        id_str: '1850000000000000950',
                        text: 'Hydrated tweet from syndication',
                        created_at: '2026-04-01T12:00:00.000Z',
                        user: {
                            name: 'Real API User',
                            screen_name: 'realapiuser'
                        }
                    })
                };
            }
            return {
                ok: false,
                status: 404,
                json: async () => ({})
            };
        });

        try {
            const coordinator = new XHostCoordinator({
                asyncStorage: mockAsync,
                relays: ['wss://mock.relay'],
                webSocketFactory: () => relayHub.createSocket(),
                fetchFn: globalThis.fetch
            });

            await coordinator.init();

            // Capture headers from WebView
            const capRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_CAPTURE_HEADERS',
                payload: {
                    headers: {
                        authorization: 'Bearer test_token',
                        'x-csrf-token': 'csrf_test_123'
                    }
                }
            });
            expect(capRes.success).toBe(true);

            // Verify chrome.cookies.get shim works with captured csrf token
            const cookie = await globalThis.chrome.cookies.get({ url: 'https://x.com', name: 'ct0' });
            expect(cookie).toEqual({ name: 'ct0', value: 'csrf_test_123' });

            // Lookup user via REAL XCloudCacheClient.lookup() + REAL XLocationApiClient.fetchUserInfo()
            const userRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_FETCH_USER_INFO',
                payload: { screenName: 'realapiuser' }
            });
            expect(userRes.success).toBe(true);
            expect(userRes.fromCache).toBe(false);
            expect(userRes.data).toEqual(expect.objectContaining({
                location: 'United Kingdom',
                device: 'UK Android App'
            }));

            // Verify all real xObserver.js content-script actions
            await coordinator.dispatchRuntimeMessage({
                action: 'X_FRIENDS_SET_IDENTITY',
                payload: { email: 'observer@x414.dev', displayName: 'Observer', passphrase: 'secret-pass' }
            });

            const markRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_MARK_TWEETS_SEEN',
                payload: {
                    tweetIds: ['1850000000000000950'],
                    tweetMetaMap: {
                        '1850000000000000950': { screenName: 'realapiuser', text: 'Hello seen' }
                    }
                }
            });
            expect(markRes.success).toBe(true);

            const forceRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_FORCE_TWEET_TO_FRIENDS',
                payload: {
                    tweetId: '1850000000000000951',
                    meta: { screenName: 'realapiuser', authorName: 'Real API User', text: 'Forced via xObserver action' }
                }
            });
            expect(forceRes.success).toBe(true);

            const checkRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_CHECK_TWEETS_SEEN',
                payload: { tweetIds: ['1850000000000000950', '1850000000000000951'] }
            });
            expect(checkRes.success).toBe(true);
            expect(checkRes.myForcedIds).toContain('1850000000000000951');

            const timelineRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_GET_FRIENDS_TIMELINE'
            });
            expect(timelineRes.success).toBe(true);
            // xObserver.js expects top-level timelinePosts and unseenForcedPosts
            expect(Array.isArray(timelineRes.timelinePosts)).toBe(true);
            expect(Array.isArray(timelineRes.unseenForcedPosts)).toBe(true);
            expect(timelineRes.timelinePosts.map(p => p.tweetId)).toContain('1850000000000000951');

            const hydrateRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_HYDRATE_TWEETS',
                payload: { tweetIds: ['1850000000000000950'] }
            });
            expect(hydrateRes.success).toBe(true);
            expect(hydrateRes.hydrated['1850000000000000950'].text).toBe('Hydrated tweet from syndication');

            const unforceRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_UNFORCE_TWEET',
                payload: { tweetId: '1850000000000000951' }
            });
            expect(unforceRes.success).toBe(true);

            const dismissRes = await coordinator.dispatchRuntimeMessage({
                action: 'X_DISMISS_FORCED_TWEET',
                payload: { tweetId: '1850000000000000951' }
            });
            expect(dismissRes.success).toBe(true);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

