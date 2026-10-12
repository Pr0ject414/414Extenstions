// KylesChromeExtensions/crunchyroll_extension/content_scripts/crunchyrollControlsHider.js
(function() {
    'use strict';

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const CRUNCHYROLL_MODULE_ENABLED_KEY = 'isCrunchyrollModuleEnabled';
    const CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY = 'isCrunchyrollHideControlsOnSpeedEnabled';

    const HIDE_CLASS = 'cr-speed-controls-hidden';
    const MOUSE_IDLE_TIMEOUT_MS = 1200; // Time after mouse stops moving to re-hide controls

    let isFeatureActive = false;
    let isMouseActive = false;
    let mouseTimer = null;
    let checkInterval = null;

    function getPlayerControlsContainer() {
        return document.querySelector('[data-testid="player-controls-root"]') ||
               document.querySelector('[data-testid="vilos-player"]') ||
               document.querySelector('.vilos-controls-container');
    }

    function onMouseMove() {
        isMouseActive = true;
        if (mouseTimer) {
            clearTimeout(mouseTimer);
        }
        checkVideoSpeedAndToggleControls();

        mouseTimer = setTimeout(() => {
            isMouseActive = false;
            checkVideoSpeedAndToggleControls();
        }, MOUSE_IDLE_TIMEOUT_MS);
    }

    function onMouseLeave() {
        isMouseActive = false;
        if (mouseTimer) {
            clearTimeout(mouseTimer);
            mouseTimer = null;
        }
        checkVideoSpeedAndToggleControls();
    }

    function attachMouseListeners() {
        const controlsRoot = getPlayerControlsContainer();
        const target = controlsRoot || document;

        if (!target.hasAttribute || !target.hasAttribute('data-cr-mouse-attached')) {
            if (target.setAttribute) {
                target.setAttribute('data-cr-mouse-attached', 'true');
            }
            target.addEventListener('mousemove', onMouseMove, { passive: true });
            target.addEventListener('mouseleave', onMouseLeave, { passive: true });
        }
    }

    function checkVideoSpeedAndToggleControls() {
        const controlsRoot = getPlayerControlsContainer();
        const videos = document.querySelectorAll('video');

        if (!isFeatureActive) {
            if (controlsRoot) controlsRoot.classList.remove(HIDE_CLASS);
            return;
        }

        let isSpeedingUp = false;
        videos.forEach(video => {
            if (!video.paused && !video.ended && video.playbackRate > 1.05) {
                isSpeedingUp = true;
            }
        });

        if (controlsRoot) {
            // Option 1: Hide controls when speeding up unless mouse is actively moving
            if (isSpeedingUp && !isMouseActive) {
                if (!controlsRoot.classList.contains(HIDE_CLASS)) {
                    controlsRoot.classList.add(HIDE_CLASS);
                }
            } else {
                if (controlsRoot.classList.contains(HIDE_CLASS)) {
                    controlsRoot.classList.remove(HIDE_CLASS);
                }
            }
        }
    }

    function attachVideoListeners() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (!video.hasAttribute('data-cr-hider-attached')) {
                video.setAttribute('data-cr-hider-attached', 'true');
                const events = ['ratechange', 'play', 'playing', 'pause', 'timeupdate', 'seeking', 'seeked'];
                events.forEach(evt => {
                    video.addEventListener(evt, checkVideoSpeedAndToggleControls);
                });
            }
        });
    }

    function startMonitoring() {
        attachMouseListeners();
        attachVideoListeners();
        checkVideoSpeedAndToggleControls();

        if (!checkInterval) {
            checkInterval = setInterval(() => {
                attachMouseListeners();
                attachVideoListeners();
                checkVideoSpeedAndToggleControls();
            }, 300);
        }
    }

    function stopMonitoring() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
        if (mouseTimer) {
            clearTimeout(mouseTimer);
            mouseTimer = null;
        }
        isMouseActive = false;

        const controlsRoot = getPlayerControlsContainer();
        if (controlsRoot) {
            controlsRoot.classList.remove(HIDE_CLASS);
        }
    }

    function updateSettings() {
        chrome.storage.local.get([
            GLOBAL_MASTER_SWITCH_ENABLED_KEY,
            CRUNCHYROLL_MODULE_ENABLED_KEY,
            CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY
        ], (result) => {
            const globalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const moduleOn = result[CRUNCHYROLL_MODULE_ENABLED_KEY] !== false;
            const featureOn = result[CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY] !== false;

            isFeatureActive = globalOn && moduleOn && featureOn;

            if (isFeatureActive) {
                startMonitoring();
            } else {
                stopMonitoring();
            }
        });
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateSettings);
    } else {
        updateSettings();
    }

    // Storage listener
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes[GLOBAL_MASTER_SWITCH_ENABLED_KEY] ||
                changes[CRUNCHYROLL_MODULE_ENABLED_KEY] ||
                changes[CRUNCHYROLL_HIDE_CONTROLS_ON_SPEED_KEY]) {
                updateSettings();
            }
        }
    });

})();
