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
        this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
        this.isLoaded = false;
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.flushTimeout = null;
        this.inflightHydrations = new Map();

        this.state = {
            identity: null, // { email, displayName, privKeyHex, pubkeyHex, seenFeedKeyHex }
            friends: {},    // { [email]: { email, displayName, status, pubkeyHex, seenFeedKeyHex, addedAt, lastSyncedAt, seenCount } }
            mySeenIds: [],  // string[]
            friendSeenMap: {}, // { [email]: string[] }
            postMetaMap: {},   // { [tweetId]: TweetMeta }
            myForcedMap: {},   // { [tweetId]: { id, forcedAt } }
            friendForcedMap: {}, // { [email]: Array<{ id, forcedAt }> }
            dismissedForcedIds: [] // string[]
        };

        this.mySeenSet = new Set();
        this.dismissedForcedSet = new Set();
        this.tweetToFriendsMap = new Map(); // tweetId -> string[] of friend labels
        this.tweetToForcedByMap = new Map(); // tweetId -> Array<{ label, email, forcedAt }>
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
                this.state.postMetaMap = (loaded.postMetaMap && typeof loaded.postMetaMap === 'object') ? loaded.postMetaMap : {};
                this.state.myForcedMap = (loaded.myForcedMap && typeof loaded.myForcedMap === 'object') ? loaded.myForcedMap : {};
                this.state.friendForcedMap = (loaded.friendForcedMap && typeof loaded.friendForcedMap === 'object') ? loaded.friendForcedMap : {};
                this.state.dismissedForcedIds = Array.isArray(loaded.dismissedForcedIds) ? loaded.dismissedForcedIds : [];
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
            this.state.dismissedForcedIds = Array.from(this.dismissedForcedSet);
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
        const valid = this.state.mySeenIds.filter(id => this.isValidRecentTweetId(id));
        const capped = valid.slice(-FRIEND_SYNC_CONFIG.MAX_SEEN_IDS);
        this.state.mySeenIds = capped;
        this.mySeenSet = new Set(capped);

        const validDismissed = (this.state.dismissedForcedIds || [])
            .filter(id => this.isValidRecentTweetId(id))
            .slice(-FRIEND_SYNC_CONFIG.MAX_FORCED_IDS * 2);
        this.state.dismissedForcedIds = validDismissed;
        this.dismissedForcedSet = new Set(validDismissed);

        // Cap myForcedMap
        if (this.state.myForcedMap && typeof this.state.myForcedMap === 'object') {
            const forcedEntries = Object.values(this.state.myForcedMap)
                .filter(item => item && this.isValidRecentTweetId(item.id))
                .sort((a, b) => (a.forcedAt || 0) - (b.forcedAt || 0))
                .slice(-(FRIEND_SYNC_CONFIG.MAX_FORCED_IDS || 100));
            this.state.myForcedMap = {};
            for (const entry of forcedEntries) {
                this.state.myForcedMap[entry.id] = entry;
            }
        } else {
            this.state.myForcedMap = {};
        }

        // Cap postMetaMap locally while preserving forced posts and hydrated friend posts
        const maxLocalMeta = Math.max((FRIEND_SYNC_CONFIG.MAX_POST_META_ENTRIES || 200) * 6, 1200);
        const metaKeys = Object.keys(this.state.postMetaMap || {});
        if (metaKeys.length > maxLocalMeta) {
            const sortedMeta = Object.values(this.state.postMetaMap)
                .filter(m => m && this.isValidRecentTweetId(m.id))
                .sort((a, b) => {
                    const aForced = Boolean(this.state.myForcedMap[a.id]);
                    const bForced = Boolean(this.state.myForcedMap[b.id]);
                    if (aForced !== bForced) return aForced ? 1 : -1;
                    return (a.updatedAt || 0) - (b.updatedAt || 0);
                })
                .slice(-maxLocalMeta);
            this.state.postMetaMap = {};
            for (const m of sortedMeta) {
                this.state.postMetaMap[m.id] = m;
            }
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
        delete this.state.friendForcedMap[normFriend];
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
            this.state.hasUnpublishedSeen = true;
            await this.saveState();

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
        const wasSeen = this.mySeenSet.has(id);
        this.mySeenSet.add(id);

        if (!wasSeen) {
            this.state.hasUnpublishedSeen = true;
            this.scheduleSnapshotFlush();
        }
        await this.saveState();
        this.broadcastSeenUpdateToTabs();

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
            if (meta && meta.isUnavailable) {
                continue;
            }
            const seenBy = this.tweetToFriendsMap.get(tweetId) || [];
            const forcedEntries = this.tweetToForcedByMap.get(tweetId) || [];
            const forcedBy = forcedEntries.map(e => e.label);
            const myForcedObj = this.state.myForcedMap ? this.state.myForcedMap[tweetId] : null;
            const forcedByMe = Boolean(myForcedObj);
            const myForcedAt = myForcedObj?.forcedAt || 0;
            const friendForcedAt = forcedEntries.reduce((max, e) => Math.max(max, e.forcedAt || 0), 0);
            const latestForcedAt = Math.max(myForcedAt, friendForcedAt);
            const isForced = forcedBy.length > 0 || forcedByMe;
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
                latestForcedAt,
                isSeenByMe,
                isDismissed,
                snowflakeTimeMs,
                sortTimestamp,
                meta
            };

            timelinePosts.push(postItem);

            if (forcedBy.length > 0 && !isSeenByMe && !isDismissed) {
                unseenForcedPosts.push(postItem);
            }
        }

        // Sort timeline posts: forced posts first (newest forcedAt), then seen posts (newest snowflake / updatedAt)
        timelinePosts.sort((a, b) => {
            if (a.isForced !== b.isForced) return a.isForced ? -1 : 1;
            if (a.isForced && b.isForced && a.latestForcedAt !== b.latestForcedAt) {
                return b.latestForcedAt - a.latestForcedAt;
            }
            if (a.snowflakeTimeMs !== b.snowflakeTimeMs) {
                return b.snowflakeTimeMs - a.snowflakeTimeMs;
            }
            return b.sortTimestamp - a.sortTimestamp;
        });

        unseenForcedPosts.sort((a, b) => (b.latestForcedAt || b.sortTimestamp) - (a.latestForcedAt || a.sortTimestamp));

        const connectedFriends = Object.values(this.state.friends)
            .filter(f => f.status === 'connected')
            .map(f => ({
                email: f.email,
                displayName: f.displayName || f.email,
                label: f.displayName && f.displayName !== f.email ? `${f.displayName} (${f.email})` : f.email
            }));

        return {
            timelinePosts,
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

        // Include compact post metadata for all forced posts + most recent seen posts
        const posts = {};
        const maxMetaEntries = FRIEND_SYNC_CONFIG.MAX_POST_META_ENTRIES || 200;
        for (const forcedItem of forcedList) {
            const meta = this.state.postMetaMap[forcedItem.id];
            if (meta && !meta.isUnavailable) {
                posts[forcedItem.id] = meta;
            }
        }
        const recentSeenForMeta = seenIds.slice(-maxMetaEntries).reverse();
        for (const tid of recentSeenForMeta) {
            if (Object.keys(posts).length >= maxMetaEntries) break;
            const meta = this.state.postMetaMap[tid];
            if (!posts[tid] && meta && !meta.isUnavailable) {
                posts[tid] = meta;
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
