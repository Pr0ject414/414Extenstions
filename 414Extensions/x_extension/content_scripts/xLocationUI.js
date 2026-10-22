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
        if (dLower.includes('iphone') || dLower.includes('ipad') || dLower.includes('mac') || dLower.includes('ios')) {
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

        // 1. Look for @handle link
        const links = Array.from(container.querySelectorAll('a'));
        const handleLink = links.find(l => l.textContent.trim().toLowerCase() === `@${screenName.toLowerCase()}`);
        if (handleLink) {
            const parent = handleLink.parentNode;
            if (parent && parent.parentNode) {
                return { target: parent.parentNode, ref: parent.nextSibling };
            }
            return { target: parent, ref: null };
        }

        // 2. Look for name link
        const nameLink = container.querySelector(`a[href="/${screenName}"]`);
        if (nameLink) {
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

    function renderFriendSeenBadge(containerElem, screenName, seenByFriends) {
        if (!containerElem || !Array.isArray(seenByFriends) || seenByFriends.length === 0) return;

        const badge = getOrCreateInlineBadge(containerElem, screenName);
        let seenSpan = badge.querySelector('.x-friend-seen-badge');
        if (!seenSpan) {
            seenSpan = document.createElement('span');
            seenSpan.className = 'x-friend-seen-badge';
            seenSpan.appendChild(createSeenCheckSVG());
            badge.appendChild(seenSpan);
        }

        const listStr = seenByFriends.join(', ');
        seenSpan.title = `Seen by: ${listStr}`;
        seenSpan.setAttribute('data-seen-by', listStr);
        seenSpan.setAttribute('aria-label', `Seen by ${listStr}`);
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
        showHovercard,
        hideHovercard,
        filterTweet,
        unfilterTweet
    };
})();
