import { jest } from '@jest/globals';

global.chrome = {
    downloads: {
        download: jest.fn()
    },
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    },
    contextMenus: {
        remove: jest.fn((id, cb) => cb && cb()),
        create: jest.fn((props, cb) => cb && cb()),
        onClicked: { addListener: jest.fn() }
    },
    cookies: {
        get: jest.fn()
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

const { handleMessage } = await import('../../x_extension/xBackground.js');

describe('xBackground', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('X_START_DOWNLOAD should initiate direct MP4 download via chrome.downloads', () => {
        global.chrome.downloads.download.mockImplementation((opts, cb) => cb(1234));
        const sendResponse = jest.fn();

        const handled = handleMessage({
            action: 'X_START_DOWNLOAD',
            payload: {
                url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x720/abc.mp4',
                filename: 'X_Video_123.mp4',
                isM3U8: false
            }
        }, {}, sendResponse);

        expect(handled).toBe(true);
        expect(global.chrome.downloads.download).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x720/abc.mp4',
                filename: 'X_Video_123.mp4',
                saveAs: false
            }),
            expect.any(Function)
        );
        expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 1234 });
    });

    test('X_GET_LOCATION_STATS should return stats object', () => {
        const sendResponse = jest.fn();
        const handled = handleMessage({ action: 'X_GET_LOCATION_STATS' }, {}, sendResponse);

        expect(handled).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            stats: expect.any(Object)
        }));
    });

    test('X_CLEAR_LOCATION_CACHE should clear cache and respond with success', async () => {
        global.chrome.storage.local.remove.mockResolvedValue();
        const sendResponse = jest.fn();
        const handled = handleMessage({ action: 'X_CLEAR_LOCATION_CACHE' }, {}, sendResponse);

        expect(handled).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('X_CAPTURE_HEADERS should set headers in apiClient', () => {
        global.chrome.storage.local.set.mockResolvedValue();
        const sendResponse = jest.fn();
        const handled = handleMessage({
            action: 'X_CAPTURE_HEADERS',
            payload: {
                headers: {
                    'authorization': 'Bearer TOKEN123',
                    'x-csrf-token': 'CSRF123'
                }
            }
        }, {}, sendResponse);

        expect(handled).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('should return false for unrecognized action', () => {
        const sendResponse = jest.fn();
        const handled = handleMessage({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);
        expect(handled).toBe(false);
    });

    test('X_FRIENDS_GET_STATE and X_MARK_TWEETS_SEEN should route to friendsSync', async () => {
        global.chrome.storage.local.get.mockResolvedValue({});
        global.chrome.storage.local.set.mockResolvedValue();

        const sendResponseState = jest.fn();
        const handledState = handleMessage({ action: 'X_FRIENDS_GET_STATE' }, {}, sendResponseState);
        expect(handledState).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(sendResponseState).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            state: expect.objectContaining({
                friends: expect.any(Array)
            })
        }));

        const sendResponseSeen = jest.fn();
        const handledSeen = handleMessage({
            action: 'X_MARK_TWEETS_SEEN',
            payload: { tweetIds: ['1234567890123'] }
        }, {}, sendResponseSeen);
        expect(handledSeen).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(sendResponseSeen).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            added: 1
        }));
    });
});
