const VSC_STORAGE_KEYS = {
  SPEED: 'vsc_speed',
  BLACKLIST: 'vsc_blacklist',
  IS_ENABLED: 'vsc_is_enabled',
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
    buttonSize: 14
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
  chrome.storage.local.get([VSC_STORAGE_KEYS.BLACKLIST, VSC_STORAGE_KEYS.SHORTCUTS, VSC_STORAGE_KEYS.OPTIONS, VSC_STORAGE_KEYS.SPEED], (result) => {
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
function init(savedSpeed) {
  debugLog('Initializing Video Speed Controller', currentConfig);
  
  // Observer
  observeVideos(savedSpeed);
  
  // Mouse Enter
  document.addEventListener('mouseenter', (e) => {
      const target = e.target;
      const isAudio = target.nodeName === 'AUDIO';
      const isVideo = target.nodeName === 'VIDEO';
      if ((isVideo) || (isAudio && currentConfig.options.audio)) {
          attachController(target, savedSpeed);
      }
  }, true);

  // Keyboard
  document.addEventListener('keydown', handleKeyDown);
}

function observeVideos(initialSpeed) {
  const observer = new MutationObserver((mutations) => {
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
  
  observer.observe(document.body, { childList: true, subtree: true });
  // Initial scan
  const selector = currentConfig.options.audio ? 'video, audio' : 'video';
  document.querySelectorAll(selector).forEach(v => attachController(v, initialSpeed));
}

// -----------------------------------------------------------------------------
// CONTROLLER UI
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// CONTROLLER UI
// -----------------------------------------------------------------------------
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

// Global Interaction Tracking (to guess triggers)
let lastInteraction = { element: null, time: 0 };
document.addEventListener('mousedown', (e) => {
    // Find closest interactive element
    const target = e.target.closest('button, [role="button"], a, div') || e.target;
    lastInteraction = { element: target, time: Date.now() };
}, true);

function attachController(video, initialSpeed) {
    if (video.dataset.vscAttached) return;
    video.dataset.vscAttached = 'true';
    
    // Attempt Initial Anchor (if created right after click)
    tryAnchor(video);
    
    // Apply initial speed if provided and valid
    if (initialSpeed && initialSpeed !== 1.0) {
        video.playbackRate = initialSpeed;
    }
    
    // Set initial target for enforcement
    videoTargetSpeeds.set(video, video.playbackRate);
    
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
        
        // Force Enforcement Logic
        if (currentConfig.options.forceLastSaved) {
            const target = videoTargetSpeeds.get(video);
            
            // If strictly different
            if (target && Math.abs(video.playbackRate - target) > 0.05) {
                // Do NOT correct immediately (causes synchronous thrashing/warnings)
                // Wait for the player's potential spam of events to settle.
                clearTimeout(enforcementTimeout);
                enforcementTimeout = setTimeout(() => {
                     // Re-check after letting the dust settle
                     if (Math.abs(video.playbackRate - target) > 0.05) {
                         debugLog("Enforcing speed", target, "over", video.playbackRate);
                         video.playbackRate = target;
                     }
                }, 500); // 500ms grace period
            }
        }
    }
    
    video.addEventListener('ratechange', handleRateChange);
    
    // Append Host
    document.body.appendChild(host);
    
    // Position Sync Loop
    function syncPosition() {
        if (!video.isConnected) {
            host.remove();
            videoTargetSpeeds.delete(video);
            videoAnchors.delete(video);
            return;
        }
        
        // Fullscreen Handling
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsElement && host.parentNode !== fsElement) {
             fsElement.appendChild(host);
        } else if (!fsElement && host.parentNode !== document.body) {
             document.body.appendChild(host);
        }
        
        // Get Rect
        const rect = video.getBoundingClientRect();
        
        // Check Visibility / Anchoring
        const isInvisible = (video.nodeName === 'AUDIO' || (rect.width === 0 && rect.height === 0) || video.offsetParent === null);
        
        if (isInvisible) {
             const anchor = videoAnchors.get(video);
             
             // VISIBILITY RULES FOR INVISIBLE PLAYERS:
             // 1. If Playing -> SHOW
             // 2. If Paused AND Anchored -> SHOW (User sees it next to button)
             // 3. If Paused AND Unanchored -> HIDE (Prevent garbage stack at 0,0)
             
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

// Logic to guess anchor
function tryAnchor(video) {
    // If we have a recent interaction (< 2s)
    if (lastInteraction.element && (Date.now() - lastInteraction.time < 2000)) {
        const isInvisible = (video.nodeName === 'AUDIO' || (video.offsetWidth === 0 && video.offsetHeight === 0));
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
        const hosts = document.querySelectorAll('.vsc-controller-host');
        hosts.forEach(h => h.classList.toggle('vsc-hidden'));
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
