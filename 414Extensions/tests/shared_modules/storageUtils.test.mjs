import test from 'node:test';
import assert from 'node:assert';
import * as storageUtils from '../../shared_modules/storageUtils.js';

// Mock chrome API
global.chrome = {
    storage: {
        local: {
            set: (data, callback) => callback(),
            get: (keys, callback) => callback({})
        }
    },
    runtime: {
        lastError: null
    }
};

test('saveToStorage - success', async () => {
    let savedData = null;
    global.chrome.storage.local.set = (data, callback) => {
        savedData = data;
        callback();
    };
    global.chrome.runtime.lastError = null;

    await storageUtils.saveToStorage('testKey', 'testValue');
    assert.deepStrictEqual(savedData, { testKey: 'testValue' });
});

test('saveToStorage - error', async () => {
    global.chrome.storage.local.set = (data, callback) => {
        global.chrome.runtime.lastError = new Error('Storage error');
        callback();
    };

    await assert.rejects(
        storageUtils.saveToStorage('testKey', 'testValue'),
        /Storage error/
    );
});

test('loadFromStorage - success', async () => {
    global.chrome.storage.local.get = (keys, callback) => {
        assert.deepStrictEqual(keys, ['testKey']);
        callback({ testKey: 'testValue' });
    };
    global.chrome.runtime.lastError = null;

    const result = await storageUtils.loadFromStorage('testKey');
    assert.strictEqual(result, 'testValue');
});

test('loadFromStorage - error', async () => {
    global.chrome.storage.local.get = (keys, callback) => {
        global.chrome.runtime.lastError = new Error('Get error');
        callback();
    };

    await assert.rejects(
        storageUtils.loadFromStorage('testKey'),
        /Get error/
    );
});

test('loadStateFromStorage - success with defaults', async () => {
    const keysWithDefaults = {
        key1: 'default1',
        key2: 'default2'
    };
    global.chrome.storage.local.get = (keys, callback) => {
        assert.deepStrictEqual(keys, ['key1', 'key2']);
        callback({ key1: 'stored1' }); // key2 is missing
    };
    global.chrome.runtime.lastError = null;

    const result = await storageUtils.loadStateFromStorage(keysWithDefaults);
    assert.deepStrictEqual(result, {
        key1: 'stored1',
        key2: 'default2'
    });
});

test('loadStateFromStorage - error', async () => {
    global.chrome.storage.local.get = (keys, callback) => {
        global.chrome.runtime.lastError = new Error('Load state error');
        callback();
    };

    await assert.rejects(
        storageUtils.loadStateFromStorage({ key: 'default' }),
        /Load state error/
    );
});

test('saveStateToStorage - success', async () => {
    let savedData = null;
    const stateObject = { key1: 'val1', key2: 'val2' };
    global.chrome.storage.local.set = (data, callback) => {
        savedData = data;
        callback();
    };
    global.chrome.runtime.lastError = null;

    await storageUtils.saveStateToStorage(stateObject);
    assert.deepStrictEqual(savedData, stateObject);
});

test('saveStateToStorage - error', async () => {
    global.chrome.storage.local.set = (data, callback) => {
        global.chrome.runtime.lastError = new Error('Save state error');
        callback();
    };

    await assert.rejects(
        storageUtils.saveStateToStorage({ key: 'val' }),
        /Save state error/
    );
});
