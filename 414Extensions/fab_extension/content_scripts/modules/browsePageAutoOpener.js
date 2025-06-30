// KylesChromeExtensions/fab_extension/content_scripts/modules/browsePageAutoOpener.js
// (Full, corrected file that mimics the original successful logic)

window.FabContentModules = window.FabContentModules || {};

(function() {
    let autoOpenerObserver = null;
    let graceCyclesMs = 4000; // This will now act as our grace period delay

    // This set tracks URLs that are currently in their grace period or have been sent for queuing.
    const processedUrls = new Set();

    function isItemFree(item) {
        const candidates = item.querySelectorAll('.fabkit-Typography-root.fabkit-Typography--intent-primary');
        for (const el of candidates) {
            if (el.tagName !== 'A' && el.textContent.trim().toLowerCase() === 'free') {
                return true;
            }
        }
        return false;
    }
    
    function processItem(item) {
        // Stop if the item is already hidden or if we're already processing its URL
        if (item.getAttribute('data-fab-hidden') === 'true') return;
        
        const itemLinkElement = item.querySelector('a.fabkit-Typography-root.bc6TaIqU.fabkit-Focusable-root');
        if (!itemLinkElement) return;

        const itemUrl = itemLinkElement.href;
        if (!itemUrl || processedUrls.has(itemUrl)) return;
        
        // Don't process items that are already owned
        if (item.querySelector('i.fabkit-Icon--intent-success')) return;

        if (isItemFree(item)) {
            // Immediately mark the URL as being processed to prevent the observer from firing again for this item.
            processedUrls.add(itemUrl);

            // This setTimeout block is the grace period. This is the logic from your original script.
            setTimeout(() => {
                // CORE LOGIC: Check if the item is still on the page. If the user scrolled away,
                // the browser will have removed it from the DOM.
                if (!document.body.contains(item)) {
                    // The user scrolled away during the grace period. Abort processing and allow
                    // the item to be picked up again if they scroll back.
                    processedUrls.delete(itemUrl);
                    return;
                }

                // If we reach here, the grace period is over and the item is still visible.
                // Time to hide it and queue it.
                console.log(`FabAutoOpener: Grace period over. Hiding and queueing item: ${itemUrl}`);
                item.style.display = 'none';
                item.setAttribute('data-fab-hidden', 'true');

                try {
                    // Send to the background for queuing. We don't need the grace period here anymore.
                    chrome.runtime.sendMessage({
                        action: "openTabInBackground", // Using a simplified, direct action now
                        url: itemUrl
                    });
                } catch (error) {
                    console.error("FabAutoOpener: Unexpected error on sendMessage:", error);
                    // If sending fails, un-hide the item to allow a retry.
                    item.style.display = '';
                    item.removeAttribute('data-fab-hidden');
                    processedUrls.delete(itemUrl);
                }

                // After a much longer timeout, clear the URL from the set to handle page reloads
                // or cases where a user might navigate away and back.
                setTimeout(() => {
                    processedUrls.delete(itemUrl);
                }, 45000); // 45 seconds, same as your original script's expiry.

            }, graceCyclesMs); // Use the grace period from settings.
        }
    }
    
    FabContentModules.initializeAutoOpener = function(settings) {
        if (autoOpenerObserver) autoOpenerObserver.disconnect();
        graceCyclesMs = settings.graceCyclesMs; // Load grace period from settings
        
        // Initial scan of the page
        document.querySelectorAll('div.nTa5u2sc').forEach(processItem);
        
        // Set up the observer for new items that load as the user scrolls
        autoOpenerObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Process only element nodes
                            if (node.matches && node.matches('div.nTa5u2sc')) {
                                processItem(node);
                            }
                            node.querySelectorAll('div.nTa5u2sc').forEach(processItem);
                        }
                    });
                }
            }
        });
        autoOpenerObserver.observe(document.body, { childList: true, subtree: true });
        console.log(`FabAutoOpener: Initialized with ${graceCyclesMs}ms visibility grace period.`);
    };

    FabContentModules.stopAutoOpener = function() {
        if (autoOpenerObserver) {
            autoOpenerObserver.disconnect();
            autoOpenerObserver = null;
        }
        processedUrls.clear();
        console.log("FabAutoOpener: Stopped.");
    };
})();