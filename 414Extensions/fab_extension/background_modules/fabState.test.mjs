import test from 'node:test';
import assert from 'node:assert';

// Mock chrome API before importing the module that uses it
global.chrome = {
    storage: {
        local: {
            get: (keys, callback) => {
                if (typeof callback === 'function') callback({});
            },
            set: (data, callback) => {
                if (typeof callback === 'function') callback();
            }
        }
    },
    runtime: {
        lastError: null
    }
};

import * as FabState from './fabState.js';

test('isUrlPendingOrQueued identifies pending URLs', (t) => {
    const url = 'https://www.fab.com/listings/pending';
    FabState.addUrlToPending(url, 123);
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), true, 'Should be true when in pending');
    FabState.removeUrlFromPending(url);
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), false, 'Should be false when removed from pending');
});

test('isUrlPendingOrQueued identifies queued URLs', (t) => {
    const url = 'https://www.fab.com/listings/queued';
    FabState.addUrlToFabQueue(url);
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), true, 'Should be true when in fabUrlQueue');
    // Cleanup
    FabState.getNextUrlFromFabQueue();
});

test('isUrlPendingOrQueued identifies URLs in verification', (t) => {
    const url = 'https://www.fab.com/listings/verification';
    FabState.setVerificationQueue([{ url: url }]);
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), true, 'Should be true when in verificationQueue');
    // Cleanup
    FabState.setVerificationQueue([]);
});

test('isUrlPendingOrQueued returns false for unknown URLs', (t) => {
    const url = 'https://www.fab.com/listings/unknown';
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), false, 'Should be false for unknown URL');
});

test('isUrlPendingOrQueued handles URL in multiple states', (t) => {
    const url = 'https://www.fab.com/listings/multiple';
    FabState.addUrlToPending(url, 123);
    FabState.addUrlToFabQueue(url);
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), true, 'Should be true when in multiple states');

    FabState.removeUrlFromPending(url);
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), true, 'Should still be true (still in queue)');

    FabState.getNextUrlFromFabQueue();
    assert.strictEqual(FabState.isUrlPendingOrQueued(url), false, 'Should be false now');
});
