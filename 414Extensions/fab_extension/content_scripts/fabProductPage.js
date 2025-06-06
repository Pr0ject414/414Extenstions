// KylesChromeExtensions/fab_extension/content_scripts/fabProductPage.js

(function() {
    // Functions from our modules are attached to window.FabContentModules
    const { scrapePageData, isAlreadyInLibraryUI, checkOwnership, addToLibrary } = window.FabContentModules;

    const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
    let currentFabAutoAddState = true;

    async function attemptDirectFreeLicenseAdd() {
        if (!currentFabAutoAddState) return;
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

        // 3. Check ownership via API call from the content script
        try {
            const ownership = await checkOwnership(listingId); // Direct call
            if (ownership?.ownsFreePersonalLicense) {
                console.log('FabProductPage: API confirms ownership. Closing.');
                setTimeout(() => chrome.runtime.sendMessage({ action: "closeFabTab" }), 250);
                return;
            }
        } catch (e) { console.error('FabProductPage: Ownership check failed.', e); }
        
        // 4. If not owned, attempt to add to library via API from content script
        try {
            const addResponse = await addToLibrary(listingId, offerId, csrfToken); // Direct call
            
            if (addResponse?.success) {
                console.log('FabProductPage: Successfully added to library. Closing.');
                setTimeout(() => chrome.runtime.sendMessage({ action: "closeFabTab" }), 250);
            } else {
                // The error message is updated to use the new response format
                console.error(`FabProductPage: Failed to add. Status: ${addResponse?.status}`);
                // If we get rate limited, we can still inform the background script to pause other operations
                if (addResponse?.status === 429) {
                    chrome.runtime.sendMessage({ action: "item_add_rate_limited", url: window.location.href, listingId });
                }
            }
        } catch (e) { console.error('FabProductPage: Add to library call failed.', e); }
    }

    function initialize() {
        chrome.storage.local.get([FAB_AUTO_ADD_ENABLED_KEY], (result) => {
            currentFabAutoAddState = result[FAB_AUTO_ADD_ENABLED_KEY] !== false;
            if (currentFabAutoAddState) {
                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    setTimeout(attemptDirectFreeLicenseAdd, 3500);
                } else {
                    window.addEventListener('load', () => setTimeout(attemptDirectFreeLicenseAdd, 3500));
                }
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes[FAB_AUTO_ADD_ENABLED_KEY]) {
                currentFabAutoAddState = !!changes[FAB_AUTO_ADD_ENABLED_KEY].newValue;
                if (currentFabAutoAddState) setTimeout(attemptDirectFreeLicenseAdd, 500);
            }
        });
    }

    // Ensure all modules are loaded before initializing
    if (window.FabContentModules?.scrapePageData && window.FabContentModules?.checkOwnership) {
        initialize();
    } else {
        // Fallback if scripts load out of order, though executeScript should prevent this.
        window.addEventListener('load', initialize, { once: true });
        console.warn("FabProductPage: Modules not immediately available. Initializing on window load.");
    }
})();