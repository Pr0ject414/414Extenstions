// 414Extensions/x_extension/content_scripts/xLocationUI.js
(function() {
    if (window.XLocationUI) return;

    const COUNTRY_FLAGS = {
        'afghanistan': '🇦🇫', 'albania': '🇦🇱', 'algeria': '🇩🇿', 'andorra': '🇦🇩', 'angola': '🇦🇴',
        'argentina': '🇦🇷', 'armenia': '🇦🇲', 'australia': '🇦🇺', 'austria': '🇦🇹', 'azerbaijan': '🇦🇿',
        'bahamas': '🇧🇸', 'bahrain': '🇧🇭', 'bangladesh': '🇧🇩', 'barbados': '🇧🇧', 'belarus': '🇧🇾',
        'belgium': '🇧🇪', 'belize': '🇧🇿', 'benin': '🇧🇯', 'bhutan': '🇧🇹', 'bolivia': '🇧🇴',
        'bosnia and herzegovina': '🇧🇦', 'botswana': '🇧🇼', 'brazil': '🇧🇷', 'brunei': '🇧🇳',
        'bulgaria': '🇧🇬', 'burkina faso': '🇧🇫', 'burundi': '🇧🇮', 'cambodia': '🇰🇭', 'cameroon': '🇨🇲',
        'canada': '🇨🇦', 'chile': '🇨🇱', 'china': '🇨🇳', 'colombia': '🇨🇴', 'costa rica': '🇨🇷',
        'croatia': '🇭🇷', 'cuba': '🇨🇺', 'cyprus': '🇨🇾', 'czech republic': '🇨🇿', 'czechia': '🇨🇿',
        'denmark': '🇩🇰', 'dominican republic': '🇩🇴', 'ecuador': '🇪🇨', 'egypt': '🇪🇬', 'el salvador': '🇸🇻',
        'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'estonia': '🇪🇪', 'ethiopia': '🇪🇹', 'europe': '🇪🇺', 'finland': '🇫🇮',
        'france': '🇫🇷', 'georgia': '🇬🇪', 'germany': '🇩🇪', 'ghana': '🇬🇭', 'greece': '🇬🇷',
        'guatemala': '🇬🇹', 'haiti': '🇭🇹', 'honduras': '🇭🇳', 'hong kong': '🇭🇰', 'hungary': '🇭🇺',
        'iceland': '🇮🇸', 'india': '🇮🇳', 'indonesia': '🇮🇩', 'iran': '🇮🇷', 'iraq': '🇮🇶',
        'ireland': '🇮🇪', 'israel': '🇮🇱', 'italy': '🇮🇹', 'jamaica': '🇯🇲', 'japan': '🇯🇵',
        'jordan': '🇯🇴', 'kazakhstan': '🇰🇿', 'kenya': '🇰🇪', 'korea': '🇰🇷', 'kuwait': '🇰🇼',
        'latvia': '🇱🇻', 'lebanon': '🇱🇧', 'lithuania': '🇱🇹', 'luxembourg': '🇱🇺', 'malaysia': '🇲🇾',
        'maldives': '🇲🇻', 'malta': '🇲🇹', 'mexico': '🇲🇽', 'moldova': '🇲🇩', 'monaco': '🇲🇨',
        'mongolia': '🇲🇳', 'montenegro': '🇲🇪', 'morocco': '🇲🇦', 'nepal': '🇳🇵', 'netherlands': '🇳🇱',
        'new zealand': '🇳🇿', 'nicaragua': '🇳🇮', 'nigeria': '🇳🇬', 'north korea': '🇰🇵', 'norway': '🇳🇴',
        'oman': '🇴🇲', 'pakistan': '🇵🇰', 'palestine': '🇵🇸', 'panama': '🇵🇦', 'paraguay': '🇵🇾',
        'peru': '🇵🇪', 'philippines': '🇵🇭', 'poland': '🇵🇱', 'portugal': '🇵🇹', 'puerto rico': '🇵🇷',
        'qatar': '🇶🇦', 'romania': '🇷🇴', 'russia': '🇷🇺', 'saudi arabia': '🇸🇦', 'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        'senegal': '🇸🇳', 'serbia': '🇷🇸', 'singapore': '🇸🇬', 'slovakia': '🇸🇰', 'slovenia': '🇸🇮',
        'south africa': '🇿🇦', 'south korea': '🇰🇷', 'spain': '🇪🇸', 'sri lanka': '🇱🇰', 'sudan': '🇸🇩',
        'sweden': '🇸🇪', 'switzerland': '🇨🇭', 'syria': '🇸🇾', 'taiwan': '🇹🇼', 'thailand': '🇹🇭',
        'tunisia': '🇹🇳', 'turkey': '🇹🇷', 'türkiye': '🇹🇷', 'uganda': '🇺🇬', 'ukraine': '🇺🇦',
        'united arab emirates': '🇦🇪', 'uae': '🇦🇪', 'united kingdom': '🇬🇧', 'uk': '🇬🇧',
        'united states': '🇺🇸', 'usa': '🇺🇸', 'us': '🇺🇸', 'uruguay': '🇺🇾', 'uzbekistan': '🇺🇿',
        'venezuela': '🇻🇪', 'vietnam': '🇻🇳', 'wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'yemen': '🇾🇪', 'zimbabwe': '🇿🇼',
        // Regions
        'east asia & pacific': '🌏', 'east asia': '🌏', 'southeast asia': '🌏', 'south asia': '🌏',
        'central asia': '🌏', 'australasia': '🌏', 'oceania': '🌏', 'west asia': '🌍',
        'middle east': '🌍', 'north africa': '🌍', 'africa': '🌍', 'eastern europe': '🌍',
        'western europe': '🌍', 'north america': '🌎', 'south america': '🌎',
        'central america': '🌎', 'latin america': '🌎'
    };

    function getFlagHtml(locationStr) {
        if (!locationStr) return '🌐';
        const lower = locationStr.toLowerCase().trim();
        let emoji = COUNTRY_FLAGS[lower] || null;
        if (!emoji) {
            for (const [key, flag] of Object.entries(COUNTRY_FLAGS)) {
                if (lower.includes(key)) {
                    emoji = flag;
                    break;
                }
            }
        }
        if (!emoji) return '🌐';

        const codePoints = Array.from(emoji)
            .map(c => c.codePointAt(0).toString(16))
            .join('-');

        return `<img src="https://abs-0.twimg.com/emoji/v2/svg/${codePoints}.svg" alt="${emoji}" style="height: 1.2em; vertical-align: -0.2em; display: inline-block;">`;
    }

    function createDeviceSVG(deviceStr) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('fill', 'currentColor');

        const dLower = (deviceStr || '').toLowerCase();
        if (dLower.includes('iphone') || dLower.includes('ipad') || dLower.includes('mac') || dLower.includes('ios') || dLower.includes('app store')) {
            // Apple SVG
            svg.innerHTML = '<path d="M17.05 12.5c-.03-2.5 2.04-3.7 2.13-3.76-1.16-1.7-2.97-1.93-3.61-1.96-1.54-.16-3 .9-3.78.9-.78 0-1.98-.88-3.25-.86-1.67.03-3.21.97-4.07 2.46-1.74 3.02-.45 7.49 1.25 9.94.83 1.2 1.82 2.55 3.12 2.5 1.25-.05 1.72-.81 3.23-.81 1.51 0 1.94.81 3.26.78 1.35-.02 2.2-1.22 3.02-2.43.95-1.39 1.34-2.74 1.36-2.81-.03-.01-2.61-1-2.64-3.99zM14.6 5.1c.69-.83 1.15-1.99 1.02-3.14-.99.04-2.19.66-2.9 1.49-.64.73-1.2 1.91-1.05 3.03 1.1.09 2.24-.56 2.93-1.38z"/>';
        } else if (dLower.includes('android')) {
            // Android SVG
            svg.innerHTML = '<path d="M12 5C8.9 5 6.4 7.3 6.2 10.2h11.6C17.6 7.3 15.1 5 12 5zm-2.3 3.1a.78.78 0 1 1 0-1.56.78.78 0 0 1 0 1.56zm4.6 0a.78.78 0 1 1 0-1.56.78.78 0 0 1 0 1.56z"/><rect x="6.4" y="11" width="11.2" height="7.3" rx="1.2"/>';
        } else {
            // Web / Browser SVG
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '1.8');
            svg.innerHTML = '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4M12 3.8c2.4 2.2 3.7 5.1 3.7 8.2s-1.3 6-3.7 8.2c-2.4-2.2-3.7-5.1-3.7-8.2S9.6 6 12 3.8z"/>';
        }
        return svg;
    }

    function createInfoSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '11');
        svg.setAttribute('height', '11');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.innerHTML = '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.7h.01"/>';
        return svg;
    }

    function createSeenCheckSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '11');
        svg.setAttribute('height', '11');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '3');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        return svg;
    }

    // Hovercard Dossier Overlay Manager
    let hovercardRoot = null;
    let hovercardTimeout = null;

    function getOrCreateHovercard() {
        if (hovercardRoot) return hovercardRoot;
        hovercardRoot = document.createElement('div');
        hovercardRoot.id = 'x-location-hovercard-root';
        document.body.appendChild(hovercardRoot);

        hovercardRoot.addEventListener('mouseenter', () => {
            if (hovercardTimeout) clearTimeout(hovercardTimeout);
        });
        hovercardRoot.addEventListener('mouseleave', () => {
            hideHovercard();
        });

        return hovercardRoot;
    }

    function showHovercard(targetElem, data) {
        if (hovercardTimeout) clearTimeout(hovercardTimeout);
        const hc = getOrCreateHovercard();

        const flag = getFlagHtml(data.location);
        const name = data.meta?.name || data.screenName;
        const createdAt = data.meta?.createdAt ? new Date(data.meta.createdAt).toLocaleDateString() : 'N/A';
        const restId = data.meta?.restId || 'N/A';

        hc.innerHTML = `
            <div class="x-hovercard-header">
                ${data.meta?.avatarUrl ? `<img class="x-hovercard-avatar" src="${data.meta.avatarUrl}" alt="">` : ''}
                <div>
                    <div class="x-hovercard-title">${name}</div>
                    <div class="x-hovercard-handle">@${data.screenName}</div>
                </div>
            </div>
            <div class="x-hovercard-row">
                <span class="x-hovercard-icon">📍</span>
                <span class="x-hovercard-label">Location:</span>
                <span class="x-hovercard-val">${flag} ${data.location || 'Unknown'}</span>
            </div>
            <div class="x-hovercard-row">
                <span class="x-hovercard-icon">📱</span>
                <span class="x-hovercard-label">Device:</span>
                <span class="x-hovercard-val">${data.device || 'Web / Unknown'}</span>
            </div>
            <div class="x-hovercard-row">
                <span class="x-hovercard-icon">📅</span>
                <span class="x-hovercard-label">Joined:</span>
                <span class="x-hovercard-val">${createdAt}</span>
            </div>
            <div class="x-hovercard-row">
                <span class="x-hovercard-icon">🆔</span>
                <span class="x-hovercard-label">User ID:</span>
                <span class="x-hovercard-val">${restId}</span>
            </div>
            ${Array.isArray(data.seenBy) && data.seenBy.length > 0 ? `
            <div class="x-hovercard-row">
                <span class="x-hovercard-icon">✅</span>
                <span class="x-hovercard-label">Seen by:</span>
                <span class="x-hovercard-val">${data.seenBy.join(', ')}</span>
            </div>` : ''}
        `;

        const rect = targetElem.getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 6;
        const left = Math.max(10, rect.left + window.scrollX - 40);

        hc.style.top = `${top}px`;
        hc.style.left = `${left}px`;
        hc.classList.add('visible');
    }

    function hideHovercard() {
        if (hovercardTimeout) clearTimeout(hovercardTimeout);
        hovercardTimeout = setTimeout(() => {
            if (hovercardRoot) hcHideImmediate();
        }, 200);
    }

    function hcHideImmediate() {
        if (hovercardRoot) {
            hovercardRoot.classList.remove('visible');
        }
    }

    function findInsertionPoint(container, screenName) {
        if (!container || !screenName) return { target: container, ref: null };

        // 1. Look for @handle link or handle container (native X quote tweets use <div tabindex="-1">@handle</div>)
        const candidates = Array.from(container.querySelectorAll('a, [tabindex="-1"]'));
        const handleElem = candidates.find(el => (el.textContent || '').trim().toLowerCase() === `@${screenName.toLowerCase()}`);
        if (handleElem) {
            const parent = handleElem.parentNode;
            if (parent && parent !== container && parent.parentNode && container.contains(parent.parentNode)) {
                return { target: parent.parentNode, ref: parent.nextSibling };
            }
            if (parent && container.contains(parent)) {
                return { target: parent, ref: handleElem.nextSibling };
            }
        }

        // 2. Look for name link inside container
        const nameLink = container.querySelector(`a[href="/${screenName}"], a[href="https://x.com/${screenName}"]`);
        if (nameLink && nameLink.parentNode && container.contains(nameLink.parentNode)) {
            return { target: nameLink.parentNode, ref: nameLink.nextSibling };
        }

        return { target: container, ref: null };
    }

    function getOrCreateInlineBadge(containerElem, screenName) {
        let badge = containerElem.querySelector('.x-location-inline-badge');
        if (badge) return badge;

        badge = document.createElement('span');
        badge.className = 'x-location-inline-badge';

        const insertion = findInsertionPoint(containerElem, screenName);
        if (insertion && insertion.target) {
            if (insertion.ref) {
                insertion.target.insertBefore(badge, insertion.ref);
            } else {
                insertion.target.appendChild(badge);
            }
        } else {
            containerElem.appendChild(badge);
        }
        return badge;
    }

    function renderInlineBadge(containerElem, data) {
        if (!containerElem || containerElem.querySelector('.x-location-flag')) return;

        const badge = getOrCreateInlineBadge(containerElem, data.screenName);
        const existingSeenBadge = badge.querySelector('.x-friend-seen-badge');

        const insertPart = (node) => {
            if (existingSeenBadge) {
                badge.insertBefore(node, existingSeenBadge);
            } else {
                badge.appendChild(node);
            }
        };

        // 1. Flag
        const flagSpan = document.createElement('span');
        flagSpan.className = 'x-location-flag';
        flagSpan.innerHTML = getFlagHtml(data.location);
        flagSpan.title = data.location ? `Account Location: ${data.location}` : 'Location Unknown';
        insertPart(flagSpan);

        // 2. Device Icon
        if (data.device) {
            const devSpan = document.createElement('span');
            devSpan.className = 'x-location-device-icon';
            devSpan.title = `Device: ${data.device}`;
            devSpan.appendChild(createDeviceSVG(data.device));
            insertPart(devSpan);
        }

        // 3. Info (i) button
        const infoBtn = document.createElement('span');
        infoBtn.className = 'x-location-info-btn';
        infoBtn.title = 'View Account Dossier';
        infoBtn.appendChild(createInfoSVG());

        infoBtn.addEventListener('mouseenter', () => {
            const seenElem = badge.querySelector('.x-friend-seen-badge');
            const seenByAttr = seenElem ? seenElem.getAttribute('data-seen-by') : '';
            const enrichedData = seenByAttr
                ? { ...data, seenBy: seenByAttr.split(', ').filter(Boolean) }
                : data;
            showHovercard(infoBtn, enrichedData);
        });
        infoBtn.addEventListener('mouseleave', () => hideHovercard());

        insertPart(infoBtn);
    }

    function renderFriendSeenBadge(containerElem, screenName, seenByFriends, forcedByFriends = []) {
        if (!containerElem) return;
        const hasSeen = Array.isArray(seenByFriends) && seenByFriends.length > 0;
        const hasForced = Array.isArray(forcedByFriends) && forcedByFriends.length > 0;
        if (!hasSeen && !hasForced) return;

        const badge = getOrCreateInlineBadge(containerElem, screenName);
        let seenSpan = badge.querySelector('.x-friend-seen-badge');
        if (!seenSpan) {
            seenSpan = document.createElement('span');
            seenSpan.className = 'x-friend-seen-badge';
            seenSpan.appendChild(createSeenCheckSVG());
            badge.appendChild(seenSpan);
        }

        const listStr = (hasSeen ? seenByFriends : forcedByFriends).join(', ');
        if (hasForced) {
            seenSpan.classList.add('is-forced-by-friend');
            const forcedStr = forcedByFriends.join(', ');
            seenSpan.title = hasSeen
                ? `Forced by: ${forcedStr} • Seen by: ${listStr}`
                : `Forced by: ${forcedStr}`;
            seenSpan.setAttribute('data-forced-by', forcedStr);
        } else {
            seenSpan.classList.remove('is-forced-by-friend');
            seenSpan.title = `Seen by: ${listStr}`;
        }
        seenSpan.setAttribute('data-seen-by', listStr);
        seenSpan.setAttribute('aria-label', seenSpan.title);
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function createForcePostSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.85');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>';
        return svg;
    }

    let toastTimeout = null;
    function showToast(message) {
        if (!document.body) return;
        let toast = document.getElementById('x-friends-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'x-friends-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('visible');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            if (toast) toast.classList.remove('visible');
        }, 2600);
    }

    function findTweetActionBar(article) {
        if (!article || !article.querySelectorAll) return null;
        const groups = Array.from(article.querySelectorAll('div[role="group"]'));
        if (groups.length > 0) {
            return groups[groups.length - 1];
        }
        return null;
    }

    function findBookmarkInsertionRef(actionBar) {
        if (!actionBar || !actionBar.querySelector) return null;
        const bookmarkEl = actionBar.querySelector(
            '[data-testid="bookmark"], [data-testid="removeBookmark"], button[aria-label="Bookmark"], .x-friend-card-stat-bookmark'
        );
        if (!bookmarkEl) return null;
        let ref = bookmarkEl;
        while (ref.parentElement && ref.parentElement !== actionBar) {
            ref = ref.parentElement;
        }
        return ref.parentElement === actionBar ? ref : null;
    }

    function renderForceTweetButton(article, tweetId, syncState = {}, onToggleForce = null) {
        if (!article || !tweetId) return null;

        const actionBar = findTweetActionBar(article) || article;
        let btnWrap = actionBar.querySelector('.x-force-friend-btn-wrap');
        if (!btnWrap) {
            btnWrap = document.createElement('div');
            btnWrap.className = 'x-force-friend-btn-wrap';
        }

        // Always keep the [Download + Force] button group positioned to the left of the Bookmark button
        const bookmarkRef = findBookmarkInsertionRef(actionBar);
        if (bookmarkRef) {
            if (btnWrap.parentNode !== actionBar || btnWrap.nextSibling !== bookmarkRef) {
                actionBar.insertBefore(btnWrap, bookmarkRef);
            }
        } else if (btnWrap.parentNode !== actionBar) {
            actionBar.appendChild(btnWrap);
        }

        let btn = btnWrap.querySelector('.x-force-friend-btn');

        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'x-force-friend-btn';
            btn.setAttribute('data-testid', 'x-force-friend-btn');
            btn.appendChild(createForcePostSVG());

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const curTweetId = btn.getAttribute('data-tweet-id') || tweetId;
                const currentlyForced = btn.classList.contains('is-forced');
                const nextForced = !currentlyForced;

                btn.classList.toggle('is-forced', nextForced);
                btn.setAttribute('data-forced-by-me', nextForced ? 'true' : 'false');
                btn.title = nextForced
                    ? "Forced to Friends' timelines (click to remove)"
                    : "Force post to Friends' timelines";
                btn.setAttribute('aria-label', btn.title);

                showToast(nextForced
                    ? "⚡ Forced post to Friends' timelines!"
                    : "Removed post from Friends' timelines");

                if (typeof onToggleForce === 'function') {
                    onToggleForce(curTweetId, nextForced, article);
                }
            });

            btnWrap.appendChild(btn);
        }

        btn.setAttribute('data-tweet-id', tweetId);
        const forcedByMe = Boolean(syncState.forcedByMe);
        const forcedByFriends = Array.isArray(syncState.forcedByFriends) ? syncState.forcedByFriends : [];

        btn.classList.toggle('is-forced', forcedByMe);
        btn.classList.toggle('is-friend-forced', forcedByFriends.length > 0);
        btn.setAttribute('data-forced-by-me', forcedByMe ? 'true' : 'false');

        if (forcedByMe && forcedByFriends.length > 0) {
            btn.title = `Forced by you & ${forcedByFriends.join(', ')} (click to unforce)`;
        } else if (forcedByMe) {
            btn.title = "Forced to Friends' timelines (click to remove)";
        } else if (forcedByFriends.length > 0) {
            btn.title = `Forced by ${forcedByFriends.join(', ')} — click to also force to your friends`;
        } else {
            btn.title = "Force post to Friends' timelines";
        }
        btn.setAttribute('aria-label', btn.title);

        if (article.querySelector && article.querySelector('video') && window.XEnv && typeof window.XEnv.injectDownloadButtons === 'function') {
            try {
                window.XEnv.injectDownloadButtons();
            } catch (e) {}
        }

        return btn;
    }

    function formatRelativeTime(timestampMs, fallbackIso) {
        const ms = timestampMs || (fallbackIso ? Date.parse(fallbackIso) : 0);
        if (!ms || isNaN(ms)) return '';
        const diffSec = Math.max(1, Math.floor((Date.now() - ms) / 1000));
        if (diffSec < 60) return `${diffSec}s`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h`;
        const diffDays = Math.floor(diffHr / 24);
        if (diffDays < 14) return `${diffDays}d`;
        return new Date(ms).toLocaleDateString();
    }

    function formatMetricCount(num) {
        if (!num || typeof num !== 'number' || num <= 0) return '';
        if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}K`;
        return String(num);
    }

    function getMediaAssetKey(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return '';
        const match = urlStr.match(/\/media\/([A-Za-z0-9_-]+)/);
        if (match && match[1]) return `media:${match[1]}`;
        const vidMatch = urlStr.match(/\/(?:ext_tw_video_thumb|amplify_video_thumb)\/(\d+)/);
        if (vidMatch && vidMatch[1]) return `vidthumb:${vidMatch[1]}`;
        return urlStr.split('?')[0].replace(/\.(jpg|jpeg|png|webp|mp4)$/i, '');
    }

    function createVerifiedBadgeSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 22 22');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('class', 'x-friend-card-verified-icon');
        svg.setAttribute('data-testid', 'icon-verified');
        svg.setAttribute('aria-label', 'Verified account');
        svg.innerHTML = '<path fill="#1d9bf0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>';
        return svg;
    }

    function createReplyIconSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.innerHTML = '<path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>';
        return svg;
    }

    function createRepostIconSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.innerHTML = '<path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>';
        return svg;
    }

    function createHeartIconSVG(isLiked = false) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.innerHTML = isLiked
            ? '<path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>'
            : '<path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>';
        return svg;
    }

    function createViewsIconSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.innerHTML = '<path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/>';
        return svg;
    }

    function createBookmarkIconSVG(isBookmarked = false) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.innerHTML = isBookmarked
            ? '<path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"/>'
            : '<path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/>';
        return svg;
    }

    const X_WEB_BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
    const X_GRAPHQL_MUTATIONS = {
        like: {
            queryId: 'lI07N6Otwv1PhnEgXILM7A',
            operationName: 'FavoriteTweet',
            buildVariables: (tid) => ({ tweet_id: String(tid) })
        },
        unlike: {
            queryId: 'ZYKSe-w7KEslx3JhSIk5LA',
            operationName: 'UnfavoriteTweet',
            buildVariables: (tid) => ({ tweet_id: String(tid) })
        },
        repost: {
            queryId: 'mbRO74GrOvSfRcJnlMapnQ',
            operationName: 'CreateRetweet',
            buildVariables: (tid) => ({ tweet_id: String(tid), dark_request: false })
        },
        unrepost: {
            queryId: 'ZyZigVsNiFO6v1dEks1eWg',
            operationName: 'DeleteRetweet',
            buildVariables: (tid) => ({ source_tweet_id: String(tid), dark_request: false })
        },
        bookmark: {
            queryId: 'aoDbu3RHznuiSkQ9aNM67Q',
            operationName: 'CreateBookmark',
            buildVariables: (tid) => ({ tweet_id: String(tid) })
        },
        unbookmark: {
            queryId: 'Wlmlj2-xzyS1GN3a6cj-mQ',
            operationName: 'DeleteBookmark',
            buildVariables: (tid) => ({ tweet_id: String(tid) })
        }
    };

    function getCsrfTokenFromCookies() {
        if (typeof document === 'undefined' || !document.cookie) return '';
        const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
        return m && m[1] ? decodeURIComponent(m[1]) : '';
    }

    async function performXGraphQLAction(actionType, tweetId) {
        const spec = X_GRAPHQL_MUTATIONS[actionType];
        if (!spec || !tweetId) return false;

        // When running on X's live web app (#react-root is present), delegate the mutation
        // to the MAIN world script (xEnv.js) via window.postMessage so it executes through
        // X's internal Redux apiClient.graphQL / webpack x-client-transaction-id signer
        // (required by endpoints like CreateBookmark / DeleteBookmark).
        if (typeof window !== 'undefined' && typeof window.postMessage === 'function' &&
            typeof document !== 'undefined' && document.getElementById('react-root')) {
            try {
                window.postMessage({
                    type: 'X_PERFORM_TWEET_ACTION',
                    payload: { actionType, tweetId: String(tweetId) }
                }, '*');
                return true;
            } catch (e) {}
        }

        if (typeof fetch !== 'function') return false;
        let authHeader = X_WEB_BEARER_TOKEN;
        let finalCsrf = getCsrfTokenFromCookies();

        if (!finalCsrf && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const stored = await new Promise(resolve => chrome.storage.local.get(['x_api_headers'], resolve));
                const hdrs = stored && stored.x_api_headers;
                if (hdrs) {
                    for (const [k, v] of Object.entries(hdrs)) {
                        if (k.toLowerCase() === 'x-csrf-token' && v) finalCsrf = v;
                        if (k.toLowerCase() === 'authorization' && v) authHeader = v;
                    }
                }
            } catch (e) {}
        }

        const url = `https://x.com/i/api/graphql/${spec.queryId}/${spec.operationName}`;
        const headers = {
            'authorization': authHeader,
            'content-type': 'application/json',
            'x-twitter-active-user': 'yes',
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-client-language': 'en'
        };
        if (finalCsrf) {
            headers['x-csrf-token'] = finalCsrf;
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    variables: spec.buildVariables(tweetId),
                    queryId: spec.queryId
                })
            });
            return Boolean(res && res.ok);
        } catch (err) {
            return false;
        }
    }

    function createExternalLinkSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('fill', 'currentColor');
        svg.innerHTML = '<path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/>';
        return svg;
    }

    function appendFormattedTweetText(container, text) {
        if (!text) return;
        const tokenRegex = /(https?:\/\/[^\s]+|@[a-zA-Z0-9_]{1,15}|#[a-zA-Z0-9_]+)/g;
        let lastIndex = 0;
        let match;
        while ((match = tokenRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const token = match[0];
            const link = document.createElement('a');
            link.className = 'x-friend-card-inline-link';
            if (token.startsWith('@')) {
                link.href = `https://x.com/${token.slice(1)}`;
            } else if (token.startsWith('#')) {
                link.href = `https://x.com/hashtag/${encodeURIComponent(token.slice(1))}`;
            } else {
                link.href = token;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            link.textContent = token;
            link.addEventListener('click', (e) => e.stopPropagation());
            container.appendChild(link);
            lastIndex = tokenRegex.lastIndex;
        }
        if (lastIndex < text.length) {
            container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
    }

    // Friends Timeline Tab & View State
    const TIMELINE_PAGE_SIZE = 20;
    let isFriendsTabActive = false;
    let currentTimelineFilter = 'all'; // 'all' | 'forced' | 'unseen'
    let currentFriendFilter = '';      // '' (all friends) or friend label
    let currentVisibleLimit = TIMELINE_PAGE_SIZE;
    let infiniteScrollObserver = null;
    let videoAutoplayObserver = null;
    let videoScrollRafPending = false;
    const trackedAutoplayVideos = new Set();
    const sessionVisibleTweetIds = new Set();
    const scrolledPastRemovedIds = new Set();

    function autoPauseVideo(video) {
        if (!video || video.paused || typeof video.pause !== 'function') return;
        video._xAutoPausing = true;
        try {
            video.pause();
        } catch (e) {}
        setTimeout(() => {
            video._xAutoPausing = false;
        }, 0);
    }

    function computeVideoVisibility(video) {
        if (!video || !video.isConnected) {
            return { ratio: 0, centerDist: Infinity };
        }
        const inFriendsRoot = video.closest && video.closest('#x-friends-timeline-root');
        if (inFriendsRoot && !isFriendsTabActive) {
            return { ratio: 0, centerDist: Infinity };
        }
        if (typeof video.getBoundingClientRect === 'function') {
            const rect = video.getBoundingClientRect();
            if (rect.height > 0 && rect.width > 0) {
                const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
                const visibleTop = Math.max(0, rect.top);
                const visibleBottom = Math.min(vh, rect.bottom);
                const visibleHeight = Math.max(0, visibleBottom - visibleTop);
                const ratio = visibleHeight / rect.height;
                const centerDist = Math.abs((rect.top + rect.bottom) / 2 - vh / 2);
                return { ratio, centerDist };
            }
        }
        if (typeof video._xIntersectionRatio === 'number') {
            return { ratio: video._xIntersectionRatio, centerDist: 0 };
        }
        return { ratio: 0, centerDist: Infinity };
    }

    function evaluateVideoAutoplay() {
        let bestVideo = null;
        let bestRatio = -1;
        let bestCenterDist = Infinity;

        for (const video of Array.from(trackedAutoplayVideos)) {
            if (!video || !video.isConnected) {
                trackedAutoplayVideos.delete(video);
                continue;
            }
            const { ratio, centerDist } = computeVideoVisibility(video);
            if (ratio < 0.25) {
                video._xUserPausedInView = false;
                autoPauseVideo(video);
                continue;
            }
            if (ratio >= 0.5 && !video._xUserPausedInView) {
                if (
                    !bestVideo ||
                    ratio > bestRatio + 0.1 ||
                    (Math.abs(ratio - bestRatio) <= 0.1 && centerDist < bestCenterDist)
                ) {
                    bestVideo = video;
                    bestRatio = ratio;
                    bestCenterDist = centerDist;
                }
            }
        }

        for (const video of trackedAutoplayVideos) {
            if (video !== bestVideo) {
                autoPauseVideo(video);
            }
        }

        if (bestVideo && bestVideo.paused && typeof bestVideo.play === 'function') {
            try {
                const playPromise = bestVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            } catch (e) {}
        }
    }

    function ensureVideoAutoplayObserver() {
        if (!videoAutoplayObserver && typeof IntersectionObserver !== 'undefined') {
            videoAutoplayObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    entry.target._xIntersectionRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
                });
                evaluateVideoAutoplay();
            }, {
                threshold: [0, 0.25, 0.5, 0.75, 1.0]
            });
        }
        if (typeof window !== 'undefined') {
            if (window._xFriendsVideoScrollHandler) {
                window.removeEventListener('scroll', window._xFriendsVideoScrollHandler, { passive: true });
            }
            window._xFriendsVideoScrollHandler = () => {
                if (videoScrollRafPending) return;
                videoScrollRafPending = true;
                const run = () => {
                    videoScrollRafPending = false;
                    evaluateVideoAutoplay();
                };
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(run);
                } else {
                    setTimeout(run, 16);
                }
            };
            window.addEventListener('scroll', window._xFriendsVideoScrollHandler, { passive: true });
        }
    }

    function registerAutoplayVideo(video) {
        if (!video) return;
        ensureVideoAutoplayObserver();
        trackedAutoplayVideos.add(video);
        if (videoAutoplayObserver) {
            videoAutoplayObserver.observe(video);
        }
        video.addEventListener('pause', () => {
            if (!video._xAutoPausing && !video.ended) {
                const { ratio } = computeVideoVisibility(video);
                if (ratio >= 0.5) {
                    video._xUserPausedInView = true;
                }
            }
        });
        video.addEventListener('play', () => {
            video._xUserPausedInView = false;
            for (const other of trackedAutoplayVideos) {
                if (other !== video) {
                    autoPauseVideo(other);
                }
            }
        });
        video.addEventListener('click', (e) => {
            const rect = typeof video.getBoundingClientRect === 'function' ? video.getBoundingClientRect() : { height: 0, bottom: 0 };
            const isControlBarClick = rect.height > 0 && typeof e.clientY === 'number' && e.clientY > 0 && e.clientY > rect.bottom - 44;
            if (!isControlBarClick && video.muted) {
                e.preventDefault();
                e.stopPropagation();
                video.muted = false;
                video.removeAttribute('muted');
                if (video.paused && typeof video.play === 'function') {
                    try {
                        const p = video.play();
                        if (p && typeof p.catch === 'function') p.catch(() => {});
                    } catch (err) {}
                }
            }
        });
    }

    function buildMediaGridElement(mediaArray, permalink, onNeedHydration = null) {
        if (!Array.isArray(mediaArray) || mediaArray.length === 0) return null;
        const mediaGrid = document.createElement('div');
        mediaGrid.className = 'x-friend-card-media-grid';
        mediaGrid.setAttribute('data-media-count', String(mediaArray.length));

        mediaArray.forEach(m => {
            if (!m || typeof m !== 'object') return;
            const isVid = m.type === 'video' || m.type === 'animated_gif';

            if (isVid && m.videoUrl) {
                const mediaWrap = document.createElement('div');
                mediaWrap.className = 'x-friend-card-media-item is-video';
                mediaWrap.addEventListener('click', (e) => e.stopPropagation());

                const video = document.createElement('video');
                video.className = 'x-friend-card-video';
                video.controls = true;
                video.playsInline = true;
                video.loop = true;
                video.muted = true;
                video.defaultMuted = true;
                video.setAttribute('muted', '');
                video.setAttribute('playsinline', '');
                video.preload = 'metadata';
                if (m.posterUrl || m.url) {
                    video.poster = m.posterUrl || m.url;
                }
                video.src = m.videoUrl;
                registerAutoplayVideo(video);
                mediaWrap.appendChild(video);
                mediaGrid.appendChild(mediaWrap);
            } else {
                const imgUrl = isVid ? (m.posterUrl || m.url) : m.url;
                if (!imgUrl) return;
                if (isVid && !m.videoUrl && typeof onNeedHydration === 'function') {
                    onNeedHydration();
                }
                const mediaLink = document.createElement('a');
                mediaLink.className = `x-friend-card-media-item${isVid ? ' is-video-poster' : ''}`;
                mediaLink.setAttribute('data-testid', 'tweetPhoto');
                mediaLink.href = permalink;
                mediaLink.addEventListener('click', (e) => e.stopPropagation());

                const img = document.createElement('img');
                img.src = imgUrl;
                img.loading = 'lazy';
                img.alt = 'Post media';
                mediaLink.appendChild(img);

                if (isVid) {
                    const playBadge = document.createElement('span');
                    playBadge.className = 'x-friend-card-video-badge';
                    playBadge.textContent = '▶ Video';
                    mediaLink.appendChild(playBadge);
                }
                mediaGrid.appendChild(mediaLink);
            }
        });

        return mediaGrid.childNodes.length > 0 ? mediaGrid : null;
    }

    function createFriendTweetCard(postItem, callbacks = {}) {
        const {
            tweetId,
            seenBy = [],
            forcedBy = [],
            forcedByMe = false,
            isSeenByMe = false,
            snowflakeTimeMs = 0,
            meta = null
        } = postItem;

        const screenName = meta?.screenName || '';
        const authorName = meta?.authorName || (screenName ? `@${screenName}` : '');
        const avatarUrl = meta?.avatarUrl || '';
        const text = meta?.text || '';
        const hasQuote = Boolean(
            meta &&
            meta.quotedTweet &&
            (meta.quotedTweet.text || meta.quotedTweet.screenName || (Array.isArray(meta.quotedTweet.media) && meta.quotedTweet.media.length > 0))
        );
        const hasParent = Boolean(
            !hasQuote &&
            meta &&
            meta.parentTweet &&
            (meta.parentTweet.text || meta.parentTweet.screenName || (Array.isArray(meta.parentTweet.media) && meta.parentTweet.media.length > 0))
        );
        const embeddedTweet = hasQuote ? meta.quotedTweet : (hasParent ? meta.parentTweet : null);

        // Deduplicate any embedded/quote media that may have been scraped into outer media before hydration
        const quoteMediaKeys = new Set();
        if (embeddedTweet && Array.isArray(embeddedTweet.media)) {
            embeddedTweet.media.forEach(m => {
                if (!m) return;
                const k1 = getMediaAssetKey(m.url);
                const k2 = getMediaAssetKey(m.posterUrl);
                if (k1) quoteMediaKeys.add(k1);
                if (k2) quoteMediaKeys.add(k2);
            });
        }
        const outerMedia = (meta && Array.isArray(meta.media))
            ? meta.media.filter(m => {
                if (!m) return false;
                const k1 = getMediaAssetKey(m.url);
                const k2 = getMediaAssetKey(m.posterUrl);
                return (!k1 || !quoteMediaKeys.has(k1)) && (!k2 || !quoteMediaKeys.has(k2));
            })
            : [];
        const hasMedia = outerMedia.length > 0;

        const inReplyTo = meta?.inReplyToScreenName || (meta?.parentTweet?.screenName || '');
        let displayText = text;
        if (inReplyTo && displayText) {
            const replyPrefixRegex = new RegExp(`^@${inReplyTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s*`, 'i');
            displayText = displayText.replace(replyPrefixRegex, '');
        }
        if (embeddedTweet && displayText) {
            if (embeddedTweet.id) {
                displayText = displayText.replace(new RegExp(`https?:\\/\\/[^\\s]*\\/status\\/${embeddedTweet.id}[^\\s]*`, 'gi'), '');
            }
            displayText = displayText.replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+\s*$/g, '').trim();
        }

        const isEmptyMeta = !meta || (!screenName && !displayText && !hasMedia && !embeddedTweet);
        const needsHydration = !meta ||
            !meta.isHydrated ||
            meta.hydrationVersion !== 4 ||
            (embeddedTweet && (!embeddedTweet.avatarUrl || !embeddedTweet.authorName));

        const permalink = meta?.permalink || (screenName ? `https://x.com/${screenName}/status/${tweetId}` : `https://x.com/i/status/${tweetId}`);
        const timeStr = formatRelativeTime(snowflakeTimeMs, meta?.createdAt);
        const isoTime = meta?.createdAt || (snowflakeTimeMs ? new Date(snowflakeTimeMs).toISOString() : '');

        const card = document.createElement('article');
        card.className = 'x-friend-tweet-card';
        card.setAttribute('data-testid', 'tweet');
        card.setAttribute('data-tweet-id', tweetId);
        card.setAttribute('data-x-tweet-id', tweetId);

        if (forcedBy.length > 0 || forcedByMe) {
            card.classList.add('is-forced-card');
        }
        if (isSeenByMe) {
            card.classList.add('is-seen-by-me');
        }
        if (needsHydration) {
            card.setAttribute('data-needs-hydration', 'true');
        }

        // Clicking the post card body navigates to the tweet permalink (matching native X post cards)
        card.addEventListener('click', (e) => {
            if (e.defaultPrevented) return;
            const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
            if (sel && String(sel).length > 0) return;
            const interactive = e.target && e.target.closest
                ? e.target.closest('a, button, video, select, input, .x-location-inline-badge, .x-friend-card-quote')
                : null;
            if (interactive) return;

            if (e.metaKey || e.ctrlKey) {
                window.open(permalink, '_blank', 'noopener');
            } else {
                window.location.href = permalink;
            }
        });

        // 1. Social context badges row at top
        const badgesRow = document.createElement('div');
        badgesRow.className = 'x-friend-card-badges';

        if (forcedBy.length > 0) {
            const forcedBadge = document.createElement('span');
            forcedBadge.className = 'x-card-badge x-card-badge-forced';
            forcedBadge.textContent = `⚡ Forced by ${forcedBy.join(', ')}`;
            badgesRow.appendChild(forcedBadge);
        }
        if (forcedByMe) {
            const myForcedBadge = document.createElement('span');
            myForcedBadge.className = 'x-card-badge x-card-badge-forced-me';
            myForcedBadge.textContent = '⚡ Forced by You';
            badgesRow.appendChild(myForcedBadge);
        }
        if (seenBy.length > 0) {
            const seenBadge = document.createElement('span');
            seenBadge.className = 'x-card-badge x-card-badge-seen';
            seenBadge.textContent = `✅ Seen by ${seenBy.join(', ')}`;
            badgesRow.appendChild(seenBadge);
        }

        const mySeenPill = document.createElement('span');
        mySeenPill.className = 'x-card-badge x-card-badge-my-seen';
        mySeenPill.setAttribute('data-testid', 'x-card-my-seen');
        mySeenPill.textContent = '✓ Seen by you';
        if (!isSeenByMe) {
            mySeenPill.style.display = 'none';
        }
        badgesRow.appendChild(mySeenPill);

        if (callbacks.isHomeInjection && typeof callbacks.onDismissForced === 'function') {
            const dismissBtn = document.createElement('button');
            dismissBtn.type = 'button';
            dismissBtn.className = 'x-forced-dismiss-btn';
            dismissBtn.textContent = '✓ Got it';
            dismissBtn.title = 'Dismiss from Home feed';
            dismissBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                callbacks.onDismissForced(tweetId, card);
            });
            badgesRow.appendChild(dismissBtn);
        }

        card.appendChild(badgesRow);

        // 2. Two-column X Post Layout (Left: 40px Avatar, Right: Header + Body + Media + Quote + Footer)
        const mainLayout = document.createElement('div');
        mainLayout.className = 'x-friend-card-main';

        const leftCol = document.createElement('div');
        leftCol.className = 'x-friend-card-left';

        const avatarWrap = document.createElement('a');
        avatarWrap.className = 'x-friend-card-avatar-wrap';
        avatarWrap.href = screenName ? `https://x.com/${screenName}` : permalink;
        if (screenName) {
            avatarWrap.setAttribute('data-testid', `UserAvatar-Container-${screenName}`);
        }
        avatarWrap.addEventListener('click', (e) => e.stopPropagation());

        if (avatarUrl) {
            const img = document.createElement('img');
            img.className = 'x-friend-card-avatar';
            img.src = avatarUrl;
            img.loading = 'lazy';
            img.alt = authorName || screenName || 'User';
            avatarWrap.appendChild(img);
        } else {
            const fallbackAvatar = document.createElement('div');
            fallbackAvatar.className = 'x-friend-card-avatar-fallback';
            const initial = ((authorName || screenName || 'X').replace(/^@/, '')[0] || '𝕏').toUpperCase();
            fallbackAvatar.textContent = initial;
            avatarWrap.appendChild(fallbackAvatar);
        }
        leftCol.appendChild(avatarWrap);
        mainLayout.appendChild(leftCol);

        const rightCol = document.createElement('div');
        rightCol.className = 'x-friend-card-right';

        const header = document.createElement('div');
        header.className = 'x-friend-card-header';

        const authorMeta = document.createElement('div');
        authorMeta.className = 'x-friend-card-author-meta';
        if (screenName) {
            authorMeta.setAttribute('data-testid', 'User-Name');
        }

        const nameLink = document.createElement('a');
        nameLink.className = 'x-friend-card-author-name';
        nameLink.href = screenName ? `https://x.com/${screenName}` : permalink;
        nameLink.addEventListener('click', (e) => e.stopPropagation());
        const nameSpan = document.createElement('span');
        nameSpan.textContent = authorName || (isEmptyMeta ? 'Loading post...' : 'X Post');
        nameLink.appendChild(nameSpan);
        authorMeta.appendChild(nameLink);

        if (meta?.isVerified) {
            authorMeta.appendChild(createVerifiedBadgeSVG());
        }

        if (screenName) {
            const handleLink = document.createElement('a');
            handleLink.className = 'x-friend-card-handle';
            handleLink.href = `https://x.com/${screenName}`;
            handleLink.textContent = `@${screenName}`;
            handleLink.addEventListener('click', (e) => e.stopPropagation());
            authorMeta.appendChild(handleLink);
        }

        if (timeStr) {
            const dotSpan = document.createElement('span');
            dotSpan.className = 'x-friend-card-dot';
            dotSpan.textContent = '·';
            authorMeta.appendChild(dotSpan);

            const timeLink = document.createElement('a');
            timeLink.className = 'x-friend-card-time';
            timeLink.href = permalink;
            timeLink.addEventListener('click', (e) => e.stopPropagation());
            const timeEl = document.createElement('time');
            if (isoTime) timeEl.setAttribute('datetime', isoTime);
            timeEl.textContent = timeStr;
            timeLink.appendChild(timeEl);
            authorMeta.appendChild(timeLink);
        } else {
            // Hidden status permalink so extractTweetIdFromArticle always finds the ID
            const hiddenTimeLink = document.createElement('a');
            hiddenTimeLink.href = permalink;
            hiddenTimeLink.style.display = 'none';
            const timeEl = document.createElement('time');
            hiddenTimeLink.appendChild(timeEl);
            authorMeta.appendChild(hiddenTimeLink);
        }

        header.appendChild(authorMeta);
        rightCol.appendChild(header);

        if (inReplyTo && !hasParent) {
            const replyingRow = document.createElement('div');
            replyingRow.className = 'x-friend-card-replying-to';
            replyingRow.appendChild(document.createTextNode('Replying to '));
            const replyLink = document.createElement('a');
            replyLink.className = 'x-friend-card-mention';
            replyLink.href = `https://x.com/${inReplyTo}`;
            replyLink.textContent = `@${inReplyTo}`;
            replyLink.addEventListener('click', (e) => e.stopPropagation());
            replyingRow.appendChild(replyLink);
            rightCol.appendChild(replyingRow);
        }

        // 4. Tweet Body Text or Loading Skeleton
        if (isEmptyMeta) {
            const skeleton = document.createElement('div');
            skeleton.className = 'x-friend-card-skeleton';
            const line1 = document.createElement('div');
            line1.className = 'x-friend-card-skeleton-line is-wide';
            const line2 = document.createElement('div');
            line2.className = 'x-friend-card-skeleton-line is-medium';
            skeleton.appendChild(line1);
            skeleton.appendChild(line2);
            rightCol.appendChild(skeleton);
        } else if (displayText) {
            const body = document.createElement('div');
            body.className = 'x-friend-card-body';
            body.setAttribute('data-testid', 'tweetText');
            appendFormattedTweetText(body, displayText);
            rightCol.appendChild(body);
        }

        // 5. Media Attachments (Photos & Playable Videos)
        if (hasMedia) {
            const mediaGrid = buildMediaGridElement(outerMedia, permalink, () => {
                card.setAttribute('data-needs-hydration', 'true');
            });
            if (mediaGrid) {
                rightCol.appendChild(mediaGrid);
            }
        }

        // 6. Quoted / Embedded Parent Tweet Card (Authentic X Nested Quote Post Layout matching For You tab)
        if (embeddedTweet) {
            const q = embeddedTweet;
            const qScreen = q.screenName || '';
            const qPermalink = qScreen && q.id
                ? `https://x.com/${qScreen}/status/${q.id}`
                : (qScreen ? `https://x.com/${qScreen}` : permalink);
            const qTimeStr = formatRelativeTime(0, q.createdAt);

            const quoteBox = document.createElement('div');
            quoteBox.className = 'x-friend-card-quote';
            quoteBox.setAttribute('role', 'link');
            quoteBox.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.metaKey || e.ctrlKey) {
                    window.open(qPermalink, '_blank', 'noopener');
                } else {
                    window.location.href = qPermalink;
                }
            });

            const quoteInner = document.createElement('div');
            quoteInner.className = 'x-friend-card-quote-inner';

            const qHeader = document.createElement('div');
            qHeader.className = 'x-friend-card-quote-header';

            // 24x24 Tweet-User-Avatar sibling before User-Name (matches native X For You quote card)
            const qAvatarWrap = document.createElement('div');
            qAvatarWrap.className = 'x-friend-card-quote-avatar-wrap';
            qAvatarWrap.setAttribute('data-testid', 'Tweet-User-Avatar');
            if (qScreen) {
                qAvatarWrap.setAttribute('data-user-avatar', qScreen);
            }

            const qAvatarContainer = document.createElement('div');
            qAvatarContainer.className = 'x-friend-card-quote-avatar-container';
            if (qScreen) {
                qAvatarContainer.setAttribute('data-testid', `UserAvatar-Container-${qScreen}`);
            }

            if (q.avatarUrl) {
                const qAvatar = document.createElement('img');
                qAvatar.className = 'x-friend-card-quote-avatar';
                qAvatar.src = q.avatarUrl;
                qAvatar.alt = '';
                qAvatarContainer.appendChild(qAvatar);
            } else {
                const qAvatarFallback = document.createElement('span');
                qAvatarFallback.className = 'x-friend-card-quote-avatar-fallback';
                const qInitial = ((q.authorName || qScreen || 'X').replace(/^@/, '')[0] || '𝕏').toUpperCase();
                qAvatarFallback.textContent = qInitial;
                qAvatarContainer.appendChild(qAvatarFallback);
            }
            qAvatarWrap.appendChild(qAvatarContainer);
            qHeader.appendChild(qAvatarWrap);

            // User-Name container holding Display Name, Verified Icon, @handle, Inline Location Badge, and · time
            const qUserMeta = document.createElement('div');
            qUserMeta.className = 'x-friend-card-quote-user-meta';
            if (qScreen) {
                qUserMeta.setAttribute('data-testid', 'User-Name');
            }

            const qAuthorSpan = document.createElement('span');
            qAuthorSpan.className = 'x-friend-card-quote-author';
            qAuthorSpan.textContent = q.authorName || (qScreen ? `@${qScreen}` : 'Quoted Post');
            qUserMeta.appendChild(qAuthorSpan);

            if (q.isVerified) {
                qUserMeta.appendChild(createVerifiedBadgeSVG());
            }

            if (qScreen) {
                const qHandleLink = document.createElement('a');
                qHandleLink.className = 'x-friend-card-quote-handle';
                qHandleLink.href = `https://x.com/${qScreen}`;
                qHandleLink.textContent = `@${qScreen}`;
                qHandleLink.addEventListener('click', (e) => e.stopPropagation());
                qUserMeta.appendChild(qHandleLink);
            }

            if (qTimeStr) {
                const qDotSpan = document.createElement('span');
                qDotSpan.className = 'x-friend-card-quote-dot';
                qDotSpan.textContent = '·';
                qUserMeta.appendChild(qDotSpan);

                const qTimeSpan = document.createElement('span');
                qTimeSpan.className = 'x-friend-card-quote-time';
                const qTimeEl = document.createElement('time');
                if (q.createdAt) qTimeEl.setAttribute('datetime', q.createdAt);
                qTimeEl.textContent = qTimeStr;
                qTimeSpan.appendChild(qTimeEl);
                qUserMeta.appendChild(qTimeSpan);
            }

            qHeader.appendChild(qUserMeta);
            quoteInner.appendChild(qHeader);

            if (q.inReplyToScreenName) {
                const qReplying = document.createElement('div');
                qReplying.className = 'x-friend-card-quote-replying';
                qReplying.textContent = `Replying to @${q.inReplyToScreenName}`;
                quoteInner.appendChild(qReplying);
            }

            let qDisplayText = q.text || '';
            if (q.inReplyToScreenName && qDisplayText) {
                const qReplyRegex = new RegExp(`^@${q.inReplyToScreenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s*`, 'i');
                qDisplayText = qDisplayText.replace(qReplyRegex, '');
            }

            if (qDisplayText) {
                const qText = document.createElement('div');
                qText.className = 'x-friend-card-quote-text';
                qText.setAttribute('data-testid', 'tweetText');
                appendFormattedTweetText(qText, qDisplayText);
                quoteInner.appendChild(qText);
            }

            quoteBox.appendChild(quoteInner);

            if (Array.isArray(q.media) && q.media.length > 0) {
                const qMediaGrid = buildMediaGridElement(q.media, qPermalink, () => {
                    card.setAttribute('data-needs-hydration', 'true');
                });
                if (qMediaGrid) {
                    qMediaGrid.classList.add('x-friend-card-quote-media');
                    quoteBox.appendChild(qMediaGrid);
                }
            }

            rightCol.appendChild(quoteBox);
        }

        // 7. Native-style X Action Bar Footer (div[role="group"])
        const footer = document.createElement('div');
        footer.className = 'x-friend-card-footer';
        footer.setAttribute('role', 'group');

        // Reply stat button
        const replyLink = document.createElement('a');
        replyLink.className = 'x-friend-card-stat x-friend-card-stat-reply';
        replyLink.setAttribute('data-testid', 'reply');
        replyLink.href = permalink;
        replyLink.title = 'Replies on X';
        replyLink.addEventListener('click', (e) => e.stopPropagation());
        replyLink.appendChild(createReplyIconSVG());
        const replyCountStr = formatMetricCount(meta?.replyCount);
        if (replyCountStr) {
            const countSpan = document.createElement('span');
            countSpan.textContent = replyCountStr;
            replyLink.appendChild(countSpan);
        }
        footer.appendChild(replyLink);

        // Repost stat button (in-place X GraphQL CreateRetweet / DeleteRetweet)
        let isReposted = Boolean(meta?.repostedByMe);
        const baseRepostCount = Math.max(0, (Number(meta?.retweetCount) || 0) - (isReposted ? 1 : 0));
        const repostBtn = document.createElement('button');
        repostBtn.type = 'button';
        repostBtn.className = `x-friend-card-stat x-friend-card-stat-repost${isReposted ? ' is-reposted' : ''}`;
        repostBtn.setAttribute('data-testid', isReposted ? 'unretweet' : 'retweet');
        repostBtn.title = isReposted ? 'Undo Repost' : 'Repost';
        repostBtn.appendChild(createRepostIconSVG());
        const repostCountSpan = document.createElement('span');
        const initialRepostStr = formatMetricCount(baseRepostCount + (isReposted ? 1 : 0));
        repostCountSpan.textContent = initialRepostStr;
        if (!initialRepostStr) repostCountSpan.style.display = 'none';
        repostBtn.appendChild(repostCountSpan);
        repostBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isReposted = !isReposted;
            const nextCount = baseRepostCount + (isReposted ? 1 : 0);
            if (meta && typeof meta === 'object') {
                meta.repostedByMe = isReposted;
                meta.retweetCount = nextCount;
            }
            repostBtn.classList.toggle('is-reposted', isReposted);
            repostBtn.setAttribute('data-testid', isReposted ? 'unretweet' : 'retweet');
            repostBtn.title = isReposted ? 'Undo Repost' : 'Repost';
            const nextStr = formatMetricCount(nextCount);
            repostCountSpan.textContent = nextStr;
            repostCountSpan.style.display = nextStr ? '' : 'none';
            performXGraphQLAction(isReposted ? 'repost' : 'unrepost', tweetId);
        });
        footer.appendChild(repostBtn);

        // Like stat button (in-place X GraphQL FavoriteTweet / UnfavoriteTweet)
        let isLiked = Boolean(meta?.likedByMe);
        const baseLikeCount = Math.max(0, (Number(meta?.favoriteCount) || 0) - (isLiked ? 1 : 0));
        const likeBtn = document.createElement('button');
        likeBtn.type = 'button';
        likeBtn.className = `x-friend-card-stat x-friend-card-stat-like${isLiked ? ' is-liked' : ''}`;
        likeBtn.setAttribute('data-testid', isLiked ? 'unlike' : 'like');
        likeBtn.title = isLiked ? 'Unlike' : 'Like';
        let heartIcon = createHeartIconSVG(isLiked);
        likeBtn.appendChild(heartIcon);
        const likeCountSpan = document.createElement('span');
        const initialLikeStr = formatMetricCount(baseLikeCount + (isLiked ? 1 : 0));
        likeCountSpan.textContent = initialLikeStr;
        if (!initialLikeStr) likeCountSpan.style.display = 'none';
        likeBtn.appendChild(likeCountSpan);
        likeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isLiked = !isLiked;
            const nextCount = baseLikeCount + (isLiked ? 1 : 0);
            if (meta && typeof meta === 'object') {
                meta.likedByMe = isLiked;
                meta.favoriteCount = nextCount;
            }
            likeBtn.classList.toggle('is-liked', isLiked);
            likeBtn.setAttribute('data-testid', isLiked ? 'unlike' : 'like');
            likeBtn.title = isLiked ? 'Unlike' : 'Like';
            const nextHeart = createHeartIconSVG(isLiked);
            if (heartIcon.parentNode === likeBtn) {
                likeBtn.replaceChild(nextHeart, heartIcon);
            }
            heartIcon = nextHeart;
            const nextStr = formatMetricCount(nextCount);
            likeCountSpan.textContent = nextStr;
            likeCountSpan.style.display = nextStr ? '' : 'none';
            performXGraphQLAction(isLiked ? 'like' : 'unlike', tweetId);
        });
        footer.appendChild(likeBtn);

        // Views stat button
        const viewsLink = document.createElement('a');
        viewsLink.className = 'x-friend-card-stat x-friend-card-stat-views';
        viewsLink.href = `${permalink}/analytics`;
        viewsLink.title = 'View post analytics on X';
        viewsLink.addEventListener('click', (e) => e.stopPropagation());
        viewsLink.appendChild(createViewsIconSVG());
        const viewCountStr = formatMetricCount(meta?.viewCount);
        if (viewCountStr) {
            const countSpan = document.createElement('span');
            countSpan.textContent = viewCountStr;
            viewsLink.appendChild(countSpan);
        }
        footer.appendChild(viewsLink);

        // Bookmark button (Force & Download buttons will be inserted immediately to the left of this)
        let isBookmarked = Boolean(meta?.bookmarkedByMe);
        const bookmarkBtn = document.createElement('button');
        bookmarkBtn.type = 'button';
        bookmarkBtn.className = `x-friend-card-stat x-friend-card-stat-bookmark${isBookmarked ? ' is-bookmarked' : ''}`;
        bookmarkBtn.setAttribute('data-testid', isBookmarked ? 'removeBookmark' : 'bookmark');
        bookmarkBtn.setAttribute('aria-label', isBookmarked ? 'Remove from Bookmarks' : 'Bookmark');
        bookmarkBtn.title = isBookmarked ? 'Remove from Bookmarks' : 'Bookmark';
        let bookmarkIcon = createBookmarkIconSVG(isBookmarked);
        bookmarkBtn.appendChild(bookmarkIcon);
        bookmarkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isBookmarked = !isBookmarked;
            if (meta && typeof meta === 'object') {
                meta.bookmarkedByMe = isBookmarked;
            }
            bookmarkBtn.classList.toggle('is-bookmarked', isBookmarked);
            bookmarkBtn.setAttribute('data-testid', isBookmarked ? 'removeBookmark' : 'bookmark');
            bookmarkBtn.setAttribute('aria-label', isBookmarked ? 'Remove from Bookmarks' : 'Bookmark');
            bookmarkBtn.title = isBookmarked ? 'Remove from Bookmarks' : 'Bookmark';
            const nextBmIcon = createBookmarkIconSVG(isBookmarked);
            if (bookmarkIcon.parentNode === bookmarkBtn) {
                bookmarkBtn.replaceChild(nextBmIcon, bookmarkIcon);
            }
            bookmarkIcon = nextBmIcon;
            performXGraphQLAction(isBookmarked ? 'bookmark' : 'unbookmark', tweetId);
        });
        footer.appendChild(bookmarkBtn);

        // Share / Open on X permalink icon
        const openLink = document.createElement('a');
        openLink.className = 'x-friend-card-stat x-friend-card-stat-open';
        openLink.setAttribute('aria-label', 'Share post');
        openLink.href = permalink;
        openLink.title = 'Open post on X';
        openLink.addEventListener('click', (e) => e.stopPropagation());
        openLink.appendChild(createExternalLinkSVG());
        footer.appendChild(openLink);

        rightCol.appendChild(footer);
        mainLayout.appendChild(rightCol);
        card.appendChild(mainLayout);

        // Attach the standard Force-to-Friends lightning bolt button into footer[role="group"]
        renderForceTweetButton(card, tweetId, {
            forcedByMe,
            forcedByFriends: forcedBy
        }, (tid, nextForced) => {
            card.classList.toggle('is-forced-card', Boolean(nextForced || forcedBy.length > 0));
            if (typeof callbacks.onToggleForce === 'function') {
                callbacks.onToggleForce(tid, nextForced, card, meta);
            }
        });

        card._xPostItem = postItem;
        card._xCallbacks = callbacks;

        return card;
    }

    function requestHydrationForCards(container, callbacks = {}) {
        if (!container || typeof callbacks.onHydrateTweets !== 'function') return;
        const unhydratedCards = container.querySelectorAll('article.x-friend-tweet-card[data-needs-hydration="true"]');
        const idsToHydrate = [];
        for (const c of unhydratedCards) {
            const tid = c.getAttribute('data-tweet-id');
            if (tid) idsToHydrate.push(tid);
            if (idsToHydrate.length >= 20) break;
        }
        if (idsToHydrate.length > 0) {
            callbacks.onHydrateTweets(idsToHydrate);
        }
    }

    function updateHydratedCardsInDOM(hydratedMap = {}, callbacks = {}) {
        if (!hydratedMap || typeof hydratedMap !== 'object') return;
        const ids = Object.keys(hydratedMap);
        if (ids.length === 0) return;

        for (const tweetId of ids) {
            const meta = hydratedMap[tweetId];
            if (!meta) continue;
            const cards = document.querySelectorAll(`article.x-friend-tweet-card[data-tweet-id="${tweetId}"]`);
            cards.forEach(oldCard => {
                if (meta.isUnavailable) {
                    if (oldCard.parentNode) {
                        oldCard.parentNode.removeChild(oldCard);
                    }
                    return;
                }
                const prevItem = oldCard._xPostItem || { tweetId };
                const activeCbs = oldCard._xCallbacks || callbacks;
                const wasSeen = Boolean(prevItem.isSeenByMe || oldCard.classList.contains('is-seen-by-me'));
                const wasViewedInSession = oldCard.dataset?.xViewedInSession === 'true';
                const updatedItem = {
                    ...prevItem,
                    isSeenByMe: wasSeen,
                    meta
                };
                const newCard = createFriendTweetCard(updatedItem, activeCbs);
                if (wasViewedInSession && newCard.dataset) {
                    newCard.dataset.xViewedInSession = 'true';
                }
                if (oldCard.parentNode) {
                    oldCard.parentNode.replaceChild(newCard, oldCard);
                }
            });
        }
        evaluateVideoAutoplay();
    }

    function updateUnseenFilterPillCountInDOM() {
        const root = document.getElementById('x-friends-timeline-root');
        if (!root) return;
        const unseenPill = root.querySelector('.x-friends-filter-pill[data-filter="unseen"]');
        if (!unseenPill) return;
        const data = root._xTimelineData;
        if (data && Array.isArray(data.timelinePosts)) {
            const unseenCount = data.timelinePosts.filter(p => !p.isSeenByMe).length;
            unseenPill.textContent = `Unseen (${unseenCount})`;
        }
    }

    function markCardSeenInDOM(tweetId) {
        if (!tweetId) return;
        const cards = document.querySelectorAll(`article.x-friend-tweet-card[data-tweet-id="${tweetId}"]`);
        cards.forEach(card => {
            card.classList.add('is-seen-by-me');
            if (card.dataset) {
                card.dataset.xViewedInSession = 'true';
            }
            if (card._xPostItem) {
                card._xPostItem.isSeenByMe = true;
            }
            const pill = card.querySelector('[data-testid="x-card-my-seen"]');
            if (pill) {
                pill.style.display = '';
            }
        });
        updateUnseenFilterPillCountInDOM();
    }

    function isCardScrolledPastTop(cardEl) {
        if (!cardEl || !cardEl.isConnected) return false;
        const rectTarget = (cardEl._xFilteredPlaceholder && cardEl._xFilteredPlaceholder.isConnected)
            ? cardEl._xFilteredPlaceholder
            : cardEl;
        if (typeof rectTarget.getBoundingClientRect !== 'function') return false;
        const rect = rectTarget.getBoundingClientRect();
        return (rect.height > 0 && rect.bottom <= 0) || rect.bottom < 0;
    }

    function removeCardAfterScrollPast(tweetId, cardEl = null) {
        const id = String(tweetId || '').trim();
        if (!id) return false;

        const targetCard = cardEl || document.querySelector(`article.x-friend-tweet-card[data-tweet-id="${id}"]`);
        if (!targetCard || !targetCard.isConnected) return false;

        const isSeen = targetCard.classList.contains('is-seen-by-me') || Boolean(targetCard._xPostItem?.isSeenByMe);
        if (!isSeen) return false;

        if (!isCardScrolledPastTop(targetCard)) {
            return false;
        }

        const placeholderEl = (targetCard._xFilteredPlaceholder && targetCard._xFilteredPlaceholder.isConnected)
            ? targetCard._xFilteredPlaceholder
            : null;
        const rectTarget = placeholderEl || targetCard;
        const rect = rectTarget.getBoundingClientRect();
        const removedHeight = rect.height > 0 ? rect.height : 0;

        // Find a visible sibling card in the viewport to check whether browser CSS overflow-anchor
        // already compensated for the removal (avoiding a double scroll jump in Chrome).
        const parentList = targetCard.parentNode;
        let anchorCard = null;
        let anchorTopBefore = 0;
        if (parentList && parentList.children) {
            for (let i = 0; i < parentList.children.length; i++) {
                const sib = parentList.children[i];
                if (sib === targetCard || sib === placeholderEl || typeof sib.getBoundingClientRect !== 'function') continue;
                const sibRect = sib.getBoundingClientRect();
                if (sibRect.bottom > 0) {
                    anchorCard = sib;
                    anchorTopBefore = sibRect.top;
                    break;
                }
            }
        }

        scrolledPastRemovedIds.add(id);
        sessionVisibleTweetIds.delete(id);

        const forcedBanner = targetCard.closest ? targetCard.closest('#x-forced-home-feed') : null;
        if (placeholderEl && placeholderEl.parentNode) {
            placeholderEl.parentNode.removeChild(placeholderEl);
        }
        targetCard._xFilteredPlaceholder = null;
        if (targetCard.parentNode) {
            targetCard.parentNode.removeChild(targetCard);
        }

        if (forcedBanner) {
            const listWrap = forcedBanner.querySelector('.x-forced-home-list');
            if (listWrap && listWrap.children.length === 0 && forcedBanner.parentNode) {
                forcedBanner.parentNode.removeChild(forcedBanner);
            } else if (listWrap) {
                const titleSpan = forcedBanner.querySelector('.x-forced-home-title');
                if (titleSpan) {
                    titleSpan.textContent = `⚡ Forced to Your Timeline by Friends (${listWrap.children.length})`;
                }
            }
        }

        if (removedHeight > 0 && typeof window.scrollBy === 'function') {
            try {
                if (anchorCard && anchorCard.isConnected) {
                    const anchorTopAfter = anchorCard.getBoundingClientRect().top;
                    const drift = anchorTopAfter - anchorTopBefore;
                    if (Math.abs(drift) > 1) {
                        window.scrollBy(0, drift);
                    }
                } else {
                    window.scrollBy(0, -removedHeight);
                }
            } catch (e) {}
        }

        return true;
    }

    function removeSeenCardsScrolledPast() {
        const seenCards = document.querySelectorAll(
            '#x-friends-timeline-root article.x-friend-tweet-card.is-seen-by-me, #x-forced-home-feed article.x-friend-tweet-card.is-seen-by-me'
        );
        let removedCount = 0;
        seenCards.forEach(card => {
            const tid = card.getAttribute('data-tweet-id') || card.dataset?.xTweetId;
            if (tid && removeCardAfterScrollPast(tid, card)) {
                removedCount++;
            }
        });
        return removedCount;
    }

    function renderForcedPostsInHomeFeed(timelineContainer, unseenForcedPosts = [], callbacks = {}) {
        if (!timelineContainer) return null;

        let container = document.getElementById('x-forced-home-feed');
        const activeForcedPosts = Array.isArray(unseenForcedPosts)
            ? unseenForcedPosts.filter(p => p && !scrolledPastRemovedIds.has(p.tweetId))
            : [];

        if (activeForcedPosts.length === 0) {
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
            return null;
        }

        if (!container) {
            container = document.createElement('section');
            container.id = 'x-forced-home-feed';
            container.className = 'x-forced-home-feed';
        }

        if (timelineContainer.firstChild !== container) {
            timelineContainer.insertBefore(container, timelineContainer.firstChild);
        }

        container._xActiveForcedPosts = activeForcedPosts;
        container._xCallbacks = callbacks;

        let bannerHeader = container.querySelector('.x-forced-home-header');
        let listWrap = container.querySelector('.x-forced-home-list');

        if (!bannerHeader || !listWrap) {
            container.innerHTML = '';
            bannerHeader = document.createElement('div');
            bannerHeader.className = 'x-forced-home-header';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'x-forced-home-title';
            bannerHeader.appendChild(titleSpan);

            const dismissAllBtn = document.createElement('button');
            dismissAllBtn.type = 'button';
            dismissAllBtn.className = 'x-forced-dismiss-all-btn';
            dismissAllBtn.textContent = 'Dismiss All';
            dismissAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const currentPosts = container._xActiveForcedPosts || activeForcedPosts;
                const activeCbs = container._xCallbacks || callbacks;
                currentPosts.forEach(p => {
                    scrolledPastRemovedIds.add(p.tweetId);
                    if (typeof activeCbs.onDismissForced === 'function') {
                        activeCbs.onDismissForced(p.tweetId);
                    }
                });
                if (container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            });
            bannerHeader.appendChild(dismissAllBtn);
            container.appendChild(bannerHeader);

            listWrap = document.createElement('div');
            listWrap.className = 'x-forced-home-list';
            container.appendChild(listWrap);
        }

        const existingMap = new Map();
        listWrap.querySelectorAll('article.x-friend-tweet-card').forEach(c => {
            const tid = c.getAttribute('data-tweet-id');
            if (tid) existingMap.set(tid, c);
        });

        let hasNewCards = false;
        activeForcedPosts.forEach(postItem => {
            if (existingMap.has(postItem.tweetId)) {
                const existingCard = existingMap.get(postItem.tweetId);
                existingCard._xPostItem = postItem;
                return;
            }
            const card = createFriendTweetCard(postItem, {
                ...callbacks,
                isHomeInjection: true,
                onDismissForced: (tid, cardEl) => {
                    scrolledPastRemovedIds.add(tid);
                    if (cardEl && cardEl.parentNode) {
                        cardEl.parentNode.removeChild(cardEl);
                    }
                    if (listWrap.children.length === 0 && container.parentNode) {
                        container.parentNode.removeChild(container);
                    } else {
                        const titleEl = container.querySelector('.x-forced-home-title');
                        if (titleEl) {
                            titleEl.textContent = `⚡ Forced to Your Timeline by Friends (${listWrap.children.length})`;
                        }
                    }
                    if (typeof callbacks.onDismissForced === 'function') {
                        callbacks.onDismissForced(tid);
                    }
                }
            });
            listWrap.appendChild(card);
            hasNewCards = true;
        });

        const titleSpan = container.querySelector('.x-forced-home-title');
        if (titleSpan) {
            titleSpan.textContent = `⚡ Forced to Your Timeline by Friends (${listWrap.children.length})`;
        }

        if (hasNewCards) {
            requestHydrationForCards(listWrap, callbacks);
        }
        return container;
    }

    function ensureFriendsTimelineTab(tabListElem, timelineData = {}, callbacks = {}) {
        if (!tabListElem) return null;

        let tabWrapper = tabListElem.querySelector('.x-friends-tab-presentation');
        let tabLink = tabWrapper ? tabWrapper.querySelector('.x-friends-timeline-tab') : null;

        if (!tabWrapper || !tabLink) {
            const existingPresentations = Array.from(tabListElem.querySelectorAll(':scope > [role="presentation"]'));
            const samplePresentation = existingPresentations[0] || tabListElem.querySelector('[role="presentation"]');

            tabWrapper = document.createElement('div');
            tabWrapper.setAttribute('role', 'presentation');
            tabWrapper.className = samplePresentation && samplePresentation.className
                ? `${samplePresentation.className} x-friends-tab-presentation`
                : 'x-friends-tab-presentation';

            tabLink = document.createElement('div');
            tabLink.setAttribute('role', 'tab');
            tabLink.setAttribute('tabindex', '0');
            tabLink.setAttribute('data-testid', 'x-friends-tab');
            tabLink.setAttribute('aria-selected', isFriendsTabActive ? 'true' : 'false');
            tabLink.className = `x-friends-timeline-tab${isFriendsTabActive ? ' is-active' : ''}`;

            const innerWrap = document.createElement('div');
            innerWrap.className = 'x-friends-tab-inner';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'x-friends-tab-label';
            labelSpan.textContent = 'Friends';
            innerWrap.appendChild(labelSpan);

            const badgeSpan = document.createElement('span');
            badgeSpan.className = 'x-friends-tab-badge';
            badgeSpan.style.display = 'none';
            innerWrap.appendChild(badgeSpan);

            const indicator = document.createElement('div');
            indicator.className = 'x-friends-tab-indicator';
            innerWrap.appendChild(indicator);

            tabLink.appendChild(innerWrap);
            tabWrapper.appendChild(tabLink);

            // Insert right after "Following" (or after "For you") so it sits next to main tabs before pinned lists
            let inserted = false;
            const candidateTabs = existingPresentations.length > 0
                ? existingPresentations
                : Array.from(tabListElem.children);
            const followingNode = candidateTabs.find(el => (el.textContent || '').trim().toLowerCase() === 'following');
            const forYouNode = candidateTabs.find(el => (el.textContent || '').trim().toLowerCase() === 'for you');
            const anchorNode = followingNode || forYouNode;

            if (anchorNode && anchorNode.parentNode === tabListElem) {
                if (anchorNode.nextSibling) {
                    tabListElem.insertBefore(tabWrapper, anchorNode.nextSibling);
                } else {
                    tabListElem.appendChild(tabWrapper);
                }
                inserted = true;
            }
            if (!inserted) {
                tabListElem.appendChild(tabWrapper);
            }

            tabLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                isFriendsTabActive = true;
                tabLink.classList.add('is-active');
                tabLink.setAttribute('aria-selected', 'true');
                tabListElem.classList.add('x-friends-tab-selected');
                const activeCbs = tabLink._xFriendsCallbacks || callbacks;
                if (activeCbs && typeof activeCbs.onSelectFriendsTab === 'function') {
                    activeCbs.onSelectFriendsTab(true);
                }
                evaluateVideoAutoplay();
            });

            if (!tabListElem._xNativeTabListenerAttached) {
                tabListElem._xNativeTabListenerAttached = true;
                tabListElem.addEventListener('click', (e) => {
                    const clickedTab = e.target && e.target.closest ? e.target.closest('[role="tab"]') : null;
                    if (clickedTab && !clickedTab.classList.contains('x-friends-timeline-tab')) {
                        if (isFriendsTabActive) {
                            isFriendsTabActive = false;
                            const myTab = tabListElem.querySelector('.x-friends-timeline-tab');
                            if (myTab) {
                                myTab.classList.remove('is-active');
                                myTab.setAttribute('aria-selected', 'false');
                            }
                            tabListElem.classList.remove('x-friends-tab-selected');
                            evaluateVideoAutoplay();
                            const activeCbs = (myTab && myTab._xFriendsCallbacks) || callbacks;
                            if (activeCbs && typeof activeCbs.onSelectFriendsTab === 'function') {
                                activeCbs.onSelectFriendsTab(false);
                            }
                        }
                    }
                }, true);
            }

            if (typeof document !== 'undefined') {
                if (document._xFriendsHomeBtnHandler) {
                    document.removeEventListener('click', document._xFriendsHomeBtnHandler, true);
                }
                document._xFriendsHomeBtnHandler = (e) => {
                    if (!isFriendsTabActive) return;
                    const homeLink = e.target && e.target.closest
                        ? e.target.closest('a[data-testid="AppTabBar_Home_Link"], a[href="/home"][aria-label="Home"], a[href="/home"][role="link"]')
                        : null;
                    if (!homeLink || homeLink.classList.contains('x-friends-timeline-tab') || homeLink.closest('[role="tablist"]')) {
                        return;
                    }

                    isFriendsTabActive = false;
                    const currentTabList = document.querySelector('[role="tablist"]');
                    const myTab = currentTabList
                        ? currentTabList.querySelector('.x-friends-timeline-tab')
                        : document.querySelector('.x-friends-timeline-tab');
                    if (myTab) {
                        myTab.classList.remove('is-active');
                        myTab.setAttribute('aria-selected', 'false');
                    }
                    if (currentTabList) {
                        currentTabList.classList.remove('x-friends-tab-selected');
                        const forYouTab = Array.from(currentTabList.querySelectorAll('[role="tab"]')).find(
                            el => !el.classList.contains('x-friends-timeline-tab') && (el.textContent || '').trim().toLowerCase() === 'for you'
                        );
                        if (forYouTab && forYouTab.getAttribute('aria-selected') !== 'true') {
                            forYouTab.click();
                        }
                    }
                    evaluateVideoAutoplay();
                    const activeCbs = (myTab && myTab._xFriendsCallbacks) || callbacks;
                    if (activeCbs && typeof activeCbs.onSelectFriendsTab === 'function') {
                        activeCbs.onSelectFriendsTab(false);
                    }
                };
                document.addEventListener('click', document._xFriendsHomeBtnHandler, true);
            }
        }

        tabLink._xFriendsCallbacks = callbacks;

        // Update badge count (unseen forced posts count)
        const badgeSpan = tabLink.querySelector('.x-friends-tab-badge');
        const unseenForcedCount = Array.isArray(timelineData.unseenForcedPosts)
            ? timelineData.unseenForcedPosts.filter(p => p && !p.isSeenByMe && !scrolledPastRemovedIds.has(p.tweetId)).length
            : 0;
        if (badgeSpan) {
            if (unseenForcedCount > 0) {
                badgeSpan.textContent = String(unseenForcedCount);
                badgeSpan.style.display = 'inline-flex';
                badgeSpan.title = `${unseenForcedCount} forced post(s) from friends`;
            } else {
                badgeSpan.style.display = 'none';
            }
        }

        return tabLink;
    }

    function renderFriendsTimeline(hostContainer, timelineData = {}, callbacks = {}) {
        if (!hostContainer) return null;

        let root = document.getElementById('x-friends-timeline-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'x-friends-timeline-root';
            root.className = 'x-friends-timeline-root';
            sessionVisibleTweetIds.clear();
            scrolledPastRemovedIds.clear();
            hostContainer.appendChild(root);
        } else if (root.parentNode !== hostContainer) {
            hostContainer.appendChild(root);
        }

        root._xHostContainer = hostContainer;
        root._xTimelineData = timelineData;
        root._xTimelineCallbacks = callbacks;

        const allPosts = Array.isArray(timelineData.timelinePosts) ? timelineData.timelinePosts : [];
        const connectedFriends = Array.isArray(timelineData.connectedFriends) ? timelineData.connectedFriends : [];

        const forcedCount = allPosts.filter(p => p.isForced).length;
        const unseenCount = allPosts.filter(p => !p.isSeenByMe).length;

        // 1. Ensure persistent toolbar & list containers exist (never wipe root.innerHTML on updates)
        let toolbar = root.querySelector('.x-friends-timeline-toolbar');
        let listContainer = root.querySelector('.x-friends-timeline-list');

        if (!toolbar || !listContainer) {
            if (infiniteScrollObserver) {
                infiniteScrollObserver.disconnect();
            }
            root.innerHTML = '';

            toolbar = document.createElement('div');
            toolbar.className = 'x-friends-timeline-toolbar';

            const filtersGroup = document.createElement('div');
            filtersGroup.className = 'x-friends-filter-pills';

            const filterIds = ['all', 'forced', 'unseen'];
            filterIds.forEach(fid => {
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className = `x-friends-filter-pill${currentTimelineFilter === fid ? ' is-active' : ''}`;
                pill.setAttribute('data-filter', fid);
                pill.addEventListener('click', () => {
                    currentTimelineFilter = fid;
                    currentVisibleLimit = TIMELINE_PAGE_SIZE;
                    sessionVisibleTweetIds.clear();
                    scrolledPastRemovedIds.clear();
                    root._xNeedsListReset = true;
                    renderFriendsTimeline(
                        root._xHostContainer || hostContainer,
                        root._xTimelineData || timelineData,
                        root._xTimelineCallbacks || callbacks
                    );
                });
                filtersGroup.appendChild(pill);
            });
            toolbar.appendChild(filtersGroup);

            const rightControls = document.createElement('div');
            rightControls.className = 'x-friends-toolbar-right';

            const syncBtn = document.createElement('button');
            syncBtn.type = 'button';
            syncBtn.className = 'x-friends-sync-btn';
            syncBtn.textContent = '↻ Sync Relays';
            syncBtn.addEventListener('click', () => {
                syncBtn.textContent = '↻ Syncing...';
                syncBtn.disabled = true;
                sessionVisibleTweetIds.clear();
                scrolledPastRemovedIds.clear();
                root._xNeedsListReset = true;
                const activeCbs = root._xTimelineCallbacks || callbacks;
                if (activeCbs && typeof activeCbs.onSyncNow === 'function') {
                    activeCbs.onSyncNow(() => {
                        syncBtn.textContent = '↻ Sync Relays';
                        syncBtn.disabled = false;
                    });
                }
            });
            rightControls.appendChild(syncBtn);
            toolbar.appendChild(rightControls);
            root.appendChild(toolbar);

            listContainer = document.createElement('div');
            listContainer.className = 'x-friends-timeline-list';
            root.appendChild(listContainer);
        }

        // Update filter pills in-place without recreating DOM nodes
        const filterLabels = {
            all: `All (${allPosts.length})`,
            forced: `⚡ Forced (${forcedCount})`,
            unseen: `Unseen (${unseenCount})`
        };
        toolbar.querySelectorAll('.x-friends-filter-pill').forEach(pill => {
            const fid = pill.getAttribute('data-filter');
            if (fid && filterLabels[fid]) {
                if (pill.textContent !== filterLabels[fid]) {
                    pill.textContent = filterLabels[fid];
                }
                pill.classList.toggle('is-active', currentTimelineFilter === fid);
            }
        });

        // Update friend selector dropdown only when friend list changes
        const rightControls = toolbar.querySelector('.x-friends-toolbar-right');
        const friendsSig = connectedFriends.map(f => `${f.label}:${f.displayName || f.email}`).join('|');
        let friendSelect = rightControls ? rightControls.querySelector('.x-friends-friend-select') : null;
        if (connectedFriends.length > 0 && rightControls) {
            if (!friendSelect || friendSelect._xFriendsSig !== friendsSig) {
                if (friendSelect && friendSelect.parentNode) {
                    friendSelect.parentNode.removeChild(friendSelect);
                }
                friendSelect = document.createElement('select');
                friendSelect.className = 'x-friends-friend-select';
                friendSelect._xFriendsSig = friendsSig;

                const allOpt = document.createElement('option');
                allOpt.value = '';
                allOpt.textContent = 'All Friends';
                friendSelect.appendChild(allOpt);

                connectedFriends.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.label;
                    opt.textContent = f.displayName || f.email;
                    if (currentFriendFilter === f.label) opt.selected = true;
                    friendSelect.appendChild(opt);
                });

                friendSelect.addEventListener('change', () => {
                    currentFriendFilter = friendSelect.value;
                    currentVisibleLimit = TIMELINE_PAGE_SIZE;
                    sessionVisibleTweetIds.clear();
                    scrolledPastRemovedIds.clear();
                    root._xNeedsListReset = true;
                    renderFriendsTimeline(
                        root._xHostContainer || hostContainer,
                        root._xTimelineData || timelineData,
                        root._xTimelineCallbacks || callbacks
                    );
                });
                rightControls.insertBefore(friendSelect, rightControls.firstChild);
            } else if (friendSelect.value !== currentFriendFilter) {
                friendSelect.value = currentFriendFilter;
            }
        } else if (friendSelect && friendSelect.parentNode) {
            friendSelect.parentNode.removeChild(friendSelect);
        }

        // 2. Compute matching posts and slice BEFORE filtering out scrolledPastRemovedIds
        // so removing a scrolled-past card at the top never shifts the pagination window mid-scroll.
        const matchingPosts = allPosts.filter(p => {
            if (!p || !p.tweetId) return false;
            if (currentTimelineFilter === 'forced' && !p.isForced) return false;
            if (currentTimelineFilter === 'unseen' && p.isSeenByMe && !sessionVisibleTweetIds.has(p.tweetId)) return false;
            if (currentFriendFilter) {
                const inSeen = Array.isArray(p.seenBy) && p.seenBy.includes(currentFriendFilter);
                const inForced = Array.isArray(p.forcedBy) && p.forcedBy.includes(currentFriendFilter);
                if (!inSeen && !inForced) return false;
            }
            return true;
        });

        const pageSlice = matchingPosts.slice(0, currentVisibleLimit);
        const visiblePosts = pageSlice.filter(p => !scrolledPastRemovedIds.has(p.tweetId));
        visiblePosts.forEach(p => {
            if (p && p.tweetId) {
                sessionVisibleTweetIds.add(p.tweetId);
            }
        });

        // 3. Incrementally reconcile listContainer (only reset when user explicitly changes filters)
        if (root._xNeedsListReset) {
            listContainer.innerHTML = '';
            root._xNeedsListReset = false;
        }

        const existingCardMap = new Map();
        listContainer.querySelectorAll('article.x-friend-tweet-card').forEach(c => {
            const tid = c.getAttribute('data-tweet-id');
            if (tid) existingCardMap.set(tid, c);
        });

        if (visiblePosts.length === 0 && existingCardMap.size === 0) {
            let emptyDiv = listContainer.querySelector('.x-friends-timeline-empty');
            const emptyMsg = allPosts.length === 0
                ? 'No posts from friends yet. As your connected friends view or force posts on X, they will appear here!'
                : 'No posts match the selected filter.';
            if (!emptyDiv) {
                emptyDiv = document.createElement('div');
                emptyDiv.className = 'x-friends-timeline-empty';
                listContainer.appendChild(emptyDiv);
            }
            if (emptyDiv.textContent !== emptyMsg) {
                emptyDiv.textContent = emptyMsg;
            }
        } else {
            const emptyDiv = listContainer.querySelector('.x-friends-timeline-empty');
            if (emptyDiv && emptyDiv.parentNode) {
                emptyDiv.parentNode.removeChild(emptyDiv);
            }

            let hasNewCards = false;
            visiblePosts.forEach(postItem => {
                if (existingCardMap.has(postItem.tweetId)) {
                    const existingCard = existingCardMap.get(postItem.tweetId);
                    existingCard._xPostItem = postItem;
                    existingCard._xCallbacks = callbacks;
                    return;
                }
                const card = createFriendTweetCard(postItem, callbacks);
                listContainer.appendChild(card);
                hasNewCards = true;
            });

            if (hasNewCards) {
                requestHydrationForCards(listContainer, callbacks);
            }
        }

        // 4. Update or create Infinite Scroll / Load More sentinel in-place
        const remainingCount = Math.max(0, matchingPosts.length - pageSlice.length);
        let loadMoreWrap = root.querySelector('.x-friends-load-more-wrap');

        if (remainingCount > 0) {
            const labelText = `Show more posts (${remainingCount} remaining)`;
            if (!loadMoreWrap) {
                loadMoreWrap = document.createElement('div');
                loadMoreWrap.className = 'x-friends-load-more-wrap';

                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.type = 'button';
                loadMoreBtn.className = 'x-friends-load-more-btn';
                loadMoreBtn.textContent = labelText;

                const loadNextPage = () => {
                    currentVisibleLimit += TIMELINE_PAGE_SIZE;
                    const activeCbs = root._xTimelineCallbacks || callbacks;
                    renderFriendsTimeline(
                        root._xHostContainer || hostContainer,
                        root._xTimelineData || timelineData,
                        activeCbs
                    );
                    if (activeCbs && typeof activeCbs.onPageAppended === 'function') {
                        activeCbs.onPageAppended();
                    }
                };

                loadMoreBtn.addEventListener('click', loadNextPage);
                loadMoreWrap.appendChild(loadMoreBtn);
                root.appendChild(loadMoreWrap);

                if (infiniteScrollObserver) {
                    infiniteScrollObserver.disconnect();
                }
                if (typeof IntersectionObserver !== 'undefined') {
                    infiniteScrollObserver = new IntersectionObserver((entries) => {
                        if (entries.some(e => e.isIntersecting)) {
                            loadNextPage();
                        }
                    }, { rootMargin: '300px' });
                    infiniteScrollObserver.observe(loadMoreWrap);
                }
            } else {
                const loadMoreBtn = loadMoreWrap.querySelector('.x-friends-load-more-btn');
                if (loadMoreBtn && loadMoreBtn.textContent !== labelText) {
                    loadMoreBtn.textContent = labelText;
                }
            }
        } else if (loadMoreWrap) {
            if (infiniteScrollObserver) {
                infiniteScrollObserver.disconnect();
            }
            if (loadMoreWrap.parentNode) {
                loadMoreWrap.parentNode.removeChild(loadMoreWrap);
            }
        }

        evaluateVideoAutoplay();
        return root;
    }

    function isFriendsTimelineTabSelected() {
        return isFriendsTabActive;
    }

    function setFriendsTimelineTabSelected(active) {
        isFriendsTabActive = Boolean(active);
        if (typeof document !== 'undefined') {
            const currentTabList = document.querySelector('[role="tablist"]');
            const myTab = currentTabList
                ? currentTabList.querySelector('.x-friends-timeline-tab')
                : document.querySelector('.x-friends-timeline-tab');
            if (myTab) {
                myTab.classList.toggle('is-active', isFriendsTabActive);
                myTab.setAttribute('aria-selected', isFriendsTabActive ? 'true' : 'false');
            }
            if (currentTabList) {
                currentTabList.classList.toggle('x-friends-tab-selected', isFriendsTabActive);
            }
        }
        evaluateVideoAutoplay();
    }

    function createFilteredIconSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
        return svg;
    }

    function filterTweet(tweet, filterInfo = {}) {
        if (!tweet) return null;

        const currentKey = filterInfo.tweetId || filterInfo.screenName || 'revealed';
        if (tweet.dataset && tweet.dataset.xFilterRevealed === currentKey) {
            return null;
        }

        if (tweet._xFilteredPlaceholder && tweet._xFilteredPlaceholder.isConnected) {
            tweet.style.display = 'none';
            tweet.classList.add('x-tweet-blocked');
            return tweet._xFilteredPlaceholder;
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'x-tweet-filtered-placeholder';
        placeholder.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        const contentDiv = document.createElement('div');
        contentDiv.className = 'x-tweet-filtered-content';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'x-tweet-filtered-icon';
        iconSpan.appendChild(createFilteredIconSVG());
        contentDiv.appendChild(iconSpan);

        const textSpan = document.createElement('span');
        textSpan.className = 'x-tweet-filtered-text';
        textSpan.textContent = 'Tweet filtered';
        contentDiv.appendChild(textSpan);

        const detailParts = [];
        if (filterInfo.screenName) {
            detailParts.push(`@${filterInfo.screenName}`);
        }
        if (filterInfo.reason) {
            detailParts.push(filterInfo.reason);
        } else if (filterInfo.location || filterInfo.device) {
            detailParts.push([filterInfo.location, filterInfo.device].filter(Boolean).join(' • '));
        }

        if (detailParts.length > 0) {
            const detailSpan = document.createElement('span');
            detailSpan.className = 'x-tweet-filtered-detail';
            detailSpan.textContent = `(${detailParts.join(' • ')})`;
            contentDiv.appendChild(detailSpan);
        }

        const showBtn = document.createElement('button');
        showBtn.type = 'button';
        showBtn.className = 'x-tweet-filtered-show-btn';
        showBtn.textContent = 'Show';

        showBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (tweet.dataset) {
                tweet.dataset.xFilterRevealed = currentKey;
            }
            unfilterTweet(tweet);
        });

        placeholder.appendChild(contentDiv);
        placeholder.appendChild(showBtn);

        const videos = tweet.querySelectorAll ? tweet.querySelectorAll('video') : [];
        videos.forEach(v => {
            try {
                if (typeof v.pause === 'function') v.pause();
            } catch (err) {}
        });

        tweet.style.display = 'none';
        tweet.classList.add('x-tweet-blocked');

        if (tweet.parentNode) {
            tweet.parentNode.insertBefore(placeholder, tweet);
        } else {
            tweet.appendChild(placeholder);
        }
        tweet._xFilteredPlaceholder = placeholder;

        return placeholder;
    }

    function unfilterTweet(tweet) {
        if (!tweet) return;
        const placeholder = tweet._xFilteredPlaceholder ||
            (tweet.previousElementSibling && tweet.previousElementSibling.classList &&
             tweet.previousElementSibling.classList.contains('x-tweet-filtered-placeholder')
                ? tweet.previousElementSibling
                : null);

        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder);
        }
        tweet._xFilteredPlaceholder = null;
        tweet.style.display = '';
        tweet.classList.remove('x-tweet-blocked');
    }

    window.XLocationUI = {
        renderInlineBadge,
        renderFriendSeenBadge,
        renderForceTweetButton,
        renderForcedPostsInHomeFeed,
        ensureFriendsTimelineTab,
        renderFriendsTimeline,
        createFriendTweetCard,
        updateHydratedCardsInDOM,
        markCardSeenInDOM,
        removeCardAfterScrollPast,
        removeSeenCardsScrolledPast,
        isFriendsTimelineTabSelected,
        setFriendsTimelineTabSelected,
        evaluateVideoAutoplay,
        showToast,
        showHovercard,
        hideHovercard,
        filterTweet,
        unfilterTweet
    };
})();
