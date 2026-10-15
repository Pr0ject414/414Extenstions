import { jest } from '@jest/globals';

// Setup chrome mock before imports
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    },
    alarms: {
        create: jest.fn(),
        get: jest.fn()
    },
    tabs: {
        create: jest.fn(),
        remove: jest.fn()
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { getListingIdFromUrl, addUrlToQueueAndProcess } from '../../fab_extension/background_modules/fabQueueManager.js';
import * as FabState from '../../fab_extension/background_modules/fabState.js';
import * as AppState from '../../shared_modules/appState.js';

describe('fabQueueManager', () => {
    beforeEach(() => {
        // Reset state
        AppState.setGlobalMasterSwitchEnabled(true);
        AppState.setFabModuleEnabled(true);
        FabState.setFabQueueProcessingEnabled(true);
        FabState.setSuspended(false);
        FabState.resetActiveTabs();
        // Clear queue
        while (FabState.getFabUrlQueueSize() > 0) {
            FabState.getNextUrlFromFabQueue();
        }
    });

    describe('getListingIdFromUrl', () => {
        test('should extract listing ID from valid Fab URL', () => {
            const url = 'https://www.fab.com/listings/12345678-abcd-1234-abcd-123456789abc';
            expect(getListingIdFromUrl(url)).toBe('12345678-abcd-1234-abcd-123456789abc');
        });

        test('should extract listing ID when URL has trailing parameters or slashes', () => {
            const url = 'https://www.fab.com/listings/abcdef12-3456-7890-abcd-ef1234567890/?ref=search';
            expect(getListingIdFromUrl(url)).toBe('abcdef12-3456-7890-abcd-ef1234567890');
        });

        test('should return null for non-listing Fab URL', () => {
            const url = 'https://www.fab.com/category/characters';
            expect(getListingIdFromUrl(url)).toBeNull();
        });

        test('should return null for invalid URL string', () => {
            expect(getListingIdFromUrl('not-a-valid-url')).toBeNull();
        });
    });

    describe('addUrlToQueueAndProcess', () => {
        const validUrl = 'https://www.fab.com/listings/12345678-1111-2222-3333-444455556666';

        test('should reject if global master switch is disabled', () => {
            AppState.setGlobalMasterSwitchEnabled(false);
            const res = addUrlToQueueAndProcess(validUrl);
            expect(res.status).toBe('global_master_disabled');
        });

        test('should reject if FAB module is disabled', () => {
            AppState.setFabModuleEnabled(false);
            const res = addUrlToQueueAndProcess(validUrl);
            expect(res.status).toBe('fab_module_disabled');
        });

        test('should queue and attempt processing when enabled', () => {
            FabState.incrementActiveTabs();
            FabState.incrementActiveTabs();
            const res = addUrlToQueueAndProcess(validUrl);
            expect(res.status).toBe('queued_and_processing_attempted');
            expect(FabState.getFabUrlQueueSize()).toBe(1);
        });

        test('should return already_queued_or_invalid on duplicate URL', () => {
            FabState.incrementActiveTabs();
            FabState.incrementActiveTabs();
            addUrlToQueueAndProcess(validUrl);
            const res = addUrlToQueueAndProcess(validUrl);
            expect(res.status).toBe('already_queued_or_invalid');
        });

        test('should return queued_processing_disabled if queue processing toggle is off', () => {
            FabState.setFabQueueProcessingEnabled(false);
            const url = 'https://www.fab.com/listings/99999999-1111-2222-3333-444455556666';
            const res = addUrlToQueueAndProcess(url);
            expect(res.status).toBe('queued_processing_disabled');
        });

        test('should return suspended if auto processing is suspended', () => {
            FabState.setSuspended(true);
            const url = 'https://www.fab.com/listings/88888888-1111-2222-3333-444455556666';
            const res = addUrlToQueueAndProcess(url);
            expect(res.status).toBe('suspended');
        });
    });
});
