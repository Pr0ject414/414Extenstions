import { jest } from '@jest/globals';

global.chrome = {
    tabs: {
        get: jest.fn(),
        sendMessage: jest.fn(),
        query: jest.fn(),
        onActivated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() }
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn()
        }
    },
    action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { VolumeBackground } from '../../volume_controller/volumeBackground.js';

describe('volumeBackground', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle updateVolume message and update badge and tab', async () => {
        global.chrome.tabs.get.mockResolvedValue({ id: 10, url: 'https://youtube.com/watch?v=123' });
        global.chrome.storage.local.set.mockResolvedValue();
        global.chrome.storage.local.get.mockResolvedValue({ volume_setting_youtube_com: 2.0 });

        const sendResponse = jest.fn();
        const handled = VolumeBackground.handleMessage(
            { action: 'updateVolume', tabId: 10, volume: 2.0 },
            {},
            sendResponse
        );

        expect(handled).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
        expect(global.chrome.tabs.sendMessage).toHaveBeenCalledWith(10, { action: 'setVolume', volume: 2.0 });
    });

    test('should handle getStoredVolume message for sender tab', async () => {
        global.chrome.tabs.get.mockResolvedValue({ id: 25, url: 'https://twitch.tv/streamer' });
        global.chrome.storage.local.get.mockResolvedValue({ 'volume_setting_twitch.tv': 1.5 });

        const sendResponse = jest.fn();
        const handled = VolumeBackground.handleMessage(
            { action: 'getStoredVolume' },
            { tab: { id: 25 } },
            sendResponse
        );

        expect(handled).toBe(true); // async response
        await new Promise(r => setTimeout(r, 20));

        expect(sendResponse).toHaveBeenCalledWith({ volume: 1.5 });
    });

    test('should return false for unrecognized actions', () => {
        const sendResponse = jest.fn();
        const handled = VolumeBackground.handleMessage({ action: 'nonExistentAction' }, {}, sendResponse);
        expect(handled).toBe(false);
    });
});
