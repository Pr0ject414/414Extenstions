import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('productPageDomScraper.js', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        document.cookie = '';
        window.FabContentModules = {};

        const scriptPath = path.resolve(__dirname, '../../fab_extension/content_scripts/modules/productPageDomScraper.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    });

    describe('scrapePageData', () => {
        test('should return error if URL has no listing ID', () => {
            delete window.location;
            window.location = new URL('https://www.fab.com/browse');

            const result = window.FabContentModules.scrapePageData();
            expect(result.error).toBe('Could not determine listing ID from URL.');
        });

        test('should return error if CSRF token cookie is missing', () => {
            delete window.location;
            window.location = new URL('https://www.fab.com/listings/12345678-abcd-1234-abcd-123456789abc');

            const result = window.FabContentModules.scrapePageData();
            expect(result.error).toBe('CSRF token is missing.');
        });

        test('should return error if JSON prefetch element is missing', () => {
            delete window.location;
            window.location = new URL('https://www.fab.com/listings/12345678-abcd-1234-abcd-123456789abc');
            document.cookie = 'fab_csrftoken=mock-csrf-token-123; path=/';

            const result = window.FabContentModules.scrapePageData();
            expect(result.error).toBe('Page JSON data element not found.');
        });

        test('should return offerId when valid listing with free personal license is found', () => {
            delete window.location;
            const listingId = '12345678-abcd-1234-abcd-123456789abc';
            window.location = new URL(`https://www.fab.com/listings/${listingId}`);
            document.cookie = 'fab_csrftoken=mock-csrf-token-123; path=/';

            const jsonScript = document.createElement('script');
            jsonScript.id = 'js-json-data-prefetched-data';
            jsonScript.type = 'application/json';
            jsonScript.textContent = JSON.stringify({
                [`/i/listings/${listingId}`]: {
                    id: listingId,
                    licenses: [
                        {
                            name: 'Personal',
                            offerId: 'offer-personal-free-1',
                            priceTier: { price: 0.0 }
                        },
                        {
                            name: 'Professional',
                            offerId: 'offer-pro-paid-2',
                            priceTier: { price: 49.99 }
                        }
                    ]
                }
            });
            document.body.appendChild(jsonScript);

            const result = window.FabContentModules.scrapePageData();
            expect(result.error).toBeNull();
            expect(result.listingId).toBe(listingId);
            expect(result.offerId).toBe('offer-personal-free-1');
            expect(result.csrfToken).toBe('mock-csrf-token-123');
        });

        test('should return error if no free license exists on listing', () => {
            delete window.location;
            const listingId = '12345678-abcd-1234-abcd-123456789abc';
            window.location = new URL(`https://www.fab.com/listings/${listingId}`);
            document.cookie = 'fab_csrftoken=mock-csrf-token-123; path=/';

            const jsonScript = document.createElement('script');
            jsonScript.id = 'js-json-data-prefetched-data';
            jsonScript.type = 'application/json';
            jsonScript.textContent = JSON.stringify({
                [`/i/listings/${listingId}`]: {
                    id: listingId,
                    licenses: [
                        {
                            name: 'Standard',
                            offerId: 'offer-standard-paid',
                            priceTier: { price: 19.99 }
                        }
                    ]
                }
            });
            document.body.appendChild(jsonScript);

            const result = window.FabContentModules.scrapePageData();
            expect(result.error).toBe('No free license offerId found.');
        });
    });

    describe('isAlreadyInLibraryUI', () => {
        test('should return truthy when "Saved in my library" heading and success icon exist', () => {
            const aside = document.createElement('aside');
            aside.innerHTML = `
                <div class="fabkit-Surface-root">
                    <div>
                        <h2>Saved in my library</h2>
                        <i class="fabkit-Icon--intent-success"></i>
                    </div>
                </div>
            `;
            document.body.appendChild(aside);

            expect(window.FabContentModules.isAlreadyInLibraryUI()).toBeTruthy();
        });

        test('should return falsy when not in library', () => {
            expect(window.FabContentModules.isAlreadyInLibraryUI()).toBeFalsy();
        });
    });
});
