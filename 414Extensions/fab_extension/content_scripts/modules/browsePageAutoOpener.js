// KylesChromeExtensions/fab_extension/content_scripts/modules/browsePageAutoOpener.js

window.FabContentModules = window.FabContentModules || {};

(function() {
    let autoOpenerObserver = null;
    let graceCyclesMs = 4000; // This default will be replaced by settings from the main content script.
    
    // This set tracks URLs that are currently in their grace period or have been sent for queuing.
    const processedUrls = new Set();

    function isItemFree(item) {
        // Find all potential "Free" text elements within the item card.
        const candidates = item.querySelectorAll('.fabkit-Typography-root.fabkit-Typography--intent-primary');  
        for (const el of candidates) {
            // Ensure we're not grabbing the price of a different item if the selector is too broad
            // and that it's not a link.
            if (el.tagName !== 'A' && el.textContent.trim().toLowerCase() === 'free') {
                return true;
            }
        }
        return false;
    }

    // Using your original function name: processItem
    function processItem(item) {
        // Stop if the item has already been hidden by another process
        if (item.getAttribute('data-fab-hidden') === 'true') return;

        const itemLinkElement = item.querySelector('a.fabkit-Typography-root.bc6TaIqU.fabkit-Focusable-root');  
        if (!itemLinkElement) return;

        const itemUrl = itemLinkElement.href;
        // Stop if we don't have a URL or if we are already handling this URL
        if (!itemUrl || processedUrls.has(itemUrl)) return;

        // Stop if the item is already marked as owned in the UI
        if (item.querySelector('i.fabkit-Icon--intent-success')) return;

        if (isItemFree(item)) {
            // Immediately mark the URL as being processed to prevent the observer from creating multiple timers for the same item.
            processedUrls.add(itemUrl);

            // This setTimeout block creates the "grace period."
            setTimeout(() => {
                // CORE LOGIC: After the grace period, we check if the item is still physically on the page.    
                // If the user scrolled away quickly, the browser's virtual scrolling will have removed it from the DOM.
                if (!document.body.contains(item)) {
                    // The user scrolled past. Abort processing and remove from our tracking set
                    // so it can be picked up again if they scroll back to it.
                    processedUrls.delete(itemUrl);
                    return;
                }

                // If we reach here, the item is still visible. It's time to hide it and queue it for opening.  
                item.style.display = 'none';
                item.setAttribute('data-fab-hidden', 'true');

                try {
                    // Send the URL to the background script to be opened in a new tab.
                    chrome.runtime.sendMessage({
                        action: "openTabInBackground",
                        url: itemUrl
                    });
                } catch (error) {
                    console.error("FabAutoOpener: Unexpected error on sendMessage:", error);
                    // If sending the message fails, we should un-hide the item to allow a retry on a subsequent pass.
                    item.style.display = '';
                    item.removeAttribute('data-fab-hidden');
                    processedUrls.delete(itemUrl);
                }

            }, graceCyclesMs); // Use the grace period duration passed from settings.
        }
    }

    let scanInterval = null;
    let browsePageItems = null; // Live HTMLCollection for optimization

    FabContentModules.initializeAutoOpener = function(settings) {
        if (autoOpenerObserver) autoOpenerObserver.disconnect();
        if (scanInterval) clearInterval(scanInterval);

        graceCyclesMs = settings.graceCyclesMs; // Load the grace period delay from the main content script settings

        // Use a live HTMLCollection for better performance over querySelectorAll.
        // It's maintained by the browser engine and doesn't require a full DOM scan on each call.
        browsePageItems = document.getElementsByClassName('nTa5u2sc');

        const scanPage = () => {
            // Convert to array or use Array.prototype.forEach since HTMLCollection
            // might not have forEach in all environments (though usually fine in modern Chrome).
            Array.prototype.forEach.call(browsePageItems, processItem);
        };

        // Initial Scan
        scanPage();

        // Periodic Re-scan (Safety Net)
        // This ensures that if the observer misses something or if the DOM settles in a way that reveals new items,
        // we catch them. It also keeps the "loop" going.
        // Throttled to 10 seconds to reduce background CPU usage as the MutationObserver is the primary trigger.
        scanInterval = setInterval(scanPage, 10000);

        // Set up the observer to watch for new items that get added to the page as the user scrolls.
        autoOpenerObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Process only element nodes
                            if (node.matches && node.matches('div.nTa5u2sc')) {
                                processItem(node);
                            }
                            // Also deep check in case a container was added
                            if (node.getElementsByClassName) {
                                Array.prototype.forEach.call(node.getElementsByClassName('nTa5u2sc'), processItem);
                            }
                        }
                    });
                }
            }
        });

        autoOpenerObserver.observe(document.body, { childList: true, subtree: true });
    };

    FabContentModules.stopAutoOpener = function() {
        if (autoOpenerObserver) {
            autoOpenerObserver.disconnect();
            autoOpenerObserver = null;
        }
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }
        processedUrls.clear(); // Clear the tracking set
    };
})();
