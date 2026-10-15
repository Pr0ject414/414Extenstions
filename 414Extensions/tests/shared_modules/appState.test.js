import { jest } from '@jest/globals';

// Mock chrome API before importing appState
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

// Mock console to keep test output clean
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn()
};

import * as AppState from '../../shared_modules/appState.js';
const { isRateLimited, setRateLimitCoolDown, rateLimitCoolDownUntil } = AppState;

describe('appState - Rate Limiting', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        // Reset the rateLimitCoolDownUntil variable if possible,
        // but since it's an exported let, we might need a way to reset it.
        // For now, we'll rely on the order of tests or set it explicitly.
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('isRateLimited should return false by default', () => {
        expect(isRateLimited()).toBe(false);
    });

    test('setRateLimitCoolDown should update cooldown and return true for future timestamp', () => {
        const futureTime = Date.now() + 10000;
        const result = setRateLimitCoolDown(futureTime);

        expect(result).toBe(true);
        expect(isRateLimited()).toBe(true);
    });

    test('isRateLimited should return false when current time is exactly cooldown time', () => {
        const now = Date.now();
        const futureTime = now + 10000;
        setRateLimitCoolDown(futureTime);

        jest.advanceTimersByTime(10000);
        // At exactly futureTime, isRateLimited (now < cooldown) should be false
        expect(isRateLimited()).toBe(false);
    });

    test('isRateLimited should return false after cooldown time', () => {
        const now = Date.now();
        const futureTime = now + 10000;
        setRateLimitCoolDown(futureTime);

        jest.advanceTimersByTime(11000);
        expect(isRateLimited()).toBe(false);
    });

    test('setRateLimitCoolDown should return false for past timestamp', () => {
        const pastTime = Date.now() - 10000;
        const result = setRateLimitCoolDown(pastTime);

        expect(result).toBe(false);
    });

    test('setRateLimitCoolDown should return false for timestamp not greater than current cooldown', () => {
        const now = Date.now();
        const futureTime = now + 10000;
        setRateLimitCoolDown(futureTime);

        const smallerFutureTime = now + 5000;
        const result = setRateLimitCoolDown(smallerFutureTime);

        expect(result).toBe(false);
    });
});

describe('appState - Module States & Master Switch', () => {
    test('module toggles should update in-memory state', () => {
        AppState.setGlobalMasterSwitchEnabled(false);
        expect(AppState.globalMasterSwitchEnabled).toBe(false);
        AppState.setGlobalMasterSwitchEnabled(true);
        expect(AppState.globalMasterSwitchEnabled).toBe(true);

        AppState.setXModuleEnabled(false);
        expect(AppState.xModuleEnabled).toBe(false);
        AppState.setXModuleEnabled(true);
        expect(AppState.xModuleEnabled).toBe(true);

        AppState.setCrunchyrollModuleEnabled(false);
        expect(AppState.crunchyrollModuleEnabled).toBe(false);
        AppState.setCrunchyrollModuleEnabled(true);
        expect(AppState.crunchyrollModuleEnabled).toBe(true);

        AppState.setVolumeModuleEnabled(false);
        expect(AppState.volumeModuleEnabled).toBe(false);
        AppState.setVolumeModuleEnabled(true);
        expect(AppState.volumeModuleEnabled).toBe(true);

        AppState.setVscModuleEnabled(false);
        expect(AppState.vscModuleEnabled).toBe(false);
        AppState.setVscModuleEnabled(true);
        expect(AppState.vscModuleEnabled).toBe(true);

        AppState.setFabModuleEnabled(false);
        expect(AppState.fabModuleEnabled).toBe(false);
        AppState.setFabModuleEnabled(true);
        expect(AppState.fabModuleEnabled).toBe(true);

        AppState.setYouTubeModuleEnabled(false);
        expect(AppState.youTubeModuleEnabled).toBe(false);
        AppState.setYouTubeModuleEnabled(true);
        expect(AppState.youTubeModuleEnabled).toBe(true);
    });

    test('saveGlobalState should write all 6 module keys to storage', async () => {
        global.chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());
        await AppState.saveGlobalState();
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({
                isGlobalMasterSwitchEnabled: true,
                isFabModuleEnabled: true,
                isYouTubeModuleEnabled: true,
                isXModuleEnabled: true,
                isCrunchyrollModuleEnabled: true,
                isVolumeModuleEnabled: true,
                vsc_is_enabled: true
            }),
            expect.any(Function)
        );
    });
});
