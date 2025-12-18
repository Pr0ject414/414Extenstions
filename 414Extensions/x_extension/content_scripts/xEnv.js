
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

    // Listen for Settings from Bridge (xSettingsLoader.js)
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'X_SETTINGS_UPDATE') {
            const { isEnabled, alwaysMute } = event.data.payload;
            isModuleEnabled = isEnabled;
            alwaysMuteEnabled = alwaysMute;
            // console.log("X Env: Settings updated.", { isModuleEnabled, alwaysMuteEnabled });
        }
    });

    // 1. CLICK LISTENER (User Intent)
    document.addEventListener('click', (e) => {
        const target = e.target;
        const muteButton = target.closest('[aria-label="Mute"]');
        const unmuteButton = target.closest('[aria-label="Unmute"]');
        const volSlider = target.closest('[aria-label="Volume slider"]');
        
        if (unmuteButton || volSlider) {
             const video = findRelatedVideo(unmuteButton || volSlider);
             if (video) {
                 // console.log("X Env: User allowed video.", video);
                 allowedUnmuted.add(video);
                 // Force update to match shadow state (which is likely 'false' if X tried to unmute it)
                 if (shadowMutedState.has(video)) {
                     const desired = shadowMutedState.get(video);
                     if (desired === false) {
                         // Apply the pending unmute
                         applyOriginalMuted(video, false);
                     }
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

                if (allowedUnmuted.has(this)) {
                    // User explicitly allowed this video. Let it unmute.
                    applyOriginalMuted(this, false);
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

    console.log("X Env: Prototype hijacking applied.");

})();
