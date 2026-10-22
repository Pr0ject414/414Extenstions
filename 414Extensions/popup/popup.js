// KylesChromeExtensions/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Global Elements ---
    const globalMasterSwitchToggle = document.getElementById('globalMasterSwitchToggle');
    const openOptionsPageLink = document.getElementById('openOptionsPageLink');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // --- Volume Control Elements ---
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValueDisplay = document.getElementById('volumeValueDisplay');
    const volumeResetBtn = document.getElementById('volumeResetBtn');
    
    // --- VSC Elements ---
    const vscPowerToggle = document.getElementById('vscPowerToggle');
    const vscPopupKeySpeed = document.getElementById('vscPopupKeySpeed');
    const vscSaveSpeedBtn = document.getElementById('vscSaveSpeedBtn');
    const vscAddBlacklistBtn = document.getElementById('vscAddBlacklistBtn');
    const vscPopupStatus = document.getElementById('vscPopupStatus');
    const vscGlobalDefaultDisplay = document.getElementById('vscGlobalDefaultDisplay');
    const vscSetCurrentAsGlobalBtn = document.getElementById('vscSetCurrentAsGlobalBtn');
    
    // --- Visibility Toggle Elements ---
    const visibilityVolumeToggle = document.getElementById('visibilityVolumeToggle');
    const visibilityVscToggle = document.getElementById('visibilityVscToggle');
    const visibilityFabToggle = document.getElementById('visibilityFabToggle');
    const visibilityYouTubeToggle = document.getElementById('visibilityYouTubeToggle');
    const visibilityXToggle = document.getElementById('visibilityXToggle');
    const visibilityCrunchyrollToggle = document.getElementById('visibilityCrunchyrollToggle');

    // --- X Module Elements ---
    const xModulePowerToggle = document.getElementById('xModulePowerToggle');
    const xAlwaysMuteToggle = document.getElementById('xAlwaysMuteToggle');

    // --- Global Storage Keys ---
    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const VOLUME_MODULE_VISIBLE_KEY = 'isVolumeModuleVisible';
    const VSC_MODULE_VISIBLE_KEY = 'isVscModuleVisible';
    const FAB_MODULE_VISIBLE_KEY = 'isFabModuleVisible';
    const YOUTUBE_MODULE_VISIBLE_KEY = 'isYouTubeModuleVisible';
    const X_MODULE_VISIBLE_KEY = 'isXModuleVisible';
    const CRUNCHYROLL_MODULE_VISIBLE_KEY = 'isCrunchyrollModuleVisible';
    const X_MODULE_ENABLED_KEY = 'isXModuleEnabled';
    const X_ALWAYS_MUTE_KEY = 'isXAlwaysMuteEnabled';

    // --- Load Global State ---
    chrome.storage.local.get([
        GLOBAL_MASTER_SWITCH_ENABLED_KEY,
        VOLUME_MODULE_VISIBLE_KEY,
        VSC_MODULE_VISIBLE_KEY,
        FAB_MODULE_VISIBLE_KEY,
        YOUTUBE_MODULE_VISIBLE_KEY,
        X_MODULE_VISIBLE_KEY,
        CRUNCHYROLL_MODULE_VISIBLE_KEY,
        X_MODULE_ENABLED_KEY,
        X_ALWAYS_MUTE_KEY
    ], (result) => {
        globalMasterSwitchToggle.checked = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
        
        if (visibilityVolumeToggle) visibilityVolumeToggle.checked = result[VOLUME_MODULE_VISIBLE_KEY] !== false;
        if (visibilityVscToggle) visibilityVscToggle.checked = result[VSC_MODULE_VISIBLE_KEY] !== false;
        if (visibilityFabToggle) visibilityFabToggle.checked = result[FAB_MODULE_VISIBLE_KEY] !== false;
        if (visibilityYouTubeToggle) visibilityYouTubeToggle.checked = result[YOUTUBE_MODULE_VISIBLE_KEY] !== false;
        if (visibilityXToggle) visibilityXToggle.checked = result[X_MODULE_VISIBLE_KEY] !== false;
        if (visibilityCrunchyrollToggle) visibilityCrunchyrollToggle.checked = result[CRUNCHYROLL_MODULE_VISIBLE_KEY] !== false;

        if (xModulePowerToggle) xModulePowerToggle.checked = result[X_MODULE_ENABLED_KEY] !== false;
        if (xAlwaysMuteToggle) xAlwaysMuteToggle.checked = result[X_ALWAYS_MUTE_KEY] !== false;

        const xLocationToggle = document.getElementById('xLocationToggle');
        const xCachedCountDisplay = document.getElementById('xCachedCountDisplay');
        const xClearCacheBtn = document.getElementById('xClearCacheBtn');

        if (xLocationToggle) {
            chrome.storage.local.get(['isXLocationEnabled'], (res) => {
                xLocationToggle.checked = res.isXLocationEnabled !== false;
            });
            xLocationToggle.addEventListener('change', () => {
                chrome.storage.local.set({ isXLocationEnabled: xLocationToggle.checked });
            });
        }

        if (xCachedCountDisplay) {
            chrome.runtime.sendMessage({ action: 'X_GET_LOCATION_STATS' }, (res) => {
                if (chrome.runtime.lastError) return;
                if (res && res.success && res.stats) {
                    xCachedCountDisplay.textContent = res.stats.totalCached || 0;
                }
            });
        }

        if (xClearCacheBtn) {
            xClearCacheBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'X_CLEAR_LOCATION_CACHE' }, (res) => {
                    if (chrome.runtime.lastError) return;
                    if (res && res.success) {
                        if (xCachedCountDisplay) xCachedCountDisplay.textContent = '0';
                    }
                });
            });
        }

        const COUNTRY_FLAGS_MAP = {
            'Afghanistan': '🇦🇫', 'Albania': '🇦🇱', 'Algeria': '🇩🇿', 'Andorra': '🇦🇩', 'Angola': '🇦🇴',
            'Argentina': '🇦🇷', 'Armenia': '🇦🇲', 'Australia': '🇦🇺', 'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿',
            'Bahamas': '🇧🇸', 'Bahrain': '🇧🇭', 'Bangladesh': '🇧🇩', 'Barbados': '🇧🇧', 'Belarus': '🇧🇾',
            'Belgium': '🇧🇪', 'Belize': '🇧🇿', 'Benin': '🇧🇯', 'Bhutan': '🇧🇹', 'Bolivia': '🇧🇴',
            'Bosnia and Herzegovina': '🇧🇦', 'Botswana': '🇧🇼', 'Brazil': '🇧🇷', 'Brunei': '🇧🇳',
            'Bulgaria': '🇧🇬', 'Burkina Faso': '🇧🇫', 'Burundi': '🇧🇮', 'Cambodia': '🇰🇭', 'Cameroon': '🇨🇲',
            'Canada': '🇨🇦', 'Chile': '🇨🇱', 'China': '🇨🇳', 'Colombia': '🇨🇴', 'Costa Rica': '🇨🇷',
            'Croatia': '🇭🇷', 'Cuba': '🇨🇺', 'Cyprus': '🇨🇾', 'Czech Republic': '🇨🇿', 'Denmark': '🇩🇰',
            'Dominican Republic': '🇩🇴', 'Ecuador': '🇪🇨', 'Egypt': '🇪🇬', 'El Salvador': '🇸🇻',
            'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Estonia': '🇪🇪', 'Ethiopia': '🇪🇹', 'Finland': '🇫🇮', 'France': '🇫🇷',
            'Georgia': '🇬🇪', 'Germany': '🇩🇪', 'Ghana': '🇬🇭', 'Greece': '🇬🇷', 'Guatemala': '🇬🇹',
            'Haiti': '🇭🇹', 'Honduras': '🇭🇳', 'Hong Kong': '🇭🇰', 'Hungary': '🇭🇺', 'Iceland': '🇮🇸',
            'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Iran': '🇮🇷', 'Iraq': '🇮🇶', 'Ireland': '🇮🇪',
            'Israel': '🇮🇱', 'Italy': '🇮🇹', 'Jamaica': '🇯🇲', 'Japan': '🇯🇵', 'Jordan': '🇯🇴',
            'Kazakhstan': '🇰🇿', 'Kenya': '🇰🇪', 'Kuwait': '🇰🇼', 'Latvia': '🇱🇻', 'Lebanon': '🇱🇧',
            'Lithuania': '🇱🇹', 'Luxembourg': '🇱🇺', 'Malaysia': '🇲🇾', 'Maldives': '🇲🇻', 'Malta': '🇲🇹',
            'Mexico': '🇲🇽', 'Moldova': '🇲🇩', 'Monaco': '🇲🇨', 'Mongolia': '🇲🇳', 'Montenegro': '🇲🇪',
            'Morocco': '🇲🇦', 'Nepal': '🇳🇵', 'Netherlands': '🇳🇱', 'New Zealand': '🇳🇿', 'Nicaragua': '🇳🇮',
            'Nigeria': '🇳🇬', 'North Korea': '🇰🇵', 'Norway': '🇳🇴', 'Oman': '🇴🇲', 'Pakistan': '🇵🇰',
            'Palestine': '🇵🇸', 'Panama': '🇵🇦', 'Paraguay': '🇵🇾', 'Peru': '🇵🇪', 'Philippines': '🇵🇭',
            'Poland': '🇵🇱', 'Portugal': '🇵🇹', 'Puerto Rico': '🇵🇷', 'Qatar': '🇶🇦', 'Romania': '🇷🇴',
            'Russia': '🇷🇺', 'Saudi Arabia': '🇸🇦', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Senegal': '🇸🇳', 'Serbia': '🇷🇸',
            'Singapore': '🇸🇬', 'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷',
            'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰', 'Sudan': '🇸🇩', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭',
            'Syria': '🇸🇾', 'Taiwan': '🇹🇼', 'Thailand': '🇹🇭', 'Tunisia': '🇹🇳', 'Turkey': '🇹🇷',
            'Uganda': '🇺🇬', 'Ukraine': '🇺🇦', 'United Arab Emirates': '🇦🇪', 'United Kingdom': '🇬🇧',
            'United States': '🇺🇸', 'Uruguay': '🇺🇾', 'Uzbekistan': '🇺🇿', 'Venezuela': '🇻🇪',
            'Vietnam': '🇻🇳', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Yemen': '🇾🇪', 'Zimbabwe': '🇿🇼'
        };

        const DEVICE_REGION_MAP = {
            // Regions
            'Africa': '🌍',
            'Australasia': '🌏',
            'Central America': '🌎',
            'Central Asia': '🌏',
            'East Asia': '🌏',
            'East Asia & Pacific': '🌏',
            'Eastern Europe': '🌍',
            'Europe': '🌍',
            'Latin America': '🌎',
            'Middle East': '🌍',
            'North Africa': '🌍',
            'North America': '🌎',
            'Oceania': '🌏',
            'South America': '🌎',
            'South Asia': '🌏',
            'Southeast Asia': '🌏',
            'West Asia': '🌍',
            'Western Europe': '🌍',
            // Device Stores & Platforms
            'App Store': '🍎',
            'Google Play': '🤖',
            'Android': '🤖',
            'Android App': '🤖',
            'iPhone': '🍎',
            'iPad': '🍎',
            'iOS': '🍎',
            'Mac': '🍎',
            'Web': '🌐',
            'X for Web': '🌐',
            // Regional Stores
            'Africa App Store': '🌍',
            'Africa Android App': '🌍',
            'Australasia App Store': '🌏',
            'Australasia Android App': '🌏',
            'East Asia & Pacific App Store': '🌏',
            'East Asia & Pacific Android App': '🌏',
            'Europe App Store': '🌍',
            'Europe Android App': '🌍',
            'Middle East App Store': '🌍',
            'Middle East Android App': '🌍',
            'North Africa App Store': '🌍',
            'North Africa Android App': '🌍',
            'North America App Store': '🌎',
            'North America Android App': '🌎',
            'South America App Store': '🌎',
            'South America Android App': '🌎',
            'South Asia App Store': '🌏',
            'South Asia Android App': '🌏',
            'Southeast Asia App Store': '🌏',
            'Southeast Asia Android App': '🌏',
            'West Asia App Store': '🌍',
            'West Asia Android App': '🌍'
        };

        function setupFilterableBlockSection({
            searchInput,
            selectEl,
            addBtn,
            chipsContainer,
            itemsMap,
            storageKey,
            placeholderText,
            emptyChipsText,
            defaultIcon
        }) {
            if (!selectEl || !chipsContainer) return;

            const sortedNames = Object.keys(itemsMap).sort();
            let currentBlocked = [];

            function populateSelectOptions(filterText = '') {
                const rawTrimmed = (filterText || '').trim();
                const query = rawTrimmed.toLowerCase();

                selectEl.innerHTML = '';
                const placeholderOpt = document.createElement('option');
                placeholderOpt.value = '';
                placeholderOpt.textContent = placeholderText;
                selectEl.appendChild(placeholderOpt);

                const matchingNames = sortedNames.filter(name =>
                    !query || name.toLowerCase().includes(query)
                );

                matchingNames.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = `${itemsMap[name]} ${name}`;
                    selectEl.appendChild(opt);
                });

                const hasExactMatch = matchingNames.some(
                    name => name.toLowerCase() === query
                );

                if (query && !hasExactMatch) {
                    const customOpt = document.createElement('option');
                    customOpt.value = rawTrimmed;
                    customOpt.textContent = `${defaultIcon} ${rawTrimmed} (Custom)`;
                    selectEl.appendChild(customOpt);
                }

                if (query) {
                    const exactMatch = matchingNames.find(n => n.toLowerCase() === query);
                    const startsWithMatch = matchingNames.find(n => n.toLowerCase().startsWith(query));
                    if (exactMatch) {
                        selectEl.value = exactMatch;
                    } else if (startsWithMatch) {
                        selectEl.value = startsWithMatch;
                    } else if (matchingNames.length > 0) {
                        selectEl.value = matchingNames[0];
                    } else {
                        selectEl.value = rawTrimmed;
                    }
                } else {
                    selectEl.value = '';
                }
            }

            function renderBlockedChips() {
                chipsContainer.innerHTML = '';
                if (currentBlocked.length === 0) {
                    chipsContainer.innerHTML = `<span style="font-size: 0.8em; color: #888;">${emptyChipsText}</span>`;
                    return;
                }

                currentBlocked.forEach(item => {
                    const chip = document.createElement('span');
                    chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; background: rgba(211,47,47,0.25); border: 1px solid rgba(211,47,47,0.5); border-radius: 12px; padding: 2px 8px; font-size: 0.8em; color: #ff8a80;';
                    const icon = itemsMap[item] || defaultIcon;
                    chip.innerHTML = `${icon} ${item} <span class="chip-remove" style="cursor: pointer; font-weight: bold; margin-left: 4px; color: #fff;">&times;</span>`;

                    chip.querySelector('.chip-remove').addEventListener('click', () => {
                        currentBlocked = currentBlocked.filter(c => c !== item);
                        chrome.storage.local.set({ [storageKey]: currentBlocked }, () => {
                            renderBlockedChips();
                        });
                    });

                    chipsContainer.appendChild(chip);
                });
            }

            function handleAddSelected() {
                const selected = selectEl.value || (searchInput ? searchInput.value.trim() : '');
                if (!selected) return;

                const alreadyExists = currentBlocked.some(
                    existing => existing.toLowerCase() === selected.toLowerCase()
                );
                if (!alreadyExists) {
                    currentBlocked.push(selected);
                    chrome.storage.local.set({ [storageKey]: currentBlocked }, () => {
                        renderBlockedChips();
                        if (searchInput) searchInput.value = '';
                        populateSelectOptions('');
                    });
                } else {
                    if (searchInput) searchInput.value = '';
                    populateSelectOptions('');
                }
            }

            populateSelectOptions('');

            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    populateSelectOptions(searchInput.value);
                });
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSelected();
                    }
                });
            }

            chrome.storage.local.get([storageKey], (res) => {
                currentBlocked = (res && Array.isArray(res[storageKey])) ? res[storageKey] : [];
                renderBlockedChips();
            });

            if (addBtn) {
                addBtn.addEventListener('click', handleAddSelected);
            }
        }

        setupFilterableBlockSection({
            searchInput: document.getElementById('xCountrySearchInput'),
            selectEl: document.getElementById('xCountrySelect'),
            addBtn: document.getElementById('xAddCountryBtn'),
            chipsContainer: document.getElementById('xBlockedChipsContainer'),
            itemsMap: COUNTRY_FLAGS_MAP,
            storageKey: 'blockedCountries',
            placeholderText: '-- Select Country to Block --',
            emptyChipsText: 'No countries blocked yet.',
            defaultIcon: '🌐'
        });

        setupFilterableBlockSection({
            searchInput: document.getElementById('xDeviceRegionSearchInput'),
            selectEl: document.getElementById('xDeviceRegionSelect'),
            addBtn: document.getElementById('xAddDeviceRegionBtn'),
            chipsContainer: document.getElementById('xBlockedDeviceRegionChipsContainer'),
            itemsMap: DEVICE_REGION_MAP,
            storageKey: 'blockedDeviceRegions',
            placeholderText: '-- Select Device / Region to Block --',
            emptyChipsText: 'No device stores or regions blocked yet.',
            defaultIcon: '📱'
        });

        // --- X Friends Seen Post Sync UI ---
        const xFriendsSyncToggle = document.getElementById('xFriendsSyncToggle');
        const xMyEmailInput = document.getElementById('xMyEmailInput');
        const xSaveIdentityBtn = document.getElementById('xSaveIdentityBtn');
        const xFriendEmailInput = document.getElementById('xFriendEmailInput');
        const xAddFriendBtn = document.getElementById('xAddFriendBtn');
        const xPendingFriendsContainer = document.getElementById('xPendingFriendsContainer');
        const xFriendsListContainer = document.getElementById('xFriendsListContainer');
        const xMySeenCountDisplay = document.getElementById('xMySeenCountDisplay');
        const xSyncFriendsNowBtn = document.getElementById('xSyncFriendsNowBtn');
        const xFriendsStatusMsg = document.getElementById('xFriendsStatusMsg');

        function setFriendsStatus(msg, isError = false) {
            if (!xFriendsStatusMsg) return;
            xFriendsStatusMsg.textContent = msg;
            xFriendsStatusMsg.style.color = isError ? 'var(--status-red)' : 'var(--status-green)';
            if (msg) {
                setTimeout(() => {
                    if (xFriendsStatusMsg.textContent === msg) {
                        xFriendsStatusMsg.textContent = '';
                    }
                }, 3500);
            }
        }

        function renderFriendsSyncState(state) {
            if (!state) return;
            if (xMyEmailInput && state.identity && state.identity.email && !xMyEmailInput.value) {
                xMyEmailInput.value = state.identity.email;
            }
            if (xMySeenCountDisplay) {
                xMySeenCountDisplay.textContent = state.mySeenCount || 0;
            }

            const friends = Array.isArray(state.friends) ? state.friends : [];
            const incoming = friends.filter(f => f.status === 'pending_incoming');
            const others = friends.filter(f => f.status !== 'pending_incoming');

            if (xPendingFriendsContainer) {
                xPendingFriendsContainer.innerHTML = '';
                incoming.forEach(req => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.45); border-radius: 8px; padding: 4px 8px; font-size: 0.8em; color: #fcd34d;';
                    row.innerHTML = `
                        <span>Invite: <strong>${req.email}</strong></span>
                        <span style="display: inline-flex; gap: 4px;">
                            <button class="btn-accept-friend btn-primary" style="padding: 2px 8px; font-size: 0.9em;">Accept</button>
                            <button class="btn-reject-friend btn-secondary" style="padding: 2px 6px; font-size: 0.9em;">&times;</button>
                        </span>
                    `;
                    row.querySelector('.btn-accept-friend').addEventListener('click', () => {
                        chrome.runtime.sendMessage({ action: 'X_FRIENDS_ACCEPT', payload: { email: req.email } }, (res) => {
                            if (chrome.runtime.lastError) return;
                            if (res && res.success) {
                                renderFriendsSyncState(res.state);
                                setFriendsStatus(`Connected with ${req.email}!`);
                            }
                        });
                    });
                    row.querySelector('.btn-reject-friend').addEventListener('click', () => {
                        chrome.runtime.sendMessage({ action: 'X_FRIENDS_REMOVE', payload: { email: req.email } }, (res) => {
                            if (chrome.runtime.lastError) return;
                            if (res && res.success) renderFriendsSyncState(res.state);
                        });
                    });
                    xPendingFriendsContainer.appendChild(row);
                });
            }

            if (xFriendsListContainer) {
                xFriendsListContainer.innerHTML = '';
                if (others.length === 0 && incoming.length === 0) {
                    xFriendsListContainer.innerHTML = '<span style="font-size: 0.8em; color: #888;">No friends added yet.</span>';
                } else {
                    others.forEach(friend => {
                        const isConnected = friend.status === 'connected';
                        const chip = document.createElement('span');
                        chip.style.cssText = isConnected
                            ? 'display: inline-flex; align-items: center; gap: 4px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 12px; padding: 2px 8px; font-size: 0.8em; color: #6ee7b7;'
                            : 'display: inline-flex; align-items: center; gap: 4px; background: rgba(148, 163, 184, 0.15); border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 12px; padding: 2px 8px; font-size: 0.8em; color: #cbd5e1;';
                        const icon = isConnected ? '✓' : '⏳';
                        const countText = isConnected ? ` (${friend.seenCount || 0})` : ' (pending)';
                        chip.innerHTML = `${icon} ${friend.email}${countText} <span class="friend-remove" style="cursor: pointer; font-weight: bold; margin-left: 4px; color: #fff;">&times;</span>`;
                        chip.querySelector('.friend-remove').addEventListener('click', () => {
                            chrome.runtime.sendMessage({ action: 'X_FRIENDS_REMOVE', payload: { email: friend.email } }, (res) => {
                                if (chrome.runtime.lastError) return;
                                if (res && res.success) renderFriendsSyncState(res.state);
                            });
                        });
                        xFriendsListContainer.appendChild(chip);
                    });
                }
            }
        }

        if (xFriendsSyncToggle) {
            chrome.storage.local.get(['isXFriendsSyncEnabled'], (res) => {
                xFriendsSyncToggle.checked = res.isXFriendsSyncEnabled !== false;
            });
            xFriendsSyncToggle.addEventListener('change', () => {
                chrome.storage.local.set({ isXFriendsSyncEnabled: xFriendsSyncToggle.checked });
            });
        }

        if (xFriendsListContainer) {
            chrome.runtime.sendMessage({ action: 'X_FRIENDS_GET_STATE' }, (res) => {
                if (chrome.runtime.lastError) return;
                if (res && res.success && res.state) {
                    renderFriendsSyncState(res.state);
                }
            });
        }

        if (xSaveIdentityBtn && xMyEmailInput) {
            xSaveIdentityBtn.addEventListener('click', () => {
                const email = xMyEmailInput.value.trim();
                if (!email) {
                    setFriendsStatus('Please enter your email or alias.', true);
                    return;
                }
                setFriendsStatus('Saving & syncing...');
                chrome.runtime.sendMessage({ action: 'X_FRIENDS_SET_IDENTITY', payload: { email } }, (res) => {
                    if (chrome.runtime.lastError) {
                        setFriendsStatus('Extension background not ready. Reload extension.', true);
                        return;
                    }
                    if (res && res.success) {
                        renderFriendsSyncState(res.state);
                        setFriendsStatus('Identity saved!');
                    } else {
                        setFriendsStatus(res?.error || 'Failed to save identity.', true);
                    }
                });
            });
        }

        if (xAddFriendBtn && xFriendEmailInput) {
            xAddFriendBtn.addEventListener('click', () => {
                const email = xFriendEmailInput.value.trim();
                if (!email) {
                    setFriendsStatus('Please enter a friend email or alias.', true);
                    return;
                }
                setFriendsStatus('Sending invite over Nostr...');
                chrome.runtime.sendMessage({ action: 'X_FRIENDS_ADD', payload: { email } }, (res) => {
                    if (chrome.runtime.lastError) {
                        setFriendsStatus('Extension background not ready. Reload extension.', true);
                        return;
                    }
                    if (res && res.success) {
                        xFriendEmailInput.value = '';
                        renderFriendsSyncState(res.state);
                        setFriendsStatus(`Added ${email}!`);
                    } else {
                        setFriendsStatus(res?.error || 'Failed to add friend.', true);
                    }
                });
            });
        }

        if (xSyncFriendsNowBtn) {
            xSyncFriendsNowBtn.addEventListener('click', () => {
                setFriendsStatus('Syncing with Nostr relays...');
                chrome.runtime.sendMessage({ action: 'X_FRIENDS_FORCE_SYNC' }, (res) => {
                    if (chrome.runtime.lastError) {
                        setFriendsStatus('Extension background not ready. Reload extension.', true);
                        return;
                    }
                    if (res && res.success) {
                        renderFriendsSyncState(res.state);
                        setFriendsStatus('Synced with relays!');
                    } else {
                        setFriendsStatus(res?.error || 'Sync failed.', true);
                    }
                });
            });
        }

        refreshTabVisibility();
        setDependentModulesState();
    });
    
    // --- VSC Storage Keys (Duplicated from controller.js/settings.js for independence) ---
    const VSC_STORAGE_KEYS = {
      BLACKLIST: 'vsc_blacklist',
      IS_ENABLED: 'vsc_is_enabled',
      OPTIONS: 'vsc_options',
      SITE_SPEEDS: 'vsc_site_speeds',
      GLOBAL_DEFAULT_SPEED: 'vsc_global_default_speed'
    };
    
    // --- Load VSC State ---
    chrome.storage.local.get([VSC_STORAGE_KEYS.IS_ENABLED, VSC_STORAGE_KEYS.OPTIONS, VSC_STORAGE_KEYS.GLOBAL_DEFAULT_SPEED], (result) => {
        // Default Enabled if not present
        const isVscEnabled = result[VSC_STORAGE_KEYS.IS_ENABLED] !== false;
        if (vscPowerToggle) vscPowerToggle.checked = isVscEnabled;
        
        const vscOptions = result[VSC_STORAGE_KEYS.OPTIONS] || {};
        if (vscPopupKeySpeed) vscPopupKeySpeed.value = vscOptions.keySpeed || 2.0;

        if (vscGlobalDefaultDisplay) {
            const globalDefault = result[VSC_STORAGE_KEYS.GLOBAL_DEFAULT_SPEED] || 1.0;
            vscGlobalDefaultDisplay.textContent = globalDefault.toFixed(1);
        }
    });

   // --- Global Event Listeners ---
    globalMasterSwitchToggle.addEventListener('change', () => {
        const isEnabled = globalMasterSwitchToggle.checked;
        chrome.storage.local.set({ [GLOBAL_MASTER_SWITCH_ENABLED_KEY]: isEnabled });
        
        // The message now has a callback that explicitly tells the module UIs to refresh
        chrome.runtime.sendMessage({ action: "setGlobalMasterSwitch", enabled: isEnabled }, () => {
            void chrome.runtime.lastError;
            setDependentModulesState();
            // Manually trigger the status updates for each module
            if (window.updateFabStatsDisplay) window.updateFabStatsDisplay();
            if (window.updateYouTubeStatsDisplay) window.updateYouTubeStatsDisplay();
        });
    });

    if (openOptionsPageLink) {
        openOptionsPageLink.addEventListener('click', (event) => {
            event.preventDefault();
            chrome.runtime.openOptionsPage ? chrome.runtime.openOptionsPage() : chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
        });
    }

    // --- Visibility Toggle Listeners ---
    [
        { el: visibilityVolumeToggle, key: VOLUME_MODULE_VISIBLE_KEY },
        { el: visibilityVscToggle, key: VSC_MODULE_VISIBLE_KEY },
        { el: visibilityFabToggle, key: FAB_MODULE_VISIBLE_KEY },
        { el: visibilityYouTubeToggle, key: YOUTUBE_MODULE_VISIBLE_KEY },
        { el: visibilityXToggle, key: X_MODULE_VISIBLE_KEY },
        { el: visibilityCrunchyrollToggle, key: CRUNCHYROLL_MODULE_VISIBLE_KEY }
    ].forEach(({ el, key }) => {
        if (el) {
            el.addEventListener('change', () => {
                const isVisible = el.checked;
                chrome.storage.local.set({ [key]: isVisible }, () => {
                    refreshTabVisibility();
                    chrome.runtime.sendMessage({ action: "settingsUpdated", type: "global" });
                });
            });
        }
    });

    // --- X Module Logic ---
    const xVolumeSlider = document.getElementById('xVolumeSlider');
    const xVolumeValueDisplay = document.getElementById('xVolumeValueDisplay');
    const X_VOLUME_LEVEL_KEY = 'xVolumeLevel';

    chrome.storage.local.get([X_MODULE_ENABLED_KEY, X_ALWAYS_MUTE_KEY, X_VOLUME_LEVEL_KEY], (result) => {
         if (xModulePowerToggle) xModulePowerToggle.checked = result[X_MODULE_ENABLED_KEY] !== false;
         if (xAlwaysMuteToggle) xAlwaysMuteToggle.checked = result[X_ALWAYS_MUTE_KEY] !== false;
         
         if (xVolumeSlider) {
             const savedVol = result[X_VOLUME_LEVEL_KEY] !== undefined ? result[X_VOLUME_LEVEL_KEY] : 1.0;
             const displayVol = Math.round(savedVol * 100);
             xVolumeSlider.value = displayVol;
             if (xVolumeValueDisplay) xVolumeValueDisplay.textContent = `${displayVol}%`;
         }
    });

    if (xModulePowerToggle) {
        xModulePowerToggle.addEventListener('change', () => {
             const isEnabled = xModulePowerToggle.checked;
             chrome.storage.local.set({ [X_MODULE_ENABLED_KEY]: isEnabled });
             chrome.runtime.sendMessage({ action: "setXModuleEnabled", enabled: isEnabled });
        });
    }
    if (xAlwaysMuteToggle) {
        xAlwaysMuteToggle.addEventListener('change', () => {
             const isEnabled = xAlwaysMuteToggle.checked;
             chrome.storage.local.set({ [X_ALWAYS_MUTE_KEY]: isEnabled });
        });
    }

    if (xVolumeSlider) {
        xVolumeSlider.addEventListener('input', () => {
            const val = xVolumeSlider.value;
            if (xVolumeValueDisplay) xVolumeValueDisplay.textContent = `${val}%`;
        });
        xVolumeSlider.addEventListener('change', () => {
             const val = parseFloat(xVolumeSlider.value) / 100;
             chrome.storage.local.set({ [X_VOLUME_LEVEL_KEY]: val });
             // xSettingsLoader.js listens to storage changes and propagates to tabs automatically
        });
    }

    // --- Volume Control Logic ---
    if (volumeSlider && volumeValueDisplay) {
        const updateVolumeDisplay = (val) => {
            const num = parseInt(val, 10) || 0;
            volumeValueDisplay.textContent = `${num}%`;
            // Dynamic color shift based on volume intensity
            if (num > 400) {
                volumeValueDisplay.style.color = '#ec4899'; // Magenta Overdrive
                volumeValueDisplay.style.textShadow = '0 0 24px rgba(236, 72, 153, 0.5)';
            } else if (num > 200) {
                volumeValueDisplay.style.color = '#06b6d4'; // Cyan High Boost
                volumeValueDisplay.style.textShadow = '0 0 20px rgba(6, 182, 212, 0.4)';
            } else if (num > 100) {
                volumeValueDisplay.style.color = '#f59e0b'; // Amber Boost
                volumeValueDisplay.style.textShadow = '0 0 16px rgba(245, 158, 11, 0.35)';
            } else {
                volumeValueDisplay.style.color = '#10b981'; // Emerald Green Normal
                volumeValueDisplay.style.textShadow = '0 0 16px rgba(16, 185, 129, 0.3)';
            }
        };

        // Preset volume buttons
        document.querySelectorAll('.preset-btn[data-vol]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetVol = parseInt(btn.getAttribute('data-vol'), 10) || 100;
                volumeSlider.value = targetVol;
                updateVolumeDisplay(targetVol);
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs.length > 0) {
                        chrome.runtime.sendMessage({ 
                            action: "updateVolume", 
                            tabId: tabs[0].id, 
                            volume: targetVol / 100 
                        });
                    }
                });
            });
        });

        volumeSlider.addEventListener('input', () => {
             const val = volumeSlider.value;
             updateVolumeDisplay(val);
        });

        volumeSlider.addEventListener('change', () => {
            const val = volumeSlider.value;
            // Get current active tab to send message
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const volumeFloat = parseFloat(val) / 100; // Convert 100 -> 1.0
                    chrome.runtime.sendMessage({ 
                        action: "updateVolume", 
                        tabId: tabs[0].id, 
                        volume: volumeFloat 
                    });
                }
            });
        });

        if (volumeResetBtn) {
            volumeResetBtn.addEventListener('click', () => {
                volumeSlider.value = 100;
                updateVolumeDisplay(100);
                // Trigger change logic
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs.length > 0) {
                        chrome.runtime.sendMessage({ 
                            action: "updateVolume", 
                            tabId: tabs[0].id, 
                            volume: 1.0 
                        });
                    }
                });
            });
        }

        // Initialize Volume State
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                 chrome.runtime.sendMessage({ 
                    action: "getCurrentVolumeForPopup", 
                    tabId: tabs[0].id 
                }, (response) => {
                    if (chrome.runtime.lastError) return;
                    if (response && response.volume !== undefined) {
                        const volPercent = Math.round(response.volume * 100);
                        volumeSlider.value = volPercent;
                        updateVolumeDisplay(volPercent);
                    }
                });
            }
        });
    }

    // --- VSC Logic ---
    if (vscPowerToggle) {
        vscPowerToggle.addEventListener('change', () => {
            const isEnabled = vscPowerToggle.checked;
            chrome.storage.local.set({ [VSC_STORAGE_KEYS.IS_ENABLED]: isEnabled });
            chrome.runtime.sendMessage({ action: "setVscModuleEnabled", enabled: isEnabled });
        });
    }

    if (vscSaveSpeedBtn) {
        vscSaveSpeedBtn.addEventListener('click', () => {
            const newSpeed = parseFloat(vscPopupKeySpeed.value);
            if (isNaN(newSpeed) || newSpeed < 0.1 || newSpeed > 16) {
                if (vscPopupStatus) {
                   vscPopupStatus.textContent = "Invalid speed (0.1 - 16)";
                   vscPopupStatus.className = "status-message error";
                }
                return;
            }
            
            // Allow partial update of options
            chrome.storage.local.get([VSC_STORAGE_KEYS.OPTIONS], (result) => {
                const options = result[VSC_STORAGE_KEYS.OPTIONS] || {};
                options.keySpeed = newSpeed;
                chrome.storage.local.set({ [VSC_STORAGE_KEYS.OPTIONS]: options }, () => {
                   if (vscPopupStatus) {
                       vscPopupStatus.textContent = "Speed saved!";
                       vscPopupStatus.className = "status-message success";
                       setTimeout(() => vscPopupStatus.textContent = "", 2000);
                   } 
                });
            });
        });
    }

    if (vscAddBlacklistBtn) {
        vscAddBlacklistBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) return;
                const tab = tabs[0];
                if (!tab.url) return;
                
                try {
                    const url = new URL(tab.url);
                    const hostname = url.hostname;
                    
                    chrome.storage.local.get([VSC_STORAGE_KEYS.BLACKLIST], (result) => {
                        let blacklist = result[VSC_STORAGE_KEYS.BLACKLIST] || '';
                        // Simple check if already there
                        if (blacklist.includes(hostname)) {
                            if (vscPopupStatus) {
                                vscPopupStatus.textContent = "Site already blacklisted";
                                vscPopupStatus.className = "status-message warning";
                            }
                            return;
                        }
                        
                        blacklist = blacklist + '\n' + hostname;
                        chrome.storage.local.set({ [VSC_STORAGE_KEYS.BLACKLIST]: blacklist }, () => {
                             if (vscPopupStatus) {
                                vscPopupStatus.textContent = `Added ${hostname}`;
                                vscPopupStatus.className = "status-message success";
                             }
                        });
                    });
                } catch (e) {
                    if (vscPopupStatus) {
                        vscPopupStatus.textContent = "Invalid URL";
                        vscPopupStatus.className = "status-message error";
                    }
                }
            });
        });
    }

    if (vscSetCurrentAsGlobalBtn) {
        vscSetCurrentAsGlobalBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) return;
                const tabId = tabs[0].id;
                
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        const video = document.querySelector('video');
                        return video ? video.playbackRate : null;
                    }
                }, (results) => {
                    if (results && results[0] && results[0].result !== null) {
                        const currentSpeed = results[0].result;
                        chrome.storage.local.set({ [VSC_STORAGE_KEYS.GLOBAL_DEFAULT_SPEED]: currentSpeed }, () => {
                            if (vscGlobalDefaultDisplay) vscGlobalDefaultDisplay.textContent = currentSpeed.toFixed(1);
                            if (vscPopupStatus) {
                                vscPopupStatus.textContent = `Global Default set to ${currentSpeed.toFixed(1)}`;
                                vscPopupStatus.className = "status-message success";
                                setTimeout(() => vscPopupStatus.textContent = "", 2000);
                            }
                        });
                    } else {
                        if (vscPopupStatus) {
                            vscPopupStatus.textContent = "No video found on page";
                            vscPopupStatus.className = "status-message error";
                        }
                    }
                });
            });
        });
    }


    // --- Functions Accessible by Module UI Scripts ---
    
    // This function can be called by module scripts to correctly set their disabled state.
    function setDependentModulesState() {
        const isGlobalOn = globalMasterSwitchToggle.checked;
        const moduleIds = ['fab-controls', 'youtube-controls', 'x-controls', 'crunchyroll-controls', 'volume-controls', 'speed-controls'];
        moduleIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('effectively-disabled', !isGlobalOn);
        });
        
        // Also disable the power toggles themselves
        const toggleIds = ['fabModulePowerToggle', 'youTubeModulePowerToggle', 'xModulePowerToggle', 'crunchyrollModulePowerToggle', 'vscPowerToggle'];
        toggleIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !isGlobalOn;
        });
    }

    // Attach a global status indicator updater to the window object
    window.updateStatusIndicator = (indicator, textElement, status) => {
        if (!indicator || !textElement) return;
        indicator.className = ''; // Clear previous
        let statusTextValue = "Unknown";
         switch (status) {
            case "EXTENSION_DISABLED":
                indicator.classList.add('status-extension-disabled');
                statusTextValue = "Ext. Disabled";
                break;
            case "FAB_DISABLED":
            case "YOUTUBE_DISABLED":
                indicator.classList.add('status-fab-disabled');
                statusTextValue = "Mod. Disabled";
                break;
            case "OK_ACTIVE":
                indicator.classList.add('status-ok-active');
                statusTextValue = "Active";
                break;
            case "OK_IDLE":
                indicator.classList.add('status-ok-idle');
                statusTextValue = "Idle";
                break;
            case "SUSPENDED":
                indicator.classList.add('status-suspended');
                statusTextValue = "Suspended";
                break;
            case "QUEUE_DISABLED":
                indicator.classList.add('status-fab-disabled');
                statusTextValue = "Queue Off";
                break;
            default:
                // Check for dynamic statuses
                if (status.startsWith("Rate Limited")) {
                    indicator.classList.add('status-rate-limited');
                    statusTextValue = status; // Use the dynamic string (e.g. "Rate Limited (45s)")
                } else {
                    indicator.classList.add('status-error');
                    statusTextValue = "Status N/A";
                }
        }
        textElement.textContent = statusTextValue;
    };


    // --- Tab Switching Logic ---
    function refreshTabVisibility() {
        const visibilityMap = {
            'volume-controls': visibilityVolumeToggle?.checked !== false,
            'speed-controls': visibilityVscToggle?.checked !== false,
            'fab-controls': visibilityFabToggle?.checked !== false,
            'youtube-controls': visibilityYouTubeToggle?.checked !== false,
            'x-controls': visibilityXToggle?.checked !== false,
            'crunchyroll-controls': visibilityCrunchyrollToggle?.checked !== false,
            'general-settings': true // Always visible
        };

        let activeTabHidden = false;
        tabButtons.forEach(btn => {
            const tabId = btn.getAttribute('data-tab');
            const isVisible = visibilityMap[tabId];
            btn.style.display = isVisible ? '' : 'none';
            if (!isVisible && btn.classList.contains('active')) {
                activeTabHidden = true;
            }
        });

        if (activeTabHidden) {
            // Find first visible tab and switch to it
            const firstVisibleButton = Array.from(tabButtons).find(btn => btn.style.display !== 'none');
            if (firstVisibleButton) {
                switchTab(firstVisibleButton.getAttribute('data-tab'));
            }
        }
    }

    const switchTab = (tabId) => {
        const targetButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const targetContent = document.getElementById(tabId);
        
        if (targetButton && targetContent) {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            targetButton.classList.add('active');
            targetContent.classList.add('active');
        }
    };

    // Restore last active tab
    if (chrome.storage?.session?.get) {
        chrome.storage.session.get(['lastActiveTab'], (result) => {
            if (result?.lastActiveTab) {
                switchTab(result.lastActiveTab);
            }
        });
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
            if (chrome.storage?.session?.set) {
                chrome.storage.session.set({ lastActiveTab: targetTab });
            }
        });
    });
});
