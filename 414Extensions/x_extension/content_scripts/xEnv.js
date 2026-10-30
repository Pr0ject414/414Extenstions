
// KylesChromeExtensions/x_extension/content_scripts/xEnv.js
(function() {
    // Prevent double injection
    if (window.hasXEnvInjected) return;
    window.hasXEnvInjected = true;

    console.log("X Env: Initialized (Main World).");

    const allowedUnmuted = new WeakSet();
    const shadowMutedState = new WeakMap();

    // Settings State (Default to Enabled/Muted until bridge updates)
    let isModuleEnabled = true;
    let alwaysMuteEnabled = true;
    let currentVolume = 1.0; // Default until loaded
    let hideAdsEnabled = true;
    let locationFilterEnabled = true;
    let blockedCountries = [];
    let blockedDeviceRegions = [];
    let blockedNameFlags = [];
    const userLocationCache = new Map(); // screenNameLower -> userData
    const SESSION_FILTER_CONFIG_KEY = '__x414_filter_cfg_v1';

    function hydrateUserLocationCache(rawCache) {
        if (!rawCache || typeof rawCache !== 'object') return;
        for (const [k, v] of Object.entries(rawCache)) {
            if (k && v && typeof v === 'object') {
                userLocationCache.set(String(k).toLowerCase(), v);
            }
        }
    }

    function loadPersistedFilterConfig() {
        try {
            if (typeof sessionStorage === 'undefined') return;
            const raw = sessionStorage.getItem(SESSION_FILTER_CONFIG_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            if (typeof parsed.isEnabled === 'boolean') isModuleEnabled = parsed.isEnabled;
            if (typeof parsed.hideAds === 'boolean') hideAdsEnabled = parsed.hideAds;
            if (typeof parsed.locationEnabled === 'boolean') locationFilterEnabled = parsed.locationEnabled;
            if (Array.isArray(parsed.blockedCountries)) blockedCountries = parsed.blockedCountries;
            if (Array.isArray(parsed.blockedDeviceRegions)) blockedDeviceRegions = parsed.blockedDeviceRegions;
            if (Array.isArray(parsed.blockedNameFlags)) blockedNameFlags = parsed.blockedNameFlags;
        } catch (e) {}
    }

    function persistFilterConfigToSession() {
        try {
            if (typeof sessionStorage === 'undefined') return;
            sessionStorage.setItem(SESSION_FILTER_CONFIG_KEY, JSON.stringify({
                isEnabled: isModuleEnabled,
                hideAds: hideAdsEnabled,
                locationEnabled: locationFilterEnabled,
                blockedCountries,
                blockedDeviceRegions,
                blockedNameFlags
            }));
        } catch (e) {}
    }

    loadPersistedFilterConfig();

    // Listen for Settings from Bridge (xSettingsLoader.js) and Location updates from xObserver.js
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'X_SETTINGS_UPDATE' && event.data.payload) {
            const payload = event.data.payload;
            const { isEnabled, alwaysMute, volumeLevel } = payload;
            if (typeof isEnabled === 'boolean') isModuleEnabled = isEnabled;
            if (typeof alwaysMute === 'boolean') alwaysMuteEnabled = alwaysMute;
            if (typeof payload.hideAds === 'boolean') hideAdsEnabled = payload.hideAds;
            if (typeof payload.locationEnabled === 'boolean') locationFilterEnabled = payload.locationEnabled;
            if (Array.isArray(payload.blockedCountries)) blockedCountries = payload.blockedCountries;
            if (Array.isArray(payload.blockedDeviceRegions)) blockedDeviceRegions = payload.blockedDeviceRegions;
            if (Array.isArray(payload.blockedNameFlags)) blockedNameFlags = payload.blockedNameFlags;
            if (payload.userCache && typeof payload.userCache === 'object') {
                hydrateUserLocationCache(payload.userCache);
            }
            persistFilterConfigToSession();
            
            if (typeof volumeLevel === 'number') {
                const oldVolume = currentVolume;
                
                // Only update our internal state from settings if the user is NOT 
                // currently dragging the slider. This prevents race conditions.
                if (!isUserInteractingWithVolume) {
                    currentVolume = volumeLevel;

                    // Real-time update: Apply to all videos if volume changed significantly
                    if (Math.abs(oldVolume - currentVolume) > 0.001) {
                         const videos = document.querySelectorAll('video');
                         videos.forEach(v => applyOriginalVolume(v, currentVolume));
                    }
                }
            }
            // console.log("X Env: Settings updated.", { isModuleEnabled, alwaysMuteEnabled, currentVolume });
        }

        if (event.data && event.data.type === 'X_USER_LOCATION_RESOLVED' && event.data.payload) {
            const { screenName, userData, users } = event.data.payload;
            if (screenName && userData && typeof userData === 'object') {
                userLocationCache.set(String(screenName).toLowerCase(), userData);
            }
            if (users && typeof users === 'object') {
                hydrateUserLocationCache(users);
            }
        }
        
        // Listen for Background Events (Context Menu)
        if (event.data && event.data.type === 'X_BACKGROUND_EVENT') {
            const { action } = event.data.payload;
            if (action === 'X_TRIGGER_DOWNLOAD_FROM_CONTEXT') {
                handleContextMenuDownload();
            }
        }

        // Listen for Save Volume from itself (already exists)
    });

    function getVolumeSliderFromTarget(target) {
        if (!target) return null;
        // 1. Check if target IS or IS INSIDE the slider
        let slider = target.closest('[aria-label*="Volume"], [data-testid="volumeSlider"], [data-testid="sound_slider"]');
        if (slider) return slider;
        
        // 2. Check if target CONTAINS the slider (is the track/parent)
        // We look for a direct child slider, or just a slider inside. 
        // Given X's structure, the track is the parent.
        if (target.querySelector) {
            slider = target.querySelector('[aria-label*="Volume"], [data-testid="volumeSlider"], [data-testid="sound_slider"]');
        }
        return slider;
    }

    // 1. CLICK LISTENER (User Intent & Volume Interaction)
    let isUserInteractingWithVolume = false;
    let volumeInteractionTimeout = null;

    document.addEventListener('mousedown', (e) => {
        handleInteractionStart(e.target);
    }, true);
    
    document.addEventListener('touchstart', (e) => {
        handleInteractionStart(e.target);
    }, { capture: true, passive: true });

    document.addEventListener('pointerdown', (e) => {
        handleInteractionStart(e.target);
    }, { capture: true, passive: true });

    function handleInteractionStart(target) {
        if (!target) return;
        if (target.tagName === 'VIDEO' && target.classList && target.classList.contains('x-friend-card-video')) {
            allowedUnmuted.add(target);
            return;
        }
        // Check if interacting with volume slider (Broadened)
        const volSlider = getVolumeSliderFromTarget(target);

        if (volSlider) {
            isUserInteractingWithVolume = true;
            if (volumeInteractionTimeout) {
                clearTimeout(volumeInteractionTimeout);
                volumeInteractionTimeout = null;
            }

            // Auto-Unmute on Slider Interaction
            const video = findRelatedVideo(volSlider);
            if (video && video.muted) {
                // console.log("X Env: Unmuting via Slider Interaction", video);
                allowedUnmuted.add(video);
                // We must set shadow state first or hijack might block it
                shadowMutedState.set(video, false); 
                applyOriginalMuted(video, false);
            }
        }
    }

    function handleInteractionEnd() {
        // We delay the reset to allow the "click" event (which happens after mouseup)
        // and subsequent site logic to process the volume change while we still
        // flag it as "User Interaction". 500ms should be plenty.
        if (isUserInteractingWithVolume) {
            if (volumeInteractionTimeout) clearTimeout(volumeInteractionTimeout);
            volumeInteractionTimeout = setTimeout(() => {
                isUserInteractingWithVolume = false;
                volumeInteractionTimeout = null;
            }, 500);
        }
    }

    document.addEventListener('pointerup', handleInteractionEnd, { capture: true, passive: true });
    
    // CLICK INTERCEPT for Click-to-Pause (when Always Mute is active)
    document.addEventListener('click', (e) => {
        if (!isModuleEnabled || !alwaysMuteEnabled) return;

        const target = e.target;

        // 1. Explicitly Detect Volume Slider Interaction (Fixes "Click to Set")
        // We catch this early to ensure the flag is set during the click handling phase
        if (getVolumeSliderFromTarget(target)) {
             isUserInteractingWithVolume = true;
             handleInteractionStart(target); // Ensure unmute logic runs
             return; // Let click propagate to X
        }

        // 2. Ignore Other Controls (Exclusions)
        // This includes Scrubbers, Buttons, etc.
        const excludedRoles = ['slider', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'switch', 'checkbox', 'radio', 'progressbar'];
        const roleSelector = excludedRoles.map(role => `[role="${role}"]`).join(',');
        
        if (
            target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' || 
            target.closest(roleSelector) || 
            target.closest('[aria-label="Mute"]') || 
            target.closest('[aria-label="Unmute"]') || 
            target.closest('[aria-label*="Volume"]') || 
            target.closest('[data-testid="volumeSlider"]') ||
            target.closest('[data-testid="progressBar"]') || 
            target.closest('[data-testid="scrubber"]') || 
            target.closest('[aria-label="Seek slider"]') || 
            target.closest('[aria-label="ProgressBar"]') ||
            target.closest('[data-testid="playButton"]') || 
            target.closest('[data-testid="pauseButton"]')
        ) return;

        const video = findRelatedVideo(target);
        if (video) {
            if (video.classList && video.classList.contains('x-friend-card-video')) return;
            // GEOMETRIC CHECK: Ensure the click is actually INSIDE the video rect.
            const rect = video.getBoundingClientRect();
            const isInX = e.clientX >= rect.left && e.clientX <= rect.right;
            const isInY = e.clientY >= rect.top && e.clientY <= rect.bottom;
            
            if (!isInX || !isInY) return; // Clicked outside video bounds

            // Found a video click outside of controls, and Always Mute is ON.
            // X.com default is to Unmute (if not previously interacted). We want to Pause/Play.
            e.stopImmediatePropagation();
            e.preventDefault();
            e.stopPropagation();

            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        }
    }, true); // Capture phase to beat X's listeners

    document.addEventListener('mouseup', handleInteractionEnd, true);
    document.addEventListener('touchend', handleInteractionEnd, { capture: true, passive: true });
    
    // CONTEXT MENU TRACKING
    let lastRightClickedVideo = null;
    document.addEventListener('contextmenu', (e) => {
        if (!isModuleEnabled) return;
        const target = e.target;
        const video = findRelatedVideo(target);
        if (video) {
            lastRightClickedVideo = video;
        } else {
            const container = target.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]');
            if (container) {
                lastRightClickedVideo = container.querySelector('video');
            }
        }
        // We no longer stop propagation here, allowing X's custom menu to show.
    }, true); // Capture phase
    
    // CLICK BURST TRACKER (Fixes double-click side effects)
    let clickBurstState = {
        video: null,
        initialPaused: false,
        lastTime: 0
    };

    document.addEventListener('pointerdown', (e) => {
        // Track the video state at the START of a potential click sequence
        const video = findRelatedVideo(e.target);
        if (video) {
            const now = Date.now();
            // New burst or different video?
            if (video !== clickBurstState.video || (now - clickBurstState.lastTime > 500)) {
                clickBurstState.video = video;
                clickBurstState.initialPaused = video.paused;
                // console.log("X Env: Burst Start. Initial Paused:", video.paused);
            }
            clickBurstState.lastTime = now;
        }
    }, { capture: true, passive: true });

    // DOUBLE CLICK FULLSCREEN
    document.addEventListener('dblclick', (e) => {
        if (!isModuleEnabled) return;

        const target = e.target;
        
        // Use same exclusion logic as click listener to avoid double clicking controls
        const excludedRoles = ['slider', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'switch', 'checkbox', 'radio', 'progressbar'];
        const roleSelector = excludedRoles.map(role => `[role="${role}"]`).join(',');
        
        if (
            target.tagName === 'BUTTON' || 
            target.tagName === 'INPUT' || 
            target.closest(roleSelector) || 
            target.closest('[data-testid="volumeSlider"]') || 
            target.closest('[data-testid="progressBar"]') || 
            target.closest('[data-testid="scrubber"]') || 
            target.closest('[aria-label="Seek slider"]')
        ) return;

        const video = findRelatedVideo(target);
        if (video) {
             const rect = video.getBoundingClientRect();
             const isInX = e.clientX >= rect.left && e.clientX <= rect.right;
             const isInY = e.clientY >= rect.top && e.clientY <= rect.bottom;
             
             if (!isInX || !isInY) return;

             e.preventDefault();
             e.stopPropagation();

             // Use our tracker if valid, otherwise fallback to current state (risky)
             let targetPausedState = video.paused;
             if (clickBurstState.video === video && (Date.now() - clickBurstState.lastTime < 1000)) {
                 targetPausedState = clickBurstState.initialPaused;
                 // console.log("X Env: Using Burst State:", targetPausedState);
             }

             // Strategy 1: Try to find existing Fullscreen Button
             // We look up from video to find the container, then search down for the button
             // Or we just search near the video.
             // X structure: Video -> (up) -> VideoPlayer -> (down) -> Button[aria-label="Enter full screen"]
             
             let container = video.parentElement;
             let fsButton = null;
             
             // Traverse up to find a common container
             for(let i=0; i<6; i++) {
                 if(!container) break;
                 // Look for buttons
                 const openBtn = container.querySelector('[aria-label="Enter full screen"], [aria-label="Full screen"]');
                 const closeBtn = container.querySelector('[aria-label="Exit full screen"]');
                 
                 if (openBtn && openBtn.offsetParent !== null) { // Check visibility roughly
                     fsButton = openBtn;
                     break;
                 }
                 if (closeBtn && closeBtn.offsetParent !== null) {
                     fsButton = closeBtn;
                     break;
                 }
                 container = container.parentElement;
             }

             if (fsButton) {
                 fsButton.click();
             } else {
                 // Strategy 2: Native Fallback
                 if (!document.fullscreenElement) {
                     // Try to fullscreen the container if possible, else video
                     if (video.parentElement) {
                         video.parentElement.requestFullscreen().catch(() => video.requestFullscreen());
                     } else {
                         video.requestFullscreen(); 
                     }
                 } else {
                     document.exitFullscreen();
                 }
             }

             // Enforce State Preservation
             setTimeout(() => {
                 if (video.paused !== targetPausedState) {
                     if (targetPausedState) video.pause();
                     else video.play().catch(() => {});
                 }
             }, 200);
        }
    }, true);
    document.addEventListener('click', (e) => {
        // We don't force reset here immediately anymore, we let the timeout handle it.
        // But we still track explicit unmute buttons.

        const target = e.target;
        if (target && target.tagName === 'VIDEO' && target.classList && target.classList.contains('x-friend-card-video')) {
            allowedUnmuted.add(target);
            const rect = target.getBoundingClientRect();
            const isControlBarClick = rect.height > 0 && e.clientY > 0 && e.clientY > rect.bottom - 44;
            const isCurrentlyMuted = originalDescriptor ? originalDescriptor.get.call(target) : target.muted;
            if (!isControlBarClick && isCurrentlyMuted) {
                e.preventDefault();
                e.stopPropagation();
                shadowMutedState.set(target, false);
                applyOriginalMuted(target, false);
                target.removeAttribute('muted');
                if (target.volume !== currentVolume) {
                    applyOriginalVolume(target, currentVolume);
                }
                if (target.paused) {
                    target.play().catch(() => {});
                }
            }
            return;
        }
        const muteButton = target.closest('[aria-label="Mute"]');
        const unmuteButton = target.closest('[aria-label="Unmute"]');
        // Broadened Slider Selector for Click Unmuting
        const volSlider = getVolumeSliderFromTarget(target);
        
        // If clicking unmute or volume slider, user wants sound.
        if (unmuteButton || volSlider) {
             const video = findRelatedVideo(unmuteButton || (volSlider ? target : null)); 
             // Note: findRelatedVideo walks up. If volSlider was found via querySelector (down), 
             // target might be the parent. findRelatedVideo(target) is correct.
             
             if (video) {
                 // console.log("X Env: User allowed video.", video);
                 allowedUnmuted.add(video);
                 
                 // Force Shadow State to match User Intent (Unmute)
                 shadowMutedState.set(video, false);
                 
                 // Force Actual Unmute
                 applyOriginalMuted(video, false);
                 
                 // If it was the Unmute BUTTON, we ensure we restore the desired volume level.
                 // If it was the SLIDER, we DO NOT interfere, because the click itself sets the volume native.
                 if (unmuteButton && video.volume !== currentVolume) {
                     applyOriginalVolume(video, currentVolume);
                 }
             }
        }
    }, true);

    function findRelatedVideo(controlElement) {
        let current = controlElement;
        for (let i = 0; i < 15; i++) {
            if (!current) break;
            const video = current.querySelector('video');
            if (video) return video;
            current = current.parentElement;
        }
        return null;
    }

    // 2. PROTOTYPE HIJACKING
    // We hijack HTMLMediaElement.prototype.muted to separate the "Site's Logical State" from "Actual Player State".
    
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    
    if (!originalDescriptor) {
        console.error("X Env: Could not find original descriptor for 'muted'. Enforcement failed.");
        return;
    }

    function applyOriginalMuted(element, value) {
        originalDescriptor.set.call(element, value);
    }

    Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        get() {
            // If we are shadowing this element, return the shadow value (what the site thinks it is)
            if (shadowMutedState.has(this)) {
                return shadowMutedState.get(this);
            }
            return originalDescriptor.get.call(this);
        },
        set(value) {
            // 1. Update the Shadow State (What the site WANTS)
            shadowMutedState.set(this, value);

            // 0. If Module is DISABLED, just pass through everything normally.
            if (!isModuleEnabled) {
                applyOriginalMuted(this, value);
                return;
            }

            // 2. Decide what to do with the Real State
            if (value === true) {
                // Site wants to MUTE. We always allow muting.
                applyOriginalMuted(this, true);
            } else {
                // Site wants to UNMUTE (value === false)
                
                // If "Always Mute" feature is OFF, we allow unmuting freely.
                if (!alwaysMuteEnabled) {
                     applyOriginalMuted(this, false);
                     return;
                }

                if (allowedUnmuted.has(this) || isUserInteractingWithVolume) {
                    // User explicitly allowed this video OR is currently interacting with volume controls.
                    // If interacting, we bless this video for future.
                    if (isUserInteractingWithVolume) {
                        allowedUnmuted.add(this);
                    }

                    // User explicitly allowed this video. Let it unmute.
                    applyOriginalMuted(this, false);
                    
                    // ALSO enforce the volume whenever it unmutes
                    if (this.volume !== currentVolume) {
                         applyOriginalVolume(this, currentVolume);
                    }

                } else {
                    // Not allowed. We KEEP it muted.
                    // But we don't throw an error, so the site thinks it succeeded.
                    // console.log("X Env: Blocking unmute attempt on", this);
                    applyOriginalMuted(this, true);
                }
            }
        },
        configurable: true,
        enumerable: true
    });


    // --- VOLUME HIJACKING ---

    const originalVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    if (!originalVolumeDescriptor) {
        console.error("X Env: Could not find original descriptor for 'volume'.");
    }

    function applyOriginalVolume(element, value) {
        if (originalVolumeDescriptor) {
            originalVolumeDescriptor.set.call(element, value);
        } else {
            element.volume = value; // Fallback
        }
    }

    if (originalVolumeDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
            get() {
                // Always return our persisted volume if controlled, or actual
                // Actually, the site expects what it set. But for volume, synchronization is usually expected.
                // Let's return the actual volume key so the UI updates if we force it.
                return originalVolumeDescriptor.get.call(this);
            },
            set(value) {
                 if (!isModuleEnabled) {
                    originalVolumeDescriptor.set.call(this, value);
                    return;
                }

                if (isUserInteractingWithVolume) {
                    // User is dragging the slider. Update our Source of Truth.
                    // But first, let's make sure we aren't being fed a "default" 1.0 by the site
                    // immediately after an interaction (common X behavior).
                    if (value === 1.0 && currentVolume < 0.95 && !allowedUnmuted.has(this)) {
                         // Skip saving this to storage, it's likely a site reset
                    } else {
                        currentVolume = value;
                        // Save to storage
                        window.postMessage({
                            type: 'X_SAVE_VOLUME',
                            payload: currentVolume
                        }, '*');
                    }
                    originalVolumeDescriptor.set.call(this, value); 
                } else {
                    // Site is trying to set volume (e.g. on new video load, or auto-adjustment).
                    // We IGNORE the site's value and Force our stored value.
                    // Unless the site is trying to set it to what we already have.
                    if (Math.abs(value - currentVolume) > 0.01) {
                        // console.log(`X Env: Blocking site volume change to ${value}. Enforcing ${currentVolume}`);
                        originalVolumeDescriptor.set.call(this, currentVolume);
                    } else {
                        originalVolumeDescriptor.set.call(this, value);
                    }
                }
            },
            configurable: true,
            enumerable: true
        });
    }


    // 3. CLEANUP/ENFORCEMENT
    // In case videos are created without touching the setter (e.g. generic attributes), 
    // we still run a loose observer to catch them, but the prototype hijack covers most JS interactions.
    // X.com relies heavily on JS, so this should suffice.
    
    // NOTE: We intentionally do not wrap Element.prototype.setAttribute because
    // setting 'muted' is already allowed, and wrapping setAttribute in the MAIN
    // world causes X.com's own inline-event feature detection (e.g. setAttribute('onload', ...))
    // to trigger CSP violations with xEnv.js in the stack trace.
    
    // NOTE: removeAttribute detection
    const originalRemoveAttribute = Element.prototype.removeAttribute;
    Element.prototype.removeAttribute = function(name) {
        if (this.tagName === 'VIDEO' && name === 'muted') {
            // Removing muted attribute.
            // Logic:
            shadowMutedState.set(this, false); 
            if (allowedUnmuted.has(this)) {
                return originalRemoveAttribute.apply(this, arguments);
            } else {
                // Don't remove the attribute from DOM if we want to stay muted?
                // Or remove it (so CSS/UI updates) but force property true?
                // Let's remove it (Visuals) but Force Property.
                originalRemoveAttribute.apply(this, arguments);
                applyOriginalMuted(this, true);
                return;
            }
        }
        return originalRemoveAttribute.apply(this, arguments);
    };

    console.log("X Env: Prototype hijacking applied (Mute & Volume).");

    // --- DOWNLOAD LOGIC ---

    function handleContextMenuDownload() {
        // Find the video that is currently playing or recent
        const videos = Array.from(document.querySelectorAll('video'));
        const playing = videos.find(v => !v.paused);
        const target = playing || videos[0];
        if (target) {
            triggerDownload(target);
        }
    }

    function triggerDownload(video) {
        const metadata = extractVideoMetadata(video);
        if (metadata && metadata.url) {
            window.postMessage({
                type: 'X_DOWNLOAD_REQUEST',
                payload: {
                    url: metadata.url,
                    filename: `X_Video_${metadata.id}.mp4`,
                    isM3U8: !!metadata.isM3U8
                }
            }, '*');
        } else {
            // Fallback: Open Tweet in downloader
            const tweetId = findTweetId(video);
            if (tweetId) {
                window.open(`https://twitsave.com/info?url=https://x.com/i/status/${tweetId}`, '_blank');
            } else {
                alert("Could not find video URL. Please try again or refresh.");
            }
        }
    }

    function extractVideoMetadata(video) {
        try {
            // 1. Recursive React search for variants
            let current = video;
            for (let i = 0; i < 15; i++) {
                if (!current) break;

                const reactKeys = Object.keys(current).filter(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
                for (const key of reactKeys) {
                    const props = current[key];
                    const variants = findVariantsInProps(props);
                    if (variants && variants.length > 0) {
                        const allVariants = variants.map(v => ({
                            url: v.url,
                            type: v.contentType || v.content_type || "",
                            bitrate: v.bitrate || 0
                        })).filter(v => v.url && (v.type.includes('video/mp4') || v.type.includes('application/x-mpegURL') || v.url.includes('.m3u8')));

                        if (allVariants.length > 0) {
                            // Sort by bitrate desc
                            allVariants.sort((a, b) => b.bitrate - a.bitrate);
                            const tweetId = findTweetId(video);
                            return {
                                url: allVariants[0].url,
                                id: tweetId || Date.now(),
                                isM3U8: allVariants[0].url.includes('.m3u8') || allVariants[0].type.includes('mpegURL')
                            };
                        }
                    }
                }
                current = current.parentElement;
            }

            // 2. Direct MP4 / stream src fallback (e.g. Friends timeline hydrated video cards)
            const directSrc = (video && ((video.getAttribute && video.getAttribute('src')) || video.src || video.currentSrc)) || '';
            if (directSrc && /^https?:\/\//i.test(directSrc)) {
                const tweetId = findTweetId(video);
                return {
                    url: directSrc,
                    id: tweetId || Date.now(),
                    isM3U8: directSrc.includes('.m3u8')
                };
            }
        } catch (e) {
            console.error("X Env: Error extracting metadata", e);
        }
        return null;
    }

    function findVariantsInProps(obj, seen = new WeakSet(), depth = 0) {
        if (!obj || depth > 6 || seen.has(obj)) return null;
        seen.add(obj);

        if (Array.isArray(obj.variants)) return obj.variants;

        // Skip common large/circular React keys to prevent freezes
        const skipKeys = ['return', 'sibling', 'stateNode', 'alternate', '_owner', 'child'];

        for (const key in obj) {
            if (skipKeys.includes(key)) continue;

            try {
                const val = obj[key];
                if (val && typeof val === 'object') {
                    const result = findVariantsInProps(val, seen, depth + 1);
                    if (result) return result;
                }
            } catch (e) {
                // Ignore restricted property access
            }
        }
        return null;
    }

    function findTweetId(element) {
        // Check DOM (article tag) up from video first so feed/quoted tweets resolve to their own tweet ID
        let current = element;
        for (let i = 0; i < 20; i++) {
            if (!current) break;
            if (current.tagName === 'ARTICLE') {
                const attrId = current.getAttribute('data-tweet-id') || current.getAttribute('data-x-tweet-id');
                if (attrId) return attrId;
                const links = current.querySelectorAll('a[href*="/status/"]');
                for (const link of links) {
                    const m = link.href.match(/\/status\/(\d+)/);
                    if (m) return m[1];
                }
            }
            current = current.parentElement;
        }

        // Fallback to URL
        const match = window.location.pathname.match(/\/status\/(\d+)/);
        if (match) return match[1];

        return null;
    }

    // --- UI INJECTION ---

    const DOWNLOAD_ICON_SVG = `
        <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" style="width: 18px; height: 18px; fill: currentColor; display: block; pointer-events: none;">
            <path d="M12 16.5l-5.5-5.5h3.5v-9h4v9h3.5L12 16.5zm-9 2h18v2H3v-2z" fill="currentColor"></path>
        </svg>
    `;

    function ensureDownloadStyles() {
        if (document.getElementById('vsc-download-btn-style')) return;
        const style = document.createElement('style');
        style.id = 'vsc-download-btn-style';
        style.textContent = `
            .vsc-download-btn {
                appearance: none !important;
                -webkit-appearance: none !important;
                pointer-events: auto !important;
                cursor: pointer !important;
                background-color: transparent !important;
                border: none !important;
                border-radius: 9999px !important;
                width: 34.75px !important;
                height: 34.75px !important;
                min-width: 34.75px !important;
                min-height: 34.75px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 !important;
                color: #71767b !important;
                transition: color 0.15s ease, background-color 0.15s ease, transform 0.12s ease !important;
                user-select: none !important;
                -webkit-user-select: none !important;
                position: relative !important;
            }
            .vsc-download-btn:hover {
                color: #1d9bf0 !important;
                background-color: rgba(29, 155, 240, 0.12) !important;
            }
            .vsc-download-btn:active {
                transform: scale(0.92) !important;
                background-color: rgba(29, 155, 240, 0.2) !important;
            }
            .vsc-download-btn svg,
            .vsc-download-btn svg path {
                fill: currentColor !important;
                color: inherit !important;
                pointer-events: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
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

    function findArticleActionBar(article) {
        if (!article || !article.querySelectorAll) return null;
        const groups = Array.from(article.querySelectorAll('div[role="group"]'));
        return groups.length > 0 ? groups[groups.length - 1] : null;
    }

    const processedDownloadPlayers = new WeakSet();

    function injectDownloadButtons(rootScope) {
        ensureDownloadStyles();

        const queryRoot = (rootScope && typeof rootScope.querySelectorAll === 'function')
            ? rootScope
            : document;

        // Find all video player containers and Friends timeline video elements
        const players = queryRoot.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"], video.x-friend-card-video');
        
        players.forEach(player => {
            if (processedDownloadPlayers.has(player) && player._xDownloadBtn && player._xDownloadBtn.isConnected) {
                return;
            }

            const article = player.closest ? player.closest('article') : null;
            const actionBar = findArticleActionBar(article);

            if (actionBar) {
                // Remove any legacy download button inside the video frame itself
                const legacyInPlayer = player.querySelector ? player.querySelector('.vsc-download-btn') : null;
                if (legacyInPlayer && legacyInPlayer.parentNode) {
                    legacyInPlayer.parentNode.removeChild(legacyInPlayer);
                }

                // Ensure .x-force-friend-btn-wrap is positioned immediately to the left of the Bookmark button
                let btnWrap = actionBar.querySelector('.x-force-friend-btn-wrap');
                if (!btnWrap) {
                    btnWrap = document.createElement('div');
                    btnWrap.className = 'x-force-friend-btn-wrap';
                }
                const bookmarkRef = findBookmarkInsertionRef(actionBar);
                if (bookmarkRef) {
                    if (btnWrap.parentNode !== actionBar || btnWrap.nextSibling !== bookmarkRef) {
                        actionBar.insertBefore(btnWrap, bookmarkRef);
                    }
                } else if (btnWrap.parentNode !== actionBar) {
                    actionBar.appendChild(btnWrap);
                }

                const existingInBar = actionBar.querySelector('.vsc-download-btn');
                if (existingInBar) {
                    player._xDownloadBtn = existingInBar;
                    processedDownloadPlayers.add(player);
                    return;
                }
            } else {
                const existingInPlayer = player.querySelector ? player.querySelector('.vsc-download-btn') : null;
                if (existingInPlayer) {
                    player._xDownloadBtn = existingInPlayer;
                    processedDownloadPlayers.add(player);
                    return;
                }
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vsc-download-btn';
            btn.setAttribute('data-testid', 'vsc-download-btn');
            btn.setAttribute('aria-label', 'Download Video');
            btn.setAttribute('title', 'Download Video');
            btn.style.cursor = 'pointer';
            btn.innerHTML = DOWNLOAD_ICON_SVG;

            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const enclosingArticle = btn.closest ? btn.closest('article') : article;
                const video = (enclosingArticle && enclosingArticle.querySelector('video')) ||
                              findRelatedVideo(btn) ||
                              (player.tagName === 'VIDEO' ? player : (player.querySelector && player.querySelector('video'))) ||
                              document.querySelector('video');
                if (video) {
                    triggerDownload(video);
                } else {
                    console.warn("X Env: Target video not found for download.");
                }
            }, true);

            player._xDownloadBtn = btn;
            processedDownloadPlayers.add(player);

            if (actionBar) {
                const btnWrap = actionBar.querySelector('.x-force-friend-btn-wrap');
                const forceBtn = btnWrap ? btnWrap.querySelector('.x-force-friend-btn') : null;
                if (btnWrap) {
                    if (forceBtn) {
                        btnWrap.insertBefore(btn, forceBtn);
                    } else {
                        btnWrap.appendChild(btn);
                    }
                    return;
                }
            }

            // Fallback for standalone video players outside a tweet article
            let fallbackWrap = player.querySelector ? player.querySelector('.x-force-friend-btn-wrap') : null;
            if (!fallbackWrap) {
                fallbackWrap = document.createElement('div');
                fallbackWrap.className = 'x-force-friend-btn-wrap';
                player.appendChild(fallbackWrap);
            }
            fallbackWrap.appendChild(btn);
        });
    }

    // Run injection loop (skip when document is hidden)
    const downloadBtnInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        injectDownloadButtons();
    }, 3000);
    if (typeof downloadBtnInterval?.unref === 'function') {
        downloadBtnInterval.unref();
    }

    // --- CUSTOM MENU INJECTION ---

    function injectIntoCustomMenu(mutations) {
        for (let i = 0; i < mutations.length; i++) {
            const addedNodes = mutations[i].addedNodes;
            if (!addedNodes || addedNodes.length === 0) continue;
            for (let j = 0; j < addedNodes.length; j++) {
                const node = addedNodes[j];
                if (!node || node.nodeType !== 1) continue;

                const testId = node.getAttribute ? node.getAttribute('data-testid') : '';
                if (testId === 'cellInnerDiv' || node.tagName === 'ARTICLE') {
                    if (node.querySelector && node.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"], video.x-friend-card-video')) {
                        injectDownloadButtons(node);
                    }
                    continue;
                }

                const nodeRole = node.getAttribute ? node.getAttribute('role') : '';
                if (nodeRole !== 'menuitem' && nodeRole !== 'menu' && testId !== 'Dropdown') {
                    const parentArticle = node.closest ? node.closest('article[data-testid="tweet"]') : null;
                    if (parentArticle) {
                        if (
                            testId === 'videoPlayer' ||
                            testId === 'videoComponent' ||
                            (node.querySelector && node.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"], video.x-friend-card-video'))
                        ) {
                            injectDownloadButtons(parentArticle);
                        }
                        continue;
                    }
                }

                // X's menu items usually have role="menuitem"
                const menuItems = node.querySelectorAll ? node.querySelectorAll('[role="menuitem"]') : [];
                const itemsToProcess = menuItems.length > 0 ? Array.from(menuItems) : [];
                if (nodeRole === 'menuitem') itemsToProcess.push(node);

                for (let k = 0; k < itemsToProcess.length; k++) {
                    const item = itemsToProcess[k];
                    if (item.classList.contains('vsc-menu-processed')) continue;
                    item.classList.add('vsc-menu-processed');

                    const text = item.textContent || "";
                    if (text.includes("Copy video address")) {
                        injectDownloadItem(item);
                    }
                }
            }
        }
    }

    function injectDownloadItem(referenceItem) {
        // Clone the reference item (Copy video address)
        const newItem = referenceItem.cloneNode(true);
        newItem.classList.remove('vsc-menu-processed');
        
        // Update text
        const textEl = newItem.querySelector('span');
        if (textEl) {
            textEl.textContent = "Download Video";
        } else {
            // Fallback if structure is different
            newItem.textContent = "Download Video";
        }

        // Add Click Listener
        newItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Trigger download for the video we tracked during right-click
            if (lastRightClickedVideo) {
                triggerDownload(lastRightClickedVideo);
            } else {
                // Fallback to finding playing video
                handleContextMenuDownload();
            }

            // Close the menu (X usually closes it on click, but we'll try to find the container and remove it)
            const menuContainer = newItem.closest('[role="menu"]') || newItem.parentElement;
            if (menuContainer) {
                // We'll just let it be, X usually handles the closing.
            }
        });

        // Add hover effect matching X
        newItem.addEventListener('mouseover', () => {
            newItem.style.backgroundColor = 'rgba(255,255,255,0.1)';
        });
        newItem.addEventListener('mouseout', () => {
            newItem.style.backgroundColor = 'transparent';
        });

        // Insert after reference item
        referenceItem.after(newItem);
    }

    const menuObserver = new MutationObserver(injectIntoCustomMenu);
    
    function startMenuObserver() {
        if (document.body) {
            menuObserver.observe(document.body, { childList: true, subtree: true });
        } else {
            // Use a temporary observer to wait for body if document_start is too early
            const bodyWaitObserver = new MutationObserver((mutations, obs) => {
                if (document.body) {
                    menuObserver.observe(document.body, { childList: true, subtree: true });
                    obs.disconnect();
                }
            });
            bodyWaitObserver.observe(document.documentElement, { childList: true });
        }
    }
    startMenuObserver();

    // --- GraphQL Header Interceptor, Pre-Render Timeline Filter & X Notification Badge Monitor ---
    let headersCaptured = false;
    let latestAuthHeaders = null;
    const API_PATTERN = /x\.com\/i\/api\/graphql/;
    const TIMELINE_GRAPHQL_PATTERN = /\/i\/api\/graphql\/[^/]+\/(HomeTimeline|HomeLatestTimeline|UserTweets|UserTweetsAndReplies|SearchTimeline|ListLatestTweetsTimeline|CommunitiesRankedTimeline|CommunitiesTimeline|TweetDetail)(?:\?|$)/i;
    const BADGE_COUNT_PATTERN = /\/badge_count\/badge_count\.json/i;
    const PROMOTED_LOG_PATTERN = /\/i\/api\/1\.1\/promoted_content\/log\.json/i;
    const SENTRY_ENVELOPE_PATTERN = /ingest\.([a-z0-9-]+\.)?sentry\.io\/api\/\d+\/(?:envelope|store)\b/i;

    const NAME_FLAG_EMOJIS = {
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

    function findMatchedNameFlagRuleForName(displayNameStr) {
        if (!displayNameStr || !Array.isArray(blockedNameFlags) || blockedNameFlags.length === 0) return null;
        const normDisplay = stripVariationSelectors(displayNameStr);
        const normDisplayWithoutComposite = normDisplay
            .replace(/\u{1F3F3}\u200D\u{26A7}/gu, '')
            .replace(/\u{1F3F3}\u200D\u{1F308}/gu, '')
            .replace(/\u{1F3F4}\u200D\u{2620}/gu, '');

        for (const item of blockedNameFlags) {
            if (!item) continue;
            const rawRule = String(item).trim();
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
                const normCustom = stripVariationSelectors(rawRule).toLowerCase();
                if (normCustom && normDisplay.toLowerCase().includes(normCustom)) {
                    return `Name Flag: ${rawRule}`;
                }
            }
        }
        return null;
    }

    function findMatchedFilterRuleForAuthor(author) {
        if (!author) return null;
        const matchedFlag = findMatchedNameFlagRuleForName(author.displayName);
        if (matchedFlag) return matchedFlag;

        const screenNameLower = (author.screenName || '').toLowerCase();
        const cached = (screenNameLower && userLocationCache.get(screenNameLower)) || author.inlineLocationData || null;
        if (!cached) return null;

        const locLower = String(cached.location || '').toLowerCase();
        const devLower = String(cached.device || '').toLowerCase();
        if (!locLower && !devLower) return null;

        if (Array.isArray(blockedCountries)) {
            for (const country of blockedCountries) {
                if (!country) continue;
                const needle = String(country).trim().toLowerCase();
                if (needle && (locLower.includes(needle) || devLower.includes(needle))) {
                    return String(country).trim();
                }
            }
        }

        if (Array.isArray(blockedDeviceRegions)) {
            for (const region of blockedDeviceRegions) {
                if (!region) continue;
                const needle = String(region).trim().toLowerCase();
                if (needle && (devLower.includes(needle) || locLower.includes(needle))) {
                    return String(region).trim();
                }
            }
        }
        return null;
    }

    function unwrapTweetResult(rawResult) {
        if (!rawResult || typeof rawResult !== 'object') return null;
        if (rawResult.__typename === 'TweetWithVisibilityResults' && rawResult.tweet) {
            return rawResult.tweet;
        }
        return rawResult.tweet || rawResult;
    }

    function extractAuthorFromUserResult(userResult) {
        if (!userResult || typeof userResult !== 'object') return null;
        const unwrapped = userResult.result || userResult;
        const screenName = unwrapped?.core?.screen_name || unwrapped?.legacy?.screen_name || '';
        const displayName = unwrapped?.core?.name || unwrapped?.legacy?.name || '';
        let inlineLocationData = null;
        if (unwrapped?.about_profile && typeof unwrapped.about_profile === 'object') {
            const loc = unwrapped.about_profile.account_based_in || null;
            const dev = unwrapped.about_profile.source || null;
            if (loc || dev) {
                inlineLocationData = { screenName, location: loc, device: dev };
                if (screenName) {
                    userLocationCache.set(screenName.toLowerCase(), inlineLocationData);
                }
            }
        }
        if (!screenName && !displayName) return null;
        return { screenName, displayName, inlineLocationData };
    }

    function extractTweetAuthorsFromItemContent(itemContent, discoveredScreenNames) {
        const authors = [];
        if (!itemContent || typeof itemContent !== 'object') return authors;
        const tweet = unwrapTweetResult(itemContent.tweet_results?.result);
        if (!tweet) return authors;

        const primaryAuthor = extractAuthorFromUserResult(tweet.core?.user_results);
        if (primaryAuthor) {
            authors.push(primaryAuthor);
            if (primaryAuthor.screenName && discoveredScreenNames) {
                discoveredScreenNames.add(primaryAuthor.screenName);
            }
        }

        const retweeted = unwrapTweetResult(tweet.legacy?.retweeted_status_result?.result);
        if (retweeted) {
            const rtAuthor = extractAuthorFromUserResult(retweeted.core?.user_results);
            if (rtAuthor) {
                authors.push(rtAuthor);
                if (rtAuthor.screenName && discoveredScreenNames) {
                    discoveredScreenNames.add(rtAuthor.screenName);
                }
            }
        }

        const quoted = unwrapTweetResult(tweet.quoted_status_result?.result);
        if (quoted) {
            const qAuthor = extractAuthorFromUserResult(quoted.core?.user_results);
            if (qAuthor && qAuthor.screenName && discoveredScreenNames) {
                discoveredScreenNames.add(qAuthor.screenName);
            }
        }

        return authors;
    }

    function isCursorTimelineEntry(entry) {
        if (!entry || typeof entry !== 'object') return false;
        const entryId = String(entry.entryId || '');
        if (/^(?:cursor|bottom|top)-/i.test(entryId)) return true;
        const content = entry.content;
        if (!content || typeof content !== 'object') return false;
        return (
            content.entryType === 'TimelineTimelineCursor' ||
            content.__typename === 'TimelineTimelineCursor' ||
            content.itemContent?.itemType === 'TimelineTimelineCursor' ||
            content.itemContent?.__typename === 'TimelineTimelineCursor'
        );
    }

    function isPromotedTimelineEntry(entry) {
        if (!entry || typeof entry !== 'object') return false;
        const entryId = String(entry.entryId || '');
        if (/^promoted[-_]?/i.test(entryId)) return true;
        const content = entry.content;
        if (!content || typeof content !== 'object') return false;
        if (content.itemContent?.promotedMetadata) return true;
        if (content.clientEventInfo?.component === 'urt_promoted_tweet') return true;
        if (Array.isArray(content.items) && content.items.length > 0) {
            const allPromoted = content.items.every(it =>
                Boolean(it?.item?.itemContent?.promotedMetadata) ||
                /^promoted[-_]?/i.test(String(it?.entryId || ''))
            );
            if (allPromoted) return true;
        }
        return false;
    }

    function isBlockedTimelineEntry(entry, discoveredScreenNames) {
        if (!entry || typeof entry !== 'object') return false;
        const content = entry.content;
        if (!content || typeof content !== 'object') return false;

        if (content.itemContent) {
            const authors = extractTweetAuthorsFromItemContent(content.itemContent, discoveredScreenNames);
            for (const author of authors) {
                if (findMatchedFilterRuleForAuthor(author)) {
                    return true;
                }
            }
        }

        if (Array.isArray(content.items) && content.items.length > 0) {
            let hasTweetItems = false;
            let anyMatched = false;
            for (const subItem of content.items) {
                const subContent = subItem?.item?.itemContent;
                if (!subContent) continue;
                const authors = extractTweetAuthorsFromItemContent(subContent, discoveredScreenNames);
                if (authors.length > 0) {
                    hasTweetItems = true;
                    for (const author of authors) {
                        if (findMatchedFilterRuleForAuthor(author)) {
                            anyMatched = true;
                            break;
                        }
                    }
                }
            }
            if (hasTweetItems && anyMatched) {
                return true;
            }
        }

        return false;
    }

    function collectTimelineInstructionsArrays(node, out = [], depth = 0) {
        if (!node || typeof node !== 'object' || depth > 10) return out;
        if (Array.isArray(node.instructions)) {
            out.push(node.instructions);
        }
        for (const key of Object.keys(node)) {
            if (key === 'instructions') continue;
            const child = node[key];
            if (child && typeof child === 'object' && !Array.isArray(child)) {
                collectTimelineInstructionsArrays(child, out, depth + 1);
            }
        }
        return out;
    }

    function filterTimelineGraphQLPayload(data, url = '') {
        if (!data || typeof data !== 'object' || !isModuleEnabled) {
            return { data, modified: false };
        }
        const shouldFilterAds = Boolean(hideAdsEnabled);
        const isTweetDetail = /\/TweetDetail(?:\?|$)/i.test(String(url || ''));
        const shouldFilterLocations = Boolean(locationFilterEnabled && !isTweetDetail);

        const instructionLists = collectTimelineInstructionsArrays(data);
        if (instructionLists.length === 0) {
            return { data, modified: false };
        }

        const discoveredScreenNames = new Set();
        let modified = false;

        for (const instructions of instructionLists) {
            for (const inst of instructions) {
                if (!inst || typeof inst !== 'object') continue;
                if (Array.isArray(inst.entries) && inst.entries.length > 0) {
                    let nonCursorCount = 0;
                    for (const entry of inst.entries) {
                        if (!isCursorTimelineEntry(entry)) {
                            nonCursorCount++;
                        }
                    }
                    const minSurvivingNonCursor = nonCursorCount >= 6 ? 2 : 1;
                    let remainingNonCursor = nonCursorCount;
                    const nextEntries = [];

                    for (const entry of inst.entries) {
                        if (isCursorTimelineEntry(entry)) {
                            nextEntries.push(entry);
                            continue;
                        }
                        if (shouldFilterAds && isPromotedTimelineEntry(entry)) {
                            remainingNonCursor--;
                            modified = true;
                            continue;
                        }
                        const isBlocked = isBlockedTimelineEntry(entry, discoveredScreenNames);
                        if (shouldFilterLocations && isBlocked && remainingNonCursor > minSurvivingNonCursor) {
                            remainingNonCursor--;
                            modified = true;
                            continue;
                        }
                        if (entry?.content?.items && Array.isArray(entry.content.items) && shouldFilterAds) {
                            const origLen = entry.content.items.length;
                            entry.content.items = entry.content.items.filter(it =>
                                !it?.item?.itemContent?.promotedMetadata &&
                                !/^promoted[-_]?/i.test(String(it?.entryId || ''))
                            );
                            if (entry.content.items.length !== origLen) {
                                modified = true;
                            }
                        }
                        nextEntries.push(entry);
                    }

                    if (nextEntries.length !== inst.entries.length) {
                        inst.entries = nextEntries;
                    }
                }

                if (Array.isArray(inst.moduleItems) && inst.moduleItems.length > 0 && shouldFilterAds) {
                    const origLen = inst.moduleItems.length;
                    inst.moduleItems = inst.moduleItems.filter(it =>
                        !it?.item?.itemContent?.promotedMetadata &&
                        !/^promoted[-_]?/i.test(String(it?.entryId || ''))
                    );
                    if (inst.moduleItems.length !== origLen) {
                        modified = true;
                    }
                }
            }
        }

        if (discoveredScreenNames.size > 0) {
            const uncachedNames = [];
            for (const name of discoveredScreenNames) {
                if (name && !userLocationCache.has(name.toLowerCase())) {
                    uncachedNames.push(name);
                }
            }
            if (uncachedNames.length > 0 && typeof window !== 'undefined' && typeof window.postMessage === 'function') {
                window.postMessage({
                    type: 'X_PREFETCH_USERS',
                    payload: { screenNames: uncachedNames.slice(0, 25) }
                }, '*');
            }
        }

        return { data, modified };
    }

    function filterTimelineGraphQLResponseText(rawText, url = '') {
        if (!rawText || typeof rawText !== 'string' || !isModuleEnabled) return rawText;
        try {
            const parsed = JSON.parse(rawText);
            const { data, modified } = filterTimelineGraphQLPayload(parsed, url);
            return modified ? JSON.stringify(data) : rawText;
        } catch (e) {
            return rawText;
        }
    }

    function shouldShortCircuitTelemetryUrl(url) {
        if (!url) return false;
        const urlStr = String(url);
        return PROMOTED_LOG_PATTERN.test(urlStr) || SENTRY_ENVELOPE_PATTERN.test(urlStr);
    }

    function extractAndPostHeaders(headers) {
        let auth = null, csrf = null;
        const headerObj = {};

        if (headers instanceof Headers) {
            headers.forEach((val, key) => {
                headerObj[key] = val;
                if (key.toLowerCase() === 'authorization') auth = val;
                if (key.toLowerCase() === 'x-csrf-token') csrf = val;
            });
        } else if (headers && typeof headers === 'object') {
            for (const [key, val] of Object.entries(headers)) {
                headerObj[key] = val;
                if (key.toLowerCase() === 'authorization') auth = val;
                if (key.toLowerCase() === 'x-csrf-token') csrf = val;
            }
        }

        if (auth && csrf) {
            latestAuthHeaders = { authorization: auth, 'x-csrf-token': csrf };
            if (!headersCaptured) {
                headersCaptured = true;
                window.postMessage({
                    type: 'X_CAPTURE_HEADERS',
                    payload: { headers: headerObj }
                }, '*');
            }
        }
    }

    function handleBadgeCountPayload(data) {
        if (!data || typeof data !== 'object') return;
        const ntabUnread = typeof data.ntab_unread_count === 'number' ? data.ntab_unread_count : null;
        const dmUnread = typeof data.dm_unread_count === 'number' ? data.dm_unread_count : null;
        if (ntabUnread !== null || dmUnread !== null) {
            window.postMessage({
                type: 'X_BADGE_COUNT_EVENT',
                payload: {
                    ntabUnread: ntabUnread !== null ? ntabUnread : 0,
                    dmUnread: dmUnread !== null ? dmUnread : 0,
                    totalUnread: typeof data.total_unread_count === 'number' ? data.total_unread_count : 0
                }
            }, '*');
        }
    }

    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = '';
        try {
            url = typeof input === 'string' ? input : (input?.url || '');
            if (url && shouldShortCircuitTelemetryUrl(url)) {
                if (typeof Response === 'function') {
                    return Promise.resolve(new Response('{}', {
                        status: 200,
                        statusText: 'OK',
                        headers: { 'content-type': 'application/json; charset=utf-8' }
                    }));
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => Promise.resolve({}),
                    text: () => Promise.resolve('{}'),
                    clone: function() { return this; }
                });
            }
            if (url && API_PATTERN.test(url) && init?.headers) {
                extractAndPostHeaders(init.headers);
            }
        } catch (e) {}
        const fetchPromise = origFetch.apply(this, arguments);
        try {
            if (url && BADGE_COUNT_PATTERN.test(url) && fetchPromise && typeof fetchPromise.then === 'function') {
                fetchPromise.then(res => {
                    if (res && res.ok && typeof res.clone === 'function') {
                        res.clone().json().then(handleBadgeCountPayload).catch(() => {});
                    }
                }).catch(() => {});
            }
            if (url && TIMELINE_GRAPHQL_PATTERN.test(url) && fetchPromise && typeof fetchPromise.then === 'function') {
                return fetchPromise.then(async (res) => {
                    try {
                        if (!res || !res.ok || typeof res.text !== 'function') return res;
                        const clone = typeof res.clone === 'function' ? res.clone() : res;
                        const rawText = await clone.text();
                        if (!rawText) return res;
                        const filteredText = filterTimelineGraphQLResponseText(rawText, url);
                        if (filteredText === rawText) return res;
                        if (typeof Response === 'function') {
                            const headers = new Headers(res.headers || { 'content-type': 'application/json; charset=utf-8' });
                            return new Response(filteredText, {
                                status: res.status || 200,
                                statusText: res.statusText || 'OK',
                                headers
                            });
                        }
                        return {
                            ok: res.ok,
                            status: res.status,
                            statusText: res.statusText,
                            headers: res.headers,
                            json: () => Promise.resolve(JSON.parse(filteredText)),
                            text: () => Promise.resolve(filteredText),
                            clone: function() { return this; }
                        };
                    } catch (err) {
                        return res;
                    }
                });
            }
        } catch (e) {}
        return fetchPromise;
    };

    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origXHRSend = XMLHttpRequest.prototype.send;
    const nativeXHRResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    const nativeXHRResponseDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');

    function attachTimelineXHRFilter(xhr) {
        if (!xhr || xhr._xTimelineFilterAttached) return;
        xhr._xTimelineFilterAttached = true;

        try {
            Object.defineProperty(xhr, 'responseText', {
                configurable: true,
                get() {
                    const raw = nativeXHRResponseTextDesc && typeof nativeXHRResponseTextDesc.get === 'function'
                        ? nativeXHRResponseTextDesc.get.call(this)
                        : '';
                    if (this.readyState !== 4 || typeof raw !== 'string' || !raw) {
                        return raw;
                    }
                    if (this._xFilteredSourceRaw !== raw) {
                        this._xFilteredSourceRaw = raw;
                        this._xFilteredResponseText = filterTimelineGraphQLResponseText(raw, this._xUrl);
                    }
                    return this._xFilteredResponseText;
                }
            });

            Object.defineProperty(xhr, 'response', {
                configurable: true,
                get() {
                    const rType = this.responseType || '';
                    if (this.readyState === 4 && (rType === '' || rType === 'text')) {
                        return this.responseText;
                    }
                    const rawResp = nativeXHRResponseDesc && typeof nativeXHRResponseDesc.get === 'function'
                        ? nativeXHRResponseDesc.get.call(this)
                        : null;
                    if (this.readyState === 4 && rType === 'json' && rawResp && typeof rawResp === 'object') {
                        if (!this._xFilteredJsonObj) {
                            const cloned = JSON.parse(JSON.stringify(rawResp));
                            filterTimelineGraphQLPayload(cloned, this._xUrl);
                            this._xFilteredJsonObj = cloned;
                        }
                        return this._xFilteredJsonObj;
                    }
                    return rawResp;
                }
            });
        } catch (e) {}
    }

    XMLHttpRequest.prototype.open = function(method, url) {
        try {
            this._xUrl = url;
            this._xHeaders = {};
        } catch (e) {}
        return origXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        try {
            if (this._xHeaders) this._xHeaders[name] = value;
        } catch (e) {}
        return origXHRSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        try {
            if (this._xUrl && shouldShortCircuitTelemetryUrl(this._xUrl)) {
                const xhr = this;
                const resolvedUrl = String(xhr._xUrl || 'https://x.com/i/api/1.1/promoted_content/log.json');
                setTimeout(() => {
                    try {
                        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
                        Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
                        Object.defineProperty(xhr, 'statusText', { value: 'OK', configurable: true });
                        Object.defineProperty(xhr, 'responseText', { value: '{}', configurable: true });
                        Object.defineProperty(xhr, 'response', {
                            value: xhr.responseType === 'json' ? {} : '{}',
                            configurable: true
                        });
                        Object.defineProperty(xhr, 'responseURL', { value: resolvedUrl, configurable: true });
                        xhr.getAllResponseHeaders = () => 'content-type: application/json; charset=utf-8\r\n';
                        xhr.getResponseHeader = (headerName) => (
                            String(headerName || '').toLowerCase() === 'content-type'
                                ? 'application/json; charset=utf-8'
                                : null
                        );
                        if (typeof Event === 'function' && typeof xhr.dispatchEvent === 'function') {
                            xhr.dispatchEvent(new Event('readystatechange'));
                            xhr.dispatchEvent(new Event('load'));
                            xhr.dispatchEvent(new Event('loadend'));
                        }
                    } catch (err) {}
                }, 0);
                return;
            }
            if (this._xUrl && API_PATTERN.test(this._xUrl) && this._xHeaders) {
                extractAndPostHeaders(this._xHeaders);
            }
            if (this._xUrl && TIMELINE_GRAPHQL_PATTERN.test(this._xUrl)) {
                attachTimelineXHRFilter(this);
            }
            if (this._xUrl && BADGE_COUNT_PATTERN.test(this._xUrl) && typeof this.addEventListener === 'function') {
                this.addEventListener('load', function() {
                    try {
                        if (this.status >= 200 && this.status < 300 && this.responseText) {
                            handleBadgeCountPayload(JSON.parse(this.responseText));
                        }
                    } catch (e) {}
                });
            }
        } catch (e) {}
        return origXHRSend.apply(this, arguments);
    };

    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const origSendBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function(url, data) {
                try {
                    if (url && shouldShortCircuitTelemetryUrl(url)) {
                        return true;
                    }
                } catch (e) {}
                return origSendBeacon(url, data);
            };
        }
    } catch (e) {}

    // Bridge Web Notification API inside Mobile WebView so X notifications forward to Android Notification Center
    try {
        if (window.__X414_MOBILE__ || window.ReactNativeWebView) {
            class X414BridgedNotification {
                static get permission() {
                    return 'granted';
                }
                static requestPermission(cb) {
                    if (typeof cb === 'function') {
                        try { cb('granted'); } catch (e) {}
                    }
                    return Promise.resolve('granted');
                }
                constructor(title, options = {}) {
                    this.title = String(title || 'X Notification');
                    this.body = String(options?.body || '');
                    this.tag = String(options?.tag || '');
                    this.data = options?.data || null;
                    this.onclick = null;
                    this.onclose = null;
                    window.postMessage({
                        type: 'X_WEB_NOTIFICATION_EVENT',
                        payload: {
                            title: this.title,
                            body: this.body,
                            tag: this.tag,
                            url: (options?.data && options.data.url) || 'https://x.com/notifications'
                        }
                    }, '*');
                }
                close() {
                    if (typeof this.onclose === 'function') {
                        try { this.onclose(); } catch (e) {}
                    }
                }
            }
            window.Notification = X414BridgedNotification;

            if (typeof ServiceWorkerRegistration !== 'undefined' && ServiceWorkerRegistration.prototype) {
                const origShowNotif = ServiceWorkerRegistration.prototype.showNotification;
                ServiceWorkerRegistration.prototype.showNotification = function(title, options = {}) {
                    window.postMessage({
                        type: 'X_WEB_NOTIFICATION_EVENT',
                        payload: {
                            title: String(title || 'X Notification'),
                            body: String(options?.body || ''),
                            tag: String(options?.tag || ''),
                            url: (options?.data && options.data.url) || 'https://x.com/notifications'
                        }
                    }, '*');
                    if (typeof origShowNotif === 'function') {
                        return origShowNotif.apply(this, arguments).catch(() => {});
                    }
                    return Promise.resolve();
                };
            }
        }
    } catch (e) {}

    // --- In-Place Tweet Interactions (Like, Repost, Bookmark) via X Internal API / Webpack ---
    const X_WEB_BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
    const MUTATION_DEFAULTS = {
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

    let wpRequireCache = null;
    let cachedXInternalApi = null;
    const opDescCache = new Map();

    function getWebpackRequire() {
        if (wpRequireCache) return wpRequireCache;
        const chunk = window.webpackChunk_twitter_responsive_web;
        if (Array.isArray(chunk)) {
            try {
                chunk.push([[Symbol('x_ext_probe')], {}, (r) => {
                    wpRequireCache = r;
                }]);
            } catch (e) {}
        }
        return wpRequireCache;
    }

    function resolveOperationDescriptor(actionType) {
        const spec = MUTATION_DEFAULTS[actionType];
        if (!spec) return null;
        if (opDescCache.has(spec.operationName)) {
            return opDescCache.get(spec.operationName);
        }

        const req = getWebpackRequire();
        if (req && req.m) {
            try {
                for (const modId of Object.keys(req.m)) {
                    const fnStr = String(req.m[modId]);
                    if (fnStr.includes(`operationName:"${spec.operationName}"`) || fnStr.includes(`operationName: "${spec.operationName}"`)) {
                        const exported = req(modId);
                        if (exported && exported.queryId && exported.operationName === spec.operationName) {
                            opDescCache.set(spec.operationName, exported);
                            return exported;
                        }
                    }
                }
            } catch (e) {}
        }

        const fallback = {
            queryId: spec.queryId,
            operationName: spec.operationName,
            operationType: 'mutation',
            metadata: { featureSwitches: [], fieldToggles: [] }
        };
        opDescCache.set(spec.operationName, fallback);
        return fallback;
    }

    function getXInternalApi() {
        if (cachedXInternalApi && cachedXInternalApi.apiClient) return cachedXInternalApi;
        const rootEl = document.getElementById('react-root') || document.body;
        if (!rootEl) return null;

        const visited = new WeakSet();
        const queue = [];
        for (const key of Object.keys(rootEl)) {
            if (key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$')) {
                queue.push(rootEl[key]);
            }
        }

        let steps = 0;
        while (queue.length > 0 && steps < 500) {
            steps++;
            const fiber = queue.shift();
            if (!fiber || typeof fiber !== 'object' || visited.has(fiber)) continue;
            visited.add(fiber);

            const storeCandidate =
                fiber.memoizedProps?.store ||
                fiber.pendingProps?.store ||
                fiber.stateNode?.store ||
                fiber.memoizedState?.element?.props?.store;

            if (storeCandidate && typeof storeCandidate.dispatch === 'function' && typeof storeCandidate.getState === 'function') {
                try {
                    storeCandidate.dispatch((dispatch, getState, extra) => {
                        if (extra && extra.api && extra.api.apiClient) {
                            cachedXInternalApi = extra.api;
                        }
                    });
                    if (cachedXInternalApi) return cachedXInternalApi;
                } catch (e) {}
            }

            if (fiber.child) queue.push(fiber.child);
            if (fiber.sibling) queue.push(fiber.sibling);
        }
        return cachedXInternalApi;
    }

    async function generateClientTransactionId(path, method = 'POST') {
        const req = getWebpackRequire();
        if (!req || !req.m) return null;
        try {
            if (req.m[265390]) {
                const mod = req(265390);
                if (mod && typeof mod.kc === 'function') {
                    return await mod.kc('https://x.com', path, method);
                }
            }
            for (const modId of Object.keys(req.m)) {
                const fnStr = String(req.m[modId]);
                if (fnStr.includes('x-client-transaction-id') && fnStr.includes('rweb_client_transaction_id_enabled')) {
                    const mod = req(modId);
                    if (mod && typeof mod.kc === 'function') {
                        return await mod.kc('https://x.com', path, method);
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    async function executeMainWorldTweetAction(actionType, tweetId) {
        const spec = MUTATION_DEFAULTS[actionType];
        if (!spec || !tweetId) return false;
        const opDesc = resolveOperationDescriptor(actionType);
        const variables = spec.buildVariables(tweetId);

        // 1. Primary: Use X's own internal apiClient.graphQL (includes x-client-transaction-id & session binding)
        const xApi = getXInternalApi();
        if (xApi && xApi.apiClient && typeof xApi.apiClient.graphQL === 'function') {
            try {
                await xApi.apiClient.graphQL(opDesc, variables);
                return true;
            } catch (err) {
                console.warn(`X Env: internal apiClient.graphQL failed for ${actionType}, falling back to signed fetch`, err);
            }
        }

        // 2. Fallback: Direct fetch with dynamically generated x-client-transaction-id
        const apiPath = `/i/api/graphql/${opDesc.queryId}/${opDesc.operationName}`;
        const csrfMatch = (document.cookie || '').match(/(?:^|;\s*)ct0=([^;]+)/);
        const csrfToken = csrfMatch && csrfMatch[1] ? decodeURIComponent(csrfMatch[1]) : '';
        const txId = await generateClientTransactionId(apiPath, 'POST');

        const headers = {
            'authorization': X_WEB_BEARER,
            'content-type': 'application/json',
            'x-twitter-active-user': 'yes',
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-client-language': 'en'
        };
        if (csrfToken) headers['x-csrf-token'] = csrfToken;
        if (txId) headers['x-client-transaction-id'] = txId;

        try {
            const res = await origFetch(`https://x.com${apiPath}`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    variables,
                    queryId: opDesc.queryId
                })
            });
            return Boolean(res && res.ok);
        } catch (e) {
            return false;
        }
    }

    async function pollXBadgeCount() {
        try {
            const csrfMatch = (document.cookie || '').match(/(?:^|;\s*)ct0=([^;]+)/);
            const csrfToken = (csrfMatch && csrfMatch[1] ? decodeURIComponent(csrfMatch[1]) : '') || (latestAuthHeaders && latestAuthHeaders['x-csrf-token']) || '';
            if (!csrfToken) return false;

            const headers = {
                'authorization': (latestAuthHeaders && latestAuthHeaders.authorization) || X_WEB_BEARER,
                'x-csrf-token': csrfToken,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session',
                'x-twitter-client-language': 'en'
            };

            const res = await origFetch('https://x.com/i/api/2/badge_count/badge_count.json?supports_ntab_urt=1', {
                method: 'GET',
                credentials: 'include',
                headers
            });
            if (res && res.ok) {
                const data = await res.json();
                handleBadgeCountPayload(data);
                return true;
            }
        } catch (e) {}
        return false;
    }

    if (typeof window !== 'undefined' && (window.__X414_MOBILE__ || window.ReactNativeWebView)) {
        window.__X414_POLL_X_NOTIFICATIONS__ = pollXBadgeCount;
        setTimeout(() => {
            pollXBadgeCount();
        }, 4000);
        const badgePollInterval = setInterval(() => {
            pollXBadgeCount();
        }, 25000);
        if (typeof badgePollInterval?.unref === 'function') {
            badgePollInterval.unref();
        }
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'X_PERFORM_TWEET_ACTION' && event.data.payload) {
            const { actionType, tweetId } = event.data.payload;
            executeMainWorldTweetAction(actionType, tweetId);
        }
        if (event.data.type === 'X_POLL_BADGE_COUNT') {
            pollXBadgeCount();
        }
    });

    if (typeof window !== 'undefined') {
        window.XEnv = {
            allowedUnmuted,
            shadowMutedState,
            injectDownloadButtons,
            executeMainWorldTweetAction,
            pollXBadgeCount,
            filterTimelineGraphQLPayload,
            filterTimelineGraphQLResponseText,
            userLocationCache,
            get isModuleEnabled() { return isModuleEnabled; },
            get alwaysMuteEnabled() { return alwaysMuteEnabled; },
            get currentVolume() { return currentVolume; },
            get hideAdsEnabled() { return hideAdsEnabled; },
            get locationFilterEnabled() { return locationFilterEnabled; }
        };
    }

})();
