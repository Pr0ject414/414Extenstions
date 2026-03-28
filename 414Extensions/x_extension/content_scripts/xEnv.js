
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
                currentVolume = volumeLevel;

                // Real-time update: Apply to all videos if volume changed
                // This ensures that dragging the popup slider immediately affects the video
                if (Math.abs(oldVolume - currentVolume) > 0.001) {
                     const videos = document.querySelectorAll('video');
                     videos.forEach(v => applyOriginalVolume(v, currentVolume));
                }
            }
            // console.log("X Env: Settings updated.", { isModuleEnabled, alwaysMuteEnabled, currentVolume });
        }
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
                    currentVolume = value;
                    originalVolumeDescriptor.set.call(this, value); 
                    
                    // Save to storage (throttling might be good, but explicit msg is fine for now)
                    window.postMessage({
                        type: 'X_SAVE_VOLUME',
                        payload: currentVolume
                    }, '*');
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

    if (typeof window !== 'undefined') {
        window.XEnv = {
            allowedUnmuted,
            shadowMutedState,
            get isModuleEnabled() { return isModuleEnabled; },
            get alwaysMuteEnabled() { return alwaysMuteEnabled; },
            get currentVolume() { return currentVolume; }
        };
    }

})();
