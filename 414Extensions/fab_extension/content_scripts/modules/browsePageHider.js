// KylesChromeExtensions/fab_extension/content_scripts/modules/browsePageHider.js

window.FabContentModules = window.FabContentModules || {};

(function() {
    let hiddenOwnedItemCount = 0;
    let hiderObserver = null;
    // Use a Set to track items currently in their grace period to avoid processing them multiple times
    const pendingHideItems = new Set();

    function hideOwnedItems(node) {
        // Use the original, more reliable method: find the "owned" checkmark icons first.
        const ownedIcons = node.querySelectorAll('i.fabkit-Icon--intent-success');
        
        ownedIcons.forEach(icon => {
            // Then, find the parent product card for each icon.
            const productItem = icon.closest('div.nTa5u2sc');

            // If we found a valid card and we aren't already waiting to hide it...
            if (productItem && !pendingHideItems.has(productItem)) {
                
                // Add the item to our pending set and start the grace period timer.
                pendingHideItems.add(productItem);
                
                setTimeout(() => {
                    // After 1.5 seconds, check if the item is still on the page.
                    if (document.body.contains(productItem)) {
                        console.log(`FabHider: Grace period over. Hiding owned item.`);
                        productItem.style.display = 'none';
                        productItem.setAttribute('data-fab-hidden', 'true');
                        hiddenOwnedItemCount++;
                    }
                    
                    // Remove the item from the pending set so it can be re-evaluated if needed.
                    pendingHideItems.delete(productItem);
                }, 1500); // 1.5-second grace period
            }
        });
    }

    FabContentModules.initializeHider = function() {
        if (hiderObserver) hiderObserver.disconnect();
        
        // Initial scan for items already on the page
        hideOwnedItems(document.body);
        
        hiderObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // If any nodes were added to the page...
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        // Check that the added node is an element we can query
                        if (node.nodeType === 1) {
                            hideOwnedItems(node);
                        }
                    });
                }
            }
        });
        
        hiderObserver.observe(document.body, { childList: true, subtree: true });
        console.log("FabBrowsePage Hider: Initialized with 1.5s grace period.");
    };

    FabContentModules.stopHider = function() {
        if (hiderObserver) {
            hiderObserver.disconnect();
            hiderObserver = null;
        }
        pendingHideItems.clear();
        console.log("FabBrowsePage Hider: Stopped.");
    };

    FabContentModules.getHiddenCount = function() {
        return hiddenOwnedItemCount;
    };
})();