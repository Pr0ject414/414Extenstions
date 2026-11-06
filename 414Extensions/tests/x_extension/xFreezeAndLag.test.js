/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

if (!globalThis.crypto || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        configurable: true
    });
}
if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder;
if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder;

import {
    generateSecretKeyHex,
    getPublicKeyHex,
    derivePairwiseInfo,
    signEvent,
    verifyEvent
} from '../../x_extension/xNostrCrypto.js';
import { XFriendsSyncManager } from '../../x_extension/xFriendsSync.js';
import { XLocationCacheManager } from '../../x_extension/xLocationCache.js';
import { XLocationApiClient } from '../../x_extension/xLocationApi.js';
import { CACHE_CONFIG } from '../../x_extension/xLocationConstants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const xLocationUIScript = fs.readFileSync(
    path.resolve(__dirname, '../../x_extension/content_scripts/xLocationUI.js'),
    'utf8'
);
const xObserverScript = fs.readFileSync(
    path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js'),
    'utf8'
);

describe('X Extension Freeze & Lag Regressions', () => {
    test('manifest.json restricts X content scripts to top frame only (all_frames: false) to avoid Castle/Arkose/Stripe iframe freezes', () => {
        const manifestPath = path.resolve(__dirname, '../../manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const xContentScripts = manifest.content_scripts.filter(cs =>
            Array.isArray(cs.matches) && cs.matches.some(m => m.includes('x.com')) &&
            Array.isArray(cs.js) && cs.js.some(j => j.startsWith('x_extension/'))
        );

        expect(xContentScripts.length).toBeGreaterThanOrEqual(2);
        for (const entry of xContentScripts) {
            expect(entry.all_frames).toBe(false);
        }
    });

    test('xNostrCrypto Jacobian projective scalar multiplication & LRU caches complete 40 Schnorr + ECDH operations in under 250ms', async () => {
        const alicePriv = generateSecretKeyHex();
        const alicePub = getPublicKeyHex(alicePriv);
        const bobPriv = generateSecretKeyHex();
        const bobPub = getPublicKeyHex(bobPriv);

        const signedEvent = await signEvent({
            kind: 24142,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'perf-test']],
            content: 'hello world'
        }, alicePriv);

        const start = performance.now();
        for (let i = 0; i < 40; i++) {
            const ok = await verifyEvent(signedEvent);
            expect(ok).toBe(true);
            const mat = await derivePairwiseInfo('alice@example.com', 'bob@example.com');
            expect(mat.pairKeyHex).toBeTruthy();
        }
        const elapsedMs = performance.now() - start;
        expect(elapsedMs).toBeLessThan(250);
    });

    test('needsTweetHydration and createFriendTweetCard never loop on v4 hydrated media-only, video-poster-only, or avatarless-quote tweets', () => {
        window.XLocationUIInjected = false;
        delete window.XLocationUI;
        window.eval(xLocationUIScript);

        const manager = new XFriendsSyncManager();
        const recentSnowflakeId = ((BigInt(Date.now() - 60000) - 1288834974657n) << 22n).toString();

        const v4HydratedMeta = {
            tweetId: recentSnowflakeId,
            screenName: 'videouser',
            authorName: 'Video User',
            avatarUrl: 'https://pbs.twimg.com/profile_images/1/ava.jpg',
            text: '', // Media-only tweet with empty text
            media: [
                {
                    type: 'video',
                    url: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/HWO9SCKbcAAhWCR.jpg',
                    posterUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/HWO9SCKbcAAhWCR.jpg',
                    videoUrl: '' // No MP4 variant returned by syndication
                }
            ],
            quotedTweet: {
                id: '2118000000000000001',
                screenName: 'quoteduser',
                authorName: '', // Missing authorName/avatarUrl on quoted tweet
                avatarUrl: '',
                text: 'Quoted content without avatar'
            },
            isHydrated: true,
            hydrationVersion: 4,
            updatedAt: Date.now()
        };

        manager.state.postMetaMap[recentSnowflakeId] = v4HydratedMeta;

        // 1. Background manager must NOT request hydration again
        expect(manager.needsTweetHydration(recentSnowflakeId)).toBe(false);

        // 2. Rendered card must NOT set data-needs-hydration="true"
        const card = window.XLocationUI.createFriendTweetCard({
            tweetId: recentSnowflakeId,
            seenBy: [],
            forcedBy: [],
            forcedByMe: false,
            isSeenByMe: false,
            snowflakeTimeMs: Date.now() - 60000,
            meta: v4HydratedMeta
        });
        expect(card.hasAttribute('data-needs-hydration')).toBe(false);

        // 3. Forced unavailable card has data-needs-hydration cleared by updateHydratedCardsInDOM
        const forcedCard = window.XLocationUI.createFriendTweetCard({
            tweetId: recentSnowflakeId,
            seenBy: [],
            forcedBy: [{ npub: 'npub1test', displayName: 'Alice' }],
            forcedByMe: false,
            isSeenByMe: false,
            isForced: true,
            snowflakeTimeMs: Date.now() - 60000,
            meta: null
        });
        expect(forcedCard.getAttribute('data-needs-hydration')).toBe('true');
        document.body.appendChild(forcedCard);

        window.XLocationUI.updateHydratedCardsInDOM({
            [recentSnowflakeId]: {
                tweetId: recentSnowflakeId,
                isUnavailable: true,
                isHydrated: true,
                hydrationVersion: 4
            }
        });
        expect(forcedCard.hasAttribute('data-needs-hydration')).toBe(false);
        forcedCard.remove();
    });

    test('markTweetsSeen does not trigger redundant storage writes when tweets are already seen and hydrated', async () => {
        const storageData = {};
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        if (typeof cb === 'function') cb(storageData);
                        return Promise.resolve(storageData);
                    }),
                    set: jest.fn((items, cb) => {
                        Object.assign(storageData, items);
                        if (typeof cb === 'function') cb();
                        return Promise.resolve();
                    })
                }
            },
            runtime: {
                sendMessage: jest.fn(() => Promise.resolve())
            }
        };

        const manager = new XFriendsSyncManager();
        await manager.init();
        const recentId = ((BigInt(Date.now() - 30000) - 1288834974657n) << 22n).toString();

        await manager.markTweetsSeen([recentId], {
            [recentId]: {
                screenName: 'alice',
                authorName: 'Alice',
                text: 'First seen',
                isHydrated: true,
                hydrationVersion: 4
            }
        });

        const callsAfterFirst = global.chrome.storage.local.set.mock.calls.length;
        expect(callsAfterFirst).toBeGreaterThan(0);

        // Calling markTweetsSeen again with the same already-seen tweet and unhydrated DOM scrape should NOT write to storage
        await manager.markTweetsSeen([recentId], {
            [recentId]: {
                screenName: 'alice',
                authorName: 'Alice',
                text: 'First seen',
                isHydrated: false
            }
        });

        expect(global.chrome.storage.local.set.mock.calls.length).toBe(callsAfterFirst);
    });

    test('XLocationApiClient negative-cache hit returns error object that LRUCache refuses to store', async () => {
        const cacheMgr = new XLocationCacheManager();
        const api = new XLocationApiClient();
        api.notFoundCache.set('missing_handle', Date.now() + 60000);

        const res = await api.fetchUserInfo('missing_handle');
        expect(res).toEqual({ error: 'Account not found (cached)', code: 'NOT_FOUND' });

        // LRUCache must refuse to store error objects
        cacheMgr.set('missing_handle', res);
        expect(cacheMgr.get('missing_handle')).toBeNull();
    });

    test('XLocationCacheManager compacts oversized storage caches down to CACHE_CONFIG.MAX_ENTRIES and strips error objects', async () => {
        const oversizedCache = {};
        for (let i = 0; i < CACHE_CONFIG.MAX_ENTRIES + 500; i++) {
            oversizedCache[`user_${i}`] = {
                screenName: `user_${i}`,
                location: 'United States',
                expiry: Date.now() + 86400000
            };
        }
        oversizedCache.poisoned_user = {
            error: 'Account not found (cached)',
            code: 'NOT_FOUND'
        };

        const storageStore = {
            x_location_cache_v4: oversizedCache
        };
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        if (typeof cb === 'function') cb(storageStore);
                        return Promise.resolve(storageStore);
                    }),
                    set: jest.fn((items, cb) => {
                        Object.assign(storageStore, items);
                        if (typeof cb === 'function') cb();
                        return Promise.resolve();
                    })
                }
            }
        };

        const cacheMgr = new XLocationCacheManager();
        await cacheMgr.init();

        expect(cacheMgr.lru.cache.size).toBe(CACHE_CONFIG.MAX_ENTRIES);
        expect(cacheMgr.get('poisoned_user')).toBeNull();
        expect(global.chrome.storage.local.set).toHaveBeenCalled();
    });

    test('xObserver enforces cooldown on failed X_FETCH_USER_INFO lookups and ignores counter transition mutations', () => {
        jest.useFakeTimers();
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="User-Name">
                    <a href="/cooldown_user"><span>Cooldown User</span></a>
                    <span>@cooldown_user</span>
                </div>
                <div data-testid="app-text-transition-container"><span>42</span></div>
            </article>
        `;

        const sendMessageMock = jest.fn((msg, cb) => {
            if (msg.action === 'X_FETCH_USER_INFO') {
                if (cb) cb({ success: false, error: 'Rate limit exceeded' });
                return;
            }
            if (cb) cb({ success: true, seenMap: {}, timelinePosts: [], unseenForcedPosts: [] });
        });

        global.chrome = {
            runtime: {
                id: 'test-ext-id',
                 lastError: null,
                sendMessage: sendMessageMock,
                onMessage: { addListener: jest.fn() }
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => cb({
                        isGlobalMasterSwitchEnabled: true,
                        isXModuleEnabled: true,
                        isXLocationEnabled: true,
                        isXHideAdsEnabled: true,
                        isXFriendsSyncEnabled: false
                    }))
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.XLocationUIInjected = false;
        delete window.XLocationUI;
        window.eval(xLocationUIScript);

        window.XObserverInjected = false;
        window.eval(xObserverScript);

        jest.advanceTimersByTime(100);

        const fetchCallsAfterFirstScan = sendMessageMock.mock.calls.filter(
            c => c[0] && c[0].action === 'X_FETCH_USER_INFO' && c[0].payload?.screenName === 'cooldown_user'
        ).length;
        expect(fetchCallsAfterFirstScan).toBe(1);

        // Trigger another DOM mutation on a tweet article within the 60s cooldown window
        const newTweet = document.createElement('article');
        newTweet.setAttribute('data-testid', 'tweet');
        newTweet.innerHTML = `<div data-testid="User-Name"><a href="/cooldown_user"><span>@cooldown_user</span></a></div>`;
        document.body.appendChild(newTweet);

        jest.advanceTimersByTime(200);

        const fetchCallsAfterSecondScan = sendMessageMock.mock.calls.filter(
            c => c[0] && c[0].action === 'X_FETCH_USER_INFO' && c[0].payload?.screenName === 'cooldown_user'
        ).length;
        // Still 1 call — no 50ms retry storm!
        expect(fetchCallsAfterSecondScan).toBe(1);

        jest.useRealTimers();
    });
});
