// KylesChromeExtensions/fab_extension/content_scripts/fabProductPage.js

(function() {
    // GUARD CLAUSE: Prevent the script from running multiple times
    if (window.hasFabProductScriptRun) {
        return;
    }
    window.hasFabProductScriptRun = true;

    // If the modules haven't loaded, this script can't run.
    if (!window.FabContentModules) return;

    const { scrapePageData, isAlreadyInLibraryUI, checkOwnership, addToLibrary } = window.FabContentModules;
    const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';

    let autoAddEnabled = false;
    let isGloballyPaused = true; // Default to paused until we confirm otherwise.

    // Listen for global status updates from the background script.
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "fab_content_scripts_status") {
            const wasPaused = isGloballyPaused;
            isGloballyPaused = request.rateLimited;
            // If the state changes from paused to unpaused, try to run the logic.
            if (wasPaused && !isGloballyPaused) {
                runAutoAddLogic();
            }
            sendResponse({ status: "ack_status_received" });
        }
        return true;
    });

    async function attemptDirectFreeLicenseAdd() {
        // Final check before executing the core logic.
        if (isGloballyPaused || !autoAddEnabled) {
            return;
        }
        console.log('FabProductPage: Script initiated.');

        // 1. Check UI first for a quick exit
        if (isAlreadyInLibraryUI()) {
            console.log('FabProductPage: UI indicates item already in library. Closing.');
            setTimeout(() => chrome.runtime.sendMessage({ action: "closeFabTab" }), 250);
            return;
        }

        // 2. Scrape page for necessary data
        const pageData = scrapePageData();
        if (pageData.error) {
            console.error(`FabProductPage: Scrape error: ${pageData.error}`);
            return;
        }
        const { listingId, offerId, csrfToken } = pageData;

        // 3. Check ownership via API call
        try {
            const ownership = await checkOwnership(listingId);
            if (ownership?.ownsFreePersonalLicense) {
                console.log('FabProductPage: API confirms ownership. Closing.');
                setTimeout(() => chrome.runtime.sendMessage({ action: "closeFabTab" }), 250);
                return;
            }
        } catch (e) { console.error('FabProductPage: Ownership check failed.', e); }
        
        // 4. If not owned, attempt to add to library
        try {
            const addResponse = await addToLibrary(listingId, offerId, csrfToken);
            
            if (addResponse?.success) {
                console.log('FabProductPage: Successfully added to library. Closing.');
                setTimeout(() => chrome.runtime.sendMessage({ action: "closeFabTab" }), 250);
            } else {
                console.error(`FabProductPage: Failed to add. Status: ${addResponse?.status}`);
                if (addResponse?.status === 429) {
                    // Inform the background script to trigger a global cool-down.
                    chrome.runtime.sendMessage({ action: "item_add_rate_limited", url: window.location.href, listingId });
                }
            }
        } catch (e) { console.error('FabProductPage: Add to library call failed.', e); }
    }

    // A wrapper function to decide if and when to run the main logic.
    function runAutoAddLogic() {
        if (!isGloballyPaused && autoAddEnabled) {
            // Use a timeout to give the page time to settle.
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(attemptDirectFreeLicenseAdd, 3500);
            } else {
                // Use 'once: true' to avoid adding multiple listeners.
                window.addEventListener('load', () => setTimeout(attemptDirectFreeLicenseAdd, 3500), { once: true });
            }
        }
    }

    async function initialize() {
        // 1. Get the initial global pause status from the background script.
        try {
            const response = await chrome.runtime.sendMessage({ action: "getFabRateLimitStatus" });
            isGloballyPaused = response?.rateLimited ?? true;
        } catch (e) {
            console.warn("FabProductPage: Could not get initial rate limit status. Assuming paused.", e.message);
            isGloballyPaused = true;
        }

        // 2. Get the user's setting for this feature from local storage.
        const result = await chrome.storage.local.get([FAB_AUTO_ADD_ENABLED_KEY]);
        autoAddEnabled = result[FAB_AUTO_ADD_ENABLED_KEY] !== false;

        // 3. Listen for changes to the user's setting.
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes[FAB_AUTO_ADD_ENABLED_KEY]) {
                autoAddEnabled = !!changes[FAB_AUTO_ADD_ENABLED_KEY].newValue;
                // Re-evaluate whether to run the logic when the setting changes.
                runAutoAddLogic();
            }
        });

        // 4. Make the initial attempt to run the logic.
        runAutoAddLogic();
        console.log(`FabProductPage: Initialized. Paused: ${isGloballyPaused}, Auto-add: ${autoAddEnabled}`);
    }

    // Ensure all required modules are loaded before initializing.
    if (window.FabContentModules?.scrapePageData && window.FabContentModules?.checkOwnership) {
        initialize();
    } else {
        // Fallback if scripts load out of order.
        window.addEventListener('load', initialize, { once: true });
        console.warn("FabProductPage: Modules not immediately available. Initializing on window load.");
    }
})();