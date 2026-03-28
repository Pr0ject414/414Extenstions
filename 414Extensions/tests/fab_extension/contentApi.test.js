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
        const scriptPath = path.resolve(__dirname, '../../fab_extension/content_scripts/modules/contentApi.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        mockFetch = jest.fn();
        global.fetch = mockFetch;
        
        // Mock chrome
        global.chrome = {
            runtime: { sendMessage: jest.fn() }
        };

        const scriptElement = document.createElement('script');
        scriptElement.textContent = scriptContent;
        document.body.appendChild(scriptElement);

        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should retry on 429 status', async () => {
        const listingId = '123';
        const offerId = '456';
        const csrfToken = 'test-token';

        mockFetch
            .mockResolvedValueOnce({ status: 429, ok: false, headers: new Map() })
            .mockResolvedValueOnce({ status: 429, ok: false, headers: new Map() })
            .mockResolvedValueOnce({ status: 204, ok: true });

        const promise = window.FabContentModules.addToLibrary(listingId, offerId, csrfToken);

        // Resolve retries
        for (let i = 0; i < 2; i++) {
            await jest.advanceTimersByTimeAsync(30000); 
        }

        const result = await promise;
        expect(result).toEqual({ success: true, status: 204 });
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should stop after max retries', async () => {
        const listingId = '123';
        const offerId = '456';
        const csrfToken = 'test-token';

        mockFetch.mockResolvedValue({ status: 429, ok: false, headers: new Map() });

        const promise = window.FabContentModules.addToLibrary(listingId, offerId, csrfToken);

        for (let i = 0; i < 3; i++) {
            await jest.advanceTimersByTimeAsync(30000); // Max retries is 3
        }

        const result = await promise;
        expect(result).toEqual({ success: false, status: 429 });
        expect(mockFetch).toHaveBeenCalledTimes(3);
    });
});
