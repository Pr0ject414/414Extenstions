// KylesChromeExtensions/x_extension/xBackground.js
import * as AppState from '../shared_modules/appState.js';
import { XLocationApiClient } from './xLocationApi.js';
import { locationCache } from './xLocationCache.js';
import { XCloudCacheClient } from './xCloudCache.js';

const CONTEXT_MENU_ID = "x_download_video";
const apiClient = new XLocationApiClient();
const cloudCache = new XCloudCacheClient();

// --- Lifecycle Functions ---
export async function init() {
    await locationCache.init();
    await apiClient.loadHeadersFromStorage();
}

export async function onStartup() {
    await locationCache.init();
    await apiClient.loadHeadersFromStorage();
}

export async function onInstalled(details) {
    await locationCache.init();
    await apiClient.loadHeadersFromStorage();
    createContextMenu();
}

function createContextMenu() {
    chrome.contextMenus.remove(CONTEXT_MENU_ID, () => {
        if (chrome.runtime.lastError) {
            // Ignore error if it doesn't exist
        }
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Download Video",
            contexts: ["video", "image"], // Twitter sometimes wraps videos in images or overlays
            documentUrlPatterns: ["*://twitter.com/*", "*://x.com/*"]
        }, () => {
            if (chrome.runtime.lastError) {
                // Ignore duplicate ID or other creation errors
            }
        });
    });
}

// --- Event Handlers ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_ID) {
        chrome.tabs.sendMessage(tab.id, { action: "X_TRIGGER_DOWNLOAD_FROM_CONTEXT" }).catch(err => {
            console.warn("X Background: Could not send message to tab.", err);
        });
    }
});

export function handleMessage(request, sender, sendResponse) {
    if (request.action === "X_START_DOWNLOAD") {
        const { url, filename, isM3U8 } = request.payload;
        
        if (isM3U8) {
            console.log(`X Background: Starting native M3U8 download for ${filename}`);
            processM3U8Download(url, filename, sendResponse);
        } else {
            console.log(`X Background: Starting direct download for ${filename}`);
            chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: false
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
        }
        return true; 
    }

    if (request.action === "X_CAPTURE_HEADERS") {
        const success = apiClient.setHeaders(request.payload.headers);
        sendResponse({ success });
        return true;
    }

    if (request.action === "X_FETCH_USER_INFO") {
        const { screenName } = request.payload;
        if (!screenName) {
            sendResponse({ success: false, error: "Missing screenName" });
            return true;
        }

        // 1. Check local LRU cache
        const cached = locationCache.get(screenName);
        if (cached) {
            sendResponse({ success: true, data: cached, fromCache: true });
            return true;
        }

        // 2. Check Community Cloud Cache (Batched lookup)
        cloudCache.lookup(screenName).then(cloudData => {
            if (cloudData) {
                locationCache.set(screenName, cloudData);
                sendResponse({ success: true, data: cloudData, fromCloud: true });
                return;
            }

            // 3. Fallback to X GraphQL API
            apiClient.fetchUserInfo(screenName).then(data => {
                locationCache.set(screenName, data);
                cloudCache.contribute(screenName, data);
                sendResponse({ success: true, data, fromCache: false });
            }).catch(err => {
                sendResponse({ success: false, error: err.message || err.code || "Failed to fetch user info" });
            });
        }).catch(err => {
            // Fallback to X GraphQL API if cloud cache query fails
            apiClient.fetchUserInfo(screenName).then(data => {
                locationCache.set(screenName, data);
                cloudCache.contribute(screenName, data);
                sendResponse({ success: true, data, fromCache: false });
            }).catch(err2 => {
                sendResponse({ success: false, error: err2.message || err2.code || "Failed to fetch user info" });
            });
        });

        return true;
    }

    if (request.action === "X_GET_LOCATION_STATS") {
        sendResponse({ success: true, stats: locationCache.getStats() });
        return true;
    }

    if (request.action === "X_CLEAR_LOCATION_CACHE") {
        locationCache.clear().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }

    return false;
}

async function processM3U8Download(url, filename, sendResponse) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch manifest: ${response.statusText}`);
        const text = await response.text();
        
        const baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
        const origin = new URL(url).origin;

        // 1. Check if it's a Master Playlist
        if (text.includes("#EXT-X-STREAM-INF")) {
            const variantMatches = [...text.matchAll(/#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+).*\n(.*)/g)];
            if (variantMatches.length > 0) {
                // Sort by bandwidth desc
                variantMatches.sort((a, b) => parseInt(b[1]) - parseInt(a[1]));
                let bestVariantUrl = variantMatches[0][2].trim();
                
                // Resolve relative URL
                if (!bestVariantUrl.startsWith('http')) {
                    bestVariantUrl = bestVariantUrl.startsWith('/') ? origin + bestVariantUrl : baseUrl + bestVariantUrl;
                }
                
                console.log(`X Background: Found Master Playlist. Switching to highest bandwidth: ${variantMatches[0][1]}`);
                return processM3U8Download(bestVariantUrl, filename, sendResponse);
            }
        }

        // 2. Parse Media Playlist (fMP4 segments)
        // Look for Init Segment (The header)
        const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
        if (!mapMatch) {
            // Check if it's TS segments (Old style)
            const tsSegments = text.match(/[^\s]+\.ts/g);
            if (tsSegments) {
                return stitchSegments(tsSegments, null, baseUrl, origin, filename, sendResponse);
            }
            throw new Error("No usable segments or map found in manifest.");
        }

        const initUrl = mapMatch[1].startsWith('http') ? mapMatch[1] : (mapMatch[1].startsWith('/') ? origin + mapMatch[1] : baseUrl + mapMatch[1]);
        const segments = text.match(/[^\s]+\.m4s/g);
        
        if (!segments || segments.length === 0) throw new Error("No media segments found.");

        return stitchSegments(segments, initUrl, baseUrl, origin, filename, sendResponse);

    } catch (err) {
        console.error("X Background: M3U8 Download Error", err);
        sendResponse({ success: false, error: err.message });
    }
}

async function stitchSegments(segments, initUrl, baseUrl, origin, filename, sendResponse) {
    try {
        // Fetch Init Segment (Header)
        let initBuffer = null;
        if (initUrl) {
            initBuffer = await fetch(initUrl).then(r => r.arrayBuffer());
        }

        // Fetch all Fragments in parallel
        console.log(`X Background: Downloading ${segments.length} segments...`);
        const segmentBuffers = await Promise.all(
            segments.map(async (seg) => {
                const segUrl = seg.startsWith('http') ? seg : (seg.startsWith('/') ? origin + seg : baseUrl + seg);
                const resp = await fetch(segUrl);
                if (!resp.ok) throw new Error(`Failed to fetch segment ${seg}`);
                return resp.arrayBuffer();
            })
        );

        // Concatenate buffers into a single Uint8Array
        const finalParts = initBuffer ? [initBuffer, ...segmentBuffers] : segmentBuffers;
        const totalLength = finalParts.reduce((acc, part) => acc + part.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const part of finalParts) {
            merged.set(new Uint8Array(part), offset);
            offset += part.byteLength;
        }

        // Convert to Base64 Data URL (MV3 Service Worker compatible, chunked to prevent stack overflow)
        let binary = '';
        const chunkSize = 0x8000; // 32KB chunks
        for (let i = 0; i < merged.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, merged.subarray(i, Math.min(i + chunkSize, merged.length)));
        }
        const dataUrl = `data:video/mp4;base64,${btoa(binary)}`;

        // Trigger Download
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false
        }, (id) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: id });
            }
        });

    } catch (err) {
        console.error("X Background: Stitching Error", err);
        sendResponse({ success: false, error: err.message });
    }
}
