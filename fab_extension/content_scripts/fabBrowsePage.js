// KylesChromeExtensions/fab_extension/content_scripts/fabBrowsePage.js

let fabFilterIntervalId = null;
const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled';
const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';

// Keys for new settings (must match fabConstants.js)
const FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY = 'fabBrowsePageScanIntervalMs';
const FAB_FREE_ITEM_GRACE_CYCLES_KEY = 'fabFreeItemGraceCycles';

let recentlyOpenedUrls = new Set();
const RECENTLY_OPENED_URL_EXPIRY_MS = 45000; // Can remain hardcoded or be made a setting later
let autoOpenFreeIsEnabled = false;
const PROCESSING_ITEM_FLAG = 'data-fab-processing-initiated';
const FREE_CANDIDATE_CYCLES_ATTR = 'data-fab-free-candidate-cycles';

let hiddenOwnedItemCount = 0;
let isGloballyRateLimited = false;
let userFilterSettingEnabled = false;

// Variables to hold loaded settings
let loadedFabBrowsePageScanIntervalMs = 5000; // Default
let loadedFabFreeItemGraceCycles = 4;      // Default

// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fab_content_scripts_status") {
        if (request.rateLimited) {
            if (!isGloballyRateLimited) {
                console.log('FabBrowsePage: Received PAUSE signal from background.');
                isGloballyRateLimited = true;
                stopFabFilter();
            }
        } else {
            if (isGloballyRateLimited) {
                console.log('FabBrowsePage: Received RESUME signal from background.');
                isGloballyRateLimited = false;
                if (userFilterSettingEnabled) {
                    console.log('FabBrowsePage: Filter is enabled by user, attempting to restart.');
                    startFabFilter();
                } else {
                    console.log('FabBrowsePage: Filter is disabled by user, not restarting despite resume signal.');
                }
            }
        }
        sendResponse({status: "ack_fab_status_received"});
        return true;
    } else if (request.action === "getHiddenOwnedItemCount") {
        sendResponse({ count: hiddenOwnedItemCount });
        return true;
    }
    return false;
});


function processFabItems() {
    const productItems = document.querySelectorAll('div.fabkit-Stack-root.nTa5u2sc');

    productItems.forEach((item) => {
        if (item.style.display === 'none' && !item.hasAttribute(PROCESSING_ITEM_FLAG) && !item.hasAttribute(FREE_CANDIDATE_CYCLES_ATTR)) {
            return;
        }

        const successIcon = item.querySelector('i.fabkit-Icon--intent-success');
        const itemLinkElement = item.querySelector('a.fabkit-Typography-root.bc6TaIqU.fabkit-Focusable-root');
        const itemUrl = itemLinkElement ? itemLinkElement.href : null;

        if (successIcon) {
            if (item.style.display !== 'none') {
                item.style.display = 'none';
                hiddenOwnedItemCount++;
            }
            if (item.hasAttribute(FREE_CANDIDATE_CYCLES_ATTR)) item.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);
            if (item.hasAttribute(PROCESSING_ITEM_FLAG)) item.removeAttribute(PROCESSING_ITEM_FLAG);
            if (itemUrl) recentlyOpenedUrls.delete(itemUrl);
        } else {
            if (item.hasAttribute(PROCESSING_ITEM_FLAG) || (item.style.display === 'none' && itemUrl && recentlyOpenedUrls.has(itemUrl))) {
                return;
            }

            const priceElements = item.querySelectorAll('.J9vFXlBh .fabkit-Typography-root.fabkit-Typography--intent-primary');
            let isFree = false;
            priceElements.forEach(el => {
                if (el.textContent.trim().toLowerCase() === 'free') {
                    isFree = true;
                }
            });

            if (isFree && autoOpenFreeIsEnabled && itemUrl) {
                let currentCycles = parseInt(item.getAttribute(FREE_CANDIDATE_CYCLES_ATTR) || '-1', 10);

                if (currentCycles === -1) {
                    item.setAttribute(FREE_CANDIDATE_CYCLES_ATTR, '0');
                } else if (currentCycles < loadedFabFreeItemGraceCycles) { // Use loaded setting
                    item.setAttribute(FREE_CANDIDATE_CYCLES_ATTR, (currentCycles + 1).toString());
                } else {
                    item.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);

                    if (recentlyOpenedUrls.has(itemUrl)) {
                        item.style.display = 'none';
                        return;
                    }

                    item.setAttribute(PROCESSING_ITEM_FLAG, 'true');
                    recentlyOpenedUrls.add(itemUrl);
                    setTimeout(() => {
                        recentlyOpenedUrls.delete(itemUrl);
                        if (item.hasAttribute(PROCESSING_ITEM_FLAG) && item.parentElement && !item.querySelector('i.fabkit-Icon--intent-success')) {
                            item.removeAttribute(PROCESSING_ITEM_FLAG);
                        }
                    }, RECENTLY_OPENED_URL_EXPIRY_MS);

                    item.style.display = 'none';

                    chrome.runtime.sendMessage({ action: "openTabInBackground", url: itemUrl }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("FabBrowsePage: Error sending 'openTabInBackground' message:", chrome.runtime.lastError.message, "for URL:", itemUrl);
                            recentlyOpenedUrls.delete(itemUrl);
                            item.removeAttribute(PROCESSING_ITEM_FLAG);
                        } else if (response && response.status && !["queued_processing_disabled", "queued_and_processing_attempted", "queued"].includes(response.status)) {
                            console.warn(`FabBrowsePage: 'openTabInBackground' for ${itemUrl} not queued as expected by background. Status: ${response.status}. Message: ${response.error || ''}`);
                            recentlyOpenedUrls.delete(itemUrl);
                            item.removeAttribute(PROCESSING_ITEM_FLAG);
                             // Optionally make item visible again if not queued due to non-processing related issue
                            // item.style.display = ''; 
                        } else if (response && response.status === "queued_processing_disabled") {
                             console.log(`FabBrowsePage: Item ${itemUrl} was queued by background, but processing is currently disabled.`);
                             // Item is queued, PROCESSING_ITEM_FLAG and optimistic hide remain.
                        }
                    });
                }
            } else {
                if (item.hasAttribute(FREE_CANDIDATE_CYCLES_ATTR)) {
                    item.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);
                }
            }
        }
    });
}

function startFabFilter() {
    if (isGloballyRateLimited) {
        console.log('FabBrowsePage Filter: Not starting, globally paused/rate-limited.');
        return;
    }
    if (fabFilterIntervalId !== null) {
        return;
    }

    console.log(`FabBrowsePage Filter: Starting filter process... ScanInterval: ${loadedFabBrowsePageScanIntervalMs}ms, GraceCycles: ${loadedFabFreeItemGraceCycles}`);
    hiddenOwnedItemCount = 0;
    try { processFabItems(); } catch (e) { console.error('FabBrowsePage: Error during initial run of processFabItems:', e); }

    fabFilterIntervalId = setInterval(() => {
        if (isGloballyRateLimited) {
            stopFabFilter();
            return;
        }
        try { processFabItems(); } catch (e) { console.error('FabBrowsePage: Error during periodic run of processFabItems:', e); }
    }, loadedFabBrowsePageScanIntervalMs); // Use loaded setting
}

function stopFabFilter() {
    if (fabFilterIntervalId !== null) {
        clearInterval(fabFilterIntervalId);
        fabFilterIntervalId = null;
        console.log('FabBrowsePage Filter: Stopped.');
        document.querySelectorAll(`[${FREE_CANDIDATE_CYCLES_ATTR}], [${PROCESSING_ITEM_FLAG}]`).forEach(el => {
            el.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);
            el.removeAttribute(PROCESSING_ITEM_FLAG);
        });
    }
}

function loadBrowsePageSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY,
            FAB_FREE_ITEM_GRACE_CYCLES_KEY
        ], (result) => {
            if (chrome.runtime.lastError) {
                console.warn("FabBrowsePage: Error loading browse page settings from storage", chrome.runtime.lastError.message);
            } else {
                if (result[FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY] !== undefined) {
                    loadedFabBrowsePageScanIntervalMs = parseInt(result[FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY], 10);
                }
                if (result[FAB_FREE_ITEM_GRACE_CYCLES_KEY] !== undefined) {
                    loadedFabFreeItemGraceCycles = parseInt(result[FAB_FREE_ITEM_GRACE_CYCLES_KEY], 10);
                }
            }
            console.log(`FabBrowsePage: Loaded settings - ScanInterval: ${loadedFabBrowsePageScanIntervalMs}ms, GraceCycles: ${loadedFabFreeItemGraceCycles}`);
            resolve();
        });
    });
}

async function initializeFabFilter() {
    await loadBrowsePageSettings(); // Load custom settings first

    chrome.runtime.sendMessage({ action: "getFabRateLimitStatus" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("FabBrowsePage: Could not get initial rate limit status from background.", chrome.runtime.lastError.message);
        } else if (response && response.rateLimited !== undefined) {
            isGloballyRateLimited = response.rateLimited;
        } else {
            console.warn("FabBrowsePage: Received no or invalid initial pause status from background.");
        }

        chrome.storage.local.get([FAB_FILTER_ENABLED_KEY, FAB_AUTO_OPEN_FREE_ENABLED_KEY], (result) => {
            if (chrome.runtime.lastError) {
                console.warn("FabBrowsePage: Error getting local storage settings.", chrome.runtime.lastError.message);
                userFilterSettingEnabled = false;
            } else {
                userFilterSettingEnabled = result[FAB_FILTER_ENABLED_KEY] === undefined ? false : result[FAB_FILTER_ENABLED_KEY];
                autoOpenFreeIsEnabled = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === undefined ? false : result[FAB_AUTO_OPEN_FREE_ENABLED_KEY];

                if (result[FAB_FILTER_ENABLED_KEY] === undefined) {
                    chrome.storage.local.set({ [FAB_FILTER_ENABLED_KEY]: false });
                }
                if (result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === undefined) {
                    chrome.storage.local.set({ [FAB_AUTO_OPEN_FREE_ENABLED_KEY]: false });
                }
            }

            console.log(`FabBrowsePage Filter: Initializing. User filter enabled: ${userFilterSettingEnabled}. Auto-open free: ${autoOpenFreeIsEnabled}. Effective background pause: ${isGloballyRateLimited}`);
            if (userFilterSettingEnabled && !isGloballyRateLimited) {
                startFabFilter();
            } else if (userFilterSettingEnabled && isGloballyRateLimited) {
                console.log('FabBrowsePage Filter: User has filter enabled, but currently paused due to background state.');
            }
        });
    });

    chrome.storage.onChanged.addListener(async (changes, namespace) => { // Make async for await
        if (namespace !== 'local') return;

        let needsFilterStateUpdate = false;
        let fabSettingsChanged = false;

        if (changes[FAB_FILTER_ENABLED_KEY]) {
            userFilterSettingEnabled = changes[FAB_FILTER_ENABLED_KEY].newValue;
            console.log(`FabBrowsePage: User filter setting changed to -> ${userFilterSettingEnabled ? 'Enabled' : 'Disabled'}`);
            needsFilterStateUpdate = true;
        }
        if (changes[FAB_AUTO_OPEN_FREE_ENABLED_KEY]) {
            autoOpenFreeIsEnabled = changes[FAB_AUTO_OPEN_FREE_ENABLED_KEY].newValue;
            console.log(`FabBrowsePage: Auto-open free setting changed to -> ${autoOpenFreeIsEnabled ? 'Enabled' : 'Disabled'}.`);
        }
        if (changes[FAB_BROWSE_PAGE_SCAN_INTERVAL_MS_KEY] || changes[FAB_FREE_ITEM_GRACE_CYCLES_KEY]) {
            console.log("FabBrowsePage: Browse page specific settings (scan interval or grace cycles) changed. Reloading them.");
            await loadBrowsePageSettings(); // Await the reload
            fabSettingsChanged = true; // Indicate that settings affecting the filter's behavior changed
        }


        if (needsFilterStateUpdate || (fabSettingsChanged && userFilterSettingEnabled && !isGloballyRateLimited) ) {
            if (userFilterSettingEnabled && !isGloballyRateLimited) {
                console.log("FabBrowsePage: Filter state update - stopping and restarting filter.");
                stopFabFilter(); // Stop first
                startFabFilter(); // Then restart with potentially new interval
            } else {
                console.log("FabBrowsePage: Filter state update - stopping filter (user disabled or globally paused).");
                stopFabFilter();
            }
        }
    });
}

initializeFabFilter();