(function() {
    if (window.hasVolumeMainWorldInjected) return;
    window.hasVolumeMainWorldInjected = true;

    let currentVolume = 1.0;
    const allShadowRoots = new Set();
    const allAudioContexts = new Set();
    const allMediaElements = new Set();

    // --- 1. SHADOW DOM TRACKING (Even Closed Ones) ---
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
        const shadowRoot = originalAttachShadow.call(this, init);
        allShadowRoots.add(shadowRoot);
        return shadowRoot;
    };

    // --- 2. AUDIOCONTEXT TRACKING & HIJACKING ---
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
        const originalConnect = AudioNode.prototype.connect;
        
        // Helper to ensure an AudioContext has our master gain node
        function ensureMasterGain(ctx) {
            if (ctx.__extensionMasterGain) return ctx.__extensionMasterGain;

            try {
                const gain = ctx.createGain();
                gain.gain.value = currentVolume;
                // Use the original connect to avoid recursion
                originalConnect.call(gain, ctx.destination);
                ctx.__extensionMasterGain = gain;
                allAudioContexts.add(ctx);
                return gain;
            } catch (e) {
                return null;
            }
        }

        // Hijack connect to intercept everything going to destination
        AudioNode.prototype.connect = function(destination, output, input) {
            if (destination && destination === this.context.destination) {
                const masterGain = ensureMasterGain(this.context);
                if (masterGain) {
                    return originalConnect.call(this, masterGain, output, input);
                }
            }
            return originalConnect.apply(this, arguments);
        };
    }

    // --- 3. SPEECH SYNTHESIS HIJACK ---
    if (window.speechSynthesis) {
        const originalSpeak = window.speechSynthesis.speak;
        window.speechSynthesis.speak = function(utterance) {
            if (utterance) {
                utterance.volume = Math.min(1.0, currentVolume);
            }
            return originalSpeak.call(this, utterance);
        };
    }

    // --- 4. MEDIA ELEMENT TRACKING ---
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
        allMediaElements.add(this);
        syncElementVolume(this);
        return originalPlay.apply(this, arguments);
    };

    function syncElementVolume(el) {
        // We NO LONGER set el.volume directly because it overrides the site's own controls.
        // Instead, we rely on the GainNode boost.
        // Exception: SpeechSynthesis (handled separately in hookSpeechSynthesis)
        
        // However, we still need to ensure elements are attached to a GainNode if we want to BOOST them.
        if (currentVolume > 1.01 || currentVolume < 0.99) {
            attachToInternalAudioContext(el);
        }
    }

    const elementContexts = new WeakMap();
    function attachToInternalAudioContext(el) {
        if (elementContexts.has(el)) {
            const { gain } = elementContexts.get(el);
            gain.gain.value = currentVolume;
            return;
        }

        // Only attach if not already handled by a page AudioContext
        // (This is a bit tricky to detect perfectly, but createMediaElementSource will throw if already attached)
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaElementSource(el);
            const gain = ctx.createGain();
            gain.gain.value = currentVolume;
            source.connect(gain);
            gain.connect(ctx.destination);
            elementContexts.set(el, { ctx, gain });
        } catch (e) {
            // Already attached to another context, or CORS issue.
            // In this case, our AudioContext hijack might already be covering it,
            // or we just can't boost it further via Web Audio.
        }
    }

    // --- 5. PERIODIC SCAN (Deep) ---
    function scanDeep() {
        // Sync native media
        const media = document.querySelectorAll('audio, video');
        media.forEach(el => {
            allMediaElements.add(el);
            syncElementVolume(el);
        });

        // Scan tracked shadow roots
        allShadowRoots.forEach(root => {
            try {
                root.querySelectorAll('audio, video').forEach(el => {
                    allMediaElements.add(el);
                    syncElementVolume(el);
                });
            } catch (e) {
                allShadowRoots.delete(root);
            }
        });

        // Sync AudioContexts
        allAudioContexts.forEach(ctx => {
            if (ctx.__extensionMasterGain) {
                ctx.__extensionMasterGain.gain.value = currentVolume;
            }
            if (ctx.state === 'closed') allAudioContexts.delete(ctx);
        });
    }

    setInterval(scanDeep, 2000);

    // --- 6. BRIDGE (Message Listener) ---
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'SET_VOLUME_BOOST') {
            currentVolume = event.data.volume;
            // Immediate apply
            allAudioContexts.forEach(ctx => {
                if (ctx.__extensionMasterGain) ctx.__extensionMasterGain.gain.value = currentVolume;
            });
            allMediaElements.forEach(syncElementVolume);
        }
    });
})();
