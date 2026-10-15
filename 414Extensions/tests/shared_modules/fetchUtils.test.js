import { jest } from '@jest/globals';

// Setup chrome mock before imports
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { fetchWithBackoff } from '../../shared_modules/fetchUtils.js';
import * as AppState from '../../shared_modules/appState.js';

describe('fetchUtils - fetchWithBackoff', () => {
    let originalFetch;

    beforeEach(() => {
        jest.useFakeTimers();
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('should resolve immediately on successful 200 response', async () => {
        const mockResponse = { status: 200, ok: true };
        global.fetch = jest.fn(() => Promise.resolve(mockResponse));

        const promise = fetchWithBackoff('https://example.com/api', {});
        const result = await promise;

        expect(result).toBe(mockResponse);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('should retry on 429 and respect Retry-After header', async () => {
        const res429 = {
            status: 429,
            headers: {
                get: (header) => header.toLowerCase() === 'retry-after' ? '2' : null
            }
        };
        const res200 = { status: 200, ok: true };

        let callCount = 0;
        global.fetch = jest.fn(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve(res429);
            return Promise.resolve(res200);
        });

        const promise = fetchWithBackoff('https://example.com/api', {});

        // Advance timers for Retry-After delay (2s = 2000ms)
        await Promise.resolve();
        jest.advanceTimersByTime(2000);

        const result = await promise;
        expect(result).toBe(res200);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('should apply global rate limit cooldown when max retries exceeded on 429', async () => {
        const res429 = {
            status: 429,
            headers: {
                get: () => null
            }
        };
        global.fetch = jest.fn(() => Promise.resolve(res429));

        const initialAttempt = AppState.globalMaxRetries;
        const promise = fetchWithBackoff('https://example.com/api', {}, initialAttempt);

        const result = await promise;
        expect(result).toBe(res429);
        expect(AppState.isRateLimited()).toBe(true);
    });

    test('should retry on network error and throw if max retries exceeded', async () => {
        const networkError = new Error('Network failure');
        global.fetch = jest.fn(() => Promise.reject(networkError));

        const initialAttempt = AppState.globalMaxRetries;
        await expect(fetchWithBackoff('https://example.com/api', {}, initialAttempt)).rejects.toThrow('Network failure');
    });
});
