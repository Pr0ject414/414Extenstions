// KylesChromeExtensions/fab_extension/content_scripts/fabProductPage.js

// This key must exactly match the definition in fab_extension/background_modules/fabConstants.js
const FAB_AUTO_ADD_ENABLED_KEY = 'isFabAutoAddFreeLicenseEnabled';
let currentFabAutoAddState = true; // Will be updated from storage

// Content Script specific fetchWithBackoff (remains as a local utility function)
async function contentFetchWithBackoff(url, options, attempt = 1, maxRetries = 3, currentDelay = 15000, tabIsClosingSignal = { closed: false }) {
    if (tabIsClosingSignal.closed) {
        console.log("FabProductPage: Tab closure signaled, aborting fetch.");
        throw new Error("Tab closure signaled, aborting fetch.");
    }
    try {
        const response = await fetch(url, options);
        if (response.status === 429) {
            if (attempt >= maxRetries) {
                console.error(`FabProductPage: Max retries for ${url} due to 429.`);
                return response;
            }
            let delay = currentDelay;
            const retryAfterHeader = response.headers.get('Retry-After');
            if (retryAfterHeader) {
                const retryAfterSeconds = parseInt(retryAfterHeader, 10);
                if (!isNaN(retryAfterSeconds)) {
                    delay = retryAfterSeconds * 1000;
                } else {
                    const retryDate = Date.parse(retryAfterHeader);
                    if (!isNaN(retryDate)) {
                        delay = Math.max(0, retryDate - Date.now());
                    }
                }
            }
            delay = Math.min(delay, 300000); // Cap delay (e.g., 5 minutes)
            delay = Math.max(delay, 1000); // Ensure at least 1s delay

            console.warn(`FabProductPage: Received 429 for ${url}. Retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries}).`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return contentFetchWithBackoff(url, options, attempt + 1, maxRetries, currentDelay * 2, tabIsClosingSignal);
        }
        return response;
    } catch (error) {
        console.error(`FabProductPage: Network or other error for ${url} (Attempt ${attempt}/${maxRetries}):`, error);
        if (attempt >= maxRetries) {
            throw error;
        }
        console.warn(`FabProductPage: Retrying ${url} due to error in ${currentDelay / 1000}s.`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        return contentFetchWithBackoff(url, options, attempt + 1, maxRetries, currentDelay * 2, tabIsClosingSignal);
    }
}


async function attemptDirectFreeLicenseAdd() {
    if (!currentFabAutoAddState) {
        console.log('FabProductPage: Auto-add feature is disabled.');
        return;
    }
    console.log('FabProductPage: Script initiated (auto-add enabled).');
    let tabShouldCloseSignal = { closed: false };

    const savedInLibraryHeading = Array.from(document.querySelectorAll('aside .fabkit-Surface-root h2.fabkit-Heading--md, aside .fabkit-Surface-root h3.fabkit-Heading--sm'))
        .find(h => h.textContent.trim().toLowerCase() === 'saved in my library');

    if (savedInLibraryHeading) {
        const successIconNearby = savedInLibraryHeading.parentElement.querySelector('i.fabkit-Icon--intent-success.edsicon-check-circle');
        if (successIconNearby) {
            console.log('FabProductPage: "Saved in My Library" UI indicator found. Item assumed already owned.');
            tabShouldCloseSignal.closed = true;
            setTimeout(() => { chrome.runtime.sendMessage({ action: "closeFabTab" }); }, 250);
            return;
        }
    }

    const listingIdMatch = window.location.pathname.match(/\/listings\/([a-f0-9-]+)/i);
    if (!listingIdMatch || !listingIdMatch[1]) {
        console.log('FabProductPage: Could not determine listing ID from URL.');
        return;
    }
    const listingId = listingIdMatch[1];
    console.log(`FabProductPage: Listing ID: ${listingId}`);

    try {
        console.log(`FabProductPage: Checking ownership for ${listingId} via API.`);
        const ownershipResponse = await contentFetchWithBackoff(`https://www.fab.com/i/listings/${listingId}/ownership`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }, 1, 2, 5000, tabShouldCloseSignal);

        console.log(`FabProductPage: Ownership check API status: ${ownershipResponse.status}`);
        if (ownershipResponse.ok) {
            const contentType = ownershipResponse.headers.get("content-type");
            if (ownershipResponse.status === 204 || !contentType || !contentType.includes("application/json")) {
                console.log('FabProductPage: Ownership API: No specific licenses owned or response not JSON.');
            } else {
                const ownedLicenses = await ownershipResponse.json();
                const ownsFreePersonalLicense = ownedLicenses.some(
                    license => license.name && license.name.toLowerCase() === 'personal' && license.slug && license.slug.toLowerCase() === 'personal'
                );
                if (ownsFreePersonalLicense) {
                    console.log('FabProductPage: API confirms "Personal" (Free) license already owned. Closing tab.');
                    tabShouldCloseSignal.closed = true;
                    setTimeout(() => { chrome.runtime.sendMessage({ action: "closeFabTab" }); }, 250);
                    return;
                }
            }
        } else if (ownershipResponse.status === 429) {
            console.warn(`FabProductPage: Ownership API check hit 429 for ${listingId}. Proceeding, but adding might fail.`);
        } else {
            console.warn(`FabProductPage: Ownership API call failed: ${ownershipResponse.status}. Proceeding to check page JSON.`);
        }
    } catch (error) {
        console.error('FabProductPage: Error during ownership API call:', error);
    }

    if (tabShouldCloseSignal.closed) return;

    const jsonDataElement = document.getElementById('js-json-data-prefetched-data');
    if (!jsonDataElement) {
        console.log('FabProductPage: Page JSON data element not found.');
        return;
    }
    let preloadedData;
    try {
        preloadedData = JSON.parse(jsonDataElement.textContent);
    } catch (e) {
        console.error('FabProductPage: Could not parse page JSON data.', e);
        return;
    }

    const listingDataKey = Object.keys(preloadedData).find(key => key.startsWith('/i/listings/') && key.includes(listingId));
    const listingData = listingDataKey ? preloadedData[listingDataKey] : null;

    if (!listingData || !listingData.licenses) {
        console.log('FabProductPage: Listing data or licenses not found in parsed JSON.');
        return;
    }

    let freeLicenseOfferId = null;
    let freeLicenseName = '';
    for (const license of listingData.licenses) {
        if (license.name && license.name.toLowerCase() === 'personal' && license.priceTier && license.priceTier.price === 0.0) {
            freeLicenseOfferId = license.offerId;
            freeLicenseName = license.name;
            break;
        }
        if (!freeLicenseOfferId && license.priceTier && license.priceTier.price === 0.0) {
             freeLicenseOfferId = license.offerId;
             freeLicenseName = license.name;
        }
    }

    if (!freeLicenseOfferId) {
        console.log('FabProductPage: No free license offerId found in page JSON for this item.');
        return;
    }
    console.log(`FabProductPage: Found free license '${freeLicenseName}' with offerId: ${freeLicenseOfferId}`);

    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.split('=').map(c => c.trim());
            if (name === 'fab_csrftoken') {
                return value;
            }
        }
        console.warn('FabProductPage: "fab_csrftoken" cookie not found.');
        return null;
    }

    const csrfToken = getCsrfToken();
    if (!csrfToken) {
        console.error('FabProductPage: CSRF token is missing. Cannot make POST request.');
        return;
    }

    const requestHeaders = new Headers();
    requestHeaders.append('Accept', 'application/json, text/plain, */*');
    requestHeaders.append('X-CSRFToken', csrfToken);
    requestHeaders.append('X-Requested-With', 'XMLHttpRequest');

    const formData = new FormData();
    formData.append('offer_id', freeLicenseOfferId);

    console.log(`FabProductPage: Attempting to add free license '${freeLicenseName}' to library via API...`);
    try {
        const response = await contentFetchWithBackoff(`https://www.fab.com/i/listings/${listingId}/add-to-library`, {
            method: 'POST',
            headers: requestHeaders,
            body: formData
        }, 1, 3, 20000, tabShouldCloseSignal);

        if (response.status === 204) {
            console.log('FabProductPage: Successfully added free license to library! Status 204. Requesting tab close.');
            tabShouldCloseSignal.closed = true;
            setTimeout(() => {
                if (tabShouldCloseSignal.closed) {
                    chrome.runtime.sendMessage({ action: "closeFabTab" });
                }
            }, 250);
        } else {
            const responseText = response.status === 429 ? "Rate limit hit after retries." : await response.text();
            console.error(`FabProductPage: Failed to add to library. Status: ${response.status}`, responseText);

            if (response.status === 429) {
                console.log(`FabProductPage: Persistent 429 error for ${listingId}. Notifying background script.`);
                chrome.runtime.sendMessage({
                    action: "item_add_rate_limited", // This action will be handled by FabBackground
                    url: window.location.href,
                    listingId: listingId
                }, (bgResponse) => { // Renamed response to bgResponse to avoid conflict
                    if (chrome.runtime.lastError) {
                        console.error("FabProductPage: Error sending rate limit message to background:", chrome.runtime.lastError.message);
                    } else if (bgResponse && bgResponse.status === "rate_limit_acknowledged_by_fab") { // Adjusted to expected response
                        console.log("FabProductPage: Background acknowledged rate limit for item.");
                         if (bgResponse.needsGlobalBroadcast) {
                            console.log("FabProductPage: Background indicated global broadcast will occur.");
                        }
                    } else {
                        console.warn("FabProductPage: Background did not acknowledge rate limit message as expected.", bgResponse);
                    }
                });
            }
        }
    } catch (error) {
        console.error('FabProductPage: Error making add-to-library POST request:', error);
    }
}

function initializeFabAutoAdd() {
    chrome.storage.local.get([FAB_AUTO_ADD_ENABLED_KEY], (result) => {
        if (result[FAB_AUTO_ADD_ENABLED_KEY] === undefined) {
            currentFabAutoAddState = true; // Default to enabled
            chrome.storage.local.set({ [FAB_AUTO_ADD_ENABLED_KEY]: true });
            console.log('FabProductPage: Auto-add enabled by default.');
        } else {
            currentFabAutoAddState = result[FAB_AUTO_ADD_ENABLED_KEY];
            console.log(`FabProductPage: Auto-add is currently ${currentFabAutoAddState ? 'enabled' : 'disabled'}.`);
        }

        if (currentFabAutoAddState) {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(attemptDirectFreeLicenseAdd, 3500);
            } else {
                window.addEventListener('load', () => {
                    setTimeout(attemptDirectFreeLicenseAdd, 3500);
                });
            }
        }
    });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[FAB_AUTO_ADD_ENABLED_KEY]) {
        currentFabAutoAddState = changes[FAB_AUTO_ADD_ENABLED_KEY].newValue;
        console.log(`FabProductPage: Auto-add setting changed to ${currentFabAutoAddState ? 'enabled' : 'disabled'}.`);
        if (currentFabAutoAddState && (document.readyState === 'complete' || document.readyState === 'interactive')) {
             console.log('FabProductPage: Setting enabled on an already loaded page, attempting run.');
             setTimeout(attemptDirectFreeLicenseAdd, 500);
        }
    }
});

initializeFabAutoAdd();