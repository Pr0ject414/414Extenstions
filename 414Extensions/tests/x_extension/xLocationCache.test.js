import { jest } from '@jest/globals';

global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { XLocationCacheManager } from '../../x_extension/xLocationCache.js';

describe('xLocationCache', () => {
    let cacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        cacheManager = new XLocationCacheManager();
    });

    test('should store and retrieve user data case-insensitively', () => {
        const data = { location: 'Tokyo, Japan', device: 'iOS' };
        cacheManager.set('Eminem', data);

        expect(cacheManager.get('eminem')).toEqual(data);
        expect(cacheManager.get('EMINEM')).toEqual(data);
        expect(cacheManager.get('unknown_user')).toBeNull();
    });

    test('should report accurate stats', () => {
        cacheManager.set('user1', { location: 'USA' });
        cacheManager.set('user2', { location: 'Canada' });

        const stats = cacheManager.getStats();
        expect(stats.totalCached).toBe(2);
        expect(stats.maxCapacity).toBeGreaterThan(0);
    });

    test('should clear cache and remove storage key', async () => {
        global.chrome.storage.local.remove.mockResolvedValue();
        cacheManager.set('user1', { location: 'USA' });
        expect(cacheManager.getStats().totalCached).toBe(1);

        await cacheManager.clear();
        expect(cacheManager.getStats().totalCached).toBe(0);
        expect(global.chrome.storage.local.remove).toHaveBeenCalledWith(['x_location_cache_v4']);
    });

    test('should load cache from storage on init', async () => {
        global.chrome.storage.local.get.mockResolvedValue({
            x_location_cache_v4: {
                elonmusk: { location: 'Austin, TX', device: 'Twitter for iPhone' }
            }
        });

        await cacheManager.init();
        expect(cacheManager.get('elonmusk')).toEqual({ location: 'Austin, TX', device: 'Twitter for iPhone' });
    });
});
