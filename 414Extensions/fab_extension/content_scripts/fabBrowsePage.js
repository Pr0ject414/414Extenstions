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

        const keys = [FAB_FILTER_ENABLED_KEY, FAB_AUTO_OPEN_FREE_ENABLED_KEY, FAB_FREE_ITEM_GRACE_CYCLES_KEY];
        const result = await chrome.storage.local.get(keys);
        
        settings.filterEnabled = result[FAB_FILTER_ENABLED_KEY] ?? false;
        settings.autoOpenEnabled = result[FAB_AUTO_OPEN_FREE_ENABLED_KEY] ?? false;
        const graceCycles = result[FAB_FREE_ITEM_GRACE_CYCLES_KEY] ?? 4;
        settings.graceCyclesMs = graceCycles * 1000;

        console.log("FabBrowsePage Coordinator: Initializing with settings:", settings);
        updateFeatureStates();

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            let needsUpdate = false;
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
        });
    }

    if (typeof chrome.runtime.id !== "undefined") {
        initialize();
    } else {
        console.log("FabBrowsePage Coordinator: Extension context is not valid. Script will not run.");
    }
})();