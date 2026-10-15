import { jest } from '@jest/globals';

let webRequestListener = null;
global.chrome = {
    webRequest: {
        onHeadersReceived: {
            addListener: jest.fn((listener) => {
                webRequestListener = listener;
            }),
            removeListener: jest.fn(() => {
                webRequestListener = null;
            })
        }
    },
    alarms: {
        create: jest.fn(),
        get: jest.fn((name, cb) => cb && cb(null))
    },
    tabs: {
        query: jest.fn((query, cb) => {
            cb([{ id: 1, url: 'https://www.fab.com/browse' }]);
        }),
        sendMessage: jest.fn().mockResolvedValue({ count: 5 }),
        remove: jest.fn().mockResolvedValue()
    },
    storage: {
        local: {
            get: jest.fn((keys, cb) => {
                if (cb) cb({});
                return Promise.resolve({});
            }),
            set: jest.fn((items, cb) => {
                if (cb) cb();
                return Promise.resolve();
            })
        }
    },
    runtime: {
        lastError: null
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import {
    onGlobalStateChange,
    handleMessage,
    handleAlarm,
    handleTabRemoved
} from '../../fab_extension/fabBackground.js';
import * as FabConstants from '../../fab_extension/background_modules/fabConstants.js';
import * as FabState from '../../fab_extension/background_modules/fabState.js';
import * as FabQueueManager from '../../fab_extension/background_modules/fabQueueManager.js';
import * as FabVerification from '../../fab_extension/background_modules/fabVerification.js';
import * as AppState from '../../shared_modules/appState.js';

describe('fabBackground', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AppState.setGlobalMasterSwitchEnabled(true);
        AppState.setFabModuleEnabled(true);
        AppState.setFabModuleVisible(true);
        AppState.resetRateLimitCoolDown();
        FabState.setFabQueueProcessingEnabled(true);
        FabState.setSuspended(false);
        FabState.resetActiveTabs();
        while (FabState.getFabUrlQueueSize() > 0) {
            FabState.getNextUrlFromFabQueue();
        }
    });

    describe('onGlobalStateChange & webRequest listeners', () => {
        test('should register webRequest listener when master and fab are enabled', () => {
            onGlobalStateChange();
            expect(chrome.webRequest.onHeadersReceived.addListener).toHaveBeenCalledWith(
                expect.any(Function),
                { urls: ["*://*.fab.com/*"] },
                ["responseHeaders", "extraHeaders"]
            );
        });

        test('should unregister webRequest listener when master switch is disabled', () => {
            onGlobalStateChange(); // register first
            AppState.setGlobalMasterSwitchEnabled(false);
            onGlobalStateChange();
            expect(chrome.webRequest.onHeadersReceived.removeListener).toHaveBeenCalled();
        });

        test('should handle 429 status code and set coolDown with retry-after header', () => {
            onGlobalStateChange();
            expect(webRequestListener).toBeDefined();

            // Simulate 429 response with Retry-After: 60
            webRequestListener({
                statusCode: 429,
                responseHeaders: [{ name: 'retry-after', value: '60' }]
            });

            expect(AppState.isRateLimited()).toBe(true);
            expect(chrome.alarms.create).toHaveBeenCalledWith(
                FabConstants.FAB_RATE_LIMIT_EXPIRY_ALARM_NAME,
                expect.objectContaining({ when: expect.any(Number) })
            );
        });
    });

    describe('handleMessage', () => {
        test('getFabGlobalStats should return current operational status and queue info', async () => {
            const sendResponse = jest.fn();
            const handled = handleMessage({ action: 'getFabGlobalStats' }, {}, sendResponse);
            expect(handled).toBe(true);

            await new Promise(r => setTimeout(r, 20));

            expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
                queueSize: 0,
                operationalStatus: 'OK_IDLE'
            }));
        });

        test('getFabRateLimitStatus should return rate limited status', () => {
            const sendResponse = jest.fn();
            handleMessage({ action: 'getFabRateLimitStatus' }, {}, sendResponse);
            expect(sendResponse).toHaveBeenCalledWith({ rateLimited: false });

            AppState.setGlobalMasterSwitchEnabled(false);
            handleMessage({ action: 'getFabRateLimitStatus' }, {}, sendResponse);
            expect(sendResponse).toHaveBeenCalledWith({ rateLimited: true });
        });

        test('setFabQueueProcessingEnabled should update FabState and respond with success', () => {
            const sendResponse = jest.fn();
            handleMessage({ action: 'setFabQueueProcessingEnabled', enabled: false }, {}, sendResponse);
            expect(FabState.fabQueueProcessingEnabled).toBe(false);
            expect(sendResponse).toHaveBeenCalledWith({ success: true });
        });

        test('queueItemWithGracePeriod should add URL to pending grace period', () => {
            const sendResponse = jest.fn();
            const url = 'https://www.fab.com/listings/test-uuid-grace';
            handleMessage({ action: 'queueItemWithGracePeriod', url, graceMs: 1000 }, {}, sendResponse);
            expect(sendResponse).toHaveBeenCalledWith({ status: 'pending_grace_period' });
            expect(FabState.isUrlPendingOrQueued(url)).toBe(true);
        });

        test('closeFabTab should mark tab for verification and remove tab', async () => {
            const sendResponse = jest.fn();
            FabState.incrementActiveTabs();

            const handled = handleMessage({ action: 'closeFabTab' }, { tab: { id: 42 } }, sendResponse);
            expect(handled).toBe(true);
            expect(sendResponse).toHaveBeenCalledWith({ status: 'tab_close_initiated' });
        });

        test('unknown action should return error response', () => {
            const sendResponse = jest.fn();
            const handled = handleMessage({ action: 'nonExistentAction' }, {}, sendResponse);
            expect(handled).toBe(false);
            expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unknown FAB action' });
        });
    });

    describe('handleAlarm', () => {
        test('should process queue when FAB_RATE_LIMIT_EXPIRY_ALARM_NAME fires', async () => {
            chrome.tabs.create = jest.fn().mockResolvedValue({ id: 99 });
            FabState.addUrlToFabQueue('https://www.fab.com/listings/12345678-1111-2222-3333-444455556666');

            await handleAlarm({ name: FabConstants.FAB_RATE_LIMIT_EXPIRY_ALARM_NAME });
            expect(chrome.tabs.create).toHaveBeenCalled();
        });

        test('should execute handleVerificationAlarm without error on FAB_VERIFICATION_ALARM_NAME', async () => {
            await expect(handleAlarm({ name: FabConstants.FAB_VERIFICATION_ALARM_NAME })).resolves.not.toThrow();
        });
    });

    describe('handleTabRemoved', () => {
        test('should mark tab for verification and decrement active tabs when processing', async () => {
            const item = { tabId: 101, status: 'opened', url: 'https://fab.com/listings/123' };
            FabState.setVerificationQueue([item]);
            FabState.incrementActiveTabs();
            expect(FabState.activeFabProcessingTabs).toBe(1);

            await handleTabRemoved(101);

            expect(item.status).toBe('pending_verification');
            expect(FabState.activeFabProcessingTabs).toBe(0);
        });

        test('should ignore tab removal if tab was not in verification queue', async () => {
            FabState.setVerificationQueue([]);
            FabState.incrementActiveTabs();

            await handleTabRemoved(999);
            expect(FabState.activeFabProcessingTabs).toBe(1);
        });
    });
});
