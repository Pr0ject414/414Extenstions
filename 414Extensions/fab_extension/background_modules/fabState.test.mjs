import test from 'node:test';
import assert from 'node:assert';
import {
    addUrlToFabQueue,
    fabUrlQueue,
    queuedUrlSet
} from './fabState.js';

// Mock chrome API for storageUtils.js
global.chrome = {
    storage: {
        local: {
            get: () => {},
            set: () => {}
        }
    },
    runtime: {
        lastError: null
    }
};

function clearState() {
    fabUrlQueue.length = 0;
    queuedUrlSet.clear();
}

test('addUrlToFabQueue adds a new valid URL', () => {
    clearState();

    const url = 'https://www.fab.com/listings/1';
    const result = addUrlToFabQueue(url);

    assert.strictEqual(result, true, 'Should return true for a new URL');
    assert.strictEqual(fabUrlQueue.length, 1, 'Queue should have one item');
    assert.strictEqual(fabUrlQueue[0], url, 'Queue should contain the added URL');
    assert.ok(queuedUrlSet.has(url), 'Set should contain the added URL');
});

test('addUrlToFabQueue rejects duplicate URLs', () => {
    clearState();

    const url = 'https://www.fab.com/listings/2';
    addUrlToFabQueue(url);
    const result = addUrlToFabQueue(url);

    assert.strictEqual(result, false, 'Should return false for a duplicate URL');
    assert.strictEqual(fabUrlQueue.length, 1, 'Queue should still have only one item');
});

test('addUrlToFabQueue rejects non-string values', () => {
    clearState();

    const result = addUrlToFabQueue(123);

    assert.strictEqual(result, false, 'Should return false for a non-string value');
    assert.strictEqual(fabUrlQueue.length, 0, 'Queue should remain empty');
});

test('addUrlToFabQueue rejects null/undefined', () => {
    clearState();

    assert.strictEqual(addUrlToFabQueue(null), false, 'Should return false for null');
    assert.strictEqual(addUrlToFabQueue(undefined), false, 'Should return false for undefined');
    assert.strictEqual(fabUrlQueue.length, 0, 'Queue should remain empty');
});
