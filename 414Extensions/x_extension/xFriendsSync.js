// 414Extensions/x_extension/xFriendsSync.js
import { FRIEND_SYNC_CONFIG } from './xLocationConstants.js';
import { X_FRIENDS_STATE_KEY, X_FRIENDS_SYNC_ENABLED_KEY } from '../shared_modules/coreConstants.js';
import {
    generateSecretKeyHex,
    getPublicKeyHex,
    generateRandomBytesHex,
    signEvent,
    verifyEvent,
    normalizeIdentifier,
    deriveInboxInfo,
    derivePairwiseInfo,
    encryptJson,
    decryptJson
} from './xNostrCrypto.js';

const TWITTER_EPOCH_MS = 1288834974657n;
const MIN_SNOWFLAKE_ID = 300000000000000n;

export class XFriendsSyncManager {
    constructor(options = {}) {
        this.relays = options.relays || FRIEND_SYNC_CONFIG.RELAYS;
        this.webSocketFactory = options.webSocketFactory || ((url) => new WebSocket(url));
        this.isLoaded = false;
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.flushTimeout = null;

        this.state = {
            identity: null, // { email, displayName, privKeyHex, pubkeyHex, seenFeedKeyHex }
            friends: {},    // { [email]: { email, displayName, status, pubkeyHex, seenFeedKeyHex, addedAt, lastSyncedAt, seenCount } }
            mySeenIds: [],  // string[]
            friendSeenMap: {} // { [email]: string[] }
        };

        this.mySeenSet = new Set();
        this.tweetToFriendsMap = new Map(); // tweetId -> string[] of friend labels
        this.wsPool = new Map();            // relayUrl -> pooled connection entry
        this.relayCooldownUntil = new Map(); // relayUrl -> timestamp ms
    }

    async init() {
        if (this.isLoaded) return;
        try {
            const stored = await chrome.storage.local.get([X_FRIENDS_STATE_KEY]);
            if (stored && stored[X_FRIENDS_STATE_KEY]) {
                const loaded = stored[X_FRIENDS_STATE_KEY];
                this.state.identity = loaded.identity || null;
                this.state.friends = loaded.friends || {};
                this.state.mySeenIds = Array.isArray(loaded.mySeenIds) ? loaded.mySeenIds : [];
                this.state.friendSeenMap = loaded.friendSeenMap || {};
                this.state.hasUnpublishedSeen = Boolean(loaded.hasUnpublishedSeen);
            }
        } catch (err) {
            console.warn('X Friends Sync: Failed to load state from storage', err);
        }

        this.pruneMySeenIds();
        this.rebuildIndex();
        this.isLoaded = true;
    }

    async saveState() {
        try {
            this.state.mySeenIds = Array.from(this.mySeenSet);
            await chrome.storage.local.set({
                [X_FRIENDS_STATE_KEY]: this.state
            });
        } catch (err) {
            console.warn('X Friends Sync: Failed to save state', err);
        }
    }

    isValidRecentTweetId(tweetId) {
        if (!tweetId || typeof tweetId !== 'string') return false;
        const trimmed = tweetId.trim();
        return /^\d{1,22}$/.test(trimmed);
    }

    isSnowflakeWithinAge(tweetId, nowMs = Date.now(), maxAgeMs = FRIEND_SYNC_CONFIG.MAX_AGE_MS) {
        if (!this.isValidRecentTweetId(tweetId)) return false;
        try {
            const idBig = BigInt(tweetId.trim());
            if (idBig >= MIN_SNOWFLAKE_ID) {
                const createdMs = Number((idBig >> 22n) + TWITTER_EPOCH_MS);
                if (createdMs <= nowMs && (nowMs - createdMs) > maxAgeMs) {
                    return false;
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    pruneMySeenIds() {
        const valid = this.state.mySeenIds.filter(id => this.isValidRecentTweetId(id));
        const capped = valid.slice(-FRIEND_SYNC_CONFIG.MAX_SEEN_IDS);
        this.state.mySeenIds = capped;
        this.mySeenSet = new Set(capped);
    }

    rebuildIndex() {
        this.tweetToFriendsMap.clear();
        for (const [email, friend] of Object.entries(this.state.friends)) {
            if (friend.status !== 'connected') continue;
            const seenList = this.state.friendSeenMap[email] || [];
            const label = friend.displayName && friend.displayName !== email
                ? `${friend.displayName} (${email})`
                : email;

            for (const tweetId of seenList) {
                let list = this.tweetToFriendsMap.get(tweetId);
                if (!list) {
                    list = [];
                    this.tweetToFriendsMap.set(tweetId, list);
                }
                if (!list.includes(label)) {
                    list.push(label);
                }
            }
        }
    }

    getPublicState() {
        const friendsArray = Object.values(this.state.friends).map(f => ({
            email: f.email,
            displayName: f.displayName || f.email,
            status: f.status,
            addedAt: f.addedAt,
            lastSyncedAt: f.lastSyncedAt || null,
            seenCount: (this.state.friendSeenMap[f.email] || []).length
        }));

        return {
            identity: this.state.identity ? {
                email: this.state.identity.email,
                displayName: this.state.identity.displayName || this.state.identity.email,
                pubkeyHex: this.state.identity.pubkeyHex
            } : null,
            friends: friendsArray,
            mySeenCount: this.mySeenSet.size,
            lastSyncTime: this.lastSyncTime,
            isSyncing: this.isSyncing
        };
    }

    async setIdentity(email, displayName = '') {
        await this.init();
        const normEmail = normalizeIdentifier(email);
        if (!normEmail || normEmail.length < 3) {
            throw new Error('Please enter a valid email or alias (min 3 characters).');
        }

        const cleanName = (displayName || '').trim() || normEmail.split('@')[0];
        const existing = this.state.identity;

        if (existing && existing.email === normEmail) {
            existing.displayName = cleanName;
        } else {
            const privKeyHex = existing?.privKeyHex || generateSecretKeyHex();
            const pubkeyHex = getPublicKeyHex(privKeyHex);
            const seenFeedKeyHex = existing?.seenFeedKeyHex || generateRandomBytesHex(32);

            this.state.identity = {
                email: normEmail,
                displayName: cleanName,
                privKeyHex,
                pubkeyHex,
                seenFeedKeyHex
            };
        }

        await this.saveState();
        // Publish seen snapshot and re-announce handshakes for any existing friends
        await this.publishAllHandshakes().catch(() => {});
        await this.publishMySeenSnapshot().catch(() => {});
        await this.syncWithRelays().catch(() => {});
        return this.getPublicState();
    }

    async addFriend(friendEmail, friendDisplayName = '') {
        await this.init();
        if (!this.state.identity) {
            throw new Error('Set your own email/alias first before adding friends.');
        }

        const normFriend = normalizeIdentifier(friendEmail);
        if (!normFriend || normFriend.length < 3) {
            throw new Error('Please enter a valid friend email or alias.');
        }
        if (normFriend === this.state.identity.email) {
            throw new Error('You cannot add yourself as a friend.');
        }

        const existing = this.state.friends[normFriend];
        if (existing && existing.status === 'pending_incoming') {
            // Mutual match! Accept immediately
            return this.acceptFriend(normFriend);
        }

        this.state.friends[normFriend] = {
            email: normFriend,
            displayName: (friendDisplayName || '').trim() || existing?.displayName || normFriend,
            status: existing?.status === 'connected' ? 'connected' : 'pending_outgoing',
            pubkeyHex: existing?.pubkeyHex || null,
            seenFeedKeyHex: existing?.seenFeedKeyHex || null,
            addedAt: existing?.addedAt || Date.now(),
            lastSyncedAt: existing?.lastSyncedAt || null,
            seenCount: (this.state.friendSeenMap[normFriend] || []).length
        };

        await this.saveState();
        await this.publishHandshakeForFriend(normFriend).catch(() => {});
        await this.syncWithRelays().catch(() => {});
        return this.getPublicState();
    }

    async acceptFriend(friendEmail) {
        await this.init();
        if (!this.state.identity) {
            throw new Error('Identity not configured.');
        }

        const normFriend = normalizeIdentifier(friendEmail);
        const friend = this.state.friends[normFriend];
        if (!friend) {
            throw new Error('Friend request not found.');
        }

        friend.status = friend.pubkeyHex && friend.seenFeedKeyHex ? 'connected' : 'pending_outgoing';
        await this.saveState();

        await this.publishHandshakeForFriend(normFriend).catch(() => {});
        await this.publishMySeenSnapshot().catch(() => {});
        await this.syncWithRelays().catch(() => {});
        return this.getPublicState();
    }

    async removeFriend(friendEmail) {
        await this.init();
        const normFriend = normalizeIdentifier(friendEmail);
        const wasConnected = this.state.friends[normFriend]?.status === 'connected';

        delete this.state.friends[normFriend];
        delete this.state.friendSeenMap[normFriend];
        this.rebuildIndex();

        if (wasConnected && this.state.identity) {
            // Rotate feed key so removed friend can no longer decrypt future snapshots
            this.state.identity.seenFeedKeyHex = generateRandomBytesHex(32);
            await this.saveState();
            await this.publishAllHandshakes().catch(() => {});
            await this.publishMySeenSnapshot().catch(() => {});
        } else {
            await this.saveState();
        }

        return this.getPublicState();
    }

    async markTweetsSeen(tweetIds) {
        await this.init();
        if (!Array.isArray(tweetIds) || tweetIds.length === 0) return { added: 0 };

        let added = 0;
        const now = Date.now();
        for (const rawId of tweetIds) {
            const id = String(rawId).trim();
            if (!this.mySeenSet.has(id) && this.isValidRecentTweetId(id, now)) {
                this.mySeenSet.add(id);
                added++;
            }
        }

        if (added > 0) {
            if (this.mySeenSet.size > FRIEND_SYNC_CONFIG.MAX_SEEN_IDS) {
                const arr = Array.from(this.mySeenSet).slice(-FRIEND_SYNC_CONFIG.MAX_SEEN_IDS);
                this.mySeenSet = new Set(arr);
            }
            this.state.hasUnpublishedSeen = true;
            await this.saveState();
            this.scheduleSnapshotFlush();
        }

        return { added, totalSeen: this.mySeenSet.size };
    }

    checkTweetsSeen(tweetIds) {
        if (!Array.isArray(tweetIds) || tweetIds.length === 0) return {};
        const results = {};
        for (const rawId of tweetIds) {
            const id = String(rawId).trim();
            const seenBy = this.tweetToFriendsMap.get(id);
            if (seenBy && seenBy.length > 0) {
                results[id] = seenBy;
            }
        }
        return results;
    }

    scheduleSnapshotFlush() {
        if (!this.state.identity) return;
        if (this.flushTimeout) clearTimeout(this.flushTimeout);
        this.flushTimeout = setTimeout(() => {
            this.flushTimeout = null;
            this.publishMySeenSnapshot().catch(() => {});
        }, FRIEND_SYNC_CONFIG.BATCH_FLUSH_DELAY_MS);
    }

    // --- Nostr Event Builders & Publishers ---

    async buildHandshakeEvents(friendEmail) {
        const id = this.state.identity;
        if (!id) return [];

        const normFriend = normalizeIdentifier(friendEmail);
        const { inboxTag, inboxKeyHex } = await deriveInboxInfo(normFriend);
        const { pairKeyHex, outgoingTag } = await derivePairwiseInfo(id.email, normFriend);

        const nowSec = Math.floor(Date.now() / 1000);

        // 1. Inbox Notification Event (so friend sees incoming request by email)
        const invitePayload = {
            type: '414x_invite_v1',
            fromEmail: id.email,
            fromName: id.displayName,
            pubkeyHex: id.pubkeyHex,
            timestamp: Date.now()
        };
        const encryptedInvite = await encryptJson(invitePayload, inboxKeyHex);
        const inviteDTag = `${inboxTag}:${id.pubkeyHex.slice(0, 16)}`;
        const inviteEvent = await signEvent({
            kind: FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA,
            created_at: nowSec,
            tags: [
                ['d', inviteDTag],
                ['t', inboxTag]
            ],
            content: encryptedInvite
        }, id.privKeyHex);

        // 2. Pairwise Handshake Event (unlocks seenFeedKeyHex for mutually matched friend)
        const handshakePayload = {
            type: '414x_handshake_v1',
            fromEmail: id.email,
            toEmail: normFriend,
            displayName: id.displayName,
            pubkeyHex: id.pubkeyHex,
            seenFeedKeyHex: id.seenFeedKeyHex,
            timestamp: Date.now()
        };
        const encryptedHandshake = await encryptJson(handshakePayload, pairKeyHex);
        const handshakeEvent = await signEvent({
            kind: FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA,
            created_at: nowSec,
            tags: [
                ['d', outgoingTag],
                ['t', outgoingTag]
            ],
            content: encryptedHandshake
        }, id.privKeyHex);

        return [inviteEvent, handshakeEvent];
    }

    async publishHandshakeForFriend(friendEmail) {
        const events = await this.buildHandshakeEvents(friendEmail);
        if (events.length > 0) {
            await this.publishEventsToRelays(events);
        }
    }

    async publishAllHandshakes() {
        if (!this.state.identity) return;
        const allEvents = [];
        for (const [email, friend] of Object.entries(this.state.friends)) {
            if (friend.status === 'connected' || friend.status === 'pending_outgoing') {
                const evs = await this.buildHandshakeEvents(email);
                allEvents.push(...evs);
            }
        }
        if (allEvents.length > 0) {
            await this.publishEventsToRelays(allEvents);
        }
    }

    async buildSeenSnapshotEvent() {
        const id = this.state.identity;
        if (!id) return null;

        this.pruneMySeenIds();
        const payload = {
            v: 1,
            email: id.email,
            displayName: id.displayName,
            updatedAt: Date.now(),
            ids: Array.from(this.mySeenSet)
        };

        const encryptedContent = await encryptJson(payload, id.seenFeedKeyHex);
        return signEvent({
            kind: FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', '414x-seen-v1']
            ],
            content: encryptedContent
        }, id.privKeyHex);
    }

    async publishMySeenSnapshot() {
        const event = await this.buildSeenSnapshotEvent();
        if (!event) return false;
        await this.publishEventsToRelays([event]);
        if (this.state.hasUnpublishedSeen) {
            this.state.hasUnpublishedSeen = false;
            await this.saveState();
        }
        return true;
    }

    async syncWithRelays() {
        await this.init();
        const id = this.state.identity;
        if (!id || this.isSyncing) return this.getPublicState();

        this.isSyncing = true;
        try {
            if (this.flushTimeout) {
                clearTimeout(this.flushTimeout);
                this.flushTimeout = null;
                this.state.hasUnpublishedSeen = true;
            }
            if (this.state.hasUnpublishedSeen) {
                await this.publishMySeenSnapshot().catch(() => {});
            }

            const { inboxTag, inboxKeyHex } = await deriveInboxInfo(id.email);
            const tTagsToQuery = [inboxTag];
            const pairwiseMap = new Map(); // incomingTag -> { friendEmail, pairKeyHex }

            for (const friendEmail of Object.keys(this.state.friends)) {
                const pairInfo = await derivePairwiseInfo(id.email, friendEmail);
                tTagsToQuery.push(pairInfo.incomingTag);
                pairwiseMap.set(pairInfo.incomingTag, {
                    friendEmail,
                    pairKeyHex: pairInfo.pairKeyHex
                });
            }

            // Step 1: Query Inbox & Incoming Pairwise Handshakes
            const discoveryFilters = [
                {
                    kinds: [FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA],
                    '#t': tTagsToQuery
                }
            ];

            const discoveryEvents = await this.queryRelays(discoveryFilters);
            let stateChanged = false;
            // Track all valid (pubkeyHex -> seenFeedKeyHex) per friend so multi-device / reinstalled keys all sync
            const friendFeedsMap = new Map(); // friendEmail -> Map<pubkeyHex, { seenFeedKeyHex, timestamp }>

            for (const [fEmail, fObj] of Object.entries(this.state.friends)) {
                if (fObj.pubkeyHex && fObj.seenFeedKeyHex) {
                    const m = new Map();
                    m.set(fObj.pubkeyHex, {
                        seenFeedKeyHex: fObj.seenFeedKeyHex,
                        timestamp: fObj.handshakeTimestamp || 0
                    });
                    friendFeedsMap.set(fEmail, m);
                }
            }

            for (const ev of discoveryEvents) {
                const tTagValues = (ev.tags || []).filter(t => t[0] === 't').map(t => t[1]);
                const dTagValue = (ev.tags || []).find(t => t[0] === 'd')?.[1] || '';
                const evTimeMs = (ev.created_at || 0) * 1000;

                // Check if it's an inbox invite for us
                if (tTagValues.includes(inboxTag) || dTagValue.startsWith(inboxTag)) {
                    const invite = await decryptJson(ev.content, inboxKeyHex);
                    if (invite && invite.type === '414x_invite_v1' && invite.fromEmail) {
                        const fromEmail = normalizeIdentifier(invite.fromEmail);
                        if (fromEmail && fromEmail !== id.email) {
                            const existing = this.state.friends[fromEmail];
                            if (!existing) {
                                this.state.friends[fromEmail] = {
                                    email: fromEmail,
                                    displayName: invite.fromName || fromEmail,
                                    status: 'pending_incoming',
                                    pubkeyHex: invite.pubkeyHex || ev.pubkey,
                                    seenFeedKeyHex: null,
                                    addedAt: invite.timestamp || Date.now(),
                                    lastSyncedAt: null,
                                    seenCount: 0
                                };
                                stateChanged = true;
                                // Also compute pairwise info so we can check if they already sent handshake
                                const pairInfo = await derivePairwiseInfo(id.email, fromEmail);
                                pairwiseMap.set(pairInfo.incomingTag, {
                                    friendEmail: fromEmail,
                                    pairKeyHex: pairInfo.pairKeyHex
                                });
                            } else if (existing.displayName === existing.email && invite.fromName) {
                                existing.displayName = invite.fromName;
                                stateChanged = true;
                            }
                        }
                    }
                }

                // Check if it's a pairwise handshake from a friend
                for (const tag of [...tTagValues, dTagValue]) {
                    const pairMeta = pairwiseMap.get(tag);
                    if (pairMeta) {
                        const hs = await decryptJson(ev.content, pairMeta.pairKeyHex);
                        if (hs && hs.type === '414x_handshake_v1' && hs.seenFeedKeyHex && hs.pubkeyHex) {
                            const friend = this.state.friends[pairMeta.friendEmail];
                            if (friend) {
                                const hsTime = hs.timestamp || evTimeMs;
                                let feeds = friendFeedsMap.get(pairMeta.friendEmail);
                                if (!feeds) {
                                    feeds = new Map();
                                    friendFeedsMap.set(pairMeta.friendEmail, feeds);
                                }
                                feeds.set(hs.pubkeyHex, {
                                    seenFeedKeyHex: hs.seenFeedKeyHex,
                                    timestamp: hsTime
                                });

                                // Only overwrite primary pubkey/seenFeedKey if this handshake is newer or equal
                                const prevHsTime = friend.handshakeTimestamp || 0;
                                if (!friend.pubkeyHex || !friend.seenFeedKeyHex || hsTime >= prevHsTime) {
                                    if (friend.pubkeyHex !== hs.pubkeyHex || friend.seenFeedKeyHex !== hs.seenFeedKeyHex) {
                                        stateChanged = true;
                                    }
                                    friend.pubkeyHex = hs.pubkeyHex;
                                    friend.seenFeedKeyHex = hs.seenFeedKeyHex;
                                    friend.handshakeTimestamp = hsTime;
                                }
                                if (hs.displayName && friend.displayName !== hs.displayName) {
                                    friend.displayName = hs.displayName;
                                    stateChanged = true;
                                }
                                if (friend.status === 'pending_outgoing') {
                                    friend.status = 'connected';
                                    stateChanged = true;
                                }
                            }
                        }
                    }
                }
            }

            // Step 2: Query Seen-Tweet Snapshots for all Connected Friends
            const connectedFriends = Object.values(this.state.friends).filter(
                f => f.status === 'connected' && f.pubkeyHex && f.seenFeedKeyHex
            );

            if (connectedFriends.length > 0) {
                const pubkeyToTargets = new Map(); // pubkeyHex -> Array<{ friend, seenFeedKeyHex }>
                for (const f of connectedFriends) {
                    const feeds = friendFeedsMap.get(f.email);
                    if (feeds && feeds.size > 0) {
                        for (const [pk, meta] of feeds.entries()) {
                            const list = pubkeyToTargets.get(pk) || [];
                            list.push({ friend: f, seenFeedKeyHex: meta.seenFeedKeyHex });
                            pubkeyToTargets.set(pk, list);
                        }
                    } else {
                        const list = pubkeyToTargets.get(f.pubkeyHex) || [];
                        list.push({ friend: f, seenFeedKeyHex: f.seenFeedKeyHex });
                        pubkeyToTargets.set(f.pubkeyHex, list);
                    }
                }

                const feedFilter = [
                    {
                        kinds: [FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA],
                        authors: Array.from(pubkeyToTargets.keys()),
                        '#d': ['414x-seen-v1']
                    }
                ];

                const feedEvents = await this.queryRelays(feedFilter);
                const now = Date.now();
                const mergedFriendIds = new Map(); // friendEmail -> Set<string>

                for (const ev of feedEvents) {
                    const targets = pubkeyToTargets.get(ev.pubkey) || [];
                    for (const { friend, seenFeedKeyHex } of targets) {
                        const decrypted = await decryptJson(ev.content, seenFeedKeyHex);
                        if (decrypted && Array.isArray(decrypted.ids)) {
                            let idSet = mergedFriendIds.get(friend.email);
                            if (!idSet) {
                                idSet = new Set();
                                mergedFriendIds.set(friend.email, idSet);
                            }
                            for (const rawId of decrypted.ids) {
                                const tid = String(rawId).trim();
                                if (this.isValidRecentTweetId(tid, now)) {
                                    idSet.add(tid);
                                }
                            }
                            if (decrypted.displayName) {
                                friend.displayName = decrypted.displayName;
                            }
                        }
                    }
                }

                for (const [fEmail, idSet] of mergedFriendIds.entries()) {
                    const friend = this.state.friends[fEmail];
                    if (!friend) continue;
                    const validIds = Array.from(idSet).slice(-FRIEND_SYNC_CONFIG.MAX_SEEN_IDS);
                    this.state.friendSeenMap[fEmail] = validIds;
                    friend.lastSyncedAt = now;
                    friend.seenCount = validIds.length;
                    stateChanged = true;
                }
            }

            this.lastSyncTime = Date.now();
            if (stateChanged) {
                this.rebuildIndex();
                await this.saveState();
                this.broadcastSeenUpdateToTabs();
            }
        } catch (err) {
            console.warn('X Friends Sync: Relay sync error', err);
        } finally {
            this.isSyncing = false;
        }

        return this.getPublicState();
    }

    broadcastSeenUpdateToTabs() {
        try {
            if (!chrome?.tabs?.query) return;
            chrome.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] }, (tabs) => {
                if (!Array.isArray(tabs)) return;
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, { action: 'X_FRIENDS_SEEN_UPDATED' }).catch(() => {});
                    }
                });
            });
        } catch (e) {
            // Ignore tab messaging errors
        }
    }

    // --- Low-Level WebSocket Relay Operations (Pooled & Multiplexed) ---

    getOrOpenRelayEntry(relayUrl) {
        const cooldown = this.relayCooldownUntil.get(relayUrl);
        if (cooldown && Date.now() < cooldown) {
            return Promise.resolve(null);
        }

        const existing = this.wsPool.get(relayUrl);
        if (existing && existing.ws && (existing.ws.readyState === 0 || existing.ws.readyState === 1)) {
            this.touchRelayEntry(existing);
            return existing.openPromise;
        }

        const entry = {
            relayUrl,
            ws: null,
            listeners: new Set(),
            idleTimer: null,
            openPromise: null
        };

        entry.openPromise = new Promise((resolve) => {
            let settled = false;
            const fail = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimer);
                this.wsPool.delete(relayUrl);
                // Put failed relay on 3-minute cooldown to prevent repeated handshake errors
                this.relayCooldownUntil.set(relayUrl, Date.now() + 3 * 60 * 1000);
                try {
                    if (entry.ws && (entry.ws.readyState === 0 || entry.ws.readyState === 1)) {
                        entry.ws.close();
                    }
                } catch (e) {}
                resolve(null);
            };

            const connectTimer = setTimeout(fail, FRIEND_SYNC_CONFIG.RELAY_TIMEOUT_MS);
            if (typeof connectTimer?.unref === 'function') connectTimer.unref();

            try {
                const ws = this.webSocketFactory(relayUrl);
                entry.ws = ws;

                ws.onopen = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(connectTimer);
                    this.relayCooldownUntil.delete(relayUrl);
                    this.touchRelayEntry(entry);
                    resolve(entry);
                };

                ws.onmessage = (msg) => {
                    for (const listener of Array.from(entry.listeners)) {
                        try {
                            listener(msg);
                        } catch (e) {}
                    }
                };

                ws.onerror = () => {
                    if (!settled) {
                        fail();
                    } else {
                        this.closeRelayEntry(entry);
                    }
                };

                ws.onclose = () => {
                    this.wsPool.delete(relayUrl);
                    if (!settled) {
                        settled = true;
                        clearTimeout(connectTimer);
                        resolve(null);
                    }
                };
            } catch (err) {
                fail();
            }
        });

        this.wsPool.set(relayUrl, entry);
        return entry.openPromise;
    }

    touchRelayEntry(entry) {
        if (entry.idleTimer) clearTimeout(entry.idleTimer);
        entry.idleTimer = setTimeout(() => {
            if (entry.listeners.size === 0) {
                this.closeRelayEntry(entry);
            }
        }, 8000);
        if (typeof entry.idleTimer?.unref === 'function') entry.idleTimer.unref();
    }

    closeRelayEntry(entry) {
        if (!entry) return;
        if (entry.idleTimer) {
            clearTimeout(entry.idleTimer);
            entry.idleTimer = null;
        }
        this.wsPool.delete(entry.relayUrl);
        try {
            if (entry.ws && (entry.ws.readyState === 0 || entry.ws.readyState === 1)) {
                entry.ws.close();
            }
        } catch (e) {}
    }

    async publishEventsToRelays(events) {
        if (!events || events.length === 0 || !this.relays || this.relays.length === 0) return;

        const targetIds = new Set(events.map(e => e.id));

        const tasks = this.relays.map(async (relayUrl) => {
            const entry = await this.getOrOpenRelayEntry(relayUrl);
            if (!entry || !entry.ws || entry.ws.readyState !== 1) return;

            await new Promise((resolve) => {
                let settled = false;
                let okCount = 0;

                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    entry.listeners.delete(onMessage);
                    this.touchRelayEntry(entry);
                    resolve();
                };

                const timer = setTimeout(finish, FRIEND_SYNC_CONFIG.RELAY_TIMEOUT_MS);
                if (typeof timer?.unref === 'function') timer.unref();

                const onMessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (Array.isArray(data) && data[0] === 'OK' && targetIds.has(data[1])) {
                            okCount++;
                            if (okCount >= events.length) finish();
                        }
                    } catch (e) {}
                };

                entry.listeners.add(onMessage);
                try {
                    for (const ev of events) {
                        entry.ws.send(JSON.stringify(['EVENT', ev]));
                    }
                } catch (err) {
                    finish();
                }
            });
        });

        await Promise.allSettled(tasks);
    }

    async queryRelays(filters) {
        if (!filters || filters.length === 0 || !this.relays || this.relays.length === 0) return [];

        const collectedByKey = new Map(); // replaceableKey -> event
        const subId = '414x_' + Math.random().toString(36).slice(2, 10);

        const tasks = this.relays.map(async (relayUrl) => {
            const entry = await this.getOrOpenRelayEntry(relayUrl);
            if (!entry || !entry.ws || entry.ws.readyState !== 1) return;

            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    entry.listeners.delete(onMessage);
                    try {
                        if (entry.ws && entry.ws.readyState === 1) {
                            entry.ws.send(JSON.stringify(['CLOSE', subId]));
                        }
                    } catch (e) {}
                    this.touchRelayEntry(entry);
                    resolve();
                };

                const timer = setTimeout(finish, FRIEND_SYNC_CONFIG.RELAY_TIMEOUT_MS);
                if (typeof timer?.unref === 'function') timer.unref();

                const onMessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (!Array.isArray(data)) return;
                        if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
                            const ev = data[2];
                            const dTag = (ev.tags || []).find(t => t[0] === 'd')?.[1] || '';
                            const key = `${ev.pubkey}:${ev.kind}:${dTag}`;
                            const existing = collectedByKey.get(key);
                            if (!existing || ev.created_at >= existing.created_at) {
                                collectedByKey.set(key, ev);
                            }
                        } else if (data[0] === 'EOSE' && data[1] === subId) {
                            finish();
                        }
                    } catch (e) {}
                };

                entry.listeners.add(onMessage);
                try {
                    entry.ws.send(JSON.stringify(['REQ', subId, ...filters]));
                } catch (err) {
                    finish();
                }
            });
        });

        await Promise.allSettled(tasks);

        const verifiedEvents = [];
        for (const ev of collectedByKey.values()) {
            const valid = await verifyEvent(ev);
            if (valid) verifiedEvents.push(ev);
        }
        verifiedEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        return verifiedEvents;
    }
}

export const friendsSync = new XFriendsSyncManager();
