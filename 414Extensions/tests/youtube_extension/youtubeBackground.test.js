import { jest } from '@jest/globals';

global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { handleMessage } from '../../youtube_extension/youtubeBackground.js';
import * as YouTubeState from '../../youtube_extension/background_modules/youtubeState.js';
import * as AppState from '../../shared_modules/appState.js';

describe('youtubeBackground', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        AppState.setGlobalMasterSwitchEnabled(true);
        AppState.setYouTubeModuleEnabled(true);
        AppState.setYouTubeModuleVisible(true);
        YouTubeState.setYouTubeNoSuggestionsEnabled(false);
    });

    test('getYouTubeModuleStatus should report isPaused false when fully enabled', () => {
        const sendResponse = jest.fn();
        const handled = handleMessage({ action: 'getYouTubeModuleStatus' }, {}, sendResponse);

        expect(handled).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({ isPaused: false });
    });

    test('getYouTubeModuleStatus should report isPaused true when master switch is off', () => {
        AppState.setGlobalMasterSwitchEnabled(false);
        const sendResponse = jest.fn();
        handleMessage({ action: 'getYouTubeModuleStatus' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ isPaused: true });
    });

    test('getYouTubeGlobalStats should return EXTENSION_DISABLED when master switch is off', () => {
        AppState.setGlobalMasterSwitchEnabled(false);
        const sendResponse = jest.fn();
        handleMessage({ action: 'getYouTubeGlobalStats' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            operationalStatus: 'EXTENSION_DISABLED'
        }));
    });

    test('getYouTubeGlobalStats should return OK_IDLE when module is active', () => {
        const sendResponse = jest.fn();
        handleMessage({ action: 'getYouTubeGlobalStats' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            operationalStatus: 'OK_IDLE'
        }));
    });

    test('setYouTubeNoSuggestionsEnabled should update and persist state', () => {
        global.chrome.storage.local.set.mockImplementation((_, cb) => cb && cb());
        const sendResponse = jest.fn();
        const handled = handleMessage({ action: 'setYouTubeNoSuggestionsEnabled', enabled: true }, {}, sendResponse);

        expect(handled).toBe(true);
        expect(YouTubeState.youTubeNoSuggestionsEnabled).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
});
