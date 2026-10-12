// 414Extensions/x_extension/content_scripts/xObserver.js
(function() {
    if (window.XObserverInjected) return;
    window.XObserverInjected = true;

    const processedElements = new WeakSet();
    const pendingNames = new Set();
    let observer = null;
    let scanTimeout = null;

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
                chrome.storage.local.get(['isXLocationEnabled', 'isXModuleEnabled', 'isGlobalMasterSwitchEnabled', 'blockedCountries'], (settings) => {
                    if (safeHasError() || !settings) return;
                    if (settings.isGlobalMasterSwitchEnabled === false || settings.isXModuleEnabled === false || settings.isXLocationEnabled === false) {
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

                                    // Apply Location-Based Tweet Filtering
                                    const tweet = elem.closest('article[data-testid="tweet"]');
                                    if (tweet && response.data.location) {
                                        const blocked = settings.blockedCountries || [];
                                        if (Array.isArray(blocked) && blocked.length > 0) {
                                            const locLower = response.data.location.toLowerCase();
                                            const isBlocked = blocked.some(country => 
                                                country && locLower.includes(country.trim().toLowerCase())
                                            );
                                            if (isBlocked) {
                                                tweet.style.display = 'none';
                                            }
                                        }
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
