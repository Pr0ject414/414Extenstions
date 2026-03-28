import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('contentApi.js - addToLibrary', () => {
    let mockFetch;

    beforeAll(() => {
        // Load the script into the JSDOM environment
        const scriptPath = path.resolve(__dirname, 'contentApi.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // In JSDOM environment, Headers and FormData should be available on window
        // But we might need to make them available on global for the script if it uses them directly
        // The script uses: new Headers(), new FormData(), fetch()

        // JSDOM doesn't have fetch by default.
        mockFetch = jest.fn();
        window.fetch = mockFetch;
        global.fetch = mockFetch;

        // Ensure Headers and FormData are on global as well
        global.Headers = window.Headers;
        global.FormData = window.FormData;

        const scriptElement = document.createElement('script');
        scriptElement.textContent = scriptContent;
        document.body.appendChild(scriptElement);
    });

    beforeEach(() => {
        mockFetch.mockReset();
        jest.useFakeTimers();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('should successfully add an item to the library (status 204)', async () => {
        mockFetch.mockResolvedValueOnce({
            status: 204,
            ok: true
        });

        const listingId = 'test-listing-id';
        const offerId = 'test-offer-id';
        const csrfToken = 'test-csrf-token';

        const result = await window.FabContentModules.addToLibrary(listingId, offerId, csrfToken);

        expect(result).toEqual({ success: true, status: 204 });
        expect(mockFetch).toHaveBeenCalledWith(
            `https://www.fab.com/i/listings/${listingId}/add-to-library`,
            expect.objectContaining({
                method: 'POST',
                headers: expect.any(window.Headers),
                body: expect.any(window.FormData)
            })
        );

        const callArgs = mockFetch.mock.calls[0][1];
        expect(callArgs.headers.get('X-CSRFToken')).toBe(csrfToken);
        expect(callArgs.body.get('offer_id')).toBe(offerId);
    });

    it('should return success false if status is not 204', async () => {
        mockFetch.mockResolvedValueOnce({
            status: 400,
            ok: false
        });

        const result = await window.FabContentModules.addToLibrary('id', 'offer', 'csrf');
        expect(result).toEqual({ success: false, status: 400 });
    });

    it('should retry on 429 status', async () => {
        mockFetch
            .mockResolvedValueOnce({
                status: 429,
                headers: new Headers({ 'Retry-After': '1' })
            })
            .mockResolvedValueOnce({
                status: 204,
                ok: true
            });

        const promise = window.FabContentModules.addToLibrary('id', 'offer', 'csrf');

        // Move time forward for the first retry
        await jest.advanceTimersByTimeAsync(1000);

        const result = await promise;
        expect(result).toEqual({ success: true, status: 204 });
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network error', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({
                status: 204,
                ok: true
            });

        const promise = window.FabContentModules.addToLibrary('id', 'offer', 'csrf');

        // Move time forward for the first retry
        await jest.advanceTimersByTimeAsync(15000); // Default delay is 15000

        const result = await promise;
        expect(result).toEqual({ success: true, status: 204 });
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return failure after max retries', async () => {
        mockFetch.mockRejectedValue(new Error('Persistent error'));

        const promise = window.FabContentModules.addToLibrary('id', 'offer', 'csrf');

        for (let i = 0; i < 3; i++) {
            await jest.advanceTimersByTimeAsync(30000); // Max retries is 3
        }

        const result = await promise;
        expect(result).toEqual({ success: false, status: -1 });
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });
});
