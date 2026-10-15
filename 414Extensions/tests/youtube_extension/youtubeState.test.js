import { jest } from '@jest/globals';

// Setup storage mock
let storageData = {};
global.chrome = {
    runtime: {
        lastError: null
    },
    storage: {
        local: {
            get: jest.fn((keys, cb) => {
                let result = {};
                if (Array.isArray(keys)) {
                    keys.forEach(k => { if (storageData[k] !== undefined) result[k] = storageData[k]; });
                } else if (typeof keys === 'object' && keys !== null) {
                    Object.keys(keys).forEach(k => {
                        result[k] = storageData[k] !== undefined ? storageData[k] : keys[k];
                    });
                } else if (typeof keys === 'string') {
                    if (storageData[keys] !== undefined) result[keys] = storageData[keys];
                }
                if (cb) cb(result);
                return Promise.resolve(result);
            }),
            set: jest.fn((items, cb) => {
                Object.assign(storageData, items);
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

import * as YouTubeState from '../../youtube_extension/background_modules/youtubeState.js';

describe('youtubeState', () => {
    beforeEach(() => {
        storageData = {};
        jest.clearAllMocks();
        YouTubeState.setYouTubeNoSuggestionsEnabled(false);
    });

    test('should set and get youTubeNoSuggestionsEnabled', () => {
        expect(YouTubeState.youTubeNoSuggestionsEnabled).toBe(false);
        YouTubeState.setYouTubeNoSuggestionsEnabled(true);
        expect(YouTubeState.youTubeNoSuggestionsEnabled).toBe(true);
        YouTubeState.setYouTubeNoSuggestionsEnabled(false);
        expect(YouTubeState.youTubeNoSuggestionsEnabled).toBe(false);
    });

    test('saveYouTubeState should persist state to storage', async () => {
        YouTubeState.setYouTubeNoSuggestionsEnabled(true);
        await YouTubeState.saveYouTubeState();

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            isYouTubeNoSuggestionsEnabled: true
        }, expect.any(Function));
        expect(storageData.isYouTubeNoSuggestionsEnabled).toBe(true);
    });

    test('loadYouTubeState should retrieve saved state from storage', async () => {
        storageData = { isYouTubeNoSuggestionsEnabled: true };

        await YouTubeState.loadYouTubeState();
        expect(YouTubeState.youTubeNoSuggestionsEnabled).toBe(true);
    });

    test('loadYouTubeState should default to false if storage is empty', async () => {
        storageData = {};

        await YouTubeState.loadYouTubeState();
        expect(YouTubeState.youTubeNoSuggestionsEnabled).toBe(false);
    });
});
