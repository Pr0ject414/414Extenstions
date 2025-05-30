// KylesChromeExtensions/fab_extension/content_scripts/fabBrowsePage.js

let fabFilterIntervalId = null;
const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled'; // Must match FabConstants.FAB_FILTER_ENABLED_KEY

let recentlyOpenedUrls = new Set();
const RECENTLY_OPENED_URL_EXPIRY_MS = 45000;
const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled'; // Must match FabConstants.FAB_AUTO_OPEN_FREE_ENABLED_KEY
let autoOpenFreeIsEnabled = false;
const GRACE_PERIOD_CYCLES_FOR_FREE_ITEM = 4;
const PROCESSING_ITEM_FLAG = 'data-fab-processing-initiated';
const FREE_CANDIDATE_CYCLES_ATTR = 'data-fab-free-candidate-cycles';

let hiddenOwnedItemCount = 0;
let isGloballyRateLimited = false; // Flag to track global rate limit status from background
let userFilterSettingEnabled = false; // Track the user's preferred setting for the filter

// --- Message Listener from Background ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fab_content_scripts_status") {
        if (request.rateLimited) { // rateLimited means effectively paused (master off, module off, or actual rate limit)
            if (!isGloballyRateLimited) { // Only log/act if state changes
                console.log('FabBrowsePage: Received PAUSE signal from background.');
                isGloballyRateLimited = true;
                stopFabFilter(); // Stop active processing
            }
        } else { // Not rateLimited (meaning resume)
            if (isGloballyRateLimited) { // Only log/act if state changes from paused
                console.log('FabBrowsePage: Received RESUME signal from background.');
                isGloballyRateLimited = false;
                // Resume only if the user's preference for the filter is actually enabled
                if (userFilterSettingEnabled) { // Check our tracked user setting
                    console.log('FabBrowsePage: Filter is enabled by user, attempting to restart.');
                    startFabFilter();
                } else {
                    console.log('FabBrowsePage: Filter is disabled by user, not restarting despite resume signal.');
                }
            }
        }
        sendResponse({status: "ack_fab_status_received"}); // Acknowledge message
        return true; // Keep channel open for sendResponse if needed, though ack is sync here
    } else if (request.action === "getHiddenOwnedItemCount") {
        sendResponse({ count: hiddenOwnedItemCount });
        return true; // Async response potentially
    }
    return false; // Default for unhandled actions or synchronous sendResponse
});


function processFabItems() {
    const productItems = document.querySelectorAll('div.fabkit-Stack-root.nTa5u2sc'); // Selector might need updates if site changes

    productItems.forEach((item) => {
        if (item.style.display === 'none' && !item.hasAttribute(PROCESSING_ITEM_FLAG) && !item.hasAttribute(FREE_CANDIDATE_CYCLES_ATTR)) {
            return; // Already hidden and not being processed, skip
        }

        const successIcon = item.querySelector('i.fabkit-Icon--intent-success');
        const itemLinkElement = item.querySelector('a.fabkit-Typography-root.bc6TaIqU.fabkit-Focusable-root');
        const itemUrl = itemLinkElement ? itemLinkElement.href : null;

        if (successIcon) { // Item is owned
            if (item.style.display !== 'none') {
                item.style.display = 'none';
                hiddenOwnedItemCount++;
                // console.log('FabBrowsePage: Hiding owned item. Count:', hiddenOwnedItemCount, itemUrl || 'Unknown item');
            }
            // Clean up attributes if an item becomes owned
            if (item.hasAttribute(FREE_CANDIDATE_CYCLES_ATTR)) item.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);
            if (item.hasAttribute(PROCESSING_ITEM_FLAG)) item.removeAttribute(PROCESSING_ITEM_FLAG);
            if (itemUrl) recentlyOpenedUrls.delete(itemUrl);
        } else { // Item is NOT (yet) showing as owned
            if (item.hasAttribute(PROCESSING_ITEM_FLAG) || (item.style.display === 'none' && itemUrl && recentlyOpenedUrls.has(itemUrl))) {
                // Already being processed or was recently opened and hidden, skip.
                return;
            }

            const priceElements = item.querySelectorAll('.J9vFXlBh .fabkit-Typography-root.fabkit-Typography--intent-primary'); // Selector might need updates
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
                } else if (currentCycles < GRACE_PERIOD_CYCLES_FOR_FREE_ITEM) {
                    item.setAttribute(FREE_CANDIDATE_CYCLES_ATTR, (currentCycles + 1).toString());
                } else { // Grace period over
                    item.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);

                    if (recentlyOpenedUrls.has(itemUrl)) {
                        item.style.display = 'none'; // Ensure it's hidden if it was re-shown
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

                    item.style.display = 'none'; // Optimistically hide

                    chrome.runtime.sendMessage({ action: "openTabInBackground", url: itemUrl }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("FabBrowsePage: Error sending 'openTabInBackground' message:", chrome.runtime.lastError.message, "for URL:", itemUrl);
                            recentlyOpenedUrls.delete(itemUrl); // Allow retry
                            item.removeAttribute(PROCESSING_ITEM_FLAG);
                            // Consider making item visible again if sendMessage fails due to background issue
                        } else if (response && response.status !== "queued" && response.status !== "already_queued_or_invalid") {
                            // Background might respond with 'suspended', 'global_master_disabled', etc.
                            console.warn(`FabBrowsePage: 'openTabInBackground' for ${itemUrl} not queued successfully by background. Status: ${response.status}`);
                            recentlyOpenedUrls.delete(itemUrl); // Allow retry
                            item.removeAttribute(PROCESSING_ITEM_FLAG);
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
        return; // Already running
    }

    console.log('FabBrowsePage Filter: Starting filter process...');
    hiddenOwnedItemCount = 0; // Reset count
    try { processFabItems(); } catch (e) { console.error('FabBrowsePage: Error during initial run of processFabItems:', e); }

    const refreshIntervalMilliseconds = 5000;
    fabFilterIntervalId = setInterval(() => {
        if (isGloballyRateLimited) { // Re-check before each run
            stopFabFilter();
            return;
        }
        try { processFabItems(); } catch (e) { console.error('FabBrowsePage: Error during periodic run of processFabItems:', e); }
    }, refreshIntervalMilliseconds);
    // console.log(`FabBrowsePage: Filter started. Interval: ${refreshIntervalMilliseconds}ms.`);
}

function stopFabFilter() {
    if (fabFilterIntervalId !== null) {
        clearInterval(fabFilterIntervalId);
        fabFilterIntervalId = null;
        console.log('FabBrowsePage Filter: Stopped.');
        // Clean up attributes when filter stops
        document.querySelectorAll(`[${FREE_CANDIDATE_CYCLES_ATTR}], [${PROCESSING_ITEM_FLAG}]`).forEach(el => {
            el.removeAttribute(FREE_CANDIDATE_CYCLES_ATTR);
            el.removeAttribute(PROCESSING_ITEM_FLAG);
        });
    }
}

function initializeFabFilter() {
    chrome.runtime.sendMessage({ action: "getFabRateLimitStatus" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("FabBrowsePage: Could not get initial rate limit status from background.", chrome.runtime.lastError.message);
        } else if (response && response.rateLimited !== undefined) {
            // console.log(`FabBrowsePage: Initial effective pause status from background: ${response.rateLimited}.`);
            isGloballyRateLimited = response.rateLimited; // This reflects master off, module off, OR actual rate limit
        } else {
            console.warn("FabBrowsePage: Received no or invalid initial pause status from background.");
        }

        chrome.storage.local.get([FAB_FILTER_ENABLED_KEY, FAB_AUTO_OPEN_FREE_ENABLED_KEY], (result) => {
            if (chrome.runtime.lastError) {
                console.warn("FabBrowsePage: Error getting local storage settings.", chrome.runtime.lastError.message);
                userFilterSettingEnabled = false; // Default
            } else {
                userFilterSettingEnabled = result[FAB_FILTER_ENABLED_KEY] === undefined ? false : result[FAB_FILTER_ENABLED_KEY];
                autoOpenFreeIsEnabled = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === undefined ? false : result[FAB_AUTO_OPEN_FREE_ENABLED_KEY];

                if (result[FAB_FILTER_ENABLED_KEY] === undefined) {
                    chrome.storage.local.set({ [FAB_FILTER_ENABLED_KEY]: false }); // Initialize if not set
                }
                if (result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] === undefined) {
                    chrome.storage.local.set({ [FAB_AUTO_OPEN_FREE_ENABLED_KEY]: false }); // Initialize if not set
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

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        let needsFilterStateUpdate = false;

        if (changes[FAB_FILTER_ENABLED_KEY]) {
            userFilterSettingEnabled = changes[FAB_FILTER_ENABLED_KEY].newValue;
            console.log(`FabBrowsePage: User filter setting changed to -> ${userFilterSettingEnabled ? 'Enabled' : 'Disabled'}`);
            needsFilterStateUpdate = true;
        }
        if (changes[FAB_AUTO_OPEN_FREE_ENABLED_KEY]) {
            autoOpenFreeIsEnabled = changes[FAB_AUTO_OPEN_FREE_ENABLED_KEY].newValue;
            console.log(`FabBrowsePage: Auto-open free setting changed to -> ${autoOpenFreeIsEnabled ? 'Enabled' : 'Disabled'}.`);
            // This change is picked up by processFabItems if the filter is running.
        }

        if (needsFilterStateUpdate) {
            if (userFilterSettingEnabled && !isGloballyRateLimited) {
                console.log("FabBrowsePage: User filter setting change - starting filter.");
                startFabFilter();
            } else {
                console.log("FabBrowsePage: User filter setting change - stopping filter (user disabled or globally paused).");
                stopFabFilter();
            }
        }
    });
}

// Kick off initialization
initializeFabFilter();