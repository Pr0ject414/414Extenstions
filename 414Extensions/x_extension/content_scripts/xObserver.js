// 414Extensions/x_extension/content_scripts/xObserver.js
(function() {
    if (window.XObserverInjected) return;
    window.XObserverInjected = true;

    const DWELL_TIME_MS = 1200;
    const VISIBILITY_THRESHOLD = 0.6;
    const SEEN_FLUSH_MS = 2000;
    const MAX_LOCAL_MARKED_SEEN = 1000;
    const MAX_PENDING_SEEN_META = 25;

    const processedElements = new WeakSet();
    const observedTweets = new WeakSet();
    const dwellTimers = new Map(); // tweetId -> timerId
    const locallyMarkedSeen = new Set();
    const pendingSeenQueue = new Set();
    const pendingSeenMetaMap = {}; // tweetId -> TweetMeta

    function addLocallyMarkedSeen(tweetId) {
        if (!tweetId) return;
        if (locallyMarkedSeen.has(tweetId)) {
            locallyMarkedSeen.delete(tweetId);
        }
        locallyMarkedSeen.add(tweetId);
        while (locallyMarkedSeen.size > MAX_LOCAL_MARKED_SEEN) {
            const oldest = locallyMarkedSeen.values().next().value;
            if (oldest === undefined) break;
            locallyMarkedSeen.delete(oldest);
        }
    }

    let observer = null;
    let tweetIntersectionObserver = null;
    let scanTimeout = null;
    let flushSeenTimeout = null;
    let isFriendsSyncActive = true;

    function isContextValid() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function safeHasError() {
        try {
            return !!(chrome.runtime && chrome.runtime.lastError);
        } catch (e) {
            return true;
        }
    }

    function extractScreenNameFromUserCell(userCell) {
        if (!userCell) return null;
        // 1. Look for UserAvatar-Container-{username} testid
        const avatar = userCell.querySelector ? userCell.querySelector('[data-testid^="UserAvatar-Container-"]') : null;
        if (avatar) {
            const tid = avatar.getAttribute('data-testid');
            const match = tid ? tid.match(/UserAvatar-Container-(.+)/) : null;
            if (match && match[1]) return match[1];
        }

        // 2. Look for links containing /username
        const links = userCell.querySelectorAll ? userCell.querySelectorAll('a[href^="/"]') : [];
        for (const link of links) {
            const href = link.getAttribute('href');
            if (href && !href.includes('/status/') && !href.includes('/i/') && !href.includes('/search')) {
                const parts = href.split('?')[0].split('/').filter(Boolean);
                if (parts.length === 1 && /^[a-zA-Z0-9_]{1,15}$/.test(parts[0])) {
                    const invalid = ['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose'];
                    if (!invalid.includes(parts[0].toLowerCase())) return parts[0];
                }
            }
        }

        // 3. Fallback: Search text content for @handle
        const match = userCell.textContent ? userCell.textContent.match(/@([a-zA-Z0-9_]{1,15})/) : null;
        if (match) {
            return match[1];
        }
        return null;
    }

    function extractTweetIdFromArticle(article) {
        if (!article) return null;
        if (article.dataset && article.dataset.xTweetId) return article.dataset.xTweetId;
        if (article.getAttribute) {
            const directId = article.getAttribute('data-tweet-id') || article.getAttribute('data-x-tweet-id');
            if (directId) return directId;
        }
        if (!article.querySelector) return null;

        // 1. Primary: look for the timestamp permalink in the outer tweet header
        const timeLinks = article.querySelectorAll('a[href*="/status/"] time');
        for (const timeEl of timeLinks) {
            const link = timeEl.closest('a[href*="/status/"]');
            if (link) {
                const href = link.getAttribute('href') || '';
                const match = href.match(/\/status\/(\d+)/);
                if (match && match[1]) return match[1];
            }
        }

        // 2. Fallback: any /status/ link inside the article
        const statusLinks = article.querySelectorAll('a[href*="/status/"]');
        for (const link of statusLinks) {
            const href = link.getAttribute('href') || '';
            const match = href.match(/\/status\/(\d+)/);
            if (match && match[1]) return match[1];
        }

        return null;
    }

    function extractAuthorNameFromHeader(headerElem, screenName) {
        if (!headerElem) return '';
        const spans = headerElem.querySelectorAll ? headerElem.querySelectorAll('span') : [];
        for (const span of spans) {
            if (span.closest && span.closest('.x-location-inline-badge')) continue;
            const txt = (span.textContent || '').trim();
            if (!txt || txt.startsWith('@') || txt === '·') continue;
            if (screenName && txt.toLowerCase() === `@${screenName.toLowerCase()}`) continue;
            return txt;
        }
        return screenName || '';
    }

    function extractTextWithEmojiAlts(elem) {
        if (!elem) return '';
        let out = '';
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3) {
                out += node.nodeValue || '';
            } else if (node.nodeType === 1) {
                if (node.tagName === 'IMG' && node.getAttribute('alt')) {
                    out += node.getAttribute('alt');
                } else {
                    const children = node.childNodes || [];
                    for (let i = 0; i < children.length; i++) {
                        walk(children[i]);
                    }
                }
            }
        };
        walk(elem);
        return out.trim();
    }

    function extractTweetMetadataFromArticle(article, tweetId) {
        if (!article || !article.querySelector) return null;
        if (article._xPostItem && article._xPostItem.meta && (article._xPostItem.meta.screenName || article._xPostItem.meta.isHydrated)) {
            return article._xPostItem.meta;
        }
        const id = tweetId || extractTweetIdFromArticle(article);
        if (!id) return null;

        const allHeaders = article.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]');
        const headerElem = allHeaders[0] || null;
        const qHeaderFromList = allHeaders.length > 1 ? allHeaders[1] : null;

        const screenName = extractScreenNameFromUserCell(headerElem) || '';
        const authorName = extractAuthorNameFromHeader(headerElem, screenName);

        // Identify the inner quoted tweet card container (if present) without matching outer avatars/links
        let quoteCard = article.querySelector('.x-friend-card-quote');
        if (!quoteCard && qHeaderFromList) {
            const roleLink = qHeaderFromList.closest ? qHeaderFromList.closest('[role="link"]') : null;
            if (roleLink && article.contains(roleLink) && roleLink !== article && (!headerElem || !roleLink.contains(headerElem))) {
                quoteCard = roleLink;
            } else {
                let curr = qHeaderFromList;
                while (curr.parentElement && curr.parentElement !== article && (!headerElem || !curr.parentElement.contains(headerElem))) {
                    curr = curr.parentElement;
                }
                if (curr !== qHeaderFromList) {
                    quoteCard = curr;
                }
            }
        }
        if (!quoteCard) {
            const roleLinks = article.querySelectorAll('[role="link"]');
            for (const rl of roleLinks) {
                if (headerElem && rl.contains && rl.contains(headerElem)) continue;
                if (rl.querySelector && (rl.querySelector('[data-testid="User-Name"], [data-testid="UserName"]') || rl.querySelector('[data-testid="tweetText"]'))) {
                    quoteCard = rl;
                    break;
                }
            }
        }

        const isVerified = Boolean(
            headerElem && headerElem.querySelector && headerElem.querySelector('[data-testid="icon-verified"], .x-friend-card-verified-icon')
        );

        let avatarUrl = '';
        const avatarImgs = article.querySelectorAll('[data-testid^="UserAvatar-Container-"] img[src], img[src*="profile_images"], img.x-friend-card-avatar');
        for (const img of avatarImgs) {
            if (quoteCard && quoteCard.contains && quoteCard.contains(img)) continue;
            avatarUrl = (img.getAttribute('src') || '').replace('_normal.', '_bigger.');
            if (avatarUrl) break;
        }

        let createdAt = null;
        const timeElements = article.querySelectorAll('a[href*="/status/"] time[datetime], time[datetime]');
        for (const tEl of timeElements) {
            if (quoteCard && quoteCard.contains && quoteCard.contains(tEl)) continue;
            createdAt = tEl.getAttribute('datetime') || null;
            if (createdAt) break;
        }

        let text = '';
        const tweetTextNodes = article.querySelectorAll('[data-testid="tweetText"]');
        for (const tNode of tweetTextNodes) {
            if (quoteCard && quoteCard.contains && quoteCard.contains(tNode)) continue;
            text = extractTextWithEmojiAlts(tNode);
            if (text) break;
        }

        // Media attachments (photos & videos on outer tweet only)
        const media = [];
        const photoImgs = article.querySelectorAll('[data-testid="tweetPhoto"] img[src]');
        for (const img of photoImgs) {
            if (quoteCard && quoteCard.contains && quoteCard.contains(img)) continue;
            const src = img.getAttribute('src') || '';
            if (src && !src.includes('profile_images') && !src.includes('/emoji/')) {
                media.push({ type: 'photo', url: src });
            }
        }
        const videos = article.querySelectorAll('video');
        for (const vid of videos) {
            if (quoteCard && quoteCard.contains && quoteCard.contains(vid)) continue;
            const poster = vid.getAttribute('poster') || '';
            const src = vid.getAttribute('src') || '';
            if (poster || src) {
                media.push({ type: 'video', posterUrl: poster, url: src || poster });
            }
        }

        // Quoted tweet summary if present
        let quotedTweet = null;
        if (quoteCard) {
            const qHeader = qHeaderFromList || (quoteCard.querySelector ? quoteCard.querySelector('[data-testid="User-Name"], [data-testid="UserName"], .x-friend-card-quote-header') : null);
            const qTextEl = quoteCard.querySelector ? quoteCard.querySelector('[data-testid="tweetText"]') : null;
            const qAvatarImg = quoteCard.querySelector ? quoteCard.querySelector('img[src*="profile_images"], img.x-friend-card-quote-avatar') : null;
            const qAvatarUrl = (qAvatarImg ? (qAvatarImg.getAttribute('src') || '') : '').replace('_normal.', '_bigger.');
            const qIsVerified = Boolean(
                (qHeader && qHeader.querySelector && qHeader.querySelector('[data-testid="icon-verified"], .x-friend-card-verified-icon')) ||
                (quoteCard.querySelector && quoteCard.querySelector('[data-testid="icon-verified"], .x-friend-card-verified-icon'))
            );
            const qTimeEl = quoteCard.querySelector ? quoteCard.querySelector('time[datetime]') : null;
            const qCreatedAt = qTimeEl ? (qTimeEl.getAttribute('datetime') || null) : null;
            let qId = '';
            if (quoteCard.querySelectorAll) {
                const qLinks = quoteCard.querySelectorAll('a[href*="/status/"]');
                for (const ql of qLinks) {
                    const href = ql.getAttribute('href') || '';
                    const m = href.match(/\/status\/(\d+)/);
                    if (m && m[1] && m[1] !== id) {
                        qId = m[1];
                        break;
                    }
                }
            }
            const qMedia = [];
            if (quoteCard.querySelectorAll) {
                const qPhotos = quoteCard.querySelectorAll('[data-testid="tweetPhoto"] img[src]');
                for (const qImg of qPhotos) {
                    const src = qImg.getAttribute('src') || '';
                    if (src && !src.includes('profile_images') && !src.includes('/emoji/')) {
                        qMedia.push({ type: 'photo', url: src });
                    }
                }
                const qVideos = quoteCard.querySelectorAll('video');
                for (const qVid of qVideos) {
                    const poster = qVid.getAttribute('poster') || '';
                    const src = qVid.getAttribute('src') || '';
                    if (poster || src) {
                        qMedia.push({ type: 'video', posterUrl: poster, url: src || poster });
                    }
                }
            }

            if (qHeader || qTextEl || qMedia.length > 0) {
                const qScreenName = extractScreenNameFromUserCell(qHeader) || extractScreenNameFromUserCell(quoteCard) || '';
                const qAuthorName = extractAuthorNameFromHeader(qHeader, qScreenName);
                const qText = extractTextWithEmojiAlts(qTextEl);
                if (qScreenName || qAuthorName || qText || qMedia.length > 0) {
                    quotedTweet = {
                        id: qId,
                        screenName: qScreenName,
                        authorName: qAuthorName,
                        avatarUrl: qAvatarUrl,
                        isVerified: qIsVerified,
                        createdAt: qCreatedAt,
                        text: qText,
                        media: qMedia.slice(0, 4)
                    };
                }
            }
        }

        const permalink = screenName
            ? `https://x.com/${screenName}/status/${id}`
            : `https://x.com/i/status/${id}`;

        return {
            id,
            screenName,
            authorName,
            avatarUrl,
            isVerified,
            text,
            media: media.slice(0, 4),
            quotedTweet,
            createdAt,
            permalink,
            updatedAt: Date.now()
        };
    }

    let cachedTimelineData = {
        timelinePosts: [],
        unseenForcedPosts: [],
        connectedFriends: []
    };
    let hasLoadedTimelineOnce = false;
    let lastTimelineFetchMs = 0;
    let checkedTweetsGeneration = 1;
    const inflightHydrateIds = new Set();

    function observeTimelineArticles() {
        ensureIntersectionObserver();
        if (!tweetIntersectionObserver) return;
        const customArticles = document.querySelectorAll('#x-friends-timeline-root article[data-testid="tweet"], #x-forced-home-feed article[data-testid="tweet"]');
        customArticles.forEach(article => {
            const tweetId = extractTweetIdFromArticle(article);
            if (!tweetId) return;
            article.dataset.xTweetId = tweetId;
            if (!observedTweets.has(article)) {
                observedTweets.add(article);
                tweetIntersectionObserver.observe(article);
            }
        });
    }

    function recordTweetSeen(tweetId, article = null) {
        if (!tweetId || !isFriendsSyncActive || !isContextValid()) return;
        const liveArticle = (article && article.isConnected)
            ? article
            : (document.querySelector(`article[data-tweet-id="${tweetId}"], article[data-x-tweet-id="${tweetId}"]`) || article);

        if (liveArticle && Object.keys(pendingSeenMetaMap).length < MAX_PENDING_SEEN_META) {
            const meta = (liveArticle._xPostItem && liveArticle._xPostItem.meta && liveArticle._xPostItem.meta.screenName)
                ? liveArticle._xPostItem.meta
                : extractTweetMetadataFromArticle(liveArticle, tweetId);
            if (meta && (meta.screenName || meta.text || (Array.isArray(meta.media) && meta.media.length > 0))) {
                pendingSeenMetaMap[tweetId] = meta;
            }
        }

        if (window.XLocationUI && typeof window.XLocationUI.markCardSeenInDOM === 'function') {
            window.XLocationUI.markCardSeenInDOM(tweetId);
        }

        // Update cachedTimelineData in-memory so seen state and badge stay in sync without removing on-screen cards
        if (Array.isArray(cachedTimelineData.timelinePosts)) {
            const item = cachedTimelineData.timelinePosts.find(p => p.tweetId === tweetId);
            if (item) item.isSeenByMe = true;
        }
        if (Array.isArray(cachedTimelineData.unseenForcedPosts)) {
            const forcedItem = cachedTimelineData.unseenForcedPosts.find(p => p.tweetId === tweetId);
            if (forcedItem && !forcedItem.isSeenByMe) {
                forcedItem.isSeenByMe = true;
                const tabList = findHomeTabList();
                if (tabList && window.XLocationUI && typeof window.XLocationUI.ensureFriendsTimelineTab === 'function') {
                    window.XLocationUI.ensureFriendsTimelineTab(tabList, cachedTimelineData);
                }
            }
        }

        if (locallyMarkedSeen.has(tweetId)) return;

        addLocallyMarkedSeen(tweetId);
        pendingSeenQueue.add(tweetId);

        if (!flushSeenTimeout) {
            flushSeenTimeout = setTimeout(flushPendingSeenTweets, SEEN_FLUSH_MS);
        }
    }

    function flushPendingSeenTweets() {
        flushSeenTimeout = null;
        if (!isContextValid() || pendingSeenQueue.size === 0) return;

        const batch = Array.from(pendingSeenQueue);
        const tweetMetaMap = {};
        for (const id of batch) {
            if (pendingSeenMetaMap[id]) {
                tweetMetaMap[id] = pendingSeenMetaMap[id];
                delete pendingSeenMetaMap[id];
            }
        }
        pendingSeenQueue.clear();

        try {
            chrome.runtime.sendMessage({
                action: 'X_MARK_TWEETS_SEEN',
                payload: { tweetIds: batch, tweetMetaMap }
            }, () => {
                if (safeHasError()) return;
            });
        } catch (err) {
            // Ignore invalidated context errors
        }
    }

    function handleToggleForceTweet(tweetId, shouldForce, article = null, fallbackMeta = null) {
        if (!tweetId || !isContextValid()) return;

        if (shouldForce) {
            const meta = (fallbackMeta && fallbackMeta.screenName)
                ? fallbackMeta
                : (article ? extractTweetMetadataFromArticle(article, tweetId) : fallbackMeta);
            locallyMarkedSeen.add(tweetId);
            try {
                chrome.runtime.sendMessage({
                    action: 'X_FORCE_TWEET_TO_FRIENDS',
                    payload: { tweetId, meta }
                }, () => {
                    if (safeHasError()) return;
                    checkedTweetsGeneration++;
                    syncFriendsTimelineUI(true);
                });
            } catch (e) {}
        } else {
            try {
                chrome.runtime.sendMessage({
                    action: 'X_UNFORCE_TWEET',
                    payload: { tweetId }
                }, () => {
                    if (safeHasError()) return;
                    checkedTweetsGeneration++;
                    syncFriendsTimelineUI(true);
                });
            } catch (e) {}
        }
    }

    function requestTweetsHydration(tweetIds = []) {
        if (!isContextValid() || !Array.isArray(tweetIds) || tweetIds.length === 0) return;
        const batch = tweetIds.filter(id => id && !inflightHydrateIds.has(id)).slice(0, 20);
        if (batch.length === 0) return;

        batch.forEach(id => inflightHydrateIds.add(id));

        try {
            chrome.runtime.sendMessage({
                action: 'X_HYDRATE_TWEETS',
                payload: { tweetIds: batch }
            }, (response) => {
                batch.forEach(id => inflightHydrateIds.delete(id));
                if (safeHasError() || !response || !response.success || !response.hydrated) return;

                const hydrated = response.hydrated;
                const unavailableIds = new Set();

                for (const [tid, meta] of Object.entries(hydrated)) {
                    if (meta && meta.isUnavailable) {
                        unavailableIds.add(tid);
                    }
                }

                if (Array.isArray(cachedTimelineData.timelinePosts)) {
                    cachedTimelineData.timelinePosts = cachedTimelineData.timelinePosts
                        .filter(p => p.isForced || !unavailableIds.has(p.tweetId))
                        .map(p => (hydrated[p.tweetId] && !hydrated[p.tweetId].isUnavailable) ? { ...p, meta: hydrated[p.tweetId] } : p);
                }
                if (Array.isArray(cachedTimelineData.unseenForcedPosts)) {
                    cachedTimelineData.unseenForcedPosts = cachedTimelineData.unseenForcedPosts
                        .map(p => (hydrated[p.tweetId] && !hydrated[p.tweetId].isUnavailable) ? { ...p, meta: hydrated[p.tweetId] } : p);
                }

                if (window.XLocationUI && typeof window.XLocationUI.updateHydratedCardsInDOM === 'function') {
                    window.XLocationUI.updateHydratedCardsInDOM(hydrated);
                }
                observeTimelineArticles();
                scanDOM();
            });
        } catch (err) {
            batch.forEach(id => inflightHydrateIds.delete(id));
        }
    }

    function findHomeTabList() {
        const tabLists = document.querySelectorAll('[role="tablist"]');
        for (const tl of tabLists) {
            const text = (tl.textContent || '').toLowerCase();
            if (text.includes('for you') || text.includes('following') || tl.getAttribute('data-x-home-tablist') === 'true') {
                return tl;
            }
        }
        return null;
    }

    function findPrimaryTimelineContainer() {
        const primaryCol = document.querySelector('[data-testid="primaryColumn"]');
        if (primaryCol) {
            const section = primaryCol.querySelector('section[role="region"]');
            if (section) return { host: primaryCol, nativeFeed: section };
            return { host: primaryCol, nativeFeed: null };
        }
        const section = document.querySelector('section[role="region"]');
        if (section && section.parentElement) {
            return { host: section.parentElement, nativeFeed: section };
        }
        return { host: null, nativeFeed: null };
    }

    function isHomeTimelinePage(tabList) {
        if (tabList) return true;
        const path = (typeof window !== 'undefined' && window.location && window.location.pathname) || '/';
        return path === '/' || path === '/home' || path.startsWith('/home/');
    }

    function syncFriendsTimelineUI(forceRefresh = false) {
        if (!isFriendsSyncActive || !isContextValid() || !window.XLocationUI) return;

        const tabList = findHomeTabList();
        if (!isHomeTimelinePage(tabList)) {
            if (typeof window.XLocationUI.isFriendsTimelineTabSelected === 'function'
                && window.XLocationUI.isFriendsTimelineTabSelected()
                && typeof window.XLocationUI.setFriendsTimelineTabSelected === 'function') {
                window.XLocationUI.setFriendsTimelineTabSelected(false);
            }
            const timelineRoot = document.getElementById('x-friends-timeline-root');
            if (timelineRoot) {
                timelineRoot.style.display = 'none';
            }
            document.querySelectorAll('.x-native-feed-hidden').forEach(el => {
                el.classList.remove('x-native-feed-hidden');
                el.style.display = '';
            });
            return;
        }

        const { host, nativeFeed } = findPrimaryTimelineContainer();
        if (!tabList && !host && !nativeFeed) return;

        const callbacks = {
            onToggleForce: handleToggleForceTweet,
            onHydrateTweets: requestTweetsHydration,
            onPageAppended: () => {
                observeTimelineArticles();
            },
            onMarkSeen: (tid, meta) => {
                if (!isContextValid()) return;
                recordTweetSeen(tid, null);
                chrome.runtime.sendMessage({
                    action: 'X_MARK_TWEETS_SEEN',
                    payload: { tweetIds: [tid], tweetMetaMap: meta ? { [tid]: meta } : {} }
                }, () => {
                    if (safeHasError()) return;
                    syncFriendsTimelineUI(true);
                });
            },
            onDismissForced: (tid) => {
                if (!isContextValid()) return;
                locallyMarkedSeen.add(tid);
                chrome.runtime.sendMessage({
                    action: 'X_DISMISS_FORCED_TWEET',
                    payload: { tweetId: tid }
                }, () => {
                    if (safeHasError()) return;
                    syncFriendsTimelineUI(true);
                });
            },
            onSyncNow: (doneCb) => {
                if (!isContextValid()) {
                    if (doneCb) doneCb();
                    return;
                }
                chrome.runtime.sendMessage({
                    action: 'X_FRIENDS_FORCE_SYNC'
                }, () => {
                    if (doneCb) doneCb();
                    if (safeHasError()) return;
                    checkedTweetsGeneration++;
                    syncFriendsTimelineUI(true);
                });
            },
            onSelectFriendsTab: () => {
                syncFriendsTimelineUI(true);
            },
            onSelectNativeTab: () => {
                syncFriendsTimelineUI(true);
                setTimeout(() => {
                    syncFriendsTimelineUI(true);
                }, 150);
            }
        };

        // 1. Immediately inject/update the "Friends" tab in X's tablist synchronously
        if (tabList && typeof window.XLocationUI.ensureFriendsTimelineTab === 'function') {
            window.XLocationUI.ensureFriendsTimelineTab(tabList, cachedTimelineData, callbacks);
        }

        const applyView = (data) => {
            if (tabList && typeof window.XLocationUI.ensureFriendsTimelineTab === 'function') {
                window.XLocationUI.ensureFriendsTimelineTab(tabList, data, callbacks);
            }

            const isFriendsSelected = typeof window.XLocationUI.isFriendsTimelineTabSelected === 'function'
                && window.XLocationUI.isFriendsTimelineTabSelected();

            const timelineRoot = document.getElementById('x-friends-timeline-root');

            if (nativeFeed && typeof window.XLocationUI.renderForcedPostsInHomeFeed === 'function') {
                window.XLocationUI.renderForcedPostsInHomeFeed(nativeFeed, data.unseenForcedPosts || [], callbacks);
            }

            if (isFriendsSelected && host) {
                if (nativeFeed) {
                    nativeFeed.classList.add('x-native-feed-hidden');
                    nativeFeed.style.display = '';
                    nativeFeed.querySelectorAll('video').forEach(v => {
                        try {
                            if (!v.paused && typeof v.pause === 'function') v.pause();
                        } catch (e) {}
                    });
                }
                if (typeof window.XLocationUI.renderFriendsTimeline === 'function') {
                    const root = window.XLocationUI.renderFriendsTimeline(host, data, callbacks);
                    if (root) root.style.display = '';
                }
                if (typeof window.XLocationUI.evaluateVideoAutoplay === 'function') {
                    window.XLocationUI.evaluateVideoAutoplay();
                }
            } else {
                if (timelineRoot) {
                    timelineRoot.style.display = 'none';
                }
                if (nativeFeed) {
                    const wasHidden = nativeFeed.classList.contains('x-native-feed-hidden') || nativeFeed.style.display === 'none';
                    nativeFeed.classList.remove('x-native-feed-hidden');
                    nativeFeed.style.display = '';
                    if (wasHidden && typeof window.dispatchEvent === 'function' && typeof Event !== 'undefined') {
                        window.dispatchEvent(new Event('resize'));
                        requestAnimationFrame(() => {
                            window.dispatchEvent(new Event('resize'));
                        });
                    }
                }
            }

            observeTimelineArticles();
        };

        applyView(cachedTimelineData);

        const now = Date.now();
        if (!forceRefresh && hasLoadedTimelineOnce && (now - lastTimelineFetchMs) < 6000) {
            return;
        }
        lastTimelineFetchMs = now;

        try {
            chrome.runtime.sendMessage({
                action: 'X_GET_FRIENDS_TIMELINE'
            }, (response) => {
                if (safeHasError() || !response || !response.success) return;
                hasLoadedTimelineOnce = true;
                cachedTimelineData = response;
                applyView(response);
            });
        } catch (err) {}
    }

    function ensureIntersectionObserver() {
        if (tweetIntersectionObserver || typeof IntersectionObserver === 'undefined') return;

        tweetIntersectionObserver = new IntersectionObserver((entries) => {
            if (!isFriendsSyncActive || !isContextValid()) return;

            for (const entry of entries) {
                const article = entry.target;
                const tweetId = article.dataset?.xTweetId || extractTweetIdFromArticle(article);
                if (!tweetId) continue;

                const isCustomCard = Boolean(article.classList && article.classList.contains('x-friend-tweet-card'));
                const isSkeletonCard = Boolean(article.querySelector && article.querySelector('.x-friend-card-skeleton'));

                if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
                    if (isSkeletonCard) continue;
                    const needsSessionViewMark = isCustomCard && article.dataset?.xViewedInSession !== 'true';
                    if ((!locallyMarkedSeen.has(tweetId) || needsSessionViewMark) && !dwellTimers.has(tweetId)) {
                        const timerId = setTimeout(() => {
                            dwellTimers.delete(tweetId);
                            recordTweetSeen(tweetId, article);
                        }, DWELL_TIME_MS);
                        dwellTimers.set(tweetId, timerId);
                    }
                } else {
                    const existingTimer = dwellTimers.get(tweetId);
                    if (existingTimer) {
                        clearTimeout(existingTimer);
                        dwellTimers.delete(tweetId);
                    }
                    if (!entry.isIntersecting && isCustomCard && article.classList.contains('is-seen-by-me')) {
                        handleWindowScrollForSeenCards();
                    }
                }
            }
        }, {
            threshold: [0, VISIBILITY_THRESHOLD]
        });
    }

    function checkIsAdTweet(article) {
        if (!article) return false;
        if (window.XLocationUI && typeof window.XLocationUI.isAdTweet === 'function') {
            return window.XLocationUI.isAdTweet(article);
        }
        if (!article.querySelectorAll) return false;
        const caretBtns = article.querySelectorAll('[data-testid="caret"]');
        for (const caretBtn of caretBtns) {
            const roleLink = caretBtn.closest ? caretBtn.closest('[role="link"]') : null;
            if (roleLink && article.contains(roleLink) && roleLink !== article) continue;
            let curr = caretBtn.parentElement;
            let cluster = null;
            let depth = 0;
            while (curr && curr !== article && depth < 6) {
                if (curr.querySelector && curr.querySelector('[data-testid="User-Name"], [data-testid="UserName"], [data-testid="tweetText"]')) {
                    break;
                }
                cluster = curr;
                curr = curr.parentElement;
                depth++;
            }
            const searchRoot = cluster || caretBtn.parentElement;
            if (searchRoot && searchRoot.querySelectorAll) {
                const spans = searchRoot.querySelectorAll('span');
                for (const span of spans) {
                    if (span.closest && span.closest('button, a, time, [data-testid="User-Name"], [data-testid="UserName"], [data-testid="tweetText"], .x-location-inline-badge')) {
                        continue;
                    }
                    const txt = (span.textContent || '').trim();
                    if (txt === 'Ad' || txt === 'Promoted') return true;
                }
            }
        }
        return false;
    }

    function applyAdStealthState(article, shouldHide) {
        if (!article) return false;
        const isAd = checkIsAdTweet(article);
        if (isAd && shouldHide) {
            if (window.XLocationUI && typeof window.XLocationUI.collapseAdTweet === 'function') {
                window.XLocationUI.collapseAdTweet(article);
            } else {
                article.style.setProperty('max-height', '0px', 'important');
                article.style.setProperty('min-height', '0px', 'important');
                article.style.setProperty('height', '0px', 'important');
                article.style.setProperty('overflow', 'hidden', 'important');
                article.style.setProperty('opacity', '0', 'important');
                article.style.setProperty('pointer-events', 'none', 'important');
                article._xAdCollapsed = true;
            }
            return true;
        }
        if (window.XLocationUI && typeof window.XLocationUI.restoreAdTweet === 'function') {
            window.XLocationUI.restoreAdTweet(article);
        } else if (article._xAdCollapsed) {
            article.style.removeProperty('max-height');
            article.style.removeProperty('min-height');
            article.style.removeProperty('height');
            article.style.removeProperty('overflow');
            article.style.removeProperty('opacity');
            article.style.removeProperty('pointer-events');
            article._xAdCollapsed = false;
        }
        return isAd;
    }

    function scanTweetsForFriendsSync(forceRecheck = false) {
        if (!isFriendsSyncActive || !isContextValid()) return;

        if (forceRecheck) {
            checkedTweetsGeneration++;
        }

        ensureIntersectionObserver();
        syncFriendsTimelineUI(forceRecheck);

        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        if (articles.length === 0) return;

        const tweetMap = new Map(); // tweetId -> Array<{ article, headerElem, screenName }>

        articles.forEach(article => {
            if (article._xAdCollapsed || checkIsAdTweet(article)) return;
            const tweetId = extractTweetIdFromArticle(article);
            if (!tweetId) return;
            article.dataset.xTweetId = tweetId;

            if (tweetIntersectionObserver && !observedTweets.has(article)) {
                observedTweets.add(article);
                tweetIntersectionObserver.observe(article);
            }

            if (window.XLocationUI && typeof window.XLocationUI.renderForceTweetButton === 'function') {
                if (!article.querySelector('.x-force-friend-btn')) {
                    window.XLocationUI.renderForceTweetButton(article, tweetId, {}, handleToggleForceTweet);
                }
            }

            if (!forceRecheck && article._xSeenCheckGen === checkedTweetsGeneration) {
                return;
            }
            article._xSeenCheckGen = checkedTweetsGeneration;

            const headerElem = article.querySelector('[data-testid="User-Name"], [data-testid="UserName"]');
            const screenName = headerElem ? extractScreenNameFromUserCell(headerElem) : null;
            const list = tweetMap.get(tweetId) || [];
            list.push({ article, headerElem, screenName });
            tweetMap.set(tweetId, list);
        });

        const tweetIds = Array.from(tweetMap.keys());
        if (tweetIds.length === 0) return;

        try {
            chrome.runtime.sendMessage({
                action: 'X_CHECK_TWEETS_SEEN',
                payload: { tweetIds }
            }, (response) => {
                if (safeHasError() || !response || !response.success) return;

                const seenMap = response.seenMap || {};
                const forcedMap = response.forcedMap || {};
                const myForcedSet = new Set(Array.isArray(response.myForcedIds) ? response.myForcedIds : []);

                for (const [tweetId, targets] of tweetMap.entries()) {
                    const seenByFriends = seenMap[tweetId] || [];
                    const forcedByFriends = forcedMap[tweetId] || [];
                    const forcedByMe = myForcedSet.has(tweetId);

                    for (const { article, headerElem, screenName } of targets) {
                        if (headerElem && (seenByFriends.length > 0 || forcedByFriends.length > 0)) {
                            if (window.XLocationUI && typeof window.XLocationUI.renderFriendSeenBadge === 'function') {
                                window.XLocationUI.renderFriendSeenBadge(headerElem, screenName, seenByFriends, forcedByFriends);
                            }
                        }
                        if (article && window.XLocationUI && typeof window.XLocationUI.renderForceTweetButton === 'function') {
                            window.XLocationUI.renderForceTweetButton(article, tweetId, {
                                forcedByMe,
                                forcedByFriends
                            }, handleToggleForceTweet);
                        }
                    }
                }
            });
        } catch (err) {
            // Ignore invalidated context errors
        }
    }

    const NAME_FLAG_EMOJIS = {
        // Pride, Identity & Special Flags
        'transgender flag': ['🏳️‍⚧️', '⚧️', '⚧'],
        'transgender symbol': ['⚧️', '⚧'],
        'rainbow / pride flag': ['🏳️‍🌈'],
        'rainbow': ['🌈'],
        'pirate flag': ['🏴‍☠️'],
        'red flag': ['🚩'],
        'black flag': ['🏴'],
        'white flag': ['🏳️'],
        'checkered flag': ['🏁'],
        'crossed flags': ['🎌'],
        'european union': ['🇪🇺'],
        'united nations': ['🇺🇳'],
        // Common Display-Name Symbols
        'watermelon': ['🍉'],
        'hammer & sickle': ['☭'],
        'rose': ['🌹'],
        'sunflower': ['🌻'],
        'syringe': ['💉'],
        'face mask': ['😷'],
        'blue heart': ['💙'],
        'raised fist': ['✊', '✊🏻', '✊🏼', '✊🏽', '✊🏾', '✊🏿'],
        'peace symbol': ['☮️', '☮'],
        'star of david': ['✡️', '✡'],
        'star & crescent': ['☪️', '☪'],
        'latin cross': ['✝️', '✝'],
        'orthodox cross': ['☦️', '☦'],
        // Countries & Territories
        'afghanistan': ['🇦🇫'], 'albania': ['🇦🇱'], 'algeria': ['🇩🇿'], 'andorra': ['🇦🇩'], 'angola': ['🇦🇴'],
        'argentina': ['🇦🇷'], 'armenia': ['🇦🇲'], 'australia': ['🇦🇺'], 'austria': ['🇦🇹'], 'azerbaijan': ['🇦🇿'],
        'bahamas': ['🇧🇸'], 'bahrain': ['🇧🇭'], 'bangladesh': ['🇧🇩'], 'barbados': ['🇧🇧'], 'belarus': ['🇧🇾'],
        'belgium': ['🇧🇪'], 'belize': ['🇧🇿'], 'benin': ['🇧🇯'], 'bhutan': ['🇧🇹'], 'bolivia': ['🇧🇴'],
        'bosnia and herzegovina': ['🇧🇦'], 'botswana': ['🇧🇼'], 'brazil': ['🇧🇷'], 'brunei': ['🇧🇳'],
        'bulgaria': ['🇧🇬'], 'burkina faso': ['🇧🇫'], 'burundi': ['🇧🇮'], 'cambodia': ['🇰🇭'], 'cameroon': ['🇨🇲'],
        'canada': ['🇨🇦'], 'chile': ['🇨🇱'], 'china': ['🇨🇳'], 'colombia': ['🇨🇴'], 'costa rica': ['🇨🇷'],
        'croatia': ['🇭🇷'], 'cuba': ['🇨🇺'], 'cyprus': ['🇨🇾'], 'czech republic': ['🇨🇿'], 'czechia': ['🇨🇿'],
        'denmark': ['🇩🇰'], 'dominican republic': ['🇩🇴'], 'ecuador': ['🇪🇨'], 'egypt': ['🇪🇬'], 'el salvador': ['🇸🇻'],
        'england': ['🏴󠁧󠁢󠁥󠁮󠁧󠁿'], 'estonia': ['🇪🇪'], 'ethiopia': ['🇪🇹'], 'finland': ['🇫🇮'], 'france': ['🇫🇷'],
        'georgia': ['🇬🇪'], 'germany': ['🇩🇪'], 'ghana': ['🇬🇭'], 'greece': ['🇬🇷'], 'guatemala': ['🇬🇹'],
        'haiti': ['🇭🇹'], 'honduras': ['🇭🇳'], 'hong kong': ['🇭🇰'], 'hungary': ['🇭🇺'], 'iceland': ['🇮🇸'],
        'india': ['🇮🇳'], 'indonesia': ['🇮🇩'], 'iran': ['🇮🇷'], 'iraq': ['🇮🇶'], 'ireland': ['🇮🇪'],
        'israel': ['🇮🇱'], 'italy': ['🇮🇹'], 'jamaica': ['🇯🇲'], 'japan': ['🇯🇵'], 'jordan': ['🇯🇴'],
        'kazakhstan': ['🇰🇿'], 'kenya': ['🇰🇪'], 'kosovo': ['🇽🇰'], 'kuwait': ['🇰🇼'], 'latvia': ['🇱🇻'],
        'lebanon': ['🇱🇧'], 'lithuania': ['🇱🇹'], 'luxembourg': ['🇱🇺'], 'malaysia': ['🇲🇾'], 'maldives': ['🇲🇻'],
        'malta': ['🇲🇹'], 'mexico': ['🇲🇽'], 'moldova': ['🇲🇩'], 'monaco': ['🇲🇨'], 'mongolia': ['🇲🇳'],
        'montenegro': ['🇲🇪'], 'morocco': ['🇲🇦'], 'nepal': ['🇳🇵'], 'netherlands': ['🇳🇱'], 'new zealand': ['🇳🇿'],
        'nicaragua': ['🇳🇮'], 'nigeria': ['🇳🇬'], 'north korea': ['🇰🇵'], 'norway': ['🇳🇴'], 'oman': ['🇴🇲'],
        'pakistan': ['🇵🇰'], 'palestine': ['🇵🇸'], 'panama': ['🇵🇦'], 'paraguay': ['🇵🇾'], 'peru': ['🇵🇪'],
        'philippines': ['🇵🇭'], 'poland': ['🇵🇱'], 'portugal': ['🇵🇹'], 'puerto rico': ['🇵🇷'], 'qatar': ['🇶🇦'],
        'romania': ['🇷🇴'], 'russia': ['🇷🇺'], 'saudi arabia': ['🇸🇦'], 'scotland': ['🏴󠁧󠁢󠁳󠁣󠁴󠁿'], 'senegal': ['🇸🇳'],
        'serbia': ['🇷🇸'], 'singapore': ['🇸🇬'], 'slovakia': ['🇸🇰'], 'slovenia': ['🇸🇮'], 'south africa': ['🇿🇦'],
        'south korea': ['🇰🇷'], 'spain': ['🇪🇸'], 'sri lanka': ['🇱🇰'], 'sudan': ['🇸🇩'], 'sweden': ['🇸🇪'],
        'switzerland': ['🇨🇭'], 'syria': ['🇸🇾'], 'taiwan': ['🇹🇼'], 'thailand': ['🇹🇭'], 'tunisia': ['🇹🇳'],
        'turkey': ['🇹🇷'], 'türkiye': ['🇹🇷'], 'uganda': ['🇺🇬'], 'ukraine': ['🇺🇦'],
        'united arab emirates': ['🇦🇪'], 'uae': ['🇦🇪'], 'united kingdom': ['🇬🇧'], 'uk': ['🇬🇧'],
        'united states': ['🇺🇸'], 'usa': ['🇺🇸'], 'uruguay': ['🇺🇾'], 'uzbekistan': ['🇺🇿'],
        'venezuela': ['🇻🇪'], 'vietnam': ['🇻🇳'], 'wales': ['🏴󠁧󠁢󠁷󠁬󠁳󠁿'], 'yemen': ['🇾🇪'], 'zimbabwe': ['🇿🇼']
    };

    function stripVariationSelectors(str) {
        return (str || '').replace(/[\uFE0E\uFE0F]/g, '');
    }

    function extractDisplayNameContent(userCell, userData = null) {
        const parts = [];
        if (userData && userData.meta && typeof userData.meta.name === 'string') {
            parts.push(userData.meta.name);
        }
        if (userData && typeof userData.displayName === 'string') {
            parts.push(userData.displayName);
        }
        if (userCell) {
            if (userCell.querySelectorAll) {
                const imgs = userCell.querySelectorAll('img[alt]');
                for (const img of imgs) {
                    if (img.closest && img.closest('.x-location-inline-badge')) continue;
                    const alt = img.getAttribute('alt');
                    if (alt) parts.push(alt);
                }
            }
            if (typeof userCell.textContent === 'string') {
                parts.push(userCell.textContent);
            }
        }
        return parts.join(' ');
    }

    function findMatchedNameFlagRule(displayNameStr, settings) {
        if (!displayNameStr || !settings) return null;
        const blockedNameFlags = Array.isArray(settings.blockedNameFlags) ? settings.blockedNameFlags : [];
        if (blockedNameFlags.length === 0) return null;

        const normDisplay = stripVariationSelectors(displayNameStr);
        // For standalone white/black flag checks, strip composite ZWJ flags first
        const normDisplayWithoutComposite = normDisplay
            .replace(/\u{1F3F3}\u200D\u{26A7}/gu, '')
            .replace(/\u{1F3F3}\u200D\u{1F308}/gu, '')
            .replace(/\u{1F3F4}\u200D\u{2620}/gu, '');

        for (const item of blockedNameFlags) {
            if (!item) continue;
            const rawRule = item.trim();
            const ruleLower = rawRule.toLowerCase();
            if (!ruleLower) continue;

            const mappedEmojis = NAME_FLAG_EMOJIS[ruleLower];
            if (mappedEmojis && mappedEmojis.length > 0) {
                const haystack = (ruleLower === 'white flag' || ruleLower === 'black flag')
                    ? normDisplayWithoutComposite
                    : normDisplay;
                for (const emoji of mappedEmojis) {
                    const normEmoji = stripVariationSelectors(emoji);
                    if (normEmoji && haystack.includes(normEmoji)) {
                        return `Name Flag: ${mappedEmojis[0]} ${rawRule}`;
                    }
                }
            } else {
                // Custom emoji or text rule entered by user
                const normCustom = stripVariationSelectors(rawRule).toLowerCase();
                if (normCustom && normDisplay.toLowerCase().includes(normCustom)) {
                    return `Name Flag: ${rawRule}`;
                }
            }
        }

        return null;
    }

    function findMatchedFilterRule(userData, settings, headerElem = null) {
        if (!settings) return null;

        // 1. Check Display Name Flags & Symbols (independent of account origin country)
        const displayNameContent = extractDisplayNameContent(headerElem, userData);
        const matchedNameFlag = findMatchedNameFlagRule(displayNameContent, settings);
        if (matchedNameFlag) {
            return matchedNameFlag;
        }

        if (!userData) return null;

        const locLower = (userData.location || '').toLowerCase();
        const devLower = (userData.device || '').toLowerCase();
        if (!locLower && !devLower) return null;

        const blockedCountries = Array.isArray(settings.blockedCountries) ? settings.blockedCountries : [];
        for (const country of blockedCountries) {
            if (!country) continue;
            const needle = country.trim().toLowerCase();
            if (needle && (locLower.includes(needle) || devLower.includes(needle))) {
                return country.trim();
            }
        }

        const blockedDeviceRegions = Array.isArray(settings.blockedDeviceRegions) ? settings.blockedDeviceRegions : [];
        for (const item of blockedDeviceRegions) {
            if (!item) continue;
            const needle = item.trim().toLowerCase();
            if (needle && (devLower.includes(needle) || locLower.includes(needle))) {
                return item.trim();
            }
        }

        return null;
    }

    function getFilterTargetForUserElement(elem) {
        if (!elem || !elem.closest) return null;
        const tweet = elem.closest('article[data-testid="tweet"]');
        if (!tweet) return null;

        const primaryHeader = tweet.querySelector
            ? tweet.querySelector('[data-testid="User-Name"], [data-testid="UserName"]')
            : null;

        if (!primaryHeader || elem === primaryHeader || elem.contains(primaryHeader) || primaryHeader.contains(elem)) {
            return tweet;
        }

        // Quoted tweet inside the article: prefer its [role="link"] card container
        const roleLink = elem.closest('[role="link"]');
        if (roleLink && tweet.contains(roleLink) && roleLink !== tweet && !roleLink.contains(primaryHeader)) {
            return roleLink;
        }

        // Fallback: walk up to highest container inside the article that does not contain the outer author header
        let curr = elem;
        while (curr.parentElement && curr.parentElement !== tweet && !curr.parentElement.contains(primaryHeader)) {
            curr = curr.parentElement;
        }
        return curr !== elem ? curr : (elem.parentElement || tweet);
    }

    function applyTweetFilterForElement(target, userData, settings, headerElem = null) {
        if (!target) return;
        if (userData) {
            target._xPrimaryLocationData = userData;
        }
        if (headerElem) {
            target._xHeaderElem = headerElem;
        }
        if (target.dataset) {
            target.dataset.xFilterTarget = 'true';
        }

        const effectiveUser = target._xPrimaryLocationData || userData || {};
        const effectiveHeader = target._xHeaderElem || headerElem || null;
        const matchedRule = findMatchedFilterRule(effectiveUser, settings, effectiveHeader);
        const tweetId = target.dataset?.xTweetId || extractTweetIdFromArticle(target) || effectiveUser.screenName;

        if (matchedRule) {
            if (window.XLocationUI && typeof window.XLocationUI.filterTweet === 'function') {
                window.XLocationUI.filterTweet(target, {
                    reason: matchedRule,
                    screenName: effectiveUser.screenName,
                    location: effectiveUser.location,
                    device: effectiveUser.device,
                    tweetId
                });
            } else {
                target.style.display = 'none';
            }
            if (isFriendsSyncActive && target.tagName === 'ARTICLE') {
                const realTweetId = target.dataset?.xTweetId || target.getAttribute?.('data-tweet-id') || extractTweetIdFromArticle(target);
                if (realTweetId && /^\d+$/.test(String(realTweetId))) {
                    recordTweetSeen(String(realTweetId), target);
                }
            }
        } else if (target.classList && target.classList.contains('x-tweet-blocked')) {
            if (window.XLocationUI && typeof window.XLocationUI.unfilterTweet === 'function') {
                window.XLocationUI.unfilterTweet(target);
            } else {
                target.style.display = '';
            }
        }
    }

    function reevaluateAllTweets() {
        if (!isContextValid()) return;
        try {
            chrome.storage.local.get([
                'isXLocationEnabled',
                'isXHideAdsEnabled',
                'isXModuleEnabled',
                'isGlobalMasterSwitchEnabled',
                'blockedCountries',
                'blockedDeviceRegions',
                'blockedNameFlags'
            ], (settings) => {
                if (safeHasError() || !settings) return;
                const isModuleActive = settings.isGlobalMasterSwitchEnabled !== false &&
                    settings.isXModuleEnabled !== false;
                const isLocationEnabled = isModuleActive && settings.isXLocationEnabled !== false;
                const shouldHideAds = isModuleActive && settings.isXHideAdsEnabled !== false;

                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                articles.forEach(article => {
                    applyAdStealthState(article, shouldHideAds);
                });

                const targets = document.querySelectorAll('article[data-testid="tweet"], [data-x-filter-target="true"]');
                targets.forEach(target => {
                    if (!isLocationEnabled) {
                        if (window.XLocationUI && typeof window.XLocationUI.unfilterTweet === 'function') {
                            window.XLocationUI.unfilterTweet(target);
                        } else {
                            target.style.display = '';
                        }
                        return;
                    }
                    if (target._xAdCollapsed) return;
                    if (target._xPrimaryLocationData || target._xHeaderElem) {
                        applyTweetFilterForElement(target, target._xPrimaryLocationData, settings, target._xHeaderElem);
                    }
                });
            });
        } catch (err) {}
    }

    let lastReportedDomNotifCount = -1;
    let lastReportedDomDmCount = -1;
    let lastReportedDomSnippet = '';

    function extractUnreadBadgeCount(linkEl) {
        if (!linkEl) return 0;
        const aria = (linkEl.getAttribute && linkEl.getAttribute('aria-label')) || '';
        const ariaMatch = aria.match(/(\d+)\s+unread/i);
        if (ariaMatch && ariaMatch[1]) {
            return parseInt(ariaMatch[1], 10) || 0;
        }
        if (linkEl.querySelectorAll) {
            const subAria = linkEl.querySelector('[aria-label*="unread"]');
            if (subAria) {
                const subText = subAria.getAttribute('aria-label') || '';
                const subMatch = subText.match(/(\d+)\s+unread/i);
                if (subMatch && subMatch[1]) {
                    return parseInt(subMatch[1], 10) || 0;
                }
                const numTxt = (subAria.textContent || '').trim().replace(/\+$/, '');
                if (/^\d+$/.test(numTxt)) {
                    return parseInt(numTxt, 10) || 0;
                }
                return 1;
            }
            const spans = linkEl.querySelectorAll('span');
            for (const sp of spans) {
                const txt = (sp.textContent || '').trim().replace(/\+$/, '');
                if (/^\d+$/.test(txt)) {
                    return parseInt(txt, 10) || 0;
                }
            }
        }
        return 0;
    }

    function scanMobileDomNotifications() {
        if (!isContextValid()) return;
        try {
            const notifLink = document.querySelector('[data-testid="AppTabBar_Notifications_Link"], a[href="/notifications"]');
            const dmLink = document.querySelector('[data-testid="AppTabBar_DirectMessage_Link"], a[href="/messages"], a[href="/i/chat"]');

            let notifCount = extractUnreadBadgeCount(notifLink);
            const dmCount = extractUnreadBadgeCount(dmLink);

            if (notifCount === 0 && typeof document.title === 'string') {
                const titleMatch = document.title.match(/^\((\d+)\)/);
                if (titleMatch && titleMatch[1]) {
                    const totalTitleUnread = parseInt(titleMatch[1], 10) || 0;
                    if (totalTitleUnread > dmCount) {
                        notifCount = totalTitleUnread - dmCount;
                    }
                }
            }

            let latestSnippet = '';
            const path = (window.location && window.location.pathname) || '';
            if (path.startsWith('/notifications')) {
                const firstNotif = document.querySelector('article[data-testid="notification"], [data-testid="cellInnerDiv"] article');
                if (firstNotif) {
                    latestSnippet = (firstNotif.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
                }
            }

            if (
                notifCount !== lastReportedDomNotifCount ||
                dmCount !== lastReportedDomDmCount ||
                (notifCount > 0 && latestSnippet && latestSnippet !== lastReportedDomSnippet)
            ) {
                lastReportedDomNotifCount = notifCount;
                lastReportedDomDmCount = dmCount;
                if (latestSnippet) lastReportedDomSnippet = latestSnippet;

                chrome.runtime.sendMessage({
                    action: 'X_SYNC_REGULAR_NOTIFICATIONS',
                    payload: {
                        unreadNotificationsCount: notifCount,
                        unreadDmCount: dmCount,
                        latestNotificationText: latestSnippet,
                        source: 'dom_badge'
                    }
                }, () => {});
            }
        } catch (err) {}
    }

    function scanDOM() {
        if (!isContextValid()) {
            if (observer) observer.disconnect();
            return;
        }
        if (scanTimeout) clearTimeout(scanTimeout);

        scanTimeout = setTimeout(() => {
            if (!isContextValid()) {
                if (observer) observer.disconnect();
                return;
            }
            try {
                chrome.storage.local.get([
                    'isXLocationEnabled',
                    'isXHideAdsEnabled',
                    'isXFriendsSyncEnabled',
                    'isXModuleEnabled',
                    'isGlobalMasterSwitchEnabled',
                    'blockedCountries',
                    'blockedDeviceRegions',
                    'blockedNameFlags'
                ], (settings) => {
                    if (safeHasError() || !settings) return;

                    if ((window.__X414_MOBILE__ || window.ReactNativeWebView) &&
                        window.XLocationUI &&
                        typeof window.XLocationUI.ensureMobileSettingsTrigger === 'function') {
                        window.XLocationUI.ensureMobileSettingsTrigger({
                            pendingIncomingCount: window.__X414_PENDING_INVITES__ || 0
                        });
                        scanMobileDomNotifications();
                    }

                    if (settings.isGlobalMasterSwitchEnabled === false || settings.isXModuleEnabled === false) {
                        isFriendsSyncActive = false;
                        document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
                            applyAdStealthState(article, false);
                        });
                        return;
                    }

                    const shouldHideAds = settings.isXHideAdsEnabled !== false;
                    document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
                        applyAdStealthState(article, shouldHideAds);
                    });

                    isFriendsSyncActive = settings.isXFriendsSyncEnabled !== false;
                    if (isFriendsSyncActive) {
                        scanTweetsForFriendsSync();
                    }

                    if (settings.isXLocationEnabled === false) {
                        return;
                    }

                    const userNames = document.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"], [data-testid="UserCell"]');
                    userNames.forEach(elem => {
                        if (processedElements.has(elem) || !isContextValid()) return;

                        const enclosingArticle = elem.closest ? elem.closest('article[data-testid="tweet"]') : null;
                        if (enclosingArticle && (enclosingArticle._xAdCollapsed || (shouldHideAds && checkIsAdTweet(enclosingArticle)))) {
                            return;
                        }
                        
                        const screenName = extractScreenNameFromUserCell(elem);
                        if (!screenName) return;

                        const filterTarget = getFilterTargetForUserElement(elem);
                        if (filterTarget) {
                            applyTweetFilterForElement(filterTarget, filterTarget._xPrimaryLocationData || { screenName }, settings, elem);
                        }

                        try {
                            // Request location data from background bridge
                            chrome.runtime.sendMessage({
                                action: 'X_FETCH_USER_INFO',
                                payload: { screenName }
                            }, (response) => {
                                if (safeHasError()) {
                                    return;
                                }

                                if (response && response.success && response.data) {
                                    processedElements.add(elem);

                                    if (window.XLocationUI) {
                                        window.XLocationUI.renderInlineBadge(elem, response.data);
                                    }

                                    // Apply Location, Device & Name-Flag Tweet Filtering (outer tweet or inner quoted tweet)
                                    if (filterTarget) {
                                        applyTweetFilterForElement(filterTarget, response.data, settings, elem);
                                    }
                                }
                            });
                        } catch (err) {
                            if (observer) observer.disconnect();
                        }
                    });
                });
            } catch (err) {
                if (observer) observer.disconnect();
            }
        }, 150);
    }

    // Track explicit user interactions (click, like, expand, video play) as immediate "seen"
    function handleUserInteraction(e) {
        if (!isFriendsSyncActive || !isContextValid() || !e.target || !e.target.closest) return;
        if (e.target.closest('.x-force-friend-btn, .vsc-download-btn, .x-location-info-btn, .x-friend-seen-badge, #x-414-nav-trigger, #x-414-floating-pill')) return;
        const article = e.target.closest('article[data-testid="tweet"]');
        if (!article || article._xAdCollapsed || checkIsAdTweet(article)) return;
        const tweetId = article.dataset?.xTweetId || extractTweetIdFromArticle(article);
        if (tweetId) {
            recordTweetSeen(tweetId, article);
        }
    }

    document.addEventListener('click', handleUserInteraction, { capture: true, passive: true });
    document.addEventListener('play', handleUserInteraction, { capture: true, passive: true });

    // Remove seen cards only after the user has scrolled past them and scrolling has settled
    let scrollCleanupTimer = null;
    function handleWindowScrollForSeenCards() {
        if (!isFriendsSyncActive) return;
        if (scrollCleanupTimer) {
            clearTimeout(scrollCleanupTimer);
        }
        scrollCleanupTimer = setTimeout(() => {
            scrollCleanupTimer = null;
            if (window.XLocationUI && typeof window.XLocationUI.removeSeenCardsScrolledPast === 'function') {
                window.XLocationUI.removeSeenCardsScrolledPast();
            }
        }, 150);
    }

    window.addEventListener('scroll', handleWindowScrollForSeenCards, { passive: true });

    // Listen for background sync broadcasts so checkmarks appear live
    try {
        if (chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request) => {
                if (request && request.action === 'X_FRIENDS_SEEN_UPDATED') {
                    scanTweetsForFriendsSync(true);
                }
            });
        }
        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && (
                    changes.blockedCountries ||
                    changes.blockedDeviceRegions ||
                    changes.blockedNameFlags ||
                    changes.isXLocationEnabled ||
                    changes.isXHideAdsEnabled ||
                    changes.isXModuleEnabled ||
                    changes.isGlobalMasterSwitchEnabled
                )) {
                    reevaluateAllTweets();
                    if (changes.isXHideAdsEnabled || changes.isXModuleEnabled || changes.isGlobalMasterSwitchEnabled) {
                        scanDOM();
                    }
                }
            });
        }
    } catch (e) {}

    // Start MutationObserver (ignore removal-only mutations and counter text updates to prevent re-scan loops)
    observer = new MutationObserver((mutations) => {
        if (!Array.isArray(mutations) || mutations.length === 0) {
            scanDOM();
            return;
        }
        let hasRelevantMutation = false;
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (m.removedNodes && m.removedNodes.length > 0) {
                for (let j = 0; j < m.removedNodes.length; j++) {
                    const rn = m.removedNodes[j];
                    if (rn && (rn.id === 'x-forced-home-feed' || (rn.querySelector && rn.querySelector('#x-forced-home-feed')))) {
                        hasRelevantMutation = true;
                        break;
                    }
                }
                if (hasRelevantMutation) break;
            }
            if (!m.addedNodes || m.addedNodes.length === 0) continue;
            const target = m.target;
            if (
                target &&
                target.closest &&
                target.closest('.x-friends-tab-badge, .x-friends-filter-pill, .x-forced-home-title, .x-friends-load-more-btn, #x-414-nav-trigger, #x-414-floating-pill')
            ) {
                continue;
            }
            hasRelevantMutation = true;
            break;
        }
        if (hasRelevantMutation) {
            scanDOM();
        }
    });

    // Periodic live timeline refresh so forced posts and friend sync updates appear automatically without manual refresh
    const liveSyncInterval = setInterval(() => {
        if (!isFriendsSyncActive || !isContextValid()) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        syncFriendsTimelineUI(false);
    }, 8000);
    if (typeof liveSyncInterval?.unref === 'function') {
        liveSyncInterval.unref();
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isFriendsSyncActive && isContextValid()) {
                syncFriendsTimelineUI(true);
            }
        });
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', () => {
            if (isFriendsSyncActive && isContextValid()) {
                syncFriendsTimelineUI(true);
            }
        });
    }

    let bodyObserved = false;
    function attachBodyObserver() {
        if (bodyObserved || !isContextValid() || !document.body) return false;
        bodyObserved = true;
        observer.observe(document.body, { childList: true, subtree: true });
        scanDOM();
        return true;
    }

    function initObserver() {
        if (!isContextValid()) return;
        if (attachBodyObserver()) return;

        document.addEventListener('DOMContentLoaded', () => {
            attachBodyObserver();
        });

        if (document.documentElement) {
            const bodyWaitObs = new MutationObserver(() => {
                if (attachBodyObserver()) {
                    bodyWaitObs.disconnect();
                }
            });
            bodyWaitObs.observe(document.documentElement, { childList: true });
        }
    }

    initObserver();
})();
