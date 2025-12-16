
// KylesChromeExtensions/volume_controller/volumeBackground.js

const DEFAULT_VOLUME = 1.0;

function getHostname(urlStr) {
    try {
        const url = new URL(urlStr);
        return url.hostname;
    } catch (e) {
        return null;
    }
}

async function getStoredVolumeForTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return DEFAULT_VOLUME;
        
        const hostname = getHostname(tab.url);
        if (!hostname) return DEFAULT_VOLUME;

        const key = `volume_setting_${hostname}`;
        const result = await chrome.storage.local.get([key]);
        return result[key] !== undefined ? result[key] : DEFAULT_VOLUME;
    } catch (e) {
        console.error("VolumeBackground: Error getting stored volume", e);
        return DEFAULT_VOLUME;
    }
}

async function setStoredVolumeForTab(tabId, volume) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return;

        const hostname = getHostname(tab.url);
        if (!hostname) return;

        const key = `volume_setting_${hostname}`;
        await chrome.storage.local.set({ [key]: volume });
        console.log(`VolumeBackground: Saved volume ${volume} for ${hostname}`);
    } catch (e) {
        console.error("VolumeBackground: Error saving stored volume", e);
    }
}

async function updateBadgeForTab(tabId) {
    try {
        const volume = await getStoredVolumeForTab(tabId);
        if (volume !== 1.0) {
            const text = `${Math.round(volume * 100)}`; // e.g., "200"
            await chrome.action.setBadgeText({ tabId: tabId, text: text });
            await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#E53935' }); // Red accent
        } else {
            await chrome.action.setBadgeText({ tabId: tabId, text: '' });
        }
    } catch (e) {
        console.error("VolumeBackground: Error updating badge", e);
    }
}

export const VolumeBackground = {
    handleMessage: (request, sender, sendResponse) => {
        if (request.action === "getStoredVolume") {
            // Message from content script initialization
            if (sender.tab && sender.tab.id) {
                getStoredVolumeForTab(sender.tab.id).then(vol => {
                     sendResponse({ volume: vol });
                     updateBadgeForTab(sender.tab.id); // Update badge when script loads
                });
                return true; // Async response
            }
        }
        else if (request.action === "updateVolume") {
            // Message from Popup
            const { tabId, volume } = request;
            setStoredVolumeForTab(tabId, volume);
            updateBadgeForTab(tabId);
            // Forward to content script
            chrome.tabs.sendMessage(tabId, { action: "setVolume", volume: volume }).catch(() => {});
            sendResponse({ success: true });
        }
        else if (request.action === "getCurrentVolumeForPopup") {
            // Message from Popup to get initial state
            const { tabId } = request;
            getStoredVolumeForTab(tabId).then(vol => {
                sendResponse({ volume: vol });
                updateBadgeForTab(tabId); // Ensure badge is correct on popup open
            });
            return true;
        }
        return false;
    },
    
    // Module lifecycle hooks
    init: async () => {
        console.log("VolumeBackground: Initialized");
        // Update badge for active tab on init
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) updateBadgeForTab(tabs[0].id);
        });
        
        // Listeners for badge updates
        chrome.tabs.onActivated.addListener(activeInfo => {
            updateBadgeForTab(activeInfo.tabId);
        });
        
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
             if (changeInfo.status === 'complete' || changeInfo.url) {
                 updateBadgeForTab(tabId);
             }
        });
    },
    onInstalled: async () => {
        console.log("VolumeBackground: Installed");
    }
};
