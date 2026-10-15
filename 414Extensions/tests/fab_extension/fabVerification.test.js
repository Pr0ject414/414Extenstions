import { jest } from '@jest/globals';

// Setup global fetch and chrome mocks before imports
global.fetch = jest.fn();

global.chrome = {
    alarms: {
        get: jest.fn((name, cb) => cb && cb(null)),
        create: jest.fn()
    },
    notifications: {
        create: jest.fn()
    },
    runtime: {
        getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
        lastError: null
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
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import {
    setupVerificationAlarm,
    addOpenedItemToVerificationQueue,
    markItemForVerificationOnTabClose,
    handleVerificationAlarm
} from '../../fab_extension/background_modules/fabVerification.js';
import * as FabState from '../../fab_extension/background_modules/fabState.js';
import * as AppState from '../../shared_modules/appState.js';

describe('fabVerification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AppState.setGlobalMasterSwitchEnabled(true);
        AppState.setFabModuleEnabled(true);
        AppState.setGlobalMaxRetries(1);
        FabState.setSuspended(false);
        FabState.setVerificationQueue([]);
    });

    describe('setupVerificationAlarm', () => {
        test('should create alarm if it does not already exist', () => {
            chrome.alarms.get.mockImplementation((name, cb) => cb(null));
            setupVerificationAlarm();
            expect(chrome.alarms.create).toHaveBeenCalledWith(
                'fabVerificationAlarm',
                expect.objectContaining({ delayInMinutes: 1, periodInMinutes: 1 })
            );
        });

        test('should not create alarm if it already exists', () => {
            chrome.alarms.get.mockImplementation((name, cb) => cb({ name: 'fabVerificationAlarm' }));
            setupVerificationAlarm();
            expect(chrome.alarms.create).not.toHaveBeenCalled();
        });
    });

    describe('queue management', () => {
        test('addOpenedItemToVerificationQueue adds item to verification queue', () => {
            const item = { url: 'https://fab.com/listings/123', listingId: '123', tabId: 10, status: 'opened' };
            addOpenedItemToVerificationQueue(item);
            expect(FabState.verificationQueue).toContain(item);
        });

        test('markItemForVerificationOnTabClose sets status to pending_verification and records closeTime', () => {
            const item = { url: 'https://fab.com/listings/123', listingId: '123', tabId: 10, status: 'opened' };
            addOpenedItemToVerificationQueue(item);

            const marked = markItemForVerificationOnTabClose(10);
            expect(marked).toBe(true);
            expect(item.status).toBe('pending_verification');
            expect(item.closeTime).toBeDefined();
        });

        test('markItemForVerificationOnTabClose returns false if tabId is not found', () => {
            const marked = markItemForVerificationOnTabClose(999);
            expect(marked).toBe(false);
        });
    });

    describe('handleVerificationAlarm', () => {
        test('does nothing if globalMasterSwitchEnabled is false', async () => {
            AppState.setGlobalMasterSwitchEnabled(false);
            const item = {
                listingId: '123',
                status: 'pending_verification',
                closeTime: Date.now() - 300000 // 5 minutes ago
            };
            FabState.setVerificationQueue([item]);

            await handleVerificationAlarm();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('does nothing if item closeTime is under 2 minutes ago', async () => {
            const item = {
                listingId: '123',
                status: 'pending_verification',
                closeTime: Date.now() - 60000 // 1 min ago
            };
            FabState.setVerificationQueue([item]);

            await handleVerificationAlarm();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('verifies item ownership and marks verified_owned when user owns personal license', async () => {
            const item = {
                listingId: 'license-123',
                status: 'pending_verification',
                closeTime: Date.now() - 150000 // 2.5 mins ago
            };
            FabState.setVerificationQueue([item]);

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: {
                    get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null)
                },
                json: async () => [
                    { name: 'Personal', slug: 'personal' }
                ]
            });

            await handleVerificationAlarm();
            expect(item.status).toBe('verified_owned');
            expect(FabState.autoProcessingSuspended).toBe(false);
        });

        test('suspends auto-processing and creates notification when user does NOT own item', async () => {
            const item = {
                listingId: 'license-456',
                status: 'pending_verification',
                closeTime: Date.now() - 150000
            };
            FabState.setVerificationQueue([item]);

            global.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: {
                    get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null)
                },
                json: async () => [
                    { name: 'Commercial', slug: 'commercial' }
                ]
            });

            await handleVerificationAlarm();
            expect(item.status).toBe('verification_failed');
            expect(FabState.autoProcessingSuspended).toBe(true);
            expect(chrome.notifications.create).toHaveBeenCalledWith(
                expect.stringContaining('fab-verify-fail-license-456'),
                expect.objectContaining({
                    title: 'FAB Helper - Verification Failed'
                })
            );
        });

        test('handles rate limit (429) gracefully without suspending', async () => {
            const item = {
                listingId: 'license-789',
                status: 'pending_verification',
                closeTime: Date.now() - 150000
            };
            FabState.setVerificationQueue([item]);

            global.fetch.mockResolvedValue({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                headers: { get: () => null }
            });

            await handleVerificationAlarm();
            expect(item.status).toBe('verification_error_rate_limit');
            expect(FabState.autoProcessingSuspended).toBe(false);
        });
    });
});
