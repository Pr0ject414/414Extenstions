import { jest } from '@jest/globals';
import { saveToStorage, loadFromStorage, loadStateFromStorage, saveStateToStorage } from './storageUtils.js';

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

describe('storageUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        chrome.runtime.lastError = null;
    });

    describe('saveToStorage', () => {
        it('should resolve on success', async () => {
            chrome.storage.local.set.mockImplementation((obj, callback) => callback());
            await expect(saveToStorage('testKey', 'testValue')).resolves.toBeUndefined();
            expect(chrome.storage.local.set).toHaveBeenCalledWith({ testKey: 'testValue' }, expect.any(Function));
        });

        it('should reject on error', async () => {
            chrome.runtime.lastError = { message: 'Save error' };
            chrome.storage.local.set.mockImplementation((obj, callback) => callback());
            await expect(saveToStorage('testKey', 'testValue')).rejects.toEqual({ message: 'Save error' });
        });
    });

    describe('loadFromStorage', () => {
        it('should resolve with the correct value on success', async () => {
            chrome.storage.local.get.mockImplementation((keys, callback) => callback({ testKey: 'testValue' }));
            await expect(loadFromStorage('testKey')).resolves.toBe('testValue');
            expect(chrome.storage.local.get).toHaveBeenCalledWith(['testKey'], expect.any(Function));
        });

        it('should reject on error', async () => {
            chrome.runtime.lastError = { message: 'Load error' };
            chrome.storage.local.get.mockImplementation((keys, callback) => callback({}));
            await expect(loadFromStorage('testKey')).rejects.toEqual({ message: 'Load error' });
        });
    });

    describe('loadStateFromStorage', () => {
        it('should load multiple values and apply defaults', async () => {
            const keysWithDefaults = { key1: 'default1', key2: 'default2', key3: 'default3' };
            chrome.storage.local.get.mockImplementation((keys, callback) => callback({ key1: 'stored1', key2: undefined }));

            const result = await loadStateFromStorage(keysWithDefaults);
            expect(result).toEqual({ key1: 'stored1', key2: 'default2', key3: 'default3' });
            expect(chrome.storage.local.get).toHaveBeenCalledWith(['key1', 'key2', 'key3'], expect.any(Function));
        });

        it('should reject on error', async () => {
            chrome.runtime.lastError = { message: 'Load state error' };
            chrome.storage.local.get.mockImplementation((keys, callback) => callback({}));
            await expect(loadStateFromStorage({ key: 'default' })).rejects.toEqual({ message: 'Load state error' });
        });
    });

    describe('saveStateToStorage', () => {
        it('should resolve on success', async () => {
            const state = { key1: 'val1', key2: 'val2' };
            chrome.storage.local.set.mockImplementation((obj, callback) => callback());
            await expect(saveStateToStorage(state)).resolves.toBeUndefined();
            expect(chrome.storage.local.set).toHaveBeenCalledWith(state, expect.any(Function));
        });

        it('should reject on error', async () => {
            chrome.runtime.lastError = { message: 'Save state error' };
            chrome.storage.local.set.mockImplementation((obj, callback) => callback());
            await expect(saveStateToStorage({ key: 'val' })).rejects.toEqual({ message: 'Save state error' });
        });
    });
});
