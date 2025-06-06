// KylesChromeExtensions/fab_extension/content_scripts/modules/browsePageHider.js

// Initialize the shared namespace if it doesn't exist
window.FabContentModules = window.FabContentModules || {};

(function() {
    let hiddenOwnedItemCount = 0;
    let hiderObserver = null;

    function hideOwnedItems(node) {
        const ownedItems = node.querySelectorAll('div.nTa5u2sc:not([data-fab-hidden="true"]) i.fabkit-Icon--intent-success');
        ownedItems.forEach(icon => {
            const productItem = icon.closest('div.nTa5u2sc');
            if (productItem) {
                productItem.style.display = 'none';
                productItem.setAttribute('data-fab-hidden', 'true');
                hiddenOwnedItemCount++;
            }
        });
    }

    FabContentModules.initializeHider = function() {
        if (hiderObserver) hiderObserver.disconnect();
        hideOwnedItems(document.body);
        hiderObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) hideOwnedItems(node);
                    });
                }
            }
        });
        hiderObserver.observe(document.body, { childList: true, subtree: true });
        console.log("FabBrowsePage Hider: Initialized.");
    };

    FabContentModules.stopHider = function() {
        if (hiderObserver) {
            hiderObserver.disconnect();
            hiderObserver = null;
            console.log("FabBrowsePage Hider: Stopped.");
        }
    };

    FabContentModules.getHiddenCount = function() {
        return hiddenOwnedItemCount;
    };
})();