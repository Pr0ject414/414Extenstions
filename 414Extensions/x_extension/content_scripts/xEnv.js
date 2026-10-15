
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

    // Listen for Settings from Bridge (xSettingsLoader.js)
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'X_SETTINGS_UPDATE') {
            const { isEnabled, alwaysMute, volumeLevel } = event.data.payload;
            isModuleEnabled = isEnabled;
            alwaysMuteEnabled = alwaysMute;
            
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
    
    // We also hijack setAttribute just in case
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (this.tagName === 'VIDEO' && name === 'muted') {
            // Setting 'muted' attribute -> Muted=true.
            // Removing it -> Muted=false.
            // HTML attributes are reflected in property, but let's just let the property hijack handle the reflection if possible.
            // However, setAttribute('muted', '') forces muted=true. strict.
            // X might use removeAttribute('muted') to unmute.
        }
        return originalSetAttribute.apply(this, arguments);
    };
    
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
        // Check URL first
        const match = window.location.pathname.match(/\/status\/(\d+)/);
        if (match) return match[1];

        // Check DOM (article tag) up from video
        let current = element;
        for (let i = 0; i < 20; i++) {
            if (!current) break;
            if (current.tagName === 'ARTICLE') {
                const links = current.querySelectorAll('a[href*="/status/"]');
                for (const link of links) {
                    const m = link.href.match(/\/status\/(\d+)/);
                    if (m) return m[1];
                }
            }
            current = current.parentElement;
        }
        return null;
    }

    // --- UI INJECTION ---

    const DOWNLOAD_ICON_SVG = `
        <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 20px; height: 20px; fill: #ffffff !important; display: block; pointer-events: none;">
            <path d="M12 16.5l-5.5-5.5h3.5v-9h4v9h3.5L12 16.5zm-9 2h18v2H3v-2z" fill="#ffffff"></path>
        </svg>
    `;

    function ensureDownloadStyles() {
        if (document.getElementById('vsc-download-btn-style')) return;
        const style = document.createElement('style');
        style.id = 'vsc-download-btn-style';
        style.textContent = `
            .vsc-download-btn {
                pointer-events: auto !important;
                cursor: pointer !important;
                background-color: transparent !important;
                border: none !important;
                border-radius: 50% !important;
                width: 36px !important;
                height: 36px !important;
                min-width: 36px !important;
                min-height: 36px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 4px !important;
                color: #ffffff !important;
                opacity: 0.85 !important;
                transition: opacity 0.15s ease, background-color 0.15s ease, transform 0.15s ease !important;
                user-select: none !important;
                -webkit-user-select: none !important;
                z-index: 99999 !important;
                position: relative !important;
            }
            .vsc-download-btn:hover {
                opacity: 1 !important;
                background-color: rgba(255, 255, 255, 0.2) !important;
                transform: scale(1.1) !important;
            }
            .vsc-download-btn:active {
                transform: scale(0.95) !important;
                background-color: rgba(255, 255, 255, 0.3) !important;
            }
            .vsc-download-btn svg,
            .vsc-download-btn svg path {
                fill: #ffffff !important;
                color: #ffffff !important;
                pointer-events: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function injectDownloadButtons() {
        ensureDownloadStyles();

        // Find all video player containers
        const players = document.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"]');
        
        players.forEach(player => {
            // 1. Check if this player already has our button anywhere inside
            if (player.querySelector('.vsc-download-btn')) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vsc-download-btn';
            btn.setAttribute('aria-label', 'Download Video');
            btn.setAttribute('title', 'Download Video');
            btn.style.cssText = 'pointer-events: auto !important; cursor: pointer !important; background-color: transparent !important; border: none !important; border-radius: 50% !important; width: 36px !important; height: 36px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; margin: 0 4px !important; color: #ffffff !important; z-index: 99999 !important; position: relative !important;';
            btn.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; pointer-events: none; width: 100%; height: 100%;">
                    ${DOWNLOAD_ICON_SVG}
                </div>
            `;

            // Hover effects
            btn.addEventListener('mouseenter', () => {
                btn.style.setProperty('opacity', '1', 'important');
                btn.style.setProperty('background-color', 'rgba(255, 255, 255, 0.2)', 'important');
                btn.style.setProperty('transform', 'scale(1.1)', 'important');
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.setProperty('opacity', '0.85', 'important');
                btn.style.setProperty('background-color', 'transparent', 'important');
                btn.style.setProperty('transform', 'scale(1)', 'important');
            });

            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                btn.style.setProperty('transform', 'scale(0.95)', 'important');
            }, true);

            btn.addEventListener('mouseup', () => {
                btn.style.setProperty('transform', 'scale(1.1)', 'important');
            });
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const video = findRelatedVideo(btn) || player.querySelector('video') || document.querySelector('video');
                if (video) {
                    triggerDownload(video);
                } else {
                    console.warn("X Env: Target video not found for download.");
                }
            }, true);

            // 2. Find the best container or insertion point
            const settingsBtn = player.querySelector('button[aria-label="Settings"], button[aria-label="Playback settings"], button[aria-label="Video Settings"], button[aria-label="Video settings"]');
            const fullscreenBtn = player.querySelector('button[aria-label="Fullscreen"], button[aria-label="Full screen"], [data-testid="fullScreenButton"]');
            const muteBtn = player.querySelector('button[aria-label="Mute"], button[aria-label="Unmute"], [data-testid="muteButton"], [data-testid="unmuteButton"]');

            if (settingsBtn && settingsBtn.parentElement) {
                settingsBtn.parentElement.insertBefore(btn, settingsBtn);
            } else if (fullscreenBtn && fullscreenBtn.parentElement) {
                fullscreenBtn.parentElement.insertBefore(btn, fullscreenBtn);
            } else if (muteBtn && muteBtn.parentElement) {
                muteBtn.parentElement.after(btn);
            } else {
                // Secondary check: General controls container
                const container = player.querySelector('.r-633pao') || 
                                  player.querySelector('.r-ero68b.r-17s6mgv.r-1awozwy.r-18u37iz') ||
                                  player.querySelector('.r-18u37iz.r-1wtj0ep.r-13qz1uu');
                if (container) {
                    container.appendChild(btn);
                } else {
                    // Fallback: floating overlay icon in player
                    btn.style.setProperty('position', 'absolute', 'important');
                    btn.style.setProperty('top', '12px', 'important');
                    btn.style.setProperty('right', '12px', 'important');
                    btn.style.setProperty('background-color', 'rgba(0, 0, 0, 0.6)', 'important');
                    btn.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.5)', 'important');
                    player.appendChild(btn);
                }
            }
        });
    }

    // Run injection loop
    setInterval(injectDownloadButtons, 2000);

    // --- CUSTOM MENU INJECTION ---

    function injectIntoCustomMenu(mutations) {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;

                // X's menu items usually have role="menuitem"
                const menuItems = node.querySelectorAll ? node.querySelectorAll('[role="menuitem"]') : [];
                // Also check the node itself if it's the menu item
                const itemsToProcess = Array.from(menuItems);
                if (node.getAttribute && node.getAttribute('role') === 'menuitem') itemsToProcess.push(node);

                itemsToProcess.forEach(item => {
                    if (item.classList.contains('vsc-menu-processed')) return;
                    item.classList.add('vsc-menu-processed');

                    const text = item.textContent || "";
                    if (text.includes("Copy video address")) {
                        // Found the right menu! Inject our Download button.
                        injectDownloadItem(item);
                    }
                });
            });
        });
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

    // --- GraphQL Header Interceptor for X Location ---
    let headersCaptured = false;
    const API_PATTERN = /x\.com\/i\/api\/graphql/;

    function extractAndPostHeaders(headers) {
        if (headersCaptured) return;
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
            headersCaptured = true;
            window.postMessage({
                type: 'X_CAPTURE_HEADERS',
                payload: { headers: headerObj }
            }, '*');
        }
    }

    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        try {
            const url = typeof input === 'string' ? input : input?.url;
            if (url && API_PATTERN.test(url) && init?.headers) {
                extractAndPostHeaders(init.headers);
            }
        } catch (e) {}
        return origFetch.apply(this, arguments);
    };

    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origXHRSend = XMLHttpRequest.prototype.send;

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
            if (this._xUrl && API_PATTERN.test(this._xUrl) && this._xHeaders) {
                extractAndPostHeaders(this._xHeaders);
            }
        } catch (e) {}
        return origXHRSend.apply(this, arguments);
    };

    if (typeof window !== 'undefined') {
        window.XEnv = {
            allowedUnmuted,
            shadowMutedState,
            injectDownloadButtons,
            get isModuleEnabled() { return isModuleEnabled; },
            get alwaysMuteEnabled() { return alwaysMuteEnabled; },
            get currentVolume() { return currentVolume; }
        };
    }

})();
