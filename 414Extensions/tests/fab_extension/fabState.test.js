import { jest } from '@jest/globals';

// Mock chrome API BEFORE importing the module
global.chrome = {
    storage: {
        local: {
            get: jest.fn((keys, callback) => {
                if (typeof callback === 'function') callback({});
            }),
            set: jest.fn((data, callback) => {
                if (typeof callback === 'function') callback();
            })
        }
    },
    runtime: {
        lastError: null
    }
};

// Now import the module
import * as FabState from '../../fab_extension/background_modules/fabState.js';

describe('fabState', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Clear internal state if possible
        FabState.setVerificationQueue([]);
        while(FabState.getNextUrlFromFabQueue()); 
    });

    describe('isUrlPendingOrQueued', () => {
        it('identifies pending URLs', () => {
            const url = 'https://www.fab.com/listings/pending';
            FabState.addUrlToPending(url, 123);
            expect(FabState.isUrlPendingOrQueued(url)).toBe(true);
            FabState.removeUrlFromPending(url);
            expect(FabState.isUrlPendingOrQueued(url)).toBe(false);
        });

        it('identifies queued URLs', () => {
            const url = 'https://www.fab.com/listings/queued';
            FabState.addUrlToFabQueue(url);
            expect(FabState.isUrlPendingOrQueued(url)).toBe(true);
        });

        it('identifies URLs in verification', () => {
            const url = 'https://www.fab.com/listings/verification';
            FabState.setVerificationQueue([{ url: url }]);
            expect(FabState.isUrlPendingOrQueued(url)).toBe(true);
        });

        it('returns false for unknown URLs', () => {
            const url = 'https://www.fab.com/listings/unknown';
            expect(FabState.isUrlPendingOrQueued(url)).toBe(false);
        });
    });

    describe('addUrlToFabQueue', () => {
        it('adds a new valid URL', () => {
            const url = 'https://www.fab.com/listings/1';
            const result = FabState.addUrlToFabQueue(url);

            expect(result).toBe(true);
            expect(FabState.fabUrlQueue).toContain(url);
        });

        it('rejects duplicate URLs', () => {
            const url = 'https://www.fab.com/listings/2';
            FabState.addUrlToFabQueue(url);
            const result = FabState.addUrlToFabQueue(url);

            expect(result).toBe(false);
        });
    });
});
