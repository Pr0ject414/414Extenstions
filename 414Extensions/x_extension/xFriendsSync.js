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
    deriveSelfSyncInfo,
    encryptJson,
    decryptJson
} from './xNostrCrypto.js';

const TWITTER_EPOCH_MS = 1288834974657n;
const MIN_SNOWFLAKE_ID = 300000000000000n;

export const SELF_SYNC_PREF_KEYS = [
    'blockedCountries',
    'blockedDeviceRegions',
    'blockedNameFlags',
    'isXLocationEnabled',
    'isXHideAdsEnabled',
    'isXAlwaysMuteEnabled',
    'isXFriendsSyncEnabled',
    'xVolumeLevel'
];

export class XFriendsSyncManager {
    constructor(options = {}) {
        this.relays = options.relays || FRIEND_SYNC_CONFIG.RELAYS;
        this.webSocketFactory = options.webSocketFactory || ((url) => new WebSocket(url));
        this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
        this.onNotification = options.onNotification || null;
        this.isLoaded = false;
        this.isSyncing = false;
        this.pendingSyncRequested = false;
        this.lastSyncTime = null;
        this.lastPublishedCreatedAtSec = 0;
        this.flushTimeout = null;
        this.inflightHydrations = new Map();
        this.lastSyncNotifications = { newInvites: [], newForcedPosts: [] };

        this.state = {
            identity: null, // { email, displayName, passphrase, privKeyHex, pubkeyHex, seenFeedKeyHex, identityCreatedAt }
            friends: {},    // { [email]: { email, displayName, status, pubkeyHex, seenFeedKeyHex, addedAt, lastSyncedAt, seenCount } }
            removedFriends: {}, // { [email]: removedAtMs }
            mySeenIds: [],  // string[]
            friendSeenMap: {}, // { [email]: string[] }
            postMetaMap: {},   // { [tweetId]: TweetMeta }
            myForcedMap: {},   // { [tweetId]: { id, forcedAt } }
            unforcedMap: {},   // { [tweetId]: unforcedAtMs }
            friendForcedMap: {}, // { [email]: Array<{ id, forcedAt }> }
            dismissedForcedIds: [], // string[]
            notifiedForcedIds: [],  // string[]
            notifiedInviteEmails: [], // string[]
            preferencesUpdatedAt: 0,
            lastKnownPrefsJson: '',
            selfSyncLastSyncedAt: null
        };

        this.mySeenSet = new Set();
        this.dismissedForcedSet = new Set();
        this.notifiedForcedSet = new Set();
        this.notifiedInviteSet = new Set();
        this.tweetToFriendsMap = new Map(); // tweetId -> string[] of friend labels
        this.tweetToForcedByMap = new Map(); // tweetId -> Array<{ label, email, forcedAt }>
        this.wsPool = new Map();            // relayUrl -> pooled connection entry
        this.relayCooldownUntil = new Map(); // relayUrl -> timestamp ms
        this.relayFailureCounts = new Map(); // relayUrl -> consecutive failure count
    }

    async init() {
        if (this.isLoaded) return;
        try {
            const stored = await chrome.storage.local.get([X_FRIENDS_STATE_KEY]);
            if (stored && stored[X_FRIENDS_STATE_KEY]) {
                const loaded = stored[X_FRIENDS_STATE_KEY];
                this.state.identity = loaded.identity || null;
                this.state.friends = loaded.friends || {};
                this.state.removedFriends = (loaded.removedFriends && typeof loaded.removedFriends === 'object') ? loaded.removedFriends : {};
                this.state.mySeenIds = Array.isArray(loaded.mySeenIds) ? loaded.mySeenIds : [];
                this.state.friendSeenMap = loaded.friendSeenMap || {};
                this.state.postMetaMap = (loaded.postMetaMap && typeof loaded.postMetaMap === 'object') ? loaded.postMetaMap : {};
                this.state.myForcedMap = (loaded.myForcedMap && typeof loaded.myForcedMap === 'object') ? loaded.myForcedMap : {};
                this.state.unforcedMap = (loaded.unforcedMap && typeof loaded.unforcedMap === 'object') ? loaded.unforcedMap : {};
                this.state.friendForcedMap = (loaded.friendForcedMap && typeof loaded.friendForcedMap === 'object') ? loaded.friendForcedMap : {};
                this.state.dismissedForcedIds = Array.isArray(loaded.dismissedForcedIds) ? loaded.dismissedForcedIds : [];
                this.state.notifiedForcedIds = Array.isArray(loaded.notifiedForcedIds) ? loaded.notifiedForcedIds : [];
                this.state.notifiedInviteEmails = Array.isArray(loaded.notifiedInviteEmails) ? loaded.notifiedInviteEmails : [];
                this.state.hasUnpublishedSeen = Boolean(loaded.hasUnpublishedSeen);
                this.state.preferencesUpdatedAt = Number(loaded.preferencesUpdatedAt) || 0;
                this.state.lastKnownPrefsJson = typeof loaded.lastKnownPrefsJson === 'string' ? loaded.lastKnownPrefsJson : '';
                this.state.selfSyncLastSyncedAt = loaded.selfSyncLastSyncedAt || null;
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
            this.state.dismissedForcedIds = Array.from(this.dismissedForcedSet);
            this.state.notifiedForcedIds = Array.from(this.notifiedForcedSet);
            this.state.notifiedInviteEmails = Array.from(this.notifiedInviteSet);
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

    getSnowflakeTimestampMs(tweetId) {
        if (!this.isValidRecentTweetId(tweetId)) return 0;
        try {
            const idBig = BigInt(tweetId.trim());
            if (idBig >= MIN_SNOWFLAKE_ID) {
                return Number((idBig >> 22n) + TWITTER_EPOCH_MS);
            }
            return 0;
        } catch (e) {
            return 0;
        }
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

    getMediaAssetKey(url) {
        if (!url || typeof url !== 'string') return '';
        const noQuery = url.split('?')[0].trim();
        const mediaMatch = noQuery.match(/\/media\/([A-Za-z0-9_-]+)/);
        if (mediaMatch && mediaMatch[1]) return `media:${mediaMatch[1]}`;
        const videoMatch = noQuery.match(/\/(?:ext_tw_video|amplify_video|tweet_video)\/(\d+)/);
        if (videoMatch && videoMatch[1]) return `video:${videoMatch[1]}`;
        return noQuery.replace(/\.(jpg|jpeg|png|webp|gif|mp4)$/i, '');
    }

    sanitizeTweetMeta(tweetId, rawMeta) {
        if (!this.isValidRecentTweetId(tweetId) || !rawMeta || typeof rawMeta !== 'object') return null;
        const id = String(tweetId).trim();
        const existing = this.state.postMetaMap[id] || {};

        if (rawMeta.isUnavailable) {
            const hasExistingContent = Boolean(
                existing.screenName ||
                existing.text ||
                (Array.isArray(existing.media) && existing.media.length > 0) ||
                existing.quotedTweet ||
                existing.parentTweet
            );
            if (hasExistingContent) {
                return {
                    ...existing,
                    isHydrated: true,
                    hydrationVersion: 4,
                    updatedAt: rawMeta.updatedAt || existing.updatedAt || Date.now()
                };
            }
            return {
                id,
                isUnavailable: true,
                isHydrated: true,
                hydrationVersion: 3,
                updatedAt: rawMeta.updatedAt || existing.updatedAt || Date.now()
            };
        }

        // Do not let unhydrated relay/DOM snapshots overwrite already-hydrated authoritative metadata
        const keepExistingHydrated = Boolean(existing.isHydrated && !rawMeta.isHydrated);

        const screenName = keepExistingHydrated && existing.screenName
            ? existing.screenName
            : ((typeof rawMeta.screenName === 'string' && rawMeta.screenName.trim())
                ? rawMeta.screenName.trim().replace(/^@/, '').slice(0, 30)
                : (existing.screenName || ''));
        const authorName = keepExistingHydrated && existing.authorName
            ? existing.authorName
            : ((typeof rawMeta.authorName === 'string' && rawMeta.authorName.trim())
                ? rawMeta.authorName.trim().slice(0, 80)
                : (existing.authorName || screenName || ''));
        const avatarUrl = keepExistingHydrated && existing.avatarUrl
            ? existing.avatarUrl
            : ((typeof rawMeta.avatarUrl === 'string' && rawMeta.avatarUrl.startsWith('http'))
                ? rawMeta.avatarUrl.trim().slice(0, 350)
                : (existing.avatarUrl || ''));
        const isVerified = keepExistingHydrated
            ? Boolean(existing.isVerified || rawMeta.isVerified)
            : Boolean(rawMeta.isVerified ?? existing.isVerified);
        const text = keepExistingHydrated
            ? (existing.text || '')
            : ((rawMeta.isHydrated && typeof rawMeta.text === 'string')
                ? rawMeta.text.trim().slice(0, 1000)
                : ((typeof rawMeta.text === 'string' && rawMeta.text.trim())
                    ? rawMeta.text.trim().slice(0, 1000)
                    : (existing.text || '')));
        const createdAt = (keepExistingHydrated && existing.createdAt)
            ? existing.createdAt
            : (rawMeta.createdAt || existing.createdAt || null);
        const favoriteCount = typeof rawMeta.favoriteCount === 'number' && rawMeta.favoriteCount > 0
            ? Math.max(rawMeta.favoriteCount, existing.favoriteCount || 0)
            : (existing.favoriteCount || 0);
        const replyCount = typeof rawMeta.replyCount === 'number' && rawMeta.replyCount > 0
            ? Math.max(rawMeta.replyCount, existing.replyCount || 0)
            : (existing.replyCount || 0);
        const retweetCount = typeof rawMeta.retweetCount === 'number' && rawMeta.retweetCount > 0
            ? Math.max(rawMeta.retweetCount, existing.retweetCount || 0)
            : (existing.retweetCount || 0);
        const viewCount = typeof rawMeta.viewCount === 'number' && rawMeta.viewCount > 0
            ? Math.max(rawMeta.viewCount, existing.viewCount || 0)
            : (existing.viewCount || 0);
        const isHydrated = Boolean(rawMeta.isHydrated || existing.isHydrated);
        const hydrationVersion = rawMeta.isHydrated
            ? (rawMeta.hydrationVersion || 3)
            : (existing.hydrationVersion || rawMeta.hydrationVersion || 0);
        const permalink = (typeof rawMeta.permalink === 'string' && rawMeta.permalink.startsWith('http'))
            ? rawMeta.permalink.trim().slice(0, 200)
            : (existing.permalink || (screenName ? `https://x.com/${screenName}/status/${id}` : `https://x.com/i/status/${id}`));

        const normalizeMediaArray = (rawArr, prevArr = [], isAuthoritative = false) => {
            if (!Array.isArray(rawArr) || rawArr.length === 0) {
                return isAuthoritative ? [] : prevArr;
            }
            return rawArr
                .filter(m => m && typeof m === 'object' && (m.url || m.posterUrl || m.videoUrl))
                .slice(0, 4)
                .map((m, idx) => {
                    const prev = prevArr[idx] || {};
                    const isVid = m.type === 'video' || m.type === 'animated_gif';
                    return {
                        type: isVid ? m.type : 'photo',
                        url: typeof m.url === 'string' && m.url ? m.url.slice(0, 450) : (prev.url || ''),
                        posterUrl: typeof m.posterUrl === 'string' && m.posterUrl ? m.posterUrl.slice(0, 450) : (prev.posterUrl || ''),
                        videoUrl: typeof m.videoUrl === 'string' && m.videoUrl ? m.videoUrl.slice(0, 500) : (prev.videoUrl || '')
                    };
                });
        };

        let quotedTweet = existing.quotedTweet || null;
        if (!keepExistingHydrated && rawMeta.quotedTweet && typeof rawMeta.quotedTweet === 'object') {
            const prevQ = existing.quotedTweet || {};
            const qId = typeof rawMeta.quotedTweet.id === 'string' && rawMeta.quotedTweet.id.trim()
                ? rawMeta.quotedTweet.id.trim()
                : (prevQ.id || '');
            const qScreenName = typeof rawMeta.quotedTweet.screenName === 'string' && rawMeta.quotedTweet.screenName.trim()
                ? rawMeta.quotedTweet.screenName.trim().replace(/^@/, '').slice(0, 30)
                : (prevQ.screenName || '');
            const qAuthorName = typeof rawMeta.quotedTweet.authorName === 'string' && rawMeta.quotedTweet.authorName.trim()
                ? rawMeta.quotedTweet.authorName.trim().slice(0, 80)
                : (prevQ.authorName || qScreenName || '');
            const qAvatarUrl = typeof rawMeta.quotedTweet.avatarUrl === 'string' && rawMeta.quotedTweet.avatarUrl.startsWith('http')
                ? rawMeta.quotedTweet.avatarUrl.trim().slice(0, 350)
                : (prevQ.avatarUrl || '');
            const qText = (rawMeta.isHydrated && typeof rawMeta.quotedTweet.text === 'string')
                ? rawMeta.quotedTweet.text.trim().slice(0, 500)
                : ((typeof rawMeta.quotedTweet.text === 'string' && rawMeta.quotedTweet.text.trim())
                    ? rawMeta.quotedTweet.text.trim().slice(0, 500)
                    : (prevQ.text || ''));
            const qMedia = normalizeMediaArray(rawMeta.quotedTweet.media, prevQ.media || [], Boolean(rawMeta.isHydrated));
            const qCreatedAt = rawMeta.quotedTweet.createdAt || prevQ.createdAt || null;
            const qInReplyTo = typeof rawMeta.quotedTweet.inReplyToScreenName === 'string' && rawMeta.quotedTweet.inReplyToScreenName.trim()
                ? rawMeta.quotedTweet.inReplyToScreenName.trim().replace(/^@/, '').slice(0, 30)
                : (prevQ.inReplyToScreenName || '');
            if (qScreenName || qAuthorName || qText || qMedia.length > 0) {
                quotedTweet = {
                    id: qId,
                    screenName: qScreenName,
                    authorName: qAuthorName,
                    avatarUrl: qAvatarUrl,
                    isVerified: Boolean(rawMeta.quotedTweet.isVerified ?? prevQ.isVerified),
                    createdAt: qCreatedAt,
                    inReplyToScreenName: qInReplyTo,
                    text: qText,
                    media: qMedia
                };
            }
        }

        const rawOuterMedia = keepExistingHydrated
            ? (existing.media || [])
            : normalizeMediaArray(rawMeta.media, existing.media || [], Boolean(rawMeta.isHydrated));

        const quoteAssetKeys = new Set(
            (quotedTweet && Array.isArray(quotedTweet.media))
                ? quotedTweet.media.map(m => this.getMediaAssetKey(m.url || m.posterUrl)).filter(Boolean)
                : []
        );
        const media = quoteAssetKeys.size > 0
            ? rawOuterMedia.filter(m => !quoteAssetKeys.has(this.getMediaAssetKey(m.url || m.posterUrl)))
            : rawOuterMedia;

        let parentTweet = existing.parentTweet || null;
        if (!keepExistingHydrated && rawMeta.parentTweet && typeof rawMeta.parentTweet === 'object') {
            const prevP = existing.parentTweet || {};
            const pId = typeof rawMeta.parentTweet.id === 'string' && rawMeta.parentTweet.id.trim()
                ? rawMeta.parentTweet.id.trim()
                : (prevP.id || '');
            const pScreenName = typeof rawMeta.parentTweet.screenName === 'string' && rawMeta.parentTweet.screenName.trim()
                ? rawMeta.parentTweet.screenName.trim().replace(/^@/, '').slice(0, 30)
                : (prevP.screenName || '');
            const pAuthorName = typeof rawMeta.parentTweet.authorName === 'string' && rawMeta.parentTweet.authorName.trim()
                ? rawMeta.parentTweet.authorName.trim().slice(0, 80)
                : (prevP.authorName || pScreenName || '');
            const pAvatarUrl = typeof rawMeta.parentTweet.avatarUrl === 'string' && rawMeta.parentTweet.avatarUrl.startsWith('http')
                ? rawMeta.parentTweet.avatarUrl.trim().slice(0, 350)
                : (prevP.avatarUrl || '');
            const pText = (rawMeta.isHydrated && typeof rawMeta.parentTweet.text === 'string')
                ? rawMeta.parentTweet.text.trim().slice(0, 500)
                : ((typeof rawMeta.parentTweet.text === 'string' && rawMeta.parentTweet.text.trim())
                    ? rawMeta.parentTweet.text.trim().slice(0, 500)
                    : (prevP.text || ''));
            const pMedia = normalizeMediaArray(rawMeta.parentTweet.media, prevP.media || [], Boolean(rawMeta.isHydrated));
            const pCreatedAt = rawMeta.parentTweet.createdAt || prevP.createdAt || null;
            const pInReplyTo = typeof rawMeta.parentTweet.inReplyToScreenName === 'string' && rawMeta.parentTweet.inReplyToScreenName.trim()
                ? rawMeta.parentTweet.inReplyToScreenName.trim().replace(/^@/, '').slice(0, 30)
                : (prevP.inReplyToScreenName || '');
            if (pScreenName || pAuthorName || pText || pMedia.length > 0) {
                parentTweet = {
                    id: pId,
                    screenName: pScreenName,
                    authorName: pAuthorName,
                    avatarUrl: pAvatarUrl,
                    isVerified: Boolean(rawMeta.parentTweet.isVerified ?? prevP.isVerified),
                    createdAt: pCreatedAt,
                    inReplyToScreenName: pInReplyTo,
                    text: pText,
                    media: pMedia
                };
            }
        }

        const inReplyToScreenName = keepExistingHydrated
            ? (existing.inReplyToScreenName || '')
            : (typeof rawMeta.inReplyToScreenName === 'string' && rawMeta.inReplyToScreenName.trim()
                ? rawMeta.inReplyToScreenName.trim().replace(/^@/, '').slice(0, 30)
                : (existing.inReplyToScreenName || ''));

        if (!screenName && !authorName && !text && media.length === 0 && !quotedTweet && !parentTweet) {
            return existing.id ? existing : null;
        }

        return {
            id,
            screenName,
            authorName,
            avatarUrl,
            isVerified,
            inReplyToScreenName,
            text,
            media,
            quotedTweet,
            parentTweet,
            createdAt,
            favoriteCount,
            replyCount,
            retweetCount,
            viewCount,
            isHydrated,
            hydrationVersion,
            permalink,
            updatedAt: rawMeta.updatedAt || existing.updatedAt || Date.now()
        };
    }

    cleanSyndicationText(rawText, entities = {}, quotedId = '', displayTextRange = null) {
        if (typeof rawText !== 'string' || !rawText) return '';
        let text = rawText;

        // Strip leading reply @mentions that precede display_text_range[0]
        if (Array.isArray(displayTextRange) && typeof displayTextRange[0] === 'number' && displayTextRange[0] > 0) {
            const codePoints = Array.from(text);
            const prefix = codePoints.slice(0, displayTextRange[0]).join('').trim();
            if (prefix && /^(?:@[a-zA-Z0-9_]{1,15}\s*)+$/.test(prefix)) {
                text = codePoints.slice(displayTextRange[0]).join('');
            }
        }

        if (Array.isArray(entities.urls)) {
            for (const u of entities.urls) {
                if (u && u.url) {
                    const expanded = u.expanded_url || '';
                    const display = u.display_url || '';
                    const isQuotedLink = quotedId && (expanded.includes(`/status/${quotedId}`) || display.includes(`/status/${quotedId}`));
                    const replacement = isQuotedLink ? '' : (display || expanded || u.url);
                    text = text.split(u.url).join(replacement);
                }
            }
        }

        if (Array.isArray(entities.media)) {
            for (const m of entities.media) {
                if (m && m.url) {
                    text = text.split(m.url).join('');
                }
            }
        }

        if (quotedId) {
            text = text
                .replace(new RegExp(`https?:\\/\\/[^\\s]*\\/status\\/${quotedId}[^\\s]*`, 'gi'), '')
                .replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+\s*$/g, '');
        }

        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }

    extractSyndicationMedia(tweetObj) {
        if (!tweetObj || typeof tweetObj !== 'object') return [];
        const details = Array.isArray(tweetObj.mediaDetails) ? tweetObj.mediaDetails : [];
        const media = [];

        if (details.length > 0) {
            for (const m of details.slice(0, 4)) {
                if (!m || typeof m !== 'object') continue;
                if (m.type === 'video' || m.type === 'animated_gif') {
                    const variants = Array.isArray(m.video_info?.variants)
                        ? m.video_info.variants.filter(v => v && v.content_type === 'video/mp4' && v.url)
                        : [];
                    variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                    const bestMp4 = variants[0]?.url || '';
                    const poster = m.media_url_https || '';
                    if (poster || bestMp4) {
                        media.push({
                            type: m.type,
                            url: poster || bestMp4,
                            posterUrl: poster,
                            videoUrl: bestMp4
                        });
                    }
                } else {
                    const photoUrl = m.media_url_https || m.url || '';
                    if (photoUrl) {
                        media.push({
                            type: 'photo',
                            url: photoUrl,
                            posterUrl: '',
                            videoUrl: ''
                        });
                    }
                }
            }
        } else if (Array.isArray(tweetObj.photos)) {
            for (const p of tweetObj.photos.slice(0, 4)) {
                if (p && p.url) {
                    media.push({
                        type: 'photo',
                        url: p.url,
                        posterUrl: '',
                        videoUrl: ''
                    });
                }
            }
        }

        return media;
    }

    parseSyndicationTweet(tweetId, data) {
        const id = String(tweetId || '').trim();
        if (!this.isValidRecentTweetId(id)) return null;

        if (!data || typeof data !== 'object' || data.__typename === 'TweetTombstone' || (!data.user && !data.text)) {
            return this.sanitizeTweetMeta(id, {
                isUnavailable: true,
                isHydrated: true,
                updatedAt: Date.now()
            });
        }

        const user = data.user || {};
        const screenName = user.screen_name || '';
        const authorName = user.name || screenName || '';
        const avatarUrl = (user.profile_image_url_https || '').replace('_normal.', '_bigger.');
        const isVerified = Boolean(user.is_blue_verified || user.verified || user.verified_type);
        const inReplyToScreenName = data.in_reply_to_screen_name || '';
        const quotedId = data.quoted_tweet?.id_str || '';
        const text = this.cleanSyndicationText(data.text || '', data.entities, quotedId, data.display_text_range);
        const media = this.extractSyndicationMedia(data);

        let quotedTweet = null;
        if (data.quoted_tweet && typeof data.quoted_tweet === 'object' && data.quoted_tweet.user) {
            const q = data.quoted_tweet;
            const qUser = q.user || {};
            quotedTweet = {
                id: q.id_str || '',
                screenName: qUser.screen_name || '',
                authorName: qUser.name || qUser.screen_name || '',
                avatarUrl: (qUser.profile_image_url_https || '').replace('_normal.', '_bigger.'),
                isVerified: Boolean(qUser.is_blue_verified || qUser.verified || qUser.verified_type),
                createdAt: q.created_at || null,
                inReplyToScreenName: q.in_reply_to_screen_name || '',
                text: this.cleanSyndicationText(q.text || '', q.entities, '', q.display_text_range),
                media: this.extractSyndicationMedia(q)
            };
        }

        let parentTweet = null;
        if (data.parent && typeof data.parent === 'object' && data.parent.user) {
            const p = data.parent;
            const pUser = p.user || {};
            parentTweet = {
                id: p.id_str || '',
                screenName: pUser.screen_name || '',
                authorName: pUser.name || pUser.screen_name || '',
                avatarUrl: (pUser.profile_image_url_https || '').replace('_normal.', '_bigger.'),
                isVerified: Boolean(pUser.is_blue_verified || pUser.verified || pUser.verified_type),
                createdAt: p.created_at || null,
                inReplyToScreenName: p.in_reply_to_screen_name || '',
                text: this.cleanSyndicationText(p.text || '', p.entities, '', p.display_text_range),
                media: this.extractSyndicationMedia(p)
            };
        }

        return this.sanitizeTweetMeta(id, {
            screenName,
            authorName,
            avatarUrl,
            isVerified,
            inReplyToScreenName,
            text,
            media,
            quotedTweet,
            parentTweet,
            createdAt: data.created_at || null,
            favoriteCount: typeof data.favorite_count === 'number' ? data.favorite_count : 0,
            replyCount: typeof data.conversation_count === 'number' ? data.conversation_count : 0,
            isHydrated: true,
            hydrationVersion: 4,
            permalink: screenName ? `https://x.com/${screenName}/status/${id}` : `https://x.com/i/status/${id}`,
            updatedAt: Date.now()
        });
    }

    needsTweetHydration(tweetId) {
        const meta = this.state.postMetaMap[tweetId];
        if (!meta) return true;
        if (meta.isUnavailable) return false;
        if (!meta.isHydrated || meta.hydrationVersion !== 4) return true;
        if (meta.quotedTweet && (!meta.quotedTweet.avatarUrl || !meta.quotedTweet.authorName)) return true;
        if (!meta.screenName || (!meta.text && (!meta.media || meta.media.length === 0) && !meta.quotedTweet && !meta.parentTweet)) return true;
        if (Array.isArray(meta.media) && meta.media.some(m => (m.type === 'video' || m.type === 'animated_gif') && !m.videoUrl)) {
            return true;
        }
        return false;
    }

    async hydrateTweets(tweetIds = []) {
        await this.init();
        if (!Array.isArray(tweetIds) || tweetIds.length === 0 || typeof this.fetchFn !== 'function') {
            return { hydrated: {} };
        }

        const uniqueIds = Array.from(new Set(
            tweetIds
                .map(id => String(id || '').trim())
                .filter(id => this.isValidRecentTweetId(id))
        )).slice(0, 25);

        const toFetch = uniqueIds.filter(id => this.needsTweetHydration(id));
        let changed = false;

        const fetchOne = async (id) => {
            if (this.inflightHydrations.has(id)) {
                return this.inflightHydrations.get(id);
            }
            const promise = (async () => {
                try {
                    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&token=x`;
                    const resp = await this.fetchFn(url, { credentials: 'omit' });
                    if (resp && resp.status === 404) {
                        const meta = this.parseSyndicationTweet(id, null);
                        if (meta) {
                            this.state.postMetaMap[id] = meta;
                            changed = true;
                        }
                        return;
                    }
                    if (!resp || !resp.ok) return;
                    const data = await resp.json();
                    const meta = this.parseSyndicationTweet(id, data);
                    if (meta) {
                        this.state.postMetaMap[id] = meta;
                        changed = true;
                    }
                } catch (err) {
                    // Ignore transient network errors so retry can happen later
                } finally {
                    this.inflightHydrations.delete(id);
                }
            })();

            this.inflightHydrations.set(id, promise);
            return promise;
        };

        // Run with bounded concurrency of 6
        const concurrency = 6;
        for (let i = 0; i < toFetch.length; i += concurrency) {
            const chunk = toFetch.slice(i, i + concurrency);
            await Promise.allSettled(chunk.map(id => fetchOne(id)));
        }

        if (changed) {
            await this.saveState();
        }

        const hydrated = {};
        for (const id of uniqueIds) {
            if (this.state.postMetaMap[id]) {
                hydrated[id] = this.state.postMetaMap[id];
            }
        }

        return { hydrated };
    }

    pruneMySeenIds() {
        const now = Date.now();
        const maxAgeMs = FRIEND_SYNC_CONFIG.MAX_AGE_MS || (14 * 24 * 60 * 60 * 1000);
        const maxSeenCap = FRIEND_SYNC_CONFIG.MAX_SEEN_IDS || 1000;
        const maxForcedCap = FRIEND_SYNC_CONFIG.MAX_FORCED_IDS || 100;
        const maxTombstoneCap = FRIEND_SYNC_CONFIG.MAX_TOMBSTONE_ENTRIES || 200;

        // 1. Cap mySeenIds (1,000 rolling window)
        const combinedSeen = new Set([
            ...(Array.isArray(this.state.mySeenIds) ? this.state.mySeenIds : []),
            ...(this.mySeenSet instanceof Set ? Array.from(this.mySeenSet) : [])
        ]);
        const valid = Array.from(combinedSeen).filter(id => this.isValidRecentTweetId(id));
        const capped = valid.slice(-maxSeenCap);
        this.state.mySeenIds = capped;
        this.mySeenSet = new Set(capped);

        // 2. Cap dismissedForcedIds, notifiedForcedIds & notifiedInviteEmails
        const combinedDismissed = new Set([
            ...(Array.isArray(this.state.dismissedForcedIds) ? this.state.dismissedForcedIds : []),
            ...(this.dismissedForcedSet instanceof Set ? Array.from(this.dismissedForcedSet) : [])
        ]);
        const validDismissed = Array.from(combinedDismissed)
            .filter(id => this.isValidRecentTweetId(id))
            .slice(-maxTombstoneCap);
        this.state.dismissedForcedIds = validDismissed;
        this.dismissedForcedSet = new Set(validDismissed);

        const combinedNotifiedForced = new Set([
            ...(Array.isArray(this.state.notifiedForcedIds) ? this.state.notifiedForcedIds : []),
            ...(this.notifiedForcedSet instanceof Set ? Array.from(this.notifiedForcedSet) : [])
        ]);
        const validNotifiedForced = Array.from(combinedNotifiedForced)
            .filter(id => this.isValidRecentTweetId(id))
            .slice(-maxTombstoneCap);
        this.state.notifiedForcedIds = validNotifiedForced;
        this.notifiedForcedSet = new Set(validNotifiedForced);

        const combinedNotifiedInvites = new Set([
            ...(Array.isArray(this.state.notifiedInviteEmails) ? this.state.notifiedInviteEmails : []),
            ...(this.notifiedInviteSet instanceof Set ? Array.from(this.notifiedInviteSet) : [])
        ]);
        const validNotifiedInvites = Array.from(combinedNotifiedInvites)
            .filter(e => typeof e === 'string' && e.trim().length > 0)
            .slice(-maxTombstoneCap);
        this.state.notifiedInviteEmails = validNotifiedInvites;
        this.notifiedInviteSet = new Set(validNotifiedInvites);

        // 3. Prune & cap myForcedMap (14-day TTL + 100 cap)
        if (this.state.myForcedMap && typeof this.state.myForcedMap === 'object') {
            const forcedEntries = Object.values(this.state.myForcedMap)
                .filter(item => {
                    if (!item || !this.isValidRecentTweetId(item.id)) return false;
                    const fAt = Number(item.forcedAt) || 0;
                    if (fAt > 0 && fAt <= now && (now - fAt) > maxAgeMs) return false;
                    return true;
                })
                .sort((a, b) => (a.forcedAt || 0) - (b.forcedAt || 0))
                .slice(-maxForcedCap);
            this.state.myForcedMap = {};
            for (const entry of forcedEntries) {
                this.state.myForcedMap[entry.id] = entry;
            }
        } else {
            this.state.myForcedMap = {};
        }

        // 4. Prune & cap friendSeenMap and friendForcedMap per friend
        if (this.state.friendSeenMap && typeof this.state.friendSeenMap === 'object') {
            for (const [fEmail, list] of Object.entries(this.state.friendSeenMap)) {
                if (Array.isArray(list)) {
                    this.state.friendSeenMap[fEmail] = list
                        .filter(id => this.isValidRecentTweetId(id))
                        .slice(-maxSeenCap);
                }
            }
        }
        const activeFriendForcedIds = new Set();
        if (this.state.friendForcedMap && typeof this.state.friendForcedMap === 'object') {
            for (const [fEmail, list] of Object.entries(this.state.friendForcedMap)) {
                if (Array.isArray(list)) {
                    const filteredForced = list
                        .filter(item => {
                            const fid = typeof item === 'string' ? item : item?.id;
                            if (!this.isValidRecentTweetId(fid)) return false;
                            const fAt = typeof item === 'object' ? (Number(item?.forcedAt) || 0) : 0;
                            if (fAt > 0 && fAt <= now && (now - fAt) > maxAgeMs) return false;
                            return true;
                        })
                        .slice(-maxForcedCap);
                    this.state.friendForcedMap[fEmail] = filteredForced;
                    for (const item of filteredForced) {
                        const fid = typeof item === 'string' ? item : item?.id;
                        if (fid) activeFriendForcedIds.add(fid);
                    }
                }
            }
        }

        // 5. Prune & cap unforcedMap and removedFriends tombstones (14-day TTL + 200 cap)
        if (this.state.unforcedMap && typeof this.state.unforcedMap === 'object') {
            const unforcedEntries = Object.entries(this.state.unforcedMap)
                .filter(([tid, ts]) => {
                    if (!this.isValidRecentTweetId(tid)) return false;
                    const t = Number(ts) || 0;
                    return !(t > 0 && t <= now && (now - t) > maxAgeMs);
                })
                .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
                .slice(-maxTombstoneCap);
            this.state.unforcedMap = Object.fromEntries(unforcedEntries);
        } else {
            this.state.unforcedMap = {};
        }

        if (this.state.removedFriends && typeof this.state.removedFriends === 'object') {
            const removedEntries = Object.entries(this.state.removedFriends)
                .filter(([email, ts]) => {
                    if (!email) return false;
                    const t = Number(ts) || 0;
                    return !(t > 0 && t <= now && (now - t) > maxAgeMs);
                })
                .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
                .slice(-maxTombstoneCap);
            this.state.removedFriends = Object.fromEntries(removedEntries);
        } else {
            this.state.removedFriends = {};
        }

        // 6. Prune & cap postMetaMap locally (250 LRU cap + 14-day TTL) while preserving forced posts
        const maxLocalMeta = FRIEND_SYNC_CONFIG.MAX_LOCAL_POST_META || 250;
        if (this.state.postMetaMap && typeof this.state.postMetaMap === 'object') {
            const allMeta = Object.values(this.state.postMetaMap).filter(m => {
                if (!m || !this.isValidRecentTweetId(m.id)) return false;
                const isPinnedForced = Boolean(this.state.myForcedMap[m.id] || activeFriendForcedIds.has(m.id));
                if (isPinnedForced) return true;
                const uAt = Number(m.updatedAt) || 0;
                if (uAt > 0 && uAt <= now && (now - uAt) > maxAgeMs) return false;
                return true;
            });

            if (allMeta.length > maxLocalMeta) {
                allMeta.sort((a, b) => {
                    const aForced = Boolean(this.state.myForcedMap[a.id] || activeFriendForcedIds.has(a.id));
                    const bForced = Boolean(this.state.myForcedMap[b.id] || activeFriendForcedIds.has(b.id));
                    if (aForced !== bForced) return aForced ? 1 : -1;
                    return (a.updatedAt || 0) - (b.updatedAt || 0);
                });
            }
            const keptMeta = allMeta.slice(-maxLocalMeta);
            this.state.postMetaMap = {};
            for (const m of keptMeta) {
                this.state.postMetaMap[m.id] = m;
            }
        } else {
            this.state.postMetaMap = {};
        }
    }

    rebuildIndex() {
        this.tweetToFriendsMap.clear();
        this.tweetToForcedByMap.clear();

        for (const [email, friend] of Object.entries(this.state.friends)) {
            if (friend.status !== 'connected') continue;
            const seenList = this.state.friendSeenMap[email] || [];
            const forcedList = this.state.friendForcedMap[email] || [];
            const label = friend.displayName && friend.displayName !== email
                ? `${friend.displayName} (${email})`
                : email;

            const addSeen = (tweetId) => {
                let list = this.tweetToFriendsMap.get(tweetId);
                if (!list) {
                    list = [];
                    this.tweetToFriendsMap.set(tweetId, list);
                }
                if (!list.includes(label)) {
                    list.push(label);
                }
            };

            for (const tweetId of seenList) {
                addSeen(tweetId);
            }

            for (const forcedItem of forcedList) {
                const tweetId = typeof forcedItem === 'string' ? forcedItem : forcedItem?.id;
                if (!tweetId) continue;
                addSeen(tweetId);

                let forcedByList = this.tweetToForcedByMap.get(tweetId);
                if (!forcedByList) {
                    forcedByList = [];
                    this.tweetToForcedByMap.set(tweetId, forcedByList);
                }
                if (!forcedByList.some(f => f.email === email)) {
                    forcedByList.push({
                        email,
                        label,
                        forcedAt: forcedItem?.forcedAt || 0
                    });
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
        const pendingIncomingCount = friendsArray.filter(f => f.status === 'pending_incoming').length;

        return {
            identity: this.state.identity ? {
                email: this.state.identity.email,
                displayName: this.state.identity.displayName || this.state.identity.email,
                pubkeyHex: this.state.identity.pubkeyHex
            } : null,
            friends: friendsArray,
            pendingIncomingCount,
            mySeenCount: this.mySeenSet.size,
            lastSyncTime: this.lastSyncTime,
            selfSyncLastSyncedAt: this.state.selfSyncLastSyncedAt || null,
            isSyncing: this.isSyncing
        };
    }

    async setIdentity(email, displayName = '', passphrase = '') {
        await this.init();
        const normEmail = normalizeIdentifier(email);
        if (!normEmail || normEmail.length < 3) {
            throw new Error('Please enter a valid email or alias (min 3 characters).');
        }

        const cleanName = (displayName || '').trim() || normEmail.split('@')[0];
        const existing = this.state.identity;

        if (existing && existing.email === normEmail) {
            existing.displayName = cleanName;
            if (passphrase !== undefined) existing.passphrase = passphrase;
        } else {
            const privKeyHex = existing?.privKeyHex || generateSecretKeyHex();
            const pubkeyHex = getPublicKeyHex(privKeyHex);
            const seenFeedKeyHex = existing?.seenFeedKeyHex || generateRandomBytesHex(32);
            const nowMs = Date.now();

            this.state.identity = {
                email: normEmail,
                displayName: cleanName,
                privKeyHex,
                pubkeyHex,
                seenFeedKeyHex,
                identityCreatedAt: existing?.identityCreatedAt || nowMs,
                feedKeyUpdatedAt: existing?.feedKeyUpdatedAt || nowMs,
                passphrase: passphrase || ''
            };
        }

        // Pull any existing self-sync snapshot from relays for this email so a second device
        // or reinstalled client automatically adopts the canonical keypair, friends, seen/forced posts, and preferences.
        await this.pullSelfSyncFromRelays(normEmail, passphrase || '', {
            adoptIdentityKeys: true,
            explicitDisplayName: Boolean((displayName || '').trim()) ? cleanName : ''
        }).catch(() => {});

        await this.saveState();
        // Publish seen snapshot, self-sync snapshot, and re-announce handshakes for any existing friends
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

        if (this.state.removedFriends && this.state.removedFriends[normFriend]) {
            delete this.state.removedFriends[normFriend];
        }

        this.state.friends[normFriend] = {
            email: normFriend,
            displayName: (friendDisplayName || '').trim() || existing?.displayName || normFriend,
            status: existing?.status === 'connected' ? 'connected' : 'pending_outgoing',
            pubkeyHex: existing?.pubkeyHex || null,
            seenFeedKeyHex: existing?.seenFeedKeyHex || null,
            addedAt: Date.now(),
            lastSyncedAt: existing?.lastSyncedAt || null,
            seenCount: (this.state.friendSeenMap[normFriend] || []).length
        };

        await this.saveState();
        await this.publishHandshakeForFriend(normFriend).catch(() => {});
        await this.publishSelfSyncSnapshot().catch(() => {});
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

        if (!this.state.removedFriends) this.state.removedFriends = {};
        this.state.removedFriends[normFriend] = Date.now();

        delete this.state.friends[normFriend];
        delete this.state.friendSeenMap[normFriend];
        delete this.state.friendForcedMap[normFriend];
        this.rebuildIndex();

        if (wasConnected && this.state.identity) {
            // Rotate feed key so removed friend can no longer decrypt future snapshots
            this.state.identity.seenFeedKeyHex = generateRandomBytesHex(32);
            this.state.identity.feedKeyUpdatedAt = Date.now();
            await this.saveState();
            await this.publishAllHandshakes().catch(() => {});
            await this.publishMySeenSnapshot().catch(() => {});
        } else {
            await this.saveState();
            await this.publishSelfSyncSnapshot().catch(() => {});
        }

        return this.getPublicState();
    }

    async markTweetsSeen(tweetIds, tweetMetaMap = {}) {
        await this.init();
        if (!Array.isArray(tweetIds) || tweetIds.length === 0) return { added: 0 };

        let added = 0;
        let metaUpdated = 0;
        const now = Date.now();
        for (const rawId of tweetIds) {
            const id = String(rawId).trim();
            if (!this.isValidRecentTweetId(id, now)) continue;

            if (!this.mySeenSet.has(id)) {
                this.mySeenSet.add(id);
                added++;
            }

            if (tweetMetaMap && typeof tweetMetaMap === 'object' && tweetMetaMap[id]) {
                const sanitized = this.sanitizeTweetMeta(id, tweetMetaMap[id]);
                if (sanitized) {
                    this.state.postMetaMap[id] = sanitized;
                    metaUpdated++;
                }
            }
        }

        if (added > 0 || metaUpdated > 0) {
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

    async forceTweetToFriends(tweetId, meta = null) {
        await this.init();
        const id = String(tweetId || '').trim();
        if (!this.isValidRecentTweetId(id)) {
            throw new Error('Invalid tweet ID.');
        }

        const now = Date.now();
        this.mySeenSet.add(id);
        if (this.state.unforcedMap && this.state.unforcedMap[id]) {
            delete this.state.unforcedMap[id];
        }
        this.state.myForcedMap[id] = {
            id,
            forcedAt: now
        };

        if (meta && typeof meta === 'object') {
            const sanitized = this.sanitizeTweetMeta(id, { ...meta, updatedAt: now });
            if (sanitized) {
                this.state.postMetaMap[id] = sanitized;
            }
        }

        this.state.hasUnpublishedSeen = true;
        this.pruneMySeenIds();
        await this.saveState();
        this.broadcastSeenUpdateToTabs();

        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
        await this.publishMySeenSnapshot().catch(() => {});
        this.broadcastSeenUpdateToTabs();

        return {
            forced: true,
            tweetId: id,
            totalForced: Object.keys(this.state.myForcedMap).length
        };
    }

    async unforceTweet(tweetId) {
        await this.init();
        const id = String(tweetId || '').trim();
        if (!id) return { forced: false, tweetId: id };

        if (this.state.myForcedMap && this.state.myForcedMap[id]) {
            delete this.state.myForcedMap[id];
            if (!this.state.unforcedMap) this.state.unforcedMap = {};
            this.state.unforcedMap[id] = Date.now();
            this.state.hasUnpublishedSeen = true;
            await this.saveState();
            this.broadcastSeenUpdateToTabs();

            if (this.flushTimeout) {
                clearTimeout(this.flushTimeout);
                this.flushTimeout = null;
            }
            await this.publishMySeenSnapshot().catch(() => {});
            this.broadcastSeenUpdateToTabs();
        }

        return {
            forced: false,
            tweetId: id,
            totalForced: Object.keys(this.state.myForcedMap || {}).length
        };
    }

    async dismissForcedTweet(tweetId) {
        await this.init();
        const id = String(tweetId || '').trim();
        if (!this.isValidRecentTweetId(id)) return { dismissed: false };

        this.dismissedForcedSet.add(id);
        this.mySeenSet.add(id);
        this.state.hasUnpublishedSeen = true;
        this.scheduleSnapshotFlush();
        await this.saveState();

        return { dismissed: true, tweetId: id };
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

    checkTweetsSyncStatus(tweetIds) {
        if (!Array.isArray(tweetIds) || tweetIds.length === 0) {
            return { seenMap: {}, forcedMap: {}, myForcedIds: [] };
        }
        const seenMap = {};
        const forcedMap = {};
        const myForcedIds = [];

        for (const rawId of tweetIds) {
            const id = String(rawId).trim();
            const seenBy = this.tweetToFriendsMap.get(id);
            if (seenBy && seenBy.length > 0) {
                seenMap[id] = seenBy;
            }
            const forcedByEntries = this.tweetToForcedByMap.get(id);
            if (forcedByEntries && forcedByEntries.length > 0) {
                forcedMap[id] = forcedByEntries.map(e => e.label);
            }
            if (this.state.myForcedMap && this.state.myForcedMap[id]) {
                myForcedIds.push(id);
            }
        }

        return { seenMap, forcedMap, myForcedIds };
    }

    getFriendsTimelineData() {
        const allIds = new Set();
        for (const id of this.tweetToFriendsMap.keys()) {
            allIds.add(id);
        }
        for (const id of this.tweetToForcedByMap.keys()) {
            allIds.add(id);
        }
        for (const id of Object.keys(this.state.myForcedMap || {})) {
            if (this.isValidRecentTweetId(id)) {
                allIds.add(id);
            }
        }

        const timelinePosts = [];
        const unseenForcedPosts = [];

        for (const tweetId of allIds) {
            const meta = this.state.postMetaMap[tweetId] || null;
            const seenBy = this.tweetToFriendsMap.get(tweetId) || [];
            const forcedEntries = this.tweetToForcedByMap.get(tweetId) || [];
            const forcedBy = forcedEntries.map(e => e.label);
            const myForcedObj = this.state.myForcedMap ? this.state.myForcedMap[tweetId] : null;
            const forcedByMe = Boolean(myForcedObj);
            // Only treat a post as incoming-forced if at least one friend forced it to you
            const isForced = forcedBy.length > 0;
            // Posts forced ONLY by you (not seen or forced by any friend) are kept for the "Sent" filter tab only
            const isSentOnly = forcedByMe && forcedBy.length === 0 && seenBy.length === 0;
            if (meta && meta.isUnavailable && !isForced && !forcedByMe) {
                continue;
            }
            const myForcedAt = myForcedObj?.forcedAt || 0;
            const friendForcedAt = forcedEntries.reduce((max, e) => Math.max(max, e.forcedAt || 0), 0);
            const latestForcedAt = friendForcedAt || myForcedAt;
            const isSeenByMe = this.mySeenSet.has(tweetId);
            const isDismissed = this.dismissedForcedSet.has(tweetId);
            const snowflakeTimeMs = this.getSnowflakeTimestampMs(tweetId);
            const sortTimestamp = latestForcedAt || meta?.updatedAt || snowflakeTimeMs || 0;

            const postItem = {
                tweetId,
                seenBy,
                forcedBy,
                forcedByMe,
                isForced,
                isSentOnly,
                myForcedAt,
                latestForcedAt,
                isSeenByMe,
                isDismissed,
                snowflakeTimeMs,
                sortTimestamp,
                meta
            };

            timelinePosts.push(postItem);

            if (forcedBy.length > 0 && !isDismissed) {
                unseenForcedPosts.push(postItem);
            }
        }

        // Sort timeline posts: friends' forced posts first (newest forcedAt), then seen posts (newest snowflake / updatedAt)
        timelinePosts.sort((a, b) => {
            if (a.isForced !== b.isForced) return a.isForced ? -1 : 1;
            if (a.isForced && b.isForced && a.latestForcedAt !== b.latestForcedAt) {
                return b.latestForcedAt - a.latestForcedAt;
            }
            if (a.isSentOnly !== b.isSentOnly) return a.isSentOnly ? 1 : -1;
            if (a.snowflakeTimeMs !== b.snowflakeTimeMs) {
                return b.snowflakeTimeMs - a.snowflakeTimeMs;
            }
            return b.sortTimestamp - a.sortTimestamp;
        });

        const maxTimelineItems = FRIEND_SYNC_CONFIG.MAX_TIMELINE_ITEMS || 300;
        let cappedTimelinePosts = timelinePosts;
        if (timelinePosts.length > maxTimelineItems) {
            const pinnedOrSent = timelinePosts.filter(p => p.isForced || p.forcedByMe);
            const regularSeen = timelinePosts.filter(p => !p.isForced && !p.forcedByMe);
            const remainingBudget = Math.max(0, maxTimelineItems - pinnedOrSent.length);
            cappedTimelinePosts = [
                ...pinnedOrSent.filter(p => !p.isSentOnly),
                ...regularSeen.slice(0, remainingBudget),
                ...pinnedOrSent.filter(p => p.isSentOnly)
            ];
        }

        unseenForcedPosts.sort((a, b) => (b.latestForcedAt || b.sortTimestamp) - (a.latestForcedAt || a.sortTimestamp));

        const connectedFriends = Object.values(this.state.friends)
            .filter(f => f.status === 'connected')
            .map(f => ({
                email: f.email,
                displayName: f.displayName || f.email,
                label: f.displayName && f.displayName !== f.email ? `${f.displayName} (${f.email})` : f.email
            }));

        return {
            timelinePosts: cappedTimelinePosts,
            unseenForcedPosts,
            connectedFriends
        };
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
        const seenIds = Array.from(this.mySeenSet);
        const forcedList = Object.values(this.state.myForcedMap || {})
            .filter(item => item && this.isValidRecentTweetId(item.id))
            .slice(-(FRIEND_SYNC_CONFIG.MAX_FORCED_IDS || 100));

        // Include compact post metadata for all forced posts + most recent seen posts (up to MAX_POST_META_ENTRIES)
        const posts = {};
        const maxSeenMetaEntries = FRIEND_SYNC_CONFIG.MAX_POST_META_ENTRIES || 25;
        for (const forcedItem of forcedList) {
            const meta = this.state.postMetaMap[forcedItem.id];
            if (meta && !meta.isUnavailable) {
                posts[forcedItem.id] = meta;
            }
        }
        const recentSeenForMeta = seenIds.slice(-maxSeenMetaEntries).reverse();
        let addedSeenMetaCount = 0;
        for (const tid of recentSeenForMeta) {
            if (addedSeenMetaCount >= maxSeenMetaEntries) break;
            const meta = this.state.postMetaMap[tid];
            if (!posts[tid] && meta && !meta.isUnavailable) {
                posts[tid] = meta;
                addedSeenMetaCount++;
            }
        }

        const payload = {
            v: 1,
            email: id.email,
            displayName: id.displayName,
            updatedAt: Date.now(),
            ids: seenIds,
            forced: forcedList,
            posts
        };

        const encryptedContent = await encryptJson(payload, id.seenFeedKeyHex);
        const nowSec = Math.floor(Date.now() / 1000);
        const createdAt = Math.max(nowSec, (this.lastPublishedCreatedAtSec || 0) + 1);
        this.lastPublishedCreatedAtSec = createdAt;
        return signEvent({
            kind: FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA,
            created_at: createdAt,
            tags: [
                ['d', '414x-seen-v1']
            ],
            content: encryptedContent
        }, id.privKeyHex);
    }

    async readLocalPreferencesForSelfSync() {
        const prefs = {};
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                const stored = await chrome.storage.local.get(SELF_SYNC_PREF_KEYS);
                for (const key of SELF_SYNC_PREF_KEYS) {
                    if (stored && stored[key] !== undefined) {
                        prefs[key] = stored[key];
                    }
                }
            }
        } catch (err) {
            // Ignore storage read errors
        }

        const prefsKeys = Object.keys(prefs).sort();
        if (prefsKeys.length > 0) {
            const normalizedObj = {};
            for (const k of prefsKeys) normalizedObj[k] = prefs[k];
            const prefsJson = JSON.stringify(normalizedObj);
            if (prefsJson !== (this.state.lastKnownPrefsJson || '')) {
                this.state.lastKnownPrefsJson = prefsJson;
                this.state.preferencesUpdatedAt = Date.now();
            }
        }

        return {
            preferences: prefs,
            preferencesUpdatedAt: this.state.preferencesUpdatedAt || 0
        };
    }

    async applyRemotePreferencesFromSelfSync(remotePrefs, remoteUpdatedAt = 0) {
        if (!remotePrefs || typeof remotePrefs !== 'object') return false;
        const localUpdatedAt = this.state.preferencesUpdatedAt || 0;
        if (remoteUpdatedAt <= localUpdatedAt) return false;

        const toSet = {};
        const sortedKeys = [];
        for (const key of SELF_SYNC_PREF_KEYS) {
            if (remotePrefs[key] !== undefined) {
                toSet[key] = remotePrefs[key];
                sortedKeys.push(key);
            }
        }
        if (sortedKeys.length === 0) return false;

        this.isApplyingRemotePrefs = true;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set(toSet);
                const fullStored = await chrome.storage.local.get(SELF_SYNC_PREF_KEYS);
                const allKeys = SELF_SYNC_PREF_KEYS.filter(k => fullStored && fullStored[k] !== undefined).sort();
                const normalizedObj = {};
                for (const k of allKeys) normalizedObj[k] = fullStored[k];
                this.state.lastKnownPrefsJson = JSON.stringify(normalizedObj);
            } else {
                sortedKeys.sort();
                const normalizedObj = {};
                for (const k of sortedKeys) normalizedObj[k] = toSet[k];
                this.state.lastKnownPrefsJson = JSON.stringify(normalizedObj);
            }
            this.state.preferencesUpdatedAt = remoteUpdatedAt;
        } catch (err) {
            console.warn('X Friends Sync: Failed to apply remote preferences', err);
        } finally {
            this.isApplyingRemotePrefs = false;
        }
        return true;
    }

    async buildSelfSyncEvent() {
        const id = this.state.identity;
        if (!id) return null;

        this.pruneMySeenIds();
        const { selfTag, selfKeyHex } = await deriveSelfSyncInfo(id.email, id.passphrase || '');
        const { preferences, preferencesUpdatedAt } = await this.readLocalPreferencesForSelfSync();

        const payload = {
            type: '414x_self_sync_v1',
            v: 1,
            updatedAt: Date.now(),
            identity: {
                email: id.email,
                displayName: id.displayName,
                privKeyHex: id.privKeyHex,
                pubkeyHex: id.pubkeyHex,
                seenFeedKeyHex: id.seenFeedKeyHex,
                identityCreatedAt: id.identityCreatedAt || 0,
                feedKeyUpdatedAt: id.feedKeyUpdatedAt || 0
            },
            friends: this.state.friends || {},
            removedFriends: this.state.removedFriends || {},
            mySeenIds: Array.from(this.mySeenSet).slice(-FRIEND_SYNC_CONFIG.MAX_SEEN_IDS),
            myForcedMap: this.state.myForcedMap || {},
            unforcedMap: this.state.unforcedMap || {},
            dismissedForcedIds: Array.from(this.dismissedForcedSet).slice(-(FRIEND_SYNC_CONFIG.MAX_DISMISSED_IDS || 500)),
            preferences,
            preferencesUpdatedAt
        };

        const encryptedContent = await encryptJson(payload, selfKeyHex);
        const nowSec = Math.floor(Date.now() / 1000);
        const createdAt = Math.max(nowSec, (this.lastPublishedCreatedAtSec || 0) + 1);
        this.lastPublishedCreatedAtSec = createdAt;

        return signEvent({
            kind: FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA,
            created_at: createdAt,
            tags: [
                ['d', '414x-self-v1'],
                ['t', selfTag]
            ],
            content: encryptedContent
        }, id.privKeyHex);
    }

    async publishSelfSyncSnapshot() {
        const event = await this.buildSelfSyncEvent();
        if (!event) return false;
        await this.publishEventsToRelays([event]);
        this.state.selfSyncLastSyncedAt = Date.now();
        await this.saveState();
        return true;
    }

    async mergeSelfSyncPayload(remote, options = {}) {
        if (!remote || remote.type !== '414x_self_sync_v1') return { changed: false, sawAdditionalItems: false };

        let changed = false;
        let sawAdditionalItems = false;
        const now = Date.now();

        // 1. Identity key adoption (multi-device / reinstall recovery & feed-key rotation sync)
        if (remote.identity && this.state.identity) {
            const rId = remote.identity;
            if (rId.privKeyHex && rId.pubkeyHex && rId.seenFeedKeyHex) {
                const sameKeypair = this.state.identity.privKeyHex === rId.privKeyHex;
                const remoteFeedUpdatedAt = Number(rId.feedKeyUpdatedAt || remote.updatedAt || 0);
                const localFeedUpdatedAt = Number(this.state.identity.feedKeyUpdatedAt || 0);

                if (options.adoptIdentityKeys) {
                    if (
                        this.state.identity.privKeyHex !== rId.privKeyHex ||
                        this.state.identity.pubkeyHex !== rId.pubkeyHex ||
                        this.state.identity.seenFeedKeyHex !== rId.seenFeedKeyHex
                    ) {
                        this.state.identity.privKeyHex = rId.privKeyHex;
                        this.state.identity.pubkeyHex = rId.pubkeyHex;
                        this.state.identity.seenFeedKeyHex = rId.seenFeedKeyHex;
                        if (rId.identityCreatedAt) this.state.identity.identityCreatedAt = rId.identityCreatedAt;
                        if (remoteFeedUpdatedAt) this.state.identity.feedKeyUpdatedAt = remoteFeedUpdatedAt;
                        changed = true;
                    }
                    if (!options.explicitDisplayName && rId.displayName && this.state.identity.displayName !== rId.displayName) {
                        this.state.identity.displayName = rId.displayName;
                        changed = true;
                    }
                } else if (sameKeypair && this.state.identity.seenFeedKeyHex !== rId.seenFeedKeyHex && remoteFeedUpdatedAt > localFeedUpdatedAt) {
                    // Another device with our same Nostr keypair rotated seenFeedKeyHex (e.g. after removing a friend)
                    this.state.identity.seenFeedKeyHex = rId.seenFeedKeyHex;
                    this.state.identity.feedKeyUpdatedAt = remoteFeedUpdatedAt;
                    changed = true;
                }
            }
        }

        // 2. Merge removedFriends tombstones
        if (!this.state.removedFriends) this.state.removedFriends = {};
        if (remote.removedFriends && typeof remote.removedFriends === 'object') {
            for (const [rawEmail, removedAt] of Object.entries(remote.removedFriends)) {
                const fEmail = normalizeIdentifier(rawEmail);
                const rTime = Number(removedAt) || 0;
                if (fEmail && rTime > (this.state.removedFriends[fEmail] || 0)) {
                    this.state.removedFriends[fEmail] = rTime;
                    changed = true;
                }
            }
        }

        // Remove any local friend whose addedAt predates a removal tombstone
        for (const [fEmail, localFriend] of Object.entries(this.state.friends)) {
            const removedAt = this.state.removedFriends[fEmail] || 0;
            if (removedAt > (localFriend.addedAt || 0)) {
                delete this.state.friends[fEmail];
                delete this.state.friendSeenMap[fEmail];
                delete this.state.friendForcedMap[fEmail];
                changed = true;
            }
        }

        // 3. Merge friends map
        if (remote.friends && typeof remote.friends === 'object') {
            for (const [rawEmail, rFriend] of Object.entries(remote.friends)) {
                const fEmail = normalizeIdentifier(rawEmail);
                if (!fEmail || !rFriend || typeof rFriend !== 'object') continue;
                if (this.state.identity && fEmail === this.state.identity.email) continue;

                const removedAt = this.state.removedFriends[fEmail] || 0;
                if ((rFriend.addedAt || 0) < removedAt) continue;

                const existing = this.state.friends[fEmail];
                if (!existing) {
                    this.state.friends[fEmail] = {
                        email: fEmail,
                        displayName: rFriend.displayName || fEmail,
                        status: rFriend.status || 'pending_outgoing',
                        pubkeyHex: rFriend.pubkeyHex || null,
                        seenFeedKeyHex: rFriend.seenFeedKeyHex || null,
                        handshakeTimestamp: rFriend.handshakeTimestamp || 0,
                        addedAt: rFriend.addedAt || now,
                        lastSyncedAt: rFriend.lastSyncedAt || null,
                        seenCount: (this.state.friendSeenMap[fEmail] || []).length
                    };
                    changed = true;
                } else {
                    if (rFriend.status === 'connected' && existing.status !== 'connected') {
                        existing.status = 'connected';
                        changed = true;
                    }
                    const rHsTime = rFriend.handshakeTimestamp || 0;
                    const lHsTime = existing.handshakeTimestamp || 0;
                    if (rFriend.pubkeyHex && rFriend.seenFeedKeyHex && (!existing.pubkeyHex || !existing.seenFeedKeyHex || rHsTime >= lHsTime)) {
                        if (existing.pubkeyHex !== rFriend.pubkeyHex || existing.seenFeedKeyHex !== rFriend.seenFeedKeyHex) {
                            existing.pubkeyHex = rFriend.pubkeyHex;
                            existing.seenFeedKeyHex = rFriend.seenFeedKeyHex;
                            existing.handshakeTimestamp = rHsTime;
                            changed = true;
                        }
                    }
                    if (rFriend.displayName && existing.displayName === existing.email && rFriend.displayName !== existing.email) {
                        existing.displayName = rFriend.displayName;
                        changed = true;
                    }
                }
            }
        }

        // 4. Merge mySeenIds
        if (Array.isArray(remote.mySeenIds)) {
            for (const rawId of remote.mySeenIds) {
                const tid = String(rawId || '').trim();
                if (this.isValidRecentTweetId(tid, now) && !this.mySeenSet.has(tid)) {
                    this.mySeenSet.add(tid);
                    changed = true;
                    sawAdditionalItems = true;
                }
            }
        }

        // 5. Merge unforcedMap & myForcedMap
        if (!this.state.unforcedMap) this.state.unforcedMap = {};
        if (remote.unforcedMap && typeof remote.unforcedMap === 'object') {
            for (const [rawId, unforcedAt] of Object.entries(remote.unforcedMap)) {
                const tid = String(rawId || '').trim();
                const uTime = Number(unforcedAt) || 0;
                if (tid && uTime > (this.state.unforcedMap[tid] || 0)) {
                    this.state.unforcedMap[tid] = uTime;
                    changed = true;
                }
            }
        }

        if (!this.state.myForcedMap) this.state.myForcedMap = {};
        for (const [tid, fObj] of Object.entries(this.state.myForcedMap)) {
            const uTime = this.state.unforcedMap[tid] || 0;
            if (uTime >= (fObj?.forcedAt || 0)) {
                delete this.state.myForcedMap[tid];
                changed = true;
                sawAdditionalItems = true;
            }
        }

        if (remote.myForcedMap && typeof remote.myForcedMap === 'object') {
            for (const [rawId, fObj] of Object.entries(remote.myForcedMap)) {
                const tid = String(rawId || fObj?.id || '').trim();
                const forcedAt = Number(fObj?.forcedAt) || remote.updatedAt || now;
                const uTime = this.state.unforcedMap[tid] || 0;
                if (this.isValidRecentTweetId(tid, now) && forcedAt > uTime) {
                    const existingForced = this.state.myForcedMap[tid];
                    if (!existingForced || forcedAt > (existingForced.forcedAt || 0)) {
                        this.state.myForcedMap[tid] = { id: tid, forcedAt };
                        this.mySeenSet.add(tid);
                        changed = true;
                        sawAdditionalItems = true;
                    }
                }
            }
        }

        // 6. Merge dismissedForcedIds
        if (Array.isArray(remote.dismissedForcedIds)) {
            for (const rawId of remote.dismissedForcedIds) {
                const tid = String(rawId || '').trim();
                if (this.isValidRecentTweetId(tid, now) && !this.dismissedForcedSet.has(tid)) {
                    this.dismissedForcedSet.add(tid);
                    this.mySeenSet.add(tid);
                    changed = true;
                }
            }
        }

        // 7. Merge preferences (blocklists & toggles)
        if (remote.preferences && typeof remote.preferences === 'object') {
            const prefsChanged = await this.applyRemotePreferencesFromSelfSync(
                remote.preferences,
                remote.preferencesUpdatedAt || remote.updatedAt || 0
            );
            if (prefsChanged) changed = true;
        }

        this.state.selfSyncLastSyncedAt = Math.max(this.state.selfSyncLastSyncedAt || 0, remote.updatedAt || now);
        this.pruneMySeenIds();
        return { changed, sawAdditionalItems };
    }

    async pullSelfSyncFromRelays(email, passphrase = '', options = {}) {
        const normEmail = normalizeIdentifier(email);
        if (!normEmail) return false;

        const { selfTag, selfKeyHex } = await deriveSelfSyncInfo(normEmail, passphrase);
        const events = await this.queryRelays([
            {
                kinds: [FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA],
                '#t': [selfTag],
                '#d': ['414x-self-v1']
            }
        ]);
        if (!Array.isArray(events) || events.length === 0) return false;

        // Sort oldest to newest so newest wins on conflicts while unioning sets
        const sorted = [...events].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        let anyMerged = false;
        for (const ev of sorted) {
            const payload = await decryptJson(ev.content, selfKeyHex);
            if (payload && payload.type === '414x_self_sync_v1') {
                await this.mergeSelfSyncPayload(payload, options);
                anyMerged = true;
            }
        }
        if (anyMerged) {
            this.rebuildIndex();
            await this.saveState();
        }
        return anyMerged;
    }

    async publishMySeenSnapshot() {
        const seenEvent = await this.buildSeenSnapshotEvent();
        const selfEvent = await this.buildSelfSyncEvent();
        const eventsToPublish = [seenEvent, selfEvent].filter(Boolean);
        if (eventsToPublish.length === 0) return false;

        await this.publishEventsToRelays(eventsToPublish);
        this.state.selfSyncLastSyncedAt = Date.now();
        if (this.state.hasUnpublishedSeen) {
            this.state.hasUnpublishedSeen = false;
        }
        await this.saveState();
        return true;
    }

    async syncWithRelays() {
        await this.init();
        const id = this.state.identity;
        if (!id) return this.getPublicState();
        if (this.isSyncing) {
            this.pendingSyncRequested = true;
            return this.getPublicState();
        }

        this.isSyncing = true;
        this.pendingSyncRequested = false;
        try {
            // Snapshot pre-sync invites & forced posts for notification diffing
            this.rebuildIndex();
            const prevInviteEmails = new Set(
                Object.values(this.state.friends)
                    .filter(f => f.status === 'pending_incoming')
                    .map(f => f.email)
            );
            const prevForcedIds = new Set(this.tweetToForcedByMap.keys());

            // Check if local preferences changed since last self-sync
            const prevPrefsUpdatedAt = this.state.preferencesUpdatedAt || 0;
            await this.readLocalPreferencesForSelfSync();
            if ((this.state.preferencesUpdatedAt || 0) > prevPrefsUpdatedAt) {
                this.state.hasUnpublishedSeen = true;
            }

            if (this.flushTimeout) {
                clearTimeout(this.flushTimeout);
                this.flushTimeout = null;
                this.state.hasUnpublishedSeen = true;
            }
            if (this.state.hasUnpublishedSeen) {
                await this.publishMySeenSnapshot().catch(() => {});
            }

            const { inboxTag, inboxKeyHex } = await deriveInboxInfo(id.email);
            const { selfTag, selfKeyHex } = await deriveSelfSyncInfo(id.email, id.passphrase || '');
            const tTagsToQuery = [inboxTag, selfTag];
            const pairwiseMap = new Map(); // incomingTag -> { friendEmail, pairKeyHex }

            for (const friendEmail of Object.keys(this.state.friends)) {
                const pairInfo = await derivePairwiseInfo(id.email, friendEmail);
                tTagsToQuery.push(pairInfo.incomingTag);
                pairwiseMap.set(pairInfo.incomingTag, {
                    friendEmail,
                    pairKeyHex: pairInfo.pairKeyHex
                });
            }

            // Step 1: Query Self-Sync, Inbox & Incoming Pairwise Handshakes
            const discoveryFilters = [
                {
                    kinds: [FRIEND_SYNC_CONFIG.NOSTR_KIND_APP_DATA],
                    '#t': tTagsToQuery
                }
            ];

            const discoveryEvents = await this.queryRelays(discoveryFilters);
            let stateChanged = false;
            let needRepublishSeenFromSelfSync = false;

            // Process self-sync events first (oldest to newest) so newly synced friends are included in pairwise checks
            const selfSyncEvents = discoveryEvents
                .filter(ev => {
                    const tVals = (ev.tags || []).filter(t => t[0] === 't').map(t => t[1]);
                    const dVal = (ev.tags || []).find(t => t[0] === 'd')?.[1] || '';
                    return tVals.includes(selfTag) || dVal === '414x-self-v1';
                })
                .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

            for (const ev of selfSyncEvents) {
                const selfPayload = await decryptJson(ev.content, selfKeyHex);
                if (selfPayload && selfPayload.type === '414x_self_sync_v1') {
                    const mergeRes = await this.mergeSelfSyncPayload(selfPayload, {
                        adoptIdentityKeys: false
                    });
                    if (mergeRes.changed) {
                        stateChanged = true;
                    }
                    if (mergeRes.sawAdditionalItems) {
                        needRepublishSeenFromSelfSync = true;
                    }
                }
            }

            // Ensure pairwiseMap includes any friends added via self-sync
            for (const friendEmail of Object.keys(this.state.friends)) {
                const pairInfo = await derivePairwiseInfo(id.email, friendEmail);
                if (!pairwiseMap.has(pairInfo.incomingTag)) {
                    pairwiseMap.set(pairInfo.incomingTag, {
                        friendEmail,
                        pairKeyHex: pairInfo.pairKeyHex
                    });
                }
            }

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
                            const removedAt = (this.state.removedFriends && this.state.removedFriends[fromEmail]) || 0;
                            const inviteTime = invite.timestamp || evTimeMs || Date.now();
                            if (inviteTime >= removedAt) {
                                const existing = this.state.friends[fromEmail];
                                if (!existing) {
                                    this.state.friends[fromEmail] = {
                                        email: fromEmail,
                                        displayName: invite.fromName || fromEmail,
                                        status: 'pending_incoming',
                                        pubkeyHex: invite.pubkeyHex || ev.pubkey,
                                        seenFeedKeyHex: null,
                                        addedAt: inviteTime,
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

            if (needRepublishSeenFromSelfSync || !this.state.selfSyncLastSyncedAt) {
                await this.publishMySeenSnapshot().catch(() => {});
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
                const mergedFriendForced = new Map(); // friendEmail -> Map<tweetId, { id, forcedAt }>

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
                            if (Array.isArray(decrypted.forced)) {
                                let forcedMapForFriend = mergedFriendForced.get(friend.email);
                                if (!forcedMapForFriend) {
                                    forcedMapForFriend = new Map();
                                    mergedFriendForced.set(friend.email, forcedMapForFriend);
                                }
                                for (const rawForced of decrypted.forced) {
                                    const fid = String(typeof rawForced === 'string' ? rawForced : rawForced?.id || '').trim();
                                    const forcedAt = (typeof rawForced === 'object' && rawForced?.forcedAt) ? rawForced.forcedAt : (decrypted.updatedAt || now);
                                    if (this.isValidRecentTweetId(fid, now)) {
                                        idSet.add(fid);
                                        const prev = forcedMapForFriend.get(fid);
                                        if (!prev || forcedAt >= prev.forcedAt) {
                                            forcedMapForFriend.set(fid, { id: fid, forcedAt });
                                        }
                                    }
                                }
                            }
                            if (decrypted.posts && typeof decrypted.posts === 'object') {
                                for (const [postId, rawPostMeta] of Object.entries(decrypted.posts)) {
                                    const sanitized = this.sanitizeTweetMeta(postId, rawPostMeta);
                                    if (sanitized) {
                                        this.state.postMetaMap[sanitized.id] = sanitized;
                                    }
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
                    const forcedMapForFriend = mergedFriendForced.get(fEmail);
                    if (forcedMapForFriend) {
                        this.state.friendForcedMap[fEmail] = Array.from(forcedMapForFriend.values())
                            .slice(-(FRIEND_SYNC_CONFIG.MAX_FORCED_IDS || 100));
                    } else {
                        this.state.friendForcedMap[fEmail] = [];
                    }
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

            // Compute newly discovered invites and forced posts for notifications
            let notifiedSetChanged = false;
            const newInvites = [];
            for (const f of Object.values(this.state.friends)) {
                if (f.status === 'pending_incoming' && (!prevInviteEmails.has(f.email) || !this.notifiedInviteSet.has(f.email))) {
                    this.notifiedInviteSet.add(f.email);
                    notifiedSetChanged = true;
                    newInvites.push({
                        email: f.email,
                        displayName: f.displayName || f.email,
                        addedAt: f.addedAt || Date.now()
                    });
                }
            }

            const candidateForcedPosts = [];
            for (const [tweetId, entries] of this.tweetToForcedByMap.entries()) {
                if (!this.dismissedForcedSet.has(tweetId) && (!prevForcedIds.has(tweetId) || !this.notifiedForcedSet.has(tweetId))) {
                    this.notifiedForcedSet.add(tweetId);
                    notifiedSetChanged = true;
                    const latestForcedAt = entries.reduce((max, e) => Math.max(max, e.forcedAt || 0), 0);
                    candidateForcedPosts.push({
                        tweetId,
                        latestForcedAt,
                        forcedBy: entries.map(e => e.label),
                        meta: this.state.postMetaMap[tweetId] || null
                    });
                }
            }

            // Sort newest forced first and cap per-sync notification burst to top 5
            candidateForcedPosts.sort((a, b) => (b.latestForcedAt || 0) - (a.latestForcedAt || 0));
            const newForcedPosts = candidateForcedPosts.slice(0, 5);

            if (notifiedSetChanged) {
                this.pruneMySeenIds();
                await this.saveState();
            }

            this.lastSyncNotifications = {
                newInvites,
                newForcedPosts,
                timestamp: Date.now()
            };

            if ((newInvites.length > 0 || newForcedPosts.length > 0) && typeof this.onNotification === 'function') {
                try {
                    await this.onNotification(this.lastSyncNotifications);
                } catch (notifErr) {
                    console.warn('X Friends Sync: Notification callback error', notifErr);
                }
            }
        } catch (err) {
            console.warn('X Friends Sync: Relay sync error', err);
        } finally {
            this.isSyncing = false;
        }

        if (this.pendingSyncRequested) {
            this.pendingSyncRequested = false;
            return this.syncWithRelays();
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
            openPromise: null,
            openedAt: 0,
            receivedData: false
        };

        const recordRelayFailure = () => {
            const failures = (this.relayFailureCounts.get(relayUrl) || 0) + 1;
            this.relayFailureCounts.set(relayUrl, failures);
            const baseCooldownMs = FRIEND_SYNC_CONFIG.RELAY_BASE_COOLDOWN_MS || (60 * 1000);
            const maxCooldownMs = FRIEND_SYNC_CONFIG.RELAY_MAX_COOLDOWN_MS || (30 * 60 * 1000);
            const backoffMs = Math.min(maxCooldownMs, baseCooldownMs * Math.pow(2, Math.min(failures - 1, 5)));
            this.relayCooldownUntil.set(relayUrl, Date.now() + backoffMs);
        };

        entry.openPromise = new Promise((resolve) => {
            let settled = false;
            const fail = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimer);
                this.wsPool.delete(relayUrl);
                recordRelayFailure();
                this.closeRelayEntry(entry);
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
                    entry.openedAt = Date.now();
                    this.relayCooldownUntil.delete(relayUrl);
                    this.touchRelayEntry(entry);
                    resolve(entry);
                };

                ws.onmessage = (msg) => {
                    if (!entry.receivedData) {
                        entry.receivedData = true;
                        this.relayFailureCounts.delete(relayUrl);
                    }
                    this.touchRelayEntry(entry);
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
                        recordRelayFailure();
                        this.closeRelayEntry(entry);
                    }
                };

                ws.onclose = () => {
                    if (entry.idleTimer) {
                        clearTimeout(entry.idleTimer);
                        entry.idleTimer = null;
                    }
                    this.wsPool.delete(relayUrl);
                    if (!settled) {
                        fail();
                    } else if (!entry.receivedData && entry.openedAt && (Date.now() - entry.openedAt) < 1500) {
                        recordRelayFailure();
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
        const idleTimeoutMs = FRIEND_SYNC_CONFIG.RELAY_IDLE_TIMEOUT_MS || 60000;
        entry.idleTimer = setTimeout(() => {
            if (entry.listeners.size === 0) {
                this.closeRelayEntry(entry);
            }
        }, idleTimeoutMs);
        if (typeof entry.idleTimer?.unref === 'function') entry.idleTimer.unref();
    }

    closeRelayEntry(entry) {
        if (!entry) return;
        if (entry.idleTimer) {
            clearTimeout(entry.idleTimer);
            entry.idleTimer = null;
        }
        this.wsPool.delete(entry.relayUrl);
        const ws = entry.ws;
        entry.ws = null;
        if (!ws) return;
        try {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            if (ws.readyState === 0 || ws.readyState === 1) {
                ws.close();
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
