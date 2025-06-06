// KylesChromeExtensions/fab_extension/content_scripts/fabBrowsePage.js

(function() {
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
        // It's good practice to check if the runtime is still valid here too.
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
        return true; // Keep the message channel open for async response
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
            console.warn("Could not get initial rate limit status. Extension may have been reloaded.", e.message);
            // Assume paused if we can't communicate with the background
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

    // Only initialize if the runtime is valid.
    if (typeof chrome.runtime.id !== "undefined") {
        initialize();
    } else {
        console.log("FabBrowsePage Coordinator: Extension context is not valid. Script will not run.");
    }
})();