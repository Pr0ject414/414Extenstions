// KylesChromeExtensions/fab_extension/content_scripts/modules/browsePageAutoOpener.js

window.FabContentModules = window.FabContentModules || {};

(function() {
    let autoOpenerObserver = null;
    let graceCyclesMs = 4000;
    const RECENTLY_OPENED_URL_EXPIRY_MS = 45000;
    const processedUrls = new Set();

    function isItemFree(item) {
        const priceElements = item.querySelectorAll('.J9vFXlBh .fabkit-Typography-root');
        for (const el of priceElements) {
            if (el.textContent.trim().toLowerCase() === 'free') return true;
        }
        return false;
    }
    
    /**
     * Injects a "success" icon into the item's card so the hider script can see it and do its job.
     * This is more robust than trying to hide the element from this script.
     * @param {HTMLElement} item The item card element.
     */
    function markItemAsOwnedInUI(item) {
        if (!item) return;
        // Check if it already has the icon to prevent duplicates.
        if (item.querySelector('i.fabkit-Icon--intent-success')) return;

        // Find a good place to put the icon. The container for the price is a good candidate.
        const priceContainer = item.querySelector('.J9vFXlBh');
        if (priceContainer) {
            const successIcon = document.createElement('i');
            // These classes are what the hider script looks for.
            successIcon.className = 'fabkit-Icon--intent-success'; 
            priceContainer.appendChild(successIcon);
        }
    }

    function processItem(item) {
        const itemLinkElement = item.querySelector('a.fabkit-Typography-root.bc6TaIqU.fabkit-Focusable-root');
        if (!itemLinkElement) return;

        const itemUrl = itemLinkElement.href;
        if (!itemUrl || processedUrls.has(itemUrl)) return;
        
        const successIcon = item.querySelector('i.fabkit-Icon--intent-success');
        if (successIcon) return;

        if (isItemFree(item)) {
            processedUrls.add(itemUrl);

            setTimeout(() => {
                if (!document.body.contains(item)) {
                    processedUrls.delete(itemUrl);
                    return;
                }

                try {
                    chrome.runtime.sendMessage({ action: "openTabInBackground", url: itemUrl }, (response) => {
                        const responseStatus = response ? (response.status || JSON.stringify(response)) : "No response";

                        if (chrome.runtime.lastError) {
                            console.error(`FabAutoOpener: Runtime error for ${itemUrl}:`, chrome.runtime.lastError.message);
                            processedUrls.delete(itemUrl); // Release claim on error
                            return;
                        }

                        if (!response || !response.status.startsWith("queued")) {
                            console.error(`FabAutoOpener: Failed to queue ${itemUrl}. Reason: ${responseStatus}`);
                            processedUrls.delete(itemUrl); // Release claim on failure to allow retry
                        } else {
                            // SUCCESS! Mark the item in the UI so the hider script can see it.
                            markItemAsOwnedInUI(item);
                            // Set the claim to expire after a timeout.
                            setTimeout(() => processedUrls.delete(itemUrl), RECENTLY_OPENED_URL_EXPIRY_MS);
                        }
                    });
                } catch (error) {
                    console.error("FabAutoOpener: Unexpected error on sendMessage:", error);
                    processedUrls.delete(itemUrl);
                }
            }, graceCyclesMs);
        }
    }
    
    FabContentModules.initializeAutoOpener = function(settings) {
        if (autoOpenerObserver) autoOpenerObserver.disconnect();
        graceCyclesMs = settings.graceCyclesMs;
        
        document.querySelectorAll('div.nTa5u2sc').forEach(processItem);
        
        autoOpenerObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
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
        console.log(`FabAutoOpener: Initialized with ${graceCyclesMs}ms grace period.`);
    };

    FabContentModules.stopAutoOpener = function() {
        if (autoOpenerObserver) {
            autoOpenerObserver.disconnect();
            autoOpenerObserver = null;
        }
        console.log("FabAutoOpener: Stopped.");
    };
})();