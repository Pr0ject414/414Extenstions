// 414Extensions/x_extension/content_scripts/xObserver.js
(function() {
    if (window.XObserverInjected) return;
    window.XObserverInjected = true;

    const DWELL_TIME_MS = 1200;
    const VISIBILITY_THRESHOLD = 0.6;
    const SEEN_FLUSH_MS = 2000;

    const processedElements = new WeakSet();
    const observedTweets = new WeakSet();
    const dwellTimers = new Map(); // tweetId -> timerId
    const locallyMarkedSeen = new Set();
    const pendingSeenQueue = new Set();

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
        if (!article || !article.querySelector) return null;

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

    function recordTweetSeen(tweetId) {
        if (!tweetId || !isFriendsSyncActive || !isContextValid()) return;
        if (locallyMarkedSeen.has(tweetId)) return;

        locallyMarkedSeen.add(tweetId);
        pendingSeenQueue.add(tweetId);

        if (!flushSeenTimeout) {
            flushSeenTimeout = setTimeout(flushPendingSeenTweets, SEEN_FLUSH_MS);
        }
    }

    function flushPendingSeenTweets() {
        flushSeenTimeout = null;
        if (!isContextValid() || pendingSeenQueue.size === 0) return;

        const batch = Array.from(pendingSeenQueue);
        pendingSeenQueue.clear();

        try {
            chrome.runtime.sendMessage({
                action: 'X_MARK_TWEETS_SEEN',
                payload: { tweetIds: batch }
            }, () => {
                if (safeHasError()) return;
            });
        } catch (err) {
            // Ignore invalidated context errors
        }
    }

    function ensureIntersectionObserver() {
        if (tweetIntersectionObserver || typeof IntersectionObserver === 'undefined') return;

        tweetIntersectionObserver = new IntersectionObserver((entries) => {
            if (!isFriendsSyncActive || !isContextValid()) return;

            for (const entry of entries) {
                const article = entry.target;
                const tweetId = article.dataset?.xTweetId || extractTweetIdFromArticle(article);
                if (!tweetId) continue;

                if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
                    if (!locallyMarkedSeen.has(tweetId) && !dwellTimers.has(tweetId)) {
                        const timerId = setTimeout(() => {
                            dwellTimers.delete(tweetId);
                            recordTweetSeen(tweetId);
                        }, DWELL_TIME_MS);
                        dwellTimers.set(tweetId, timerId);
                    }
                } else {
                    const existingTimer = dwellTimers.get(tweetId);
                    if (existingTimer) {
                        clearTimeout(existingTimer);
                        dwellTimers.delete(tweetId);
                    }
                }
            }
        }, {
            threshold: [0, VISIBILITY_THRESHOLD]
        });
    }

    function scanTweetsForFriendsSync() {
        if (!isFriendsSyncActive || !isContextValid()) return;

        ensureIntersectionObserver();
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        if (articles.length === 0) return;

        const tweetMap = new Map(); // tweetId -> Array<{ article, headerElem, screenName }>

        articles.forEach(article => {
            const tweetId = extractTweetIdFromArticle(article);
            if (!tweetId) return;
            article.dataset.xTweetId = tweetId;

            if (tweetIntersectionObserver && !observedTweets.has(article)) {
                observedTweets.add(article);
                tweetIntersectionObserver.observe(article);
            }

            const headerElem = article.querySelector('[data-testid="User-Name"], [data-testid="UserName"]');
            if (headerElem) {
                const screenName = extractScreenNameFromUserCell(headerElem);
                const list = tweetMap.get(tweetId) || [];
                list.push({ article, headerElem, screenName });
                tweetMap.set(tweetId, list);
            }
        });

        const tweetIds = Array.from(tweetMap.keys());
        if (tweetIds.length === 0) return;

        try {
            chrome.runtime.sendMessage({
                action: 'X_CHECK_TWEETS_SEEN',
                payload: { tweetIds }
            }, (response) => {
                if (safeHasError() || !response || !response.success || !response.seenMap) return;

                for (const [tweetId, seenByFriends] of Object.entries(response.seenMap)) {
                    const targets = tweetMap.get(tweetId) || [];
                    for (const { headerElem, screenName } of targets) {
                        if (window.XLocationUI && typeof window.XLocationUI.renderFriendSeenBadge === 'function') {
                            window.XLocationUI.renderFriendSeenBadge(headerElem, screenName, seenByFriends);
                        }
                    }
                }
            });
        } catch (err) {
            // Ignore invalidated context errors
        }
    }

    function findMatchedFilterRule(userData, settings) {
        if (!userData || !settings) return null;

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

    function applyTweetFilterForElement(tweet, userData, settings) {
        if (!tweet || !userData) return;
        tweet._xPrimaryLocationData = userData;

        const matchedRule = findMatchedFilterRule(userData, settings);
        const tweetId = tweet.dataset?.xTweetId || extractTweetIdFromArticle(tweet);

        if (matchedRule) {
            if (window.XLocationUI && typeof window.XLocationUI.filterTweet === 'function') {
                window.XLocationUI.filterTweet(tweet, {
                    reason: matchedRule,
                    screenName: userData.screenName,
                    location: userData.location,
                    device: userData.device,
                    tweetId
                });
            } else {
                tweet.style.display = 'none';
            }
        } else if (tweet.classList && tweet.classList.contains('x-tweet-blocked')) {
            if (window.XLocationUI && typeof window.XLocationUI.unfilterTweet === 'function') {
                window.XLocationUI.unfilterTweet(tweet);
            } else {
                tweet.style.display = '';
            }
        }
    }

    function reevaluateAllTweets() {
        if (!isContextValid()) return;
        try {
            chrome.storage.local.get([
                'isXLocationEnabled',
                'isXModuleEnabled',
                'isGlobalMasterSwitchEnabled',
                'blockedCountries',
                'blockedDeviceRegions'
            ], (settings) => {
                if (safeHasError() || !settings) return;
                const isEnabled = settings.isGlobalMasterSwitchEnabled !== false &&
                    settings.isXModuleEnabled !== false &&
                    settings.isXLocationEnabled !== false;

                const tweets = document.querySelectorAll('article[data-testid="tweet"]');
                tweets.forEach(tweet => {
                    if (!isEnabled) {
                        if (window.XLocationUI && typeof window.XLocationUI.unfilterTweet === 'function') {
                            window.XLocationUI.unfilterTweet(tweet);
                        } else {
                            tweet.style.display = '';
                        }
                        return;
                    }
                    if (tweet._xPrimaryLocationData) {
                        applyTweetFilterForElement(tweet, tweet._xPrimaryLocationData, settings);
                    }
                });
            });
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
                    'isXFriendsSyncEnabled',
                    'isXModuleEnabled',
                    'isGlobalMasterSwitchEnabled',
                    'blockedCountries',
                    'blockedDeviceRegions'
                ], (settings) => {
                    if (safeHasError() || !settings) return;
                    if (settings.isGlobalMasterSwitchEnabled === false || settings.isXModuleEnabled === false) {
                        isFriendsSyncActive = false;
                        return;
                    }

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
                        
                        const screenName = extractScreenNameFromUserCell(elem);
                        if (!screenName) return;

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

                                    // Apply Location & Device-Based Tweet Filtering
                                    const tweet = elem.closest('article[data-testid="tweet"]');
                                    if (tweet) {
                                        applyTweetFilterForElement(tweet, response.data, settings);
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
        const article = e.target.closest('article[data-testid="tweet"]');
        if (!article) return;
        const tweetId = article.dataset?.xTweetId || extractTweetIdFromArticle(article);
        if (tweetId) {
            recordTweetSeen(tweetId);
        }
    }

    document.addEventListener('click', handleUserInteraction, { capture: true, passive: true });
    document.addEventListener('play', handleUserInteraction, { capture: true, passive: true });

    // Listen for background sync broadcasts so checkmarks appear live
    try {
        if (chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request) => {
                if (request && request.action === 'X_FRIENDS_SEEN_UPDATED') {
                    scanTweetsForFriendsSync();
                }
            });
        }
        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && (
                    changes.blockedCountries ||
                    changes.blockedDeviceRegions ||
                    changes.isXLocationEnabled ||
                    changes.isXModuleEnabled ||
                    changes.isGlobalMasterSwitchEnabled
                )) {
                    reevaluateAllTweets();
                }
            });
        }
    } catch (e) {}

    // Start MutationObserver
    observer = new MutationObserver(() => {
        scanDOM();
    });

    function initObserver() {
        if (!isContextValid()) return;
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
            scanDOM();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (!isContextValid()) return;
                observer.observe(document.body, { childList: true, subtree: true });
                scanDOM();
            });
        }
    }

    initObserver();
})();
