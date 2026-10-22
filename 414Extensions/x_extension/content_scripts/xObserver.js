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
                'isXModuleEnabled',
                'isGlobalMasterSwitchEnabled',
                'blockedCountries',
                'blockedDeviceRegions',
                'blockedNameFlags'
            ], (settings) => {
                if (safeHasError() || !settings) return;
                const isEnabled = settings.isGlobalMasterSwitchEnabled !== false &&
                    settings.isXModuleEnabled !== false &&
                    settings.isXLocationEnabled !== false;

                const targets = document.querySelectorAll('article[data-testid="tweet"], [data-x-filter-target="true"]');
                targets.forEach(target => {
                    if (!isEnabled) {
                        if (window.XLocationUI && typeof window.XLocationUI.unfilterTweet === 'function') {
                            window.XLocationUI.unfilterTweet(target);
                        } else {
                            target.style.display = '';
                        }
                        return;
                    }
                    if (target._xPrimaryLocationData || target._xHeaderElem) {
                        applyTweetFilterForElement(target, target._xPrimaryLocationData, settings, target._xHeaderElem);
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
                    'blockedDeviceRegions',
                    'blockedNameFlags'
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
                    changes.blockedNameFlags ||
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
