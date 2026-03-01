import { jest } from '@jest/globals';

// Mock chrome API before everything else
global.chrome = {
    alarms: {
        create: jest.fn()
    },
    webRequest: {
        onHeadersReceived: {
            addListener: jest.fn(),
            removeListener: jest.fn()
        }
    },
    runtime: {
        lastError: null
    },
    tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
        remove: jest.fn()
    }
};

// Mock modules
jest.unstable_mockModule('./background_modules/fabConstants.js', () => ({
    FAB_RATE_LIMIT_EXPIRY_ALARM_NAME: 'fabRateLimitExpiryAlarm',
    FAB_VERIFICATION_ALARM_NAME: 'fabVerificationAlarm',
    FAB_VERIFICATION_RESUME_ALARM_NAME_SUFFIX: '_resumeVerification',
    FAB_QUEUE_PROCESS_RETRY_ALARM_NAME: 'fabQueueProcessRetryAlarm'
}));

jest.unstable_mockModule('./background_modules/fabState.js', () => ({
    loadFabState: jest.fn(),
    saveFabState: jest.fn(),
    getFabUrlQueueSize: jest.fn(),
    isUrlPendingOrQueued: jest.fn(),
    addUrlToPending: jest.fn(),
    removeUrlFromPending: jest.fn(),
    resetActiveTabs: jest.fn(),
    decrementActiveTabs: jest.fn(),
    setFabQueueProcessingEnabled: jest.fn(),
    fabQueueProcessingEnabled: true,
    activeFabProcessingTabs: 0,
    autoProcessingSuspended: false
}));

jest.unstable_mockModule('./background_modules/fabQueueManager.js', () => ({
    processFabTabQueue: jest.fn(),
    addUrlToQueueAndProcess: jest.fn()
}));

jest.unstable_mockModule('./background_modules/fabVerification.js', () => ({
    setupVerificationAlarm: jest.fn(),
    handleVerificationAlarm: jest.fn(),
    markItemForVerificationOnTabClose: jest.fn()
}));

jest.unstable_mockModule('../../shared_modules/appState.js', () => ({
    globalMasterSwitchEnabled: true,
    fabModuleEnabled: true,
    fabModuleVisible: true,
    globalMaxDelayMs: 300000,
    setRateLimitCoolDown: jest.fn(),
    saveGlobalState: jest.fn(),
    isRateLimited: jest.fn(),
    rateLimitCoolDownUntil: 0
}));

const { handle429 } = await import('./fabBackground.js');
const AppState = await import('../../shared_modules/appState.js');
const FabConstants = await import('./background_modules/fabConstants.js');

describe('fabBackground - handle429', () => {
    const MOCK_NOW = 1700000000000;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(MOCK_NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should set default cooldown when no retry headers are present', () => {
        const details = {
            statusCode: 429,
            responseHeaders: []
        };

        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        const expectedCoolDown = MOCK_NOW + AppState.globalMaxDelayMs;
        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(expectedCoolDown);
        expect(AppState.saveGlobalState).toHaveBeenCalled();
        expect(chrome.alarms.create).toHaveBeenCalledWith(
            FabConstants.FAB_RATE_LIMIT_EXPIRY_ALARM_NAME,
            { when: expectedCoolDown }
        );
    });

    it('should parse Retry-After header in seconds', () => {
        const details = {
            statusCode: 429,
            responseHeaders: [
                { name: 'Retry-After', value: '60' }
            ]
        };
        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        const expectedCoolDown = MOCK_NOW + 60000;
        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(expectedCoolDown);
    });

    it('should parse Retry-After header as a date string', () => {
        const futureDate = new Date(MOCK_NOW + 120000).toUTCString();
        const details = {
            statusCode: 429,
            responseHeaders: [
                { name: 'Retry-After', value: futureDate }
            ]
        };
        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(Date.parse(futureDate));
    });

    it('should parse X-RateLimit-Reset header if Retry-After is missing', () => {
        const details = {
            statusCode: 429,
            responseHeaders: [
                { name: 'X-RateLimit-Reset', value: '30' }
            ]
        };
        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(MOCK_NOW + 30000);
    });

    it('should prioritize Retry-After over X-RateLimit-Reset', () => {
        const details = {
            statusCode: 429,
            responseHeaders: [
                { name: 'Retry-After', value: '60' },
                { name: 'X-RateLimit-Reset', value: '30' }
            ]
        };
        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(MOCK_NOW + 60000);
    });

    it('should handle case-insensitive header names', () => {
        const details = {
            statusCode: 429,
            responseHeaders: [
                { name: 'retry-after', value: '45' }
            ]
        };
        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(MOCK_NOW + 45000);
    });

    it('should do nothing if status code is not 429', () => {
        const details = { statusCode: 200 };
        handle429(details);
        expect(AppState.setRateLimitCoolDown).not.toHaveBeenCalled();
    });

    it('should not create alarm if setRateLimitCoolDown returns false', () => {
        const details = { statusCode: 429 };
        AppState.setRateLimitCoolDown.mockReturnValue(false);
        handle429(details);
        expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    it('should use default cooldown if Retry-After header is invalid date', () => {
        const details = {
            statusCode: 429,
            responseHeaders: [
                { name: 'Retry-After', value: 'invalid-date' }
            ]
        };
        AppState.setRateLimitCoolDown.mockReturnValue(true);

        handle429(details);

        expect(AppState.setRateLimitCoolDown).toHaveBeenCalledWith(MOCK_NOW + AppState.globalMaxDelayMs);
    });
});
