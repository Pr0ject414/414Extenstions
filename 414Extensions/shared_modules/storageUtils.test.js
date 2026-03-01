import { loadStateFromStorage } from './storageUtils.js';
import { jest } from '@jest/globals';

describe('loadStateFromStorage', () => {
    let originalChrome;

    beforeEach(() => {
        originalChrome = global.chrome;
        global.chrome = {
            storage: {
                local: {
                    get: jest.fn()
                }
            },
            runtime: {
                lastError: null
            }
        };
    });

    afterEach(() => {
        global.chrome = originalChrome;
    });

    test('should load all keys from storage when they exist', async () => {
        const keysWithDefaults = {
            key1: 'default1',
            key2: 'default2'
        };
        const storageResult = {
            key1: 'value1',
            key2: 'value2'
        };

        chrome.storage.local.get.mockImplementation((keys, callback) => {
            callback(storageResult);
        });

        const result = await loadStateFromStorage(keysWithDefaults);

        expect(chrome.storage.local.get).toHaveBeenCalledWith(['key1', 'key2'], expect.any(Function));
        expect(result).toEqual(storageResult);
    });

    test('should fallback to defaults when keys are missing in storage', async () => {
        const keysWithDefaults = {
            key1: 'default1',
            key2: 'default2'
        };
        const storageResult = {
            key1: 'value1'
            // key2 is missing
        };

        chrome.storage.local.get.mockImplementation((keys, callback) => {
            callback(storageResult);
        });

        const result = await loadStateFromStorage(keysWithDefaults);

        expect(result).toEqual({
            key1: 'value1',
            key2: 'default2'
        });
    });

    test('should reject when chrome.runtime.lastError is set', async () => {
        const keysWithDefaults = { key1: 'default1' };
        const error = { message: 'Storage error' };

        chrome.storage.local.get.mockImplementation((keys, callback) => {
            chrome.runtime.lastError = error;
            callback();
        });

        await expect(loadStateFromStorage(keysWithDefaults)).rejects.toEqual(error);
    });

    test('should handle keys with null or false values in storage correctly (not use default)', async () => {
        const keysWithDefaults = {
            key1: 'default1',
            key2: 'default2'
        };
        const storageResult = {
            key1: null,
            key2: false
        };

        chrome.storage.local.get.mockImplementation((keys, callback) => {
            callback(storageResult);
        });

        const result = await loadStateFromStorage(keysWithDefaults);

        expect(result).toEqual({
            key1: null,
            key2: false
        });
    });
});
