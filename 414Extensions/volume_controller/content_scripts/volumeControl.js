// KylesChromeExtensions/volume_controller/content_scripts/volumeControl.js
(function() {
    if (window.hasVolumeControlInjected) return;
    window.hasVolumeControlInjected = true;

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const VOLUME_MODULE_VISIBLE_KEY = 'isVolumeModuleVisible';

    chrome.storage.local.get([GLOBAL_MASTER_SWITCH_ENABLED_KEY, VOLUME_MODULE_VISIBLE_KEY], (result) => {
        if (result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] === false || result[VOLUME_MODULE_VISIBLE_KEY] === false) {
            return;
        }

        startVolumeControl();
    });

    function startVolumeControl() {
    let audioCtx;
    let gainNode;
    let mediaSources = new WeakMap();
    let currentVolume = 1.0;

    function initAudioContext() {
        if (!audioCtx) {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
                gainNode = audioCtx.createGain();
                gainNode.connect(audioCtx.destination);
                gainNode.gain.value = currentVolume;
                // console.log("VolumeControl: AudioContext initialized. State:", audioCtx.state);
            } catch (e) {
                // console.error("VolumeControl: Failed to initialize AudioContext", e);
            }
        }
        return audioCtx;
    }

    // Add gesture listeners to unlock AudioContext
    const unlockEvents = ['mousedown', 'keydown', 'touchstart'];
    const unlockAudio = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                // console.log("VolumeControl: AudioContext resumed via user gesture.");
                unlockEvents.forEach(evt => document.removeEventListener(evt, unlockAudio, true));
            });
        }
    };
    unlockEvents.forEach(evt => document.addEventListener(evt, unlockAudio, true));

    function ensureCORS(mediaElement) {
        // We no longer programmatically set crossOrigin because it can break
        // playback if the server doesn't support CORS headers (like Google's assets).
        // We just return the CORS state for decision making.
        const src = mediaElement.currentSrc || mediaElement.src || (mediaElement.querySelector('source') && mediaElement.querySelector('source').src);
        if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
            try {
                const url = new URL(src, window.location.href);
                if (url.origin !== window.location.origin) {
                    return (mediaElement.crossOrigin === 'anonymous' || mediaElement.crossOrigin === 'use-credentials');
                }
            } catch (e) {}
        }
        return true; // same-origin or handled
    }

    function attachToMedia(mediaElement) {
        if (!ensureCORS(mediaElement)) {
            // Already cross-origin and no CORS. If we haven't logged it yet, do so.
            if (!mediaSources.has(mediaElement)) {
                mediaSources.set(mediaElement, null); // Mark as skipped
            }
            // Always sync native volume for skipped elements (handles dynamically loaded sources)
            mediaElement.volume = Math.min(1.0, currentVolume);
            return;
        }

        if (mediaSources.has(mediaElement) && mediaSources.get(mediaElement) !== null) return;

        try {
            initAudioContext();
            // Try to attach
            const source = audioCtx.createMediaElementSource(mediaElement);
            source.connect(gainNode);
            mediaSources.set(mediaElement, source);
            // console.log("VolumeControl: Attached to media element", mediaElement);
        } catch (e) {
            // console.error("VolumeControl: Failed to attach to media element", e);
            mediaSources.set(mediaElement, null);
        }
    }

    function scanForMedia() {
        document.querySelectorAll('audio, video').forEach(attachToMedia);
    }

    // Capture late-bound sources (like Google Pronunciation)
    document.addEventListener('play', (e) => {
        if (e.target.tagName === 'AUDIO' || e.target.tagName === 'VIDEO') {
            attachToMedia(e.target);
        }
    }, true);

    // Observer for new media elements
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
                        attachToMedia(node);
                    } else {
                        node.querySelectorAll && node.querySelectorAll('audio, video').forEach(attachToMedia);  
                    }
                }
            });
        });
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // Initial scan
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanForMedia);
    } else {
        scanForMedia();
    }

    // Polling fallback for complex SPAs (like Instagram) where Observer might miss rapid changes
    // or if elements are added in specific ways.
    setInterval(scanForMedia, 2000);

    // Listen for messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "setVolume") {
            const newVolume = parseFloat(request.volume);
            if (!isNaN(newVolume)) {
                currentVolume = newVolume;
                if (gainNode) {
                    gainNode.gain.value = currentVolume;
                }
                // Sync native volume for fallback elements
                document.querySelectorAll('audio, video').forEach(el => {
                    if (mediaSources.get(el) === null) {
                        el.volume = Math.min(1.0, currentVolume);
                    }
                });
                // Ensure context is running (it might suspend)
                if (audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume().catch(() => {});
                }
                // console.log(`VolumeControl: Set volume to ${currentVolume}`);
            }
        } else if (request.action === "getVolume") {
            sendResponse({ volume: currentVolume });
        }
    });

    // Ask background for initial volume
    chrome.runtime.sendMessage({ action: "getStoredVolume" }, (response) => {
        if (response && response.volume !== undefined) {
             currentVolume = response.volume;
             if (gainNode) gainNode.gain.value = currentVolume;
        }
    });
    }
})();
