// KylesChromeExtensions/fab_extension/content_scripts/fabBrowsePage.js

(function() {
    // GUARD CLAUSE: Check if this script has already been loaded on this page.
    // If it has, do nothing and exit immediately.
    if (window.hasFabBrowseScriptRun) {
        return;
    }
    // Set the flag to true to prevent this script from running again.
    window.hasFabBrowseScriptRun = true;

    // If the modules haven't loaded, this script can't run.
    if (!window.FabContentModules) return;

    const { initializeHider, stopHider, getHiddenCount, initializeAutoOpener, stopAutoOpener } = window.FabContentModules;

    const FAB_FILTER_ENABLED_KEY = 'isFabFilterEnabled';
    const FAB_AUTO_OPEN_FREE_ENABLED_KEY = 'isFabAutoOpenFreeEnabled';
    const FAB_FREE_ITEM_GRACE_CYCLES_KEY = 'fabFreeItemGraceCycles';
    const FAB_SHOW_FREE_ONLY_KEY = 'isFabShowFreeOnlyEnabled';

    let settings = {
        filterEnabled: false,
        autoOpenEnabled: false,
        graceCyclesMs: 4000
    };
    let isGloballyPaused = false;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (chrome.runtime.lastError) {
            console.log("FabBrowsePage Coordinator: Runtime error on message.", chrome.runtime.lastError.message);
            return;
        }

        if (request.action === "fab_content_scripts_status") {
            isGloballyPaused = request.rateLimited;
            updateFeatureStates();
            sendResponse({ status: "ack_fab_status_received" });
        } else if (request.action === "getHiddenOwnedItemCount") {
            sendResponse({ count: getHiddenCount() });
        }
        return true; 
    });

    function updateFeatureStates() {
        if (settings.filterEnabled && !isGloballyPaused) initializeHider();
        else stopHider();

        if (settings.autoOpenEnabled && !isGloballyPaused) initializeAutoOpener({ graceCyclesMs: settings.graceCyclesMs });
        else stopAutoOpener();
    }

    async function initialize() {
        try {
            const response = await chrome.runtime.sendMessage({ action: "getFabRateLimitStatus" });
            isGloballyPaused = response?.rateLimited ?? false;
        } catch(e) { 
            console.warn("Could not get initial rate limit status. Assuming paused.", e.message);
            isGloballyPaused = true;
        }

        const keys = [FAB_FILTER_ENABLED_KEY, FAB_AUTO_OPEN_FREE_ENABLED_KEY, FAB_FREE_ITEM_GRACE_CYCLES_KEY, FAB_SHOW_FREE_ONLY_KEY];
        const result = await chrome.storage.local.get(keys);
        
        settings.filterEnabled = result[FAB_FILTER_ENABLED_KEY] ?? false;
        settings.autoOpenEnabled = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] ?? false;
        const graceCycles = result[FAB_FREE_ITEM_GRACE_CYCLES_KEY] ?? 4;
        settings.graceCyclesMs = graceCycles * 1000;

        console.log("FabBrowsePage Coordinator: Initializing with settings:", settings);
        // URL Monitoring logic to handle SPA navigation
        let lastUrl = location.href;
        let isRedirecting = false;

        const checkAndEnforceFilter = () => {
             // Re-fetch setting in case it changed in memory (though usually static here until reload)
             // Check if we need to enforce "Show Free Only"
             const currentUrl = new URL(window.location.href);
             const path = currentUrl.pathname;
             
             // Expand the definition of a "Browse Page" where we want to filter items.
             const isBrowsePage = 
                path.includes('/category/') || 
                path.includes('/search') || 
                path.includes('/channels/') || 
                path.includes('/tags/') || 
                path.includes('/formats/') || 
                path.includes('/sellers/');
             
             chrome.storage.local.get([FAB_SHOW_FREE_ONLY_KEY], (res) => {
                 if (res[FAB_SHOW_FREE_ONLY_KEY] && isBrowsePage) {
                    // Check if is_free is missing OR if it is present but not set to '1'
                    if (currentUrl.searchParams.get('is_free') !== '1') {
                        if (isRedirecting) return; // Prevent loop

                        console.log("FAB Browse Page: 'Only Show Free' is enabled. Redirecting to filtered view...");
                        currentUrl.searchParams.set('is_free', '1');
                        isRedirecting = true;
                        window.location.href = currentUrl.href;
                    }
                 }
             });
        };

        // Run immediately
        checkAndEnforceFilter();

        // Check periodically for URL changes (SPA navigation)
        const urlCheckInterval = setInterval(() => {
            // SAFETY CHECK: If extension is reloaded, chrome.runtime.id becomes undefined.
            // We must stop running to clear "Extension context invalidated" errors.
            if (typeof chrome.runtime.id === 'undefined') {
                clearInterval(urlCheckInterval);
                return;
            }

            if (location.href !== lastUrl) {
                lastUrl = location.href;
                isRedirecting = false; // Reset flag on URL change (new navigation)
                
                checkAndEnforceFilter();
                // Also re-trigger feature state updates if needed (e.g. hider might need reset)
                updateFeatureStates();
            }
        }, 500); // Check every 500ms for snappier response to SPA changes
        updateFeatureStates();

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            let needsUpdate = false;
            
            // Re-check rate limit status on any setting change to see if we can resume
            chrome.runtime.sendMessage({ action: "getFabRateLimitStatus" }).then(response => {
                const wasPaused = isGloballyPaused;
                isGloballyPaused = response?.rateLimited ?? false;
                if (wasPaused !== isGloballyPaused) {
                    console.log(`FabBrowsePage: Rate limit status updated to ${isGloballyPaused ? 'PAUSED' : 'ACTIVE'}`);
                    needsUpdate = true;
                }

                if (changes[FAB_FILTER_ENABLED_KEY]) {
                    settings.filterEnabled = !!changes[FAB_FILTER_ENABLED_KEY].newValue;
                    needsUpdate = true;
                }
                if (changes[FAB_AUTO_OPEN_FREE_ENABLED_KEY]) {
                    settings.autoOpenEnabled = !!changes[FAB_AUTO_OPEN_FREE_ENABLED_KEY].newValue;
                    needsUpdate = true;
                }
                if (changes[FAB_FREE_ITEM_GRACE_CYCLES_KEY]) {
                    settings.graceCyclesMs = (changes[FAB_FREE_ITEM_GRACE_CYCLES_KEY].newValue ?? 4) * 1000;
                    needsUpdate = true;
                }
                
                if (needsUpdate) updateFeatureStates();
            }).catch(e => console.warn("FabBrowsePage: Failed to check rate limit status on change.", e));
        });
    }

    if (typeof chrome.runtime.id !== "undefined") {
        initialize();
    } else {
        console.log("FabBrowsePage Coordinator: Extension context is not valid. Script will not run.");
    }
})();