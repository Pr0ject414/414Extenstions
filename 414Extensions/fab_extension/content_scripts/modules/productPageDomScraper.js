// KylesChromeExtensions/fab_extension/content_scripts/modules/productPageDomScraper.js

window.FabContentModules = window.FabContentModules || {};

(function() {
    FabContentModules.scrapePageData = function() {
        const listingIdMatch = window.location.pathname.match(/\/listings\/([a-f0-9-]+)/i);
        if (!listingIdMatch || !listingIdMatch[1]) return { error: 'Could not determine listing ID from URL.' };
        const listingId = listingIdMatch[1];

        const csrfToken = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('fab_csrftoken='))?.split('=')[1];
        if (!csrfToken) return { error: 'CSRF token is missing.' };

        const jsonDataElement = document.getElementById('js-json-data-prefetched-data');
        if (!jsonDataElement) return { error: 'Page JSON data element not found.' };

        let preloadedData;
        try {
            preloadedData = JSON.parse(jsonDataElement.textContent);
        } catch (e) {
            return { error: 'Could not parse page JSON data.' };
        }

        const listingDataKey = Object.keys(preloadedData).find(key => key.startsWith('/i/listings/') && key.includes(listingId));
        const listingData = listingDataKey ? preloadedData[listingDataKey] : null;
        if (!listingData || !listingData.licenses) return { error: 'Listing data or licenses not found in parsed JSON.' };

        let freeLicenseOfferId = null;
        for (const license of listingData.licenses) {
            if (license.name?.toLowerCase() === 'personal' && license.priceTier?.price === 0.0) {
                freeLicenseOfferId = license.offerId;
                break;
            }
            if (!freeLicenseOfferId && license.priceTier?.price === 0.0) {
                freeLicenseOfferId = license.offerId;
            }
        }
        if (!freeLicenseOfferId) return { error: 'No free license offerId found.' };

        return { listingId, offerId: freeLicenseOfferId, csrfToken, error: null };
    };

    FabContentModules.isAlreadyInLibraryUI = function() {
        const savedInLibraryHeading = Array.from(document.querySelectorAll('aside .fabkit-Surface-root h2, aside .fabkit-Surface-root h3'))
            .find(h => h.textContent.trim().toLowerCase() === 'saved in my library');
        return savedInLibraryHeading && savedInLibraryHeading.parentElement.querySelector('i.fabkit-Icon--intent-success');
    };
})();