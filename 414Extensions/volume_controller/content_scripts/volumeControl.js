
// KylesChromeExtensions/volume_controller/content_scripts/volumeControl.js
(function() {
    if (window.hasVolumeControlInjected) return;
    window.hasVolumeControlInjected = true;

    let audioCtx;
    let gainNode;
    let mediaSources = new WeakMap();
    let currentVolume = 1.0;

    function initAudioContext() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
            gainNode.gain.value = currentVolume;
        }
        else if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function attachToMedia(mediaElement) {
        if (mediaSources.has(mediaElement)) return;
        
        try {
            initAudioContext();
            // Try to attach
            const source = audioCtx.createMediaElementSource(mediaElement);
            source.connect(gainNode);
            mediaSources.set(mediaElement, source);
            console.log("VolumeControl: Attached to media element", mediaElement);
        } catch (e) {
            console.error("VolumeControl: Failed to attach to media element", e);
            // If it fails (e.g. already connected), we mark it as 'handled' to stop retrying immediately
            // But we might want to retry if state changes? No, InvalidStateError is permanent for that element instance.
            mediaSources.set(mediaElement, null); 
        }
    }

    function scanForMedia() {
        document.querySelectorAll('audio, video').forEach(attachToMedia);
    }

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
                // Ensure context is running (it might suspend)
                if (audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                console.log(`VolumeControl: Set volume to ${currentVolume}`);
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

})();
