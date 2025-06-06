// KylesChromeExtensions/fab_extension/content_scripts/modules/contentApi.js

// Establish the shared namespace on the window object
window.FabContentModules = window.FabContentModules || {};

(function() {
    // This is a simplified, self-contained fetchWithBackoff for content script use.
    async function contentFetchWithBackoff(url, options, attempt = 1, maxRetries = 3, currentDelay = 15000) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 && attempt < maxRetries) {
                console.warn(`FabContentAPI: Received 429 for ${url}. Retrying...`);
                let delay = currentDelay;
                const retryAfterHeader = response.headers.get('Retry-After');
                if (retryAfterHeader) {
                    const retryAfterSeconds = parseInt(retryAfterHeader, 10);
                    delay = isNaN(retryAfterSeconds) ? delay : retryAfterSeconds * 1000;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
                return contentFetchWithBackoff(url, options, attempt + 1, maxRetries, currentDelay * 2);
            }
            return response;
        } catch (error) {
            if (attempt < maxRetries) {
                console.warn(`FabContentAPI: Network error for ${url}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                return contentFetchWithBackoff(url, options, attempt + 1, maxRetries, currentDelay * 2);
            }
            throw error;
        }
    }

    /**
     * Checks ownership directly from the content script.
     * @param {string} listingId The listing ID.
     * @returns {Promise<{ownsFreePersonalLicense: boolean}>}
     */
    FabContentModules.checkOwnership = async function(listingId) {
        const url = `https://www.fab.com/i/listings/${listingId}/ownership`;
        try {
            const response = await contentFetchWithBackoff(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest',
                }
            });

            if (!response.ok || response.status === 204) {
                return { ownsFreePersonalLicense: false };
            }

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const ownedLicenses = await response.json();
                const ownsFreePersonalLicense = ownedLicenses.some(
                    license => license.name?.toLowerCase() === 'personal' && license.slug?.toLowerCase() === 'personal'
                );
                return { ownsFreePersonalLicense };
            }
            return { ownsFreePersonalLicense: false };

        } catch (error) {
            console.error(`FabContentAPI.checkOwnership: Exception for ${listingId}:`, error);
            return { ownsFreePersonalLicense: false };
        }
    };

    /**
     * Adds an item to the library directly from the content script.
     * @param {string} listingId
     * @param {string} offerId
     * @param {string} csrfToken
     * @returns {Promise<{success: boolean, status: number}>}
     */
    FabContentModules.addToLibrary = async function(listingId, offerId, csrfToken) {
        const url = `https://www.fab.com/i/listings/${listingId}/add-to-library`;
        
        const requestHeaders = new Headers();
        requestHeaders.append('Accept', 'application/json, text/plain, */*');
        requestHeaders.append('X-CSRFToken', csrfToken);
        requestHeaders.append('X-Requested-With', 'XMLHttpRequest');

        const formData = new FormData();
        formData.append('offer_id', offerId);

        try {
            const response = await contentFetchWithBackoff(url, {
                method: 'POST',
                headers: requestHeaders,
                body: formData,
            });

            if (response.status === 204) {
                return { success: true, status: response.status };
            } else {
                return { success: false, status: response.status };
            }

        } catch (error) {
            console.error(`FabContentAPI.addToLibrary: Exception for ${listingId}:`, error);
            return { success: false, status: -1 };
        }
    };
})();