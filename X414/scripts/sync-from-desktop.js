// D:\Dev\414Extenstions\X414\scripts\sync-from-desktop.js
// Single-Source-of-Truth Sync & WebView Bundle Builder for X414 (Android Pixel)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CANDIDATE_DESKTOP_ROOT = path.resolve(PROJECT_ROOT, '..', '414Extensions');
const DESKTOP_ROOT = fs.existsSync(CANDIDATE_DESKTOP_ROOT)
    ? CANDIDATE_DESKTOP_ROOT
    : path.resolve(PROJECT_ROOT, '..', '414Extenstions', '414Extensions');
const DESKTOP_X_DIR = path.join(DESKTOP_ROOT, 'x_extension');
const DESKTOP_CONTENT_DIR = path.join(DESKTOP_X_DIR, 'content_scripts');
const SHARED_OUT_DIR = path.join(PROJECT_ROOT, 'src', 'shared');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');

const SHARED_MODULES = [
    'xLocationConstants.js',
    'xNostrCrypto.js',
    'xFriendsSync.js',
    'xLocationApi.js',
    'xLocationCache.js',
    'xCloudCache.js'
];

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Create a valid solid-color RGBA PNG with an optional center accent square for app icons/splash
function createMinimalPngBuffer(width, height, bgRgb = [0, 0, 0], accentRgb = [29, 155, 240]) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    function crc32(buf) {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let k = 0; k < 8; k++) {
                c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
            }
        }
        return (c ^ 0xffffffff) >>> 0;
    }

    function makeChunk(typeStr, dataBuf) {
        const typeBuf = Buffer.from(typeStr, 'ascii');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(dataBuf.length, 0);
        const crcInput = Buffer.concat([typeBuf, dataBuf]);
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(crcInput), 0);
        return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 4 + 1;
    const raw = Buffer.alloc(stride * height);
    const minX = Math.floor(width * 0.3);
    const maxX = Math.floor(width * 0.7);
    const minY = Math.floor(height * 0.3);
    const maxY = Math.floor(height * 0.7);

    for (let y = 0; y < height; y++) {
        const rowStart = y * stride;
        raw[rowStart] = 0; // filter type 0
        for (let x = 0; x < width; x++) {
            const px = rowStart + 1 + x * 4;
            const isRing =
                x >= minX && x <= maxX && y >= minY && y <= maxY &&
                (x < minX + 12 || x > maxX - 12 || y < minY + 12 || y > maxY - 12);
            const rgb = isRing ? accentRgb : bgRgb;
            raw[px] = rgb[0];
            raw[px + 1] = rgb[1];
            raw[px + 2] = rgb[2];
            raw[px + 3] = 255;
        }
    }

    const compressed = zlib.deflateSync(raw);
    return Buffer.concat([
        signature,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', compressed),
        makeChunk('IEND', Buffer.alloc(0))
    ]);
}

function ensureAppAssets() {
    ensureDir(ASSETS_DIR);
    const iconFiles = [
        { name: 'icon.png', size: 256 },
        { name: 'adaptive-icon.png', size: 256 },
        { name: 'splash.png', size: 512 }
    ];
    for (const item of iconFiles) {
        const target = path.join(ASSETS_DIR, item.name);
        if (!fs.existsSync(target)) {
            fs.writeFileSync(target, createMinimalPngBuffer(item.size, item.size));
        }
    }
}

function syncSharedCoreModules() {
    ensureDir(SHARED_OUT_DIR);
    if (!fs.existsSync(DESKTOP_X_DIR)) {
        console.warn(`[sync-from-desktop] Desktop source directory not found at ${DESKTOP_X_DIR}; keeping existing src/shared files.`);
        return;
    }

    const coreConstantsSrc = path.join(DESKTOP_ROOT, 'shared_modules', 'coreConstants.js');
    if (fs.existsSync(coreConstantsSrc)) {
        const coreContent = fs.readFileSync(coreConstantsSrc, 'utf8');
        const banner = `// AUTO-SYNCED FROM 414Extensions/shared_modules/coreConstants.js — DO NOT EDIT DIRECTLY\n`;
        fs.writeFileSync(path.join(SHARED_OUT_DIR, 'coreConstants.js'), banner + coreContent, 'utf8');
    }

    for (const fileName of SHARED_MODULES) {
        const srcPath = path.join(DESKTOP_X_DIR, fileName);
        const destPath = path.join(SHARED_OUT_DIR, fileName);
        const content = fs.readFileSync(srcPath, 'utf8')
            .replace(/\.\.\/shared_modules\/coreConstants\.js/g, './coreConstants.js');
        const banner = `// AUTO-SYNCED FROM 414Extensions/x_extension/${fileName} — DO NOT EDIT DIRECTLY\n`;
        fs.writeFileSync(destPath, banner + content, 'utf8');
    }
}

function syncFilterOptions() {
    const popupPath = path.join(DESKTOP_ROOT, 'popup', 'popup.js');
    if (!fs.existsSync(popupPath)) return;

    const popupSource = fs.readFileSync(popupPath, 'utf8');
    const countryMatch = popupSource.match(/const COUNTRY_FLAGS_MAP = (\{[\s\S]*?\});/);
    const deviceMatch = popupSource.match(/const DEVICE_REGION_MAP = (\{[\s\S]*?\});/);
    const nameFlagMatch = popupSource.match(/const NAME_FLAG_MAP = (\{[\s\S]*?\});/);

    if (countryMatch && deviceMatch && nameFlagMatch) {
        const outContent = `// AUTO-SYNCED FROM 414Extensions/popup/popup.js — DO NOT EDIT DIRECTLY
export const COUNTRY_FLAGS_MAP = ${countryMatch[1]};

export const DEVICE_REGION_MAP = ${deviceMatch[1]};

export const NAME_FLAG_MAP = ${nameFlagMatch[1]};
`;
        fs.writeFileSync(path.join(SHARED_OUT_DIR, 'filterOptions.js'), outContent, 'utf8');
    }
}

function generateWebViewBundle() {
    if (!fs.existsSync(DESKTOP_CONTENT_DIR)) return;

    const cssContent = fs.readFileSync(path.join(DESKTOP_CONTENT_DIR, 'xLocation.css'), 'utf8');
    const xEnvContent = fs.readFileSync(path.join(DESKTOP_CONTENT_DIR, 'xEnv.js'), 'utf8');
    const xSettingsLoaderContent = fs.readFileSync(path.join(DESKTOP_CONTENT_DIR, 'xSettingsLoader.js'), 'utf8');
    const xLocationUIContent = fs.readFileSync(path.join(DESKTOP_CONTENT_DIR, 'xLocationUI.js'), 'utf8');
    const xObserverContent = fs.readFileSync(path.join(DESKTOP_CONTENT_DIR, 'xObserver.js'), 'utf8');

    const bundleSource = `// AUTO-GENERATED BY scripts/sync-from-desktop.js — DO NOT EDIT DIRECTLY
export const RAW_X_LOCATION_CSS = ${JSON.stringify(cssContent)};
export const RAW_X_ENV_JS = ${JSON.stringify(xEnvContent)};
export const RAW_X_SETTINGS_LOADER_JS = ${JSON.stringify(xSettingsLoaderContent)};
export const RAW_X_LOCATION_UI_JS = ${JSON.stringify(xLocationUIContent)};
export const RAW_X_OBSERVER_JS = ${JSON.stringify(xObserverContent)};

export function buildWebViewInjectionScript(initialStorage = {}, options = {}) {
    const safeStorageJson = JSON.stringify(initialStorage || {});
    const safePendingInvites = Number(options.pendingIncomingCount || 0);

    return \`(function() {
    function ensureXDarkMode() {
        try {
            // 1. Force prefers-color-scheme: dark for X's web client
            if (typeof window.matchMedia === 'function' && !window.__X414_MATCH_MEDIA_PATCHED__) {
                const origMatchMedia = window.matchMedia.bind(window);
                window.matchMedia = function(query) {
                    const q = String(query || '').toLowerCase();
                    if (q.includes('prefers-color-scheme: dark')) {
                        return {
                            matches: true,
                            media: query,
                            onchange: null,
                            addListener: function() {},
                            removeListener: function() {},
                            addEventListener: function() {},
                            removeEventListener: function() {},
                            dispatchEvent: function() { return false; }
                        };
                    }
                    if (q.includes('prefers-color-scheme: light')) {
                        return {
                            matches: false,
                            media: query,
                            onchange: null,
                            addListener: function() {},
                            removeListener: function() {},
                            addEventListener: function() {},
                            removeEventListener: function() {},
                            dispatchEvent: function() { return false; }
                        };
                    }
                    return origMatchMedia(query);
                };
                window.__X414_MATCH_MEDIA_PATCHED__ = true;
            }

            if (document.documentElement) {
                document.documentElement.style.colorScheme = 'dark';
                document.documentElement.style.backgroundColor = '#000000';
            }

            // 2. Ensure X's night_mode cookie is set to 2 (Lights Out / True OLED Black)
            const cookieStr = String(document.cookie || '');
            const nightMatch = cookieStr.match(/(?:^|;\\\\s*)night_mode=([^;]+)/);
            const currentNightMode = nightMatch ? nightMatch[1].trim() : null;
            if (currentNightMode !== '1' && currentNightMode !== '2') {
                const cookieAttrs = 'path=/; max-age=315360000; SameSite=None; Secure';
                document.cookie = 'night_mode=2; domain=.x.com; ' + cookieAttrs;
                document.cookie = 'night_mode=2; domain=x.com; ' + cookieAttrs;
                document.cookie = 'night_mode=2; domain=.twitter.com; ' + cookieAttrs;
                document.cookie = 'night_mode=2; path=/; max-age=315360000';

                // Reload once on x.com / twitter.com so the HTTP request headers include Cookie: night_mode=2
                const host = String((window.location && window.location.hostname) || '').toLowerCase();
                const isXHost = host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
                if (isXHost && !sessionStorage.getItem('__x414_dark_reloaded__')) {
                    sessionStorage.setItem('__x414_dark_reloaded__', '1');
                    window.location.reload();
                    return;
                }
            }
        } catch (err) {}
    }
    ensureXDarkMode();

    if (window.__X414_BUNDLE_BOOTSTRAPPED__) {
        if (typeof window.__X414_UPDATE_PENDING_INVITES__ === 'function') {
            window.__X414_UPDATE_PENDING_INVITES__(\${safePendingInvites});
        }
        return true;
    }
    window.__X414_BUNDLE_BOOTSTRAPPED__ = true;
    window.__X414_MOBILE__ = true;
    window.__X414_PENDING_INVITES__ = \${safePendingInvites};

    const storageCache = Object.assign({
        isGlobalMasterSwitchEnabled: true,
        isXModuleEnabled: true,
        isXLocationEnabled: true,
        isXHideAdsEnabled: true,
        isXFriendsSyncEnabled: true,
        isXAlwaysMuteEnabled: false,
        xVolumeLevel: 1.0,
        blockedCountries: [],
        blockedDeviceRegions: [],
        blockedNameFlags: []
    }, \${safeStorageJson});

    const storageListeners = new Set();
    const runtimeMessageListeners = new Set();
    const pendingRequests = new Map();
    let reqSeq = 1;

    function postToNativeHost(packet) {
        try {
            if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
                window.ReactNativeWebView.postMessage(JSON.stringify(packet));
            }
        } catch (err) {}
    }

    function notifyStorageListeners(changes, areaName) {
        storageListeners.forEach(fn => {
            try {
                fn(changes, areaName);
            } catch (err) {}
        });
    }

    window.__X414_UPDATE_PENDING_INVITES__ = function(count) {
        window.__X414_PENDING_INVITES__ = Number(count || 0);
        if (window.XLocationUI && typeof window.XLocationUI.ensureMobileSettingsTrigger === 'function') {
            window.XLocationUI.ensureMobileSettingsTrigger({
                pendingIncomingCount: window.__X414_PENDING_INVITES__
            });
        }
    };

    window.__X414_HANDLE_HOST_MESSAGE__ = function(packet) {
        if (!packet || typeof packet !== 'object') return;
        if (packet.type === 'X_RUNTIME_RESPONSE' && packet.requestId) {
            const entry = pendingRequests.get(packet.requestId);
            if (entry) {
                pendingRequests.delete(packet.requestId);
                clearTimeout(entry.timer);
                if (typeof entry.callback === 'function') {
                    try { entry.callback(packet.response); } catch (e) {}
                }
                entry.resolve(packet.response);
            }
            return;
        }
        if (packet.type === 'X_STORAGE_CHANGED' && packet.changes) {
            const changesObj = {};
            for (const [k, change] of Object.entries(packet.changes)) {
                const newVal = change && typeof change === 'object' && 'newValue' in change ? change.newValue : change;
                const oldVal = storageCache[k];
                storageCache[k] = newVal;
                changesObj[k] = { oldValue: oldVal, newValue: newVal };
            }
            notifyStorageListeners(changesObj, 'local');
            return;
        }
        if (packet.type === 'X_RUNTIME_BROADCAST' && packet.message) {
            runtimeMessageListeners.forEach(fn => {
                try {
                    fn(packet.message, { id: 'x414-mobile-host' }, function() {});
                } catch (err) {}
            });
        }
    };

    if (!window.chrome) window.chrome = {};
    window.chrome.runtime = {
        id: 'x414-mobile-webview',
        lastError: null,
        getURL: function(p) { return String(p || ''); },
        sendMessage: function(message, callback) {
            return new Promise((resolve) => {
                const requestId = 'req_' + (reqSeq++) + '_' + Date.now();
                const timer = setTimeout(() => {
                    if (pendingRequests.has(requestId)) {
                        pendingRequests.delete(requestId);
                        if (typeof callback === 'function') {
                            try { callback({ success: false, error: 'Host timeout' }); } catch (e) {}
                        }
                        resolve({ success: false, error: 'Host timeout' });
                    }
                }, 15000);
                pendingRequests.set(requestId, { resolve, callback, timer });
                postToNativeHost({
                    type: 'X_RUNTIME_MESSAGE',
                    requestId: requestId,
                    payload: message
                });
            });
        },
        onMessage: {
            addListener: function(fn) {
                if (typeof fn === 'function') runtimeMessageListeners.add(fn);
            },
            removeListener: function(fn) {
                runtimeMessageListeners.delete(fn);
            }
        }
    };

    window.chrome.storage = {
        local: {
            get: function(keys, callback) {
                const res = {};
                if (!keys) {
                    Object.assign(res, storageCache);
                } else if (typeof keys === 'string') {
                    if (keys in storageCache) res[keys] = storageCache[keys];
                } else if (Array.isArray(keys)) {
                    for (let i = 0; i < keys.length; i++) {
                        const k = keys[i];
                        if (k in storageCache) res[k] = storageCache[k];
                    }
                } else if (typeof keys === 'object') {
                    for (const [k, defVal] of Object.entries(keys)) {
                        res[k] = (k in storageCache) ? storageCache[k] : defVal;
                    }
                }
                if (typeof callback === 'function') {
                    try { callback(res); } catch (e) {}
                }
                return Promise.resolve(res);
            },
            set: function(items, callback) {
                const changes = {};
                if (items && typeof items === 'object') {
                    for (const [k, v] of Object.entries(items)) {
                        const oldVal = storageCache[k];
                        storageCache[k] = v;
                        changes[k] = { oldValue: oldVal, newValue: v };
                    }
                    notifyStorageListeners(changes, 'local');
                    postToNativeHost({
                        type: 'X_STORAGE_SET',
                        payload: items
                    });
                }
                if (typeof callback === 'function') {
                    try { callback(); } catch (e) {}
                }
                return Promise.resolve();
            },
            remove: function(keys, callback) {
                const list = Array.isArray(keys) ? keys : [keys];
                const changes = {};
                for (const k of list) {
                    if (k in storageCache) {
                        const oldVal = storageCache[k];
                        delete storageCache[k];
                        changes[k] = { oldValue: oldVal, newValue: undefined };
                    }
                }
                notifyStorageListeners(changes, 'local');
                postToNativeHost({
                    type: 'X_STORAGE_REMOVE',
                    payload: list
                });
                if (typeof callback === 'function') {
                    try { callback(); } catch (e) {}
                }
                return Promise.resolve();
            }
        },
        onChanged: {
            addListener: function(fn) {
                if (typeof fn === 'function') storageListeners.add(fn);
            },
            removeListener: function(fn) {
                storageListeners.delete(fn);
            }
        }
    };

    function injectStyles() {
        const doc = document.head || document.documentElement;
        if (!doc) {
            setTimeout(injectStyles, 30);
            return;
        }
        if (!document.getElementById('x414-location-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'x414-location-styles';
            styleEl.textContent = \${JSON.stringify(RAW_X_LOCATION_CSS)};
            doc.appendChild(styleEl);
        }
    }
    injectStyles();

    try {
        \${RAW_X_ENV_JS}
    } catch (e) {
        console.warn('X414 xEnv error:', e);
    }
    try {
        \${RAW_X_SETTINGS_LOADER_JS}
    } catch (e) {
        console.warn('X414 xSettingsLoader error:', e);
    }
    try {
        \${RAW_X_LOCATION_UI_JS}
    } catch (e) {
        console.warn('X414 xLocationUI error:', e);
    }
    try {
        \${RAW_X_OBSERVER_JS}
    } catch (e) {
        console.warn('X414 xObserver error:', e);
    }
    return true;
})();\`;
}
`;

    fs.writeFileSync(path.join(SHARED_OUT_DIR, 'webviewInjectedBundle.js'), bundleSource, 'utf8');
}

function main() {
    ensureAppAssets();
    syncSharedCoreModules();
    syncFilterOptions();
    generateWebViewBundle();
    console.log('[sync-from-desktop] Successfully synced shared modules, filter options, assets, and WebView bundle.');
}

main();
