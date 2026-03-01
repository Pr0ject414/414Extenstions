const VSC_STORAGE_KEYS = {
  SPEED: 'vsc_speed',
  BLACKLIST: 'vsc_blacklist',
  IS_ENABLED: 'vsc_is_enabled',
  VISIBLE: 'isVscModuleVisible',
  SHORTCUTS: 'vsc_shortcuts',
  OPTIONS: 'vsc_options'
};

const DEFAULT_SPEED = 1.0;
const SPEED_STEP = 0.1;
const REWIND_TIME = 10;
const ADVANCE_TIME = 10;

// Helper logging
function debugLog(...args) {
    // console.log('[VSC]', ...args);
}

// -----------------------------------------------------------------------------
// CONFIG DEFAULTS
// -----------------------------------------------------------------------------
const DEFAULT_VSC_SHORTCUTS = [
    { id: "toggle", label: "Show/hide controller", key: "v", value: null, valueType: "none" },
    { id: "decrease", label: "Decrease speed", key: "s", value: 0.1, valueType: "number" },
    { id: "increase", label: "Increase speed", key: "d", value: 0.1, valueType: "number" },
    { id: "rewind", label: "Rewind", key: "z", value: 10, valueType: "number" },
    { id: "advance", label: "Advance", key: "x", value: 10, valueType: "number" },
    { id: "reset", label: "Reset speed", key: "r", value: 1.0, valueType: "fixed" },
    { id: "preferred", label: "Preferred speed", key: "g", value: 1.8, valueType: "fixed" }
];

const DEFAULT_VSC_OPTIONS = {
    audio: true,
    rememberSpeed: true,
    hideDefault: false,
    forceLastSaved: false,
    opacity: 0.3,
    buttonSize: 14,
    keySpeed: 2.0
};

let currentConfig = {
    shortcuts: DEFAULT_VSC_SHORTCUTS,
    options: DEFAULT_VSC_OPTIONS
};

// -----------------------------------------------------------------------------
// BLACKLIST LOGIC
// -----------------------------------------------------------------------------
// ... (Blacklist logic remains similar, but trigger init with config load) ...

function checkBlacklistAndInit() {
  const hostname = window.location.hostname;
  chrome.storage.local.get([VSC_STORAGE_KEYS.BLACKLIST, VSC_STORAGE_KEYS.SHORTCUTS, VSC_STORAGE_KEYS.OPTIONS, VSC_STORAGE_KEYS.SPEED, VSC_STORAGE_KEYS.IS_ENABLED, VSC_STORAGE_KEYS.VISIBLE], (result) => {
    // 0. Master Switch & Visibility Check
    if (result[VSC_STORAGE_KEYS.IS_ENABLED] === false || result[VSC_STORAGE_KEYS.VISIBLE] === false) {
        debugLog('VSC is disabled globally or hidden.');
        isGloballyDisabled = true;
        deinit(); // Ensure cleanup if it was running
        return;
    }
    isGloballyDisabled = false;

    // 1. Blacklist Check
    const blacklist = result[VSC_STORAGE_KEYS.BLACKLIST] || '';
    const lines = blacklist.split('\n');
    for (const line of lines) {
      const pattern = line.trim();
      if (!pattern) continue;
      try {
        let regex;
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
            const lastSlash = pattern.lastIndexOf('/');
            const flags = pattern.substring(lastSlash + 1);
            const source = pattern.substring(1, lastSlash);
            regex = new RegExp(source, flags);
            if (regex.test(hostname)) return;
        } else {
            if (hostname.includes(pattern)) return;
        }
      } catch (e) {
        console.error('Error parsing blacklist pattern:', pattern, e);
      }
    }
    
    // 2. Load Config
    if (result[VSC_STORAGE_KEYS.SHORTCUTS]) currentConfig.shortcuts = result[VSC_STORAGE_KEYS.SHORTCUTS];
    if (result[VSC_STORAGE_KEYS.OPTIONS]) currentConfig.options = result[VSC_STORAGE_KEYS.OPTIONS];
    
    // 3. Load Saved Speed
    let savedSpeed = 1.0;
    if (currentConfig.options.rememberSpeed) {
        savedSpeed = result[VSC_STORAGE_KEYS.SPEED];
        if (!savedSpeed || typeof savedSpeed !== 'number') savedSpeed = 1.0;
    }

    init(savedSpeed);
  });
}

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------

// Module-level references for cleanup
let pageObserver = null;
let isInitialized = false;
let isGloballyDisabled = true; // Default to true until checked
const activeHosts = new Set();
const attachedVideos = new Set();

// Monitor Storage for Visibility/Enable changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    
    const isEnabled = changes[VSC_STORAGE_KEYS.IS_ENABLED];
    const isVisible = changes[VSC_STORAGE_KEYS.VISIBLE];
    
    if (isEnabled || isVisible) {
        // Re-evaluate state
        chrome.storage.local.get([VSC_STORAGE_KEYS.IS_ENABLED, VSC_STORAGE_KEYS.VISIBLE], (result) => {
             const disabled = result[VSC_STORAGE_KEYS.IS_ENABLED] === false || result[VSC_STORAGE_KEYS.VISIBLE] === false;
             if (disabled !== isGloballyDisabled) {
                 isGloballyDisabled = disabled;
                 if (isGloballyDisabled) {
                     deinit();
                 } else {
                     checkBlacklistAndInit();
                 }
             }
        });
    }
});

// Named Handlers for removal
const handleMouseEnter = (e) => {
      const target = e.target;
      const isAudio = target.nodeName === 'AUDIO';
      const isVideo = target.nodeName === 'VIDEO';
      if ((isVideo) || (isAudio && currentConfig.options.audio)) {
          attachController(target, currentConfig.options.rememberSpeed ? undefined : 1.0); // Simple pass, logic inside handles storage check
      }
};

const handleGlobalKeyDownInternal = (e) => handleKeyDown(e); // Alias to existing function

function init(savedSpeed) {
  if (isInitialized) return;
  isInitialized = true;
  debugLog('Initializing Video Speed Controller', currentConfig);
  
  // Observer
  observeVideos(savedSpeed);
  
  // Mouse Enter
  document.addEventListener('mouseenter', handleMouseEnter, true);

  // Keyboard
  document.addEventListener('keydown', handleGlobalKeyDownInternal);
}

function deinit() {
    if (!isInitialized) return;
    isInitialized = false;
    debugLog('De-initializing VSC');
    
    // Disconnect Observer
    if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
    }
    
    // Remove Global Listeners
    document.removeEventListener('mouseenter', handleMouseEnter, true);
    document.removeEventListener('keydown', handleGlobalKeyDownInternal);
    
    // Remove UI from all videos
    activeHosts.forEach(el => el.remove());
    activeHosts.clear();

    // Clear Dataset attached flag so we can re-attach later
    attachedVideos.forEach(v => {
        delete v.dataset.vscAttached;
    });
    attachedVideos.clear();
    
    // Clear Maps
    // (WeakMaps clear themselves when elements die, but we can't iterate them to clear specific data 
    // without tracking the keys. However, removing the UI stops the enforcement loops because 
    // `syncPosition` checks `host.isConnected` or `video.isConnected`. 
    // BUT, the enforcement loop `requestAnimationFrame` might keep running if we don't stop it.
    // The loop checks `!video.isConnected` OR `host`. Since we removed host, loop should die.)
}

function observeVideos(initialSpeed) {
  pageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        
        const isAudio = node.nodeName === 'AUDIO';
        const isVideo = node.nodeName === 'VIDEO';
        
        if (isVideo || (isAudio && currentConfig.options.audio)) {
          attachController(node, initialSpeed);
        } else {
             const selector = currentConfig.options.audio ? 'video, audio' : 'video';
             const media = node.querySelectorAll ? node.querySelectorAll(selector) : [];
             media.forEach(v => attachController(v, initialSpeed));
        }
      });
    });
  });
  
  pageObserver.observe(document.body, { childList: true, subtree: true });
  // Initial scan
  const selector = currentConfig.options.audio ? 'video, audio' : 'video';
  document.querySelectorAll(selector).forEach(v => attachController(v, initialSpeed));
}

// -----------------------------------------------------------------------------
// CONTROLLER UI
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// DRAG LOGIC
// -----------------------------------------------------------------------------
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let initialDragOffset = { x: 0, y: 0 };

function onMouseDown(e) {
    if (e.button !== 0 || e.target.tagName === 'BUTTON') return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    initialDragOffset = { ...dragOffset };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
}

function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    dragOffset = {
        x: initialDragOffset.x + dx,
        y: initialDragOffset.y + dy
    };
}

function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
}

// Track target speeds for enforcement
const videoTargetSpeeds = new WeakMap();
// Track anchors for invisible players
const videoAnchors = new WeakMap();
// Track override state per video
const videoOverrideState = new WeakMap(); // { active: bool, originalSpeed: number }

// Global Interaction Tracking (to guess triggers)
let lastInteraction = { element: null, time: 0 };
document.addEventListener('mousedown', (e) => {
    // Find closest interactive element
    const target = e.target.closest('button, [role="button"], a, div') || e.target;
    lastInteraction = { element: target, time: Date.now() };
}, true);

function attachController(video, initialSpeed) {
    if (video.dataset.vscAttached) return;

    // Ignore YouTube TV preview videos to prevent ghost overlays in fullscreen
    if (window.location.hostname === 'tv.youtube.com' && video.id === 'id-tenx-video') {
        return;
    }
    video.dataset.vscAttached = 'true';
    attachedVideos.add(video);
    
    // Attempt Initial Anchor (if created right after click)
    // REMOVED: This causes ghost overlays on X.com when "Load More" is clicked 
    // and invisible preload videos are added. We will wait for 'play' or visibility.
    // tryAnchor(video);
    
    // Apply initial speed if provided and valid
    if (initialSpeed && initialSpeed !== 1.0) {
        video.playbackRate = initialSpeed;
    }
    
    // Set initial target for enforcement
    videoTargetSpeeds.set(video, video.playbackRate);
    videoOverrideState.set(video, { active: false, originalSpeed: null });
    
    // Create Host
    const host = document.createElement('div');
    host.className = 'vsc-controller-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none'; 
    host.style.top = '-9999px';
    host.style.left = '-9999px';
    
    // Shadow DOM
    const shadow = host.attachShadow({ mode: 'open' });
    
    // Styles
    const style = document.createElement('style');
    style.textContent = `
      .vsc-controller {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: rgba(0, 0, 0, ${currentConfig.options.opacity});
        border-radius: 4px;
        color: #fff;
        padding: 5px 10px;
        font-size: 16px;
        cursor: pointer;
        transition: opacity 0.2s, background 0.2s;
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        opacity: ${currentConfig.options.hideDefault ? '0' : currentConfig.options.opacity}; 
        user-select: none;
      }
      .vsc-controller:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.8);
      }
      
      .vsc-btn {
        width: ${currentConfig.options.buttonSize}px;
        height: ${currentConfig.options.buttonSize}px;
        font-size: ${Math.max(10, currentConfig.options.buttonSize - 4)}px;
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .vsc-btn:hover {
        background: rgba(255,255,255,0.4);
      }
      .vsc-btn:active {
        transform: scale(0.95);
      }
      
      .vsc-value {
        font-weight: bold;
        min-width: 30px;
        text-align: center;
      }
      
      .vsc-controls {
        display: none;
        gap: 4px;
      }
      
      .vsc-controller:hover .vsc-controls {
        display: flex;
      }
      
      :host(.vsc-hidden) .vsc-controller {
          display: none;
      }
    `;
    shadow.appendChild(style);
    
    // Container
    const container = document.createElement('div');
    container.className = 'vsc-controller';
    
    // Indicator
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'vsc-value';
    valueDisplay.textContent = video.playbackRate.toFixed(1);
    
    // Controls
    const controls = document.createElement('div');
    controls.className = 'vsc-controls';
    
    const btnDecrease = createBtn('-', () => updateSpeed(video, -0.1));
    const btnIncrease = createBtn('+', () => updateSpeed(video, 0.1));
    const btnRewind = createBtn('<<', () => { video.currentTime -= 10; });
    const btnAdvance = createBtn('>>', () => { video.currentTime += 10; });
    const btnReset = createBtn('R', () => updateSpeed(video, 0, true));
    
    controls.append(btnDecrease, btnIncrease, btnRewind, btnAdvance, btnReset);
    container.append(valueDisplay, controls);
    shadow.appendChild(container);
    
    // Attach Drag
    container.addEventListener('mousedown', onMouseDown);
    container.style.cursor = 'move';
    
    // -------------------------------------------------------------------------
    // EVENT LISTENERS (Video)
    // -------------------------------------------------------------------------
    
    // Listen for 'play' to late-bind anchor (e.g. pre-loaded audio starts playing on click)
    video.addEventListener('play', () => {
        if (!videoAnchors.has(video)) {
            tryAnchor(video);
        }
    });

    // Rate Change Handler (Display Update + Force Enforcement)
    let enforcementTimeout;
    function handleRateChange() {
        // Update UI immediately for responsiveness
        valueDisplay.textContent = video.playbackRate.toFixed(1);
        
        // Check override state [FIX 2: Enforcement Conflict]
        const overrideState = videoOverrideState.get(video);
        const isOverriding = overrideState && overrideState.active;
        
        // Force Enforcement Logic
        if (currentConfig.options.forceLastSaved && !isOverriding) {
            const target = videoTargetSpeeds.get(video);
            
            // If strictly different
            if (target && Math.abs(video.playbackRate - target) > 0.05) {
                // Do NOT correct immediately (causes synchronous thrashing/warnings)
                // Wait for the player's potential spam of events to settle.
                clearTimeout(enforcementTimeout);
                enforcementTimeout = setTimeout(() => {
                     // Re-check after letting the dust settle
                     const currentOverride = videoOverrideState.get(video);
                     if (currentOverride && currentOverride.active) return;
                     
                     if (Math.abs(video.playbackRate - target) > 0.05) {
                         debugLog("Enforcing speed", target, "over", video.playbackRate);
                         video.playbackRate = target;
                     }
                }, 500); // 500ms grace period
            }
        }
        
        // If override is active, ensure we stay at override speed
        if (isOverriding) {
            const desired = currentConfig.options.keySpeed || 2.0;
            if (Math.abs(video.playbackRate - desired) > 0.05) {
                 // The site tried to fight back? Force it.
                 // Use a small timeout to avoid max stack if they really fight
                 setTimeout(() => video.playbackRate = desired, 0);
            }
        }
    }
    
    video.addEventListener('ratechange', handleRateChange);
    
    // Append Host
    document.body.appendChild(host);
    activeHosts.add(host);
    
    // Position Sync Loop
    function syncPosition() {
        // If disabled or disconnected, remove and stop
        if (isGloballyDisabled || !video.isConnected) {
            host.remove();
            activeHosts.delete(host);
            attachedVideos.delete(video);
            videoTargetSpeeds.delete(video);
            videoAnchors.delete(video);
            return;
        }
        
        // Fullscreen Handling
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsElement) {
            // Check if THIS video is part of the fullscreen element
            const isRelatedToFS = (video === fsElement || fsElement.contains(video));
            
            if (isRelatedToFS) {
                if (host.parentNode !== fsElement) {
                    fsElement.appendChild(host);
                }
                // Ensure it's not hidden if it was previously hidden by another FS video
                if (host.classList.contains('vsc-fs-hidden')) {
                    host.classList.remove('vsc-fs-hidden');
                    host.style.display = 'block';
                }
            } else {
                // Another video is FS, hide this one
                if (!host.classList.contains('vsc-fs-hidden')) {
                    host.classList.add('vsc-fs-hidden');
                    host.style.display = 'none';
                }
                // Keep it in body if hidden
                if (host.parentNode !== document.body) {
                    document.body.appendChild(host);
                }
                requestAnimationFrame(syncPosition);
                return; // Skip the rest of positioning
            }
        } else {
            // No fullscreen, ensure visible and in body
            if (host.classList.contains('vsc-fs-hidden')) {
                host.classList.remove('vsc-fs-hidden');
                host.style.display = 'block';
            }
            if (host.parentNode !== document.body) {
                document.body.appendChild(host);
            }
        }
        
        // Get Rect
        const rect = video.getBoundingClientRect();
        
        // Check Visibility / Anchoring
        const isInvisible = (video.nodeName === 'AUDIO' || (rect.width === 0 && rect.height === 0) || video.offsetParent === null);
        
        if (isInvisible) {
             const anchor = videoAnchors.get(video);
             
             // VISIBILITY RULES FOR INVISIBLE PLAYERS:
             // 1. If AUDIO -> Follow Anchor Logic
             // 2. If VIDEO -> HIDE (Fix for X.com ghost overlays from preload videos)
             
             if (video.nodeName === 'VIDEO') {
                 host.style.display = 'none';
             } else {
                 // AUDIO LOGIC
                 const shouldShow = !video.paused || (video.paused && !!anchor);
                 
                 if (!shouldShow) {
                     host.style.display = 'none';
                 } else {
                     host.style.display = 'block';
                 
                 // Positioning
                     if (anchor && anchor.isConnected) {
                        const anchorRect = anchor.getBoundingClientRect();
                        const top = anchorRect.bottom + 10 + dragOffset.y;
                        const left = anchorRect.left + dragOffset.x;
                        host.style.top = `${top}px`;
                        host.style.left = `${left}px`;
                     } else {
                    // Fallback to top-left if no anchor or anchor lost
                        const top = 10 + dragOffset.y;
                        const left = 10 + dragOffset.x;
                        host.style.top = `${top}px`;
                        host.style.left = `${left}px`;
                     }
                 }
            }
        } else {
            // Normal Visible Video
            host.style.display = 'block';
            const top = rect.top + 10 + dragOffset.y;
            const left = rect.left + 10 + dragOffset.x;
            host.style.top = `${top}px`;
            host.style.left = `${left}px`;
        }
        
        requestAnimationFrame(syncPosition);
    }
    
    requestAnimationFrame(syncPosition);
}

function triggerOverride(video, active) {
    const state = videoOverrideState.get(video) || { active: false, originalSpeed: null };
    const overrideSpeed = currentConfig.options.keySpeed || 2.0;
    
    if (active) {
        if (state.active) return; // Already active
        
        state.active = true;
        state.originalSpeed = video.playbackRate;
        videoOverrideState.set(video, state);
        
        // Apply speed
        video.playbackRate = overrideSpeed;
        
    } else {
        if (!state.active) return; // Not active
        
        state.active = false;
        const restoreSpeed = state.originalSpeed || 1.0;
        state.originalSpeed = null;
        videoOverrideState.set(video, state);
        
        // Restore speed
        video.playbackRate = restoreSpeed;
        
        // Sync target speed so enforcement doesn't fight the restore
        videoTargetSpeeds.set(video, restoreSpeed);
    }
}

// -----------------------------------------------------------------------------
// GLOBAL OVERRIDE HANDLERS (Capture Phase)
// -----------------------------------------------------------------------------
// We use capture to catch events before sites (like Crunchyroll) swallow them.
// We use geometric checks because many sites put transparent divs over the video.

let overrideTriggeredByMouse = false;
let overrideTriggeredByKey = false;
let shouldSuppressClick = false;
let spaceKeyPending = false;
let spaceTimer = null;

document.addEventListener('mousedown', (e) => {
    if (isGloballyDisabled) return;

    // 1. Basic Filters: Ignore clicks on interactive elements, controls, or our own UI
    if (e.button !== 0) return; 
    
    const excludedRoles = ['button', 'slider', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'switch', 'checkbox', 'radio', 'progressbar'];
    const roleSelector = excludedRoles.map(role => `[role="${role}"]`).join(',');
    
    if (
        e.target.tagName === 'BUTTON' || 
        e.target.tagName === 'INPUT' || 
        e.target.closest('a') || 
        e.target.closest(roleSelector) ||
        e.target.closest('.vsc-controller-host') ||
        e.target.closest('[aria-label="Volume slider"]')
    ) {
        // Size-based exclusion
        const excludedEl = e.target.closest(roleSelector) || e.target.closest('button');
        if (excludedEl) {
             const rect = excludedEl.getBoundingClientRect();
             // Allow triggering on large overlays (likely video surfaces)
             if (rect.width > 300 && rect.height > 300) {
                 // Proceed
             } else {
                 return; // Real button
             }
        } else {
             return; // Other excluded type
        }
    }

    // 2. Find Video
    const selector = currentConfig.options.audio ? 'video, audio' : 'video';
    const videos = Array.from(document.querySelectorAll(selector));
    
    const targetVideo = videos.find(video => {
        if (e.target === video) return true;
        const rect = video.getBoundingClientRect();
        return (
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom
        );
    });

    if (targetVideo) {
        // Delay activation to distinguish click vs hold
        const delayMs = 500;
        
        const timerId = setTimeout(() => {
            overrideTriggeredByMouse = true;
            shouldSuppressClick = true; // Prepare to kill the click
            triggerOverride(targetVideo, true);
        }, delayMs);
        
        const onRelease = (e) => {
             // Blur Event
             if (e && e.type === 'blur' && e.target !== window) {
                 return;
             }

             clearTimeout(timerId);
             
             if (overrideTriggeredByMouse) {
                 overrideTriggeredByMouse = false;
                 
                 // Strategy: Allow mouseup to propagate (fixes UI stickiness)
                 // But FORCE video to play if the site paused it (fixes pause bug)
                 setTimeout(() => {
                     if (targetVideo.paused) {
                         targetVideo.play().catch(() => {});
                     }
                 }, 50); // Small delay to let site's mouseup handler run first

                 // Don't disable if key is holding
                 if (!overrideTriggeredByKey) {
                     triggerOverride(targetVideo, false);
                 }
                 
                 // we still suppress the following click just in case
                 setTimeout(() => shouldSuppressClick = false, 100);
             }
             
             // Clean up all listeners
             document.removeEventListener('mouseup', onRelease, true);
             document.removeEventListener('dragend', onRelease, true);
             document.removeEventListener('mouseleave', onRelease, true);
             window.removeEventListener('blur', onRelease, true);
             document.removeEventListener('mousemove', onMouseMoveCheck, true);
        };
        
        // Dead Man's Switch: If mouse moves and buttons are 0, we missed the release.
        const onMouseMoveCheck = (e) => {
            if (e.buttons === 0) {
                onRelease(e);
            }
        };

        document.addEventListener('mouseup', onRelease, true);
        document.addEventListener('dragend', onRelease, true);
        document.addEventListener('mouseleave', onRelease, true); // Fail-safe: mouse leaves window
        window.addEventListener('blur', onRelease, true); // Fail-safe: alt-tab
        document.addEventListener('mousemove', onMouseMoveCheck, true); // Dead Man's Switch for drags
    }
}, true); // Capture

document.addEventListener('click', (e) => {
    if (shouldSuppressClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
        shouldSuppressClick = false;
        debugLog('Suppressed Click after Hold');
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (isGloballyDisabled) return;

    // Space bar check
    if (e.code === 'Space') {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;

        // HIJACK: Stop site from seeing Space
        e.stopImmediatePropagation();
        e.preventDefault();

        // If already overriding, ignore active holds (but handle repeats if we were pending)
        if (overrideTriggeredByKey) return;

        const selector = currentConfig.options.audio ? 'video, audio' : 'video';
        const videos = Array.from(document.querySelectorAll(selector));
        
        // Helper to find target
        const getTarget = () => {
            let t = videos.find(v => !v.paused);
            if (!t) t = videos.find(v => v.getBoundingClientRect().width > 0);
            return t;
        };

        // If we are pending (waiting to decide Tap vs Hold) and getting repeats, confirm Hold now
        if (spaceKeyPending && e.repeat) {
             clearTimeout(spaceTimer);
             spaceKeyPending = false;
             overrideTriggeredByKey = true;
             const target = getTarget();
             if (target) {
                 target.play().catch(()=>{}); // Force play
                 triggerOverride(target, true);
             }
             return;
        }

        // New Press
        if (!spaceKeyPending) {
            spaceKeyPending = true;
            // 200ms threshold for Space (quicker than mouse)
            spaceTimer = setTimeout(() => {
                spaceKeyPending = false;
                overrideTriggeredByKey = true;
                const target = getTarget();
                if (target) {
                    target.play().catch(()=>{});
                    triggerOverride(target, true);
                }
            }, 200);
        }
    }
}, true); // Capture

document.addEventListener('keyup', (e) => {
    if (isGloballyDisabled) return;

    if (e.code === 'Space') {
         if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
         
         // Always stop prop for Space if we are managing it
         e.stopImmediatePropagation();
         e.preventDefault();

         if (spaceKeyPending) {
             // Released before timer -> TAP
             clearTimeout(spaceTimer);
             spaceKeyPending = false;
             
             // Toggle Play/Pause Manually
             const selector = currentConfig.options.audio ? 'video, audio' : 'video';
             const videos = Array.from(document.querySelectorAll(selector));
             // Toggle specific target or all? Usually site toggles active one.
             // Best guess: Find playing -> pause. Else find first visible -> play.
             const playing = videos.find(v => !v.paused);
             if (playing) {
                 playing.pause();
             } else {
                 const visible = videos.find(v => v.getBoundingClientRect().width > 0);
                 if (visible) visible.play().catch(()=>{});
             }
         }
         else if (overrideTriggeredByKey) {
             // Released after Hold -> Stop Override
             overrideTriggeredByKey = false;
             const selector = currentConfig.options.audio ? 'video, audio' : 'video';
             const videos = Array.from(document.querySelectorAll(selector));
             videos.forEach(v => triggerOverride(v, false));
         }
    }
}, true); // Capture


// Logic to guess anchor
function tryAnchor(video) {
    // If we have a recent interaction (< 2s)
    if (lastInteraction.element && (Date.now() - lastInteraction.time < 2000)) {
        const isInvisible = (video.nodeName === 'AUDIO' || (video.offsetWidth === 0 && video.offsetHeight === 0));
        // Also check if video is playing?
        
        if (isInvisible) {
            debugLog('Anchoring invisible controller to:', lastInteraction.element);
            videoAnchors.set(video, lastInteraction.element);
        }
    }
}

function createBtn(text, onClick) {
    const btn = document.createElement('button');
    btn.className = 'vsc-btn';
    btn.textContent = text;
    // Prevent focus stealing / native click propagation
    btn.onmousedown = (e) => e.preventDefault();
    btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
    };
    return btn;
}

function updateSpeed(video, diff, reset = false, targetValue = null) {
    let newRate;
    if (reset) {
        newRate = targetValue || 1.0;
    } else if (targetValue !== null) {
        newRate = targetValue;
    } else {
        newRate = Math.max(0.1, Math.min(16, video.playbackRate + diff));
    }
    
    const finalRate = parseFloat(newRate.toFixed(2));
    video.playbackRate = finalRate;
    
    // Update our target so we don't fight ourselves
    videoTargetSpeeds.set(video, finalRate);
    
    // Save speed to storage (Persistence)
    if (currentConfig.options.rememberSpeed) {
        chrome.storage.local.set({ [VSC_STORAGE_KEYS.SPEED]: finalRate });
    }
}

// -----------------------------------------------------------------------------
// SHORTCUTS (Configurable)
// -----------------------------------------------------------------------------
function handleKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable) {
        return;
    }
    
    const selector = currentConfig.options.audio ? 'video, audio' : 'video';
    const videos = Array.from(document.querySelectorAll(selector));
    // Prioritize playing, then active/anchored
    let target = videos.find(v => !v.paused);
    if (!target) {
        // Find visible or anchored video
        target = videos.find(v => {
            if (v.offsetParent !== null) return true;
            // Check anchor
            if (videoAnchors.has(v)) return true;
            return false;
        });
    }
    if (!target && videos.length > 0) target = videos[0];
    
    if (!target) return;
    
    const key = e.key.toLowerCase();
    
    const shortcut = currentConfig.shortcuts.find(s => s.key.toLowerCase() === key);
    if (!shortcut) return;
    
    if (shortcut.id === 'toggle') {
        activeHosts.forEach(h => h.classList.toggle('vsc-hidden'));
        document.body.classList.toggle('vsc-global-hidden');
    } 
    else if (shortcut.id === 'decrease') {
        updateSpeed(target, -shortcut.value);
    }
    else if (shortcut.id === 'increase') {
        updateSpeed(target, +shortcut.value);
    }
    else if (shortcut.id === 'rewind') {
        target.currentTime -= shortcut.value;
    }
    else if (shortcut.id === 'advance') {
        target.currentTime += shortcut.value;
    }
    else if (shortcut.id === 'reset') {
        updateSpeed(target, 0, true, shortcut.value);
    }
    else if (shortcut.id === 'preferred') {
        updateSpeed(target, 0, false, shortcut.value);
    }
}

// Start
checkBlacklistAndInit();

// Storage Listener for Real-Time Updates
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;
  
  // 1. Master Switch
  if (changes[VSC_STORAGE_KEYS.IS_ENABLED]) {
      const isEnabled = changes[VSC_STORAGE_KEYS.IS_ENABLED].newValue;
      if (isEnabled === false) {
          deinit();
      } else {
          checkBlacklistAndInit();
      }
  }
  
  // 2. Options Update (Speed, Opacity, etc.)
  if (changes[VSC_STORAGE_KEYS.OPTIONS]) {
      currentConfig.options = { ...currentConfig.options, ...changes[VSC_STORAGE_KEYS.OPTIONS].newValue };
      // Apply immediate visual effects?
      // Opacity / Display default
      activeHosts.forEach(host => {
          if (host.shadowRoot) {
            const wrapper = host.shadowRoot.querySelector('.vsc-controller');
            if (wrapper) wrapper.style.opacity = currentConfig.options.hideDefault ? '0' : currentConfig.options.opacity;
            // Background update requires re-render of style or direct manipulation
            // wrapper.style.background = `rgba(0, 0, 0, ${currentConfig.options.opacity})`;
          }
      });
  }
  
  // 3. Blacklist Update
  if (changes[VSC_STORAGE_KEYS.BLACKLIST]) {
       // if current site is now blacklisted, deinit.
       // if current site was blacklisted but now isn't, init.
       // Easiest is to re-run check logic.
       // But if we are already init, we need to check if we should STOP.
       // if we are stopped, check if we should START.
       
       // Force re-check
       if (isInitialized) {
            checkBlacklistAndInit(); // Will handle disabling if needed? 
            // Actually checkBlacklistAndInit calls init(). It doesn't deinit.
            // We need logic to deinit if currently blacklisted.
            
            const hostname = window.location.hostname;
            const newBlacklist = changes[VSC_STORAGE_KEYS.BLACKLIST].newValue || '';
            let isBlacklisted = false;
            // Quick check
            // ... (Duping regex logic is annoying, maybe extract?)
            // Just running checkBlacklistAndInit is safer if we Modify it to handle "Already Init -> Should Disable" case.
            // For now, let's implement a naive check here or reloading page is acceptable for *blacklist* specifically? 
            // User requested "popup changes" (speed/enable) to be instant. Blacklist slightly less critical but nice.
            
            // Let's rely on standard reload for Blacklist to ensure cleanliness?
            // User: "Making changes on the popup requires me to reload". Implies ALL changes.
            
            // Re-run full check.
            deinit(); 
            checkBlacklistAndInit();
       } else {
           checkBlacklistAndInit();
       }
  }
});
