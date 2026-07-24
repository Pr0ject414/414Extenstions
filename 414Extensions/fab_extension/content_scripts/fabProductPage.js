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
    const FAB_QUEUE_PROCESSING_ENABLED_KEY = 'isFabQueueProcessingEnabled';

    let autoAddEnabled = false;
    let queueProcessingEnabled = false;
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
        // Guard check: Ensure we are still on a listing page (handles SPA/client-side navigation cases)
        if (!window.location.pathname.includes('/listings/')) {
            return;
        }

        // Final check before executing the core logic.
        // We run if EITHER auto-add is explicitly enabled OR if we are processing the queue.
        // If queue processing is on, the user expects items to be added and closed.
        if (isGloballyPaused || (!autoAddEnabled && !queueProcessingEnabled)) {
            return;
        }

        // 1. Check UI first for a quick exit
        if (isAlreadyInLibraryUI()) {
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
                setTimeout(() => chrome.runtime.sendMessage({ action: "closeFabTab" }), 250);
                return;
            }
        } catch (e) { console.error('FabProductPage: Ownership check failed.', e); }
        
        // 4. If not owned, attempt to add to library
        try {
            const addResponse = await addToLibrary(listingId, offerId, csrfToken);
            
            if (addResponse?.success) {
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
        // Guard check: Ensure we are on a listing page before setting up check intervals
        if (!window.location.pathname.includes('/listings/')) return;

        if (isGloballyPaused || (!autoAddEnabled && !queueProcessingEnabled)) return;

        const checkAndRun = () => {
            let attempts = 0;
            const maxAttempts = 50; // 10 seconds max (50 * 200ms)
            const interval = setInterval(() => {
                attempts++;
                const dataEl = document.getElementById('js-json-data-prefetched-data');
                // We also check if we can scrape, as scrapePageData depends on this.
                if (dataEl) {
                    clearInterval(interval);
                    // SAFETY DELAY: Even though getElementById is client-side only and safe, 
                    // we add a randomized delay (1s - 2.5s) to mimic human behavior and avoid
                    // any potential side-effects of triggering the API call too soon after page load.
                    const randomDelay = Math.floor(Math.random() * 1500) + 1000;
                    setTimeout(attemptDirectFreeLicenseAdd, randomDelay); 
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                }
            }, 200);
        };

        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            checkAndRun();
        } else {
            window.addEventListener('load', checkAndRun, { once: true });
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
        const result = await chrome.storage.local.get([FAB_AUTO_ADD_ENABLED_KEY, FAB_QUEUE_PROCESSING_ENABLED_KEY]);
        autoAddEnabled = result[FAB_AUTO_ADD_ENABLED_KEY] !== false;
        queueProcessingEnabled = result[FAB_QUEUE_PROCESSING_ENABLED_KEY] === true;

        // 3. Listen for changes to the user's setting.
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                let shouldCheck = false;
                if (changes[FAB_AUTO_ADD_ENABLED_KEY]) {
                    autoAddEnabled = !!changes[FAB_AUTO_ADD_ENABLED_KEY].newValue;
                    shouldCheck = true;
                }
                if (changes[FAB_QUEUE_PROCESSING_ENABLED_KEY]) {
                    queueProcessingEnabled = !!changes[FAB_QUEUE_PROCESSING_ENABLED_KEY].newValue;
                    shouldCheck = true;
                }
                
                if (shouldCheck) {
                    // Re-evaluate whether to run the logic when the setting changes.
                    runAutoAddLogic();
                }
            }
        });

        // 4. Make the initial attempt to run the logic.
        runAutoAddLogic();
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