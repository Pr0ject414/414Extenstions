import { jest } from '@jest/globals';

// Mock chrome API before importing appState
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    },
    runtime: {
        lastError: null
    }
};

// Mock console to keep test output clean
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn()
};

import { isRateLimited, setRateLimitCoolDown, rateLimitCoolDownUntil } from './appState.js';

describe('appState - Rate Limiting', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        // Reset the rateLimitCoolDownUntil variable if possible,
        // but since it's an exported let, we might need a way to reset it.
        // For now, we'll rely on the order of tests or set it explicitly.
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('isRateLimited should return false by default', () => {
        expect(isRateLimited()).toBe(false);
    });

    test('setRateLimitCoolDown should update cooldown and return true for future timestamp', () => {
        const futureTime = Date.now() + 10000;
        const result = setRateLimitCoolDown(futureTime);

        expect(result).toBe(true);
        expect(isRateLimited()).toBe(true);
    });

    test('isRateLimited should return false when current time is exactly cooldown time', () => {
        const now = Date.now();
        const futureTime = now + 10000;
        setRateLimitCoolDown(futureTime);

        jest.advanceTimersByTime(10000);
        // At exactly futureTime, isRateLimited (now < cooldown) should be false
        expect(isRateLimited()).toBe(false);
    });

    test('isRateLimited should return false after cooldown time', () => {
        const now = Date.now();
        const futureTime = now + 10000;
        setRateLimitCoolDown(futureTime);

        jest.advanceTimersByTime(11000);
        expect(isRateLimited()).toBe(false);
    });

    test('setRateLimitCoolDown should return false for past timestamp', () => {
        const pastTime = Date.now() - 10000;
        const result = setRateLimitCoolDown(pastTime);

        expect(result).toBe(false);
    });

    test('setRateLimitCoolDown should return false for timestamp not greater than current cooldown', () => {
        const now = Date.now();
        const futureTime = now + 10000;
        setRateLimitCoolDown(futureTime);

        const smallerFutureTime = now + 5000;
        const result = setRateLimitCoolDown(smallerFutureTime);

        expect(result).toBe(false);
    });
});
