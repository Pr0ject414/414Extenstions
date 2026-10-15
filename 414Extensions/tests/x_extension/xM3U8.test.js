import { jest } from '@jest/globals';

global.fetch = jest.fn();

global.chrome = {
    downloads: {
        download: jest.fn((options, cb) => cb && cb(12345))
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
            }),
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

describe('xBackground M3U8 Downloader Pipeline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should parse master playlist, pick highest bandwidth variant, and download', async () => {
        const masterPlaylist = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
variant_low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
variant_high.m3u8
        `;

        const mediaPlaylist = `
#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4.000,
seg1.m4s
#EXTINF:4.000,
seg2.m4s
        `;

        const mockInitBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
        const mockSeg1Buffer = new Uint8Array([5, 6, 7]).buffer;
        const mockSeg2Buffer = new Uint8Array([8, 9, 10]).buffer;

        global.fetch.mockImplementation((url) => {
            if (url.endsWith('master.m3u8')) {
                return Promise.resolve({
                    ok: true,
                    text: async () => masterPlaylist
                });
            }
            if (url.endsWith('variant_high.m3u8')) {
                return Promise.resolve({
                    ok: true,
                    text: async () => mediaPlaylist
                });
            }
            if (url.endsWith('init.mp4')) {
                return Promise.resolve({
                    ok: true,
                    arrayBuffer: async () => mockInitBuffer
                });
            }
            if (url.endsWith('seg1.m4s')) {
                return Promise.resolve({
                    ok: true,
                    arrayBuffer: async () => mockSeg1Buffer
                });
            }
            if (url.endsWith('seg2.m4s')) {
                return Promise.resolve({
                    ok: true,
                    arrayBuffer: async () => mockSeg2Buffer
                });
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const sendResponse = jest.fn();
        handleMessage({
            action: 'X_START_DOWNLOAD',
            payload: {
                url: 'https://video.twimg.com/ext_tw_video/123/pu/pl/master.m3u8',
                filename: 'twitter_video_hd.mp4',
                isM3U8: true
            }
        }, {}, sendResponse);

        // Wait for async pipeline
        await new Promise(r => setTimeout(r, 100));

        expect(chrome.downloads.download).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: 'twitter_video_hd.mp4',
                saveAs: false,
                url: expect.stringMatching(/^data:video\/mp4;base64,/)
            }),
            expect.any(Function)
        );
        expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 12345 });
    });

    test('should parse legacy TS segments media playlist', async () => {
        const tsPlaylist = `
#EXTM3U
#EXTINF:3.0,
segment_0.ts
#EXTINF:3.0,
segment_1.ts
        `;

        const mockSegBuffer = new Uint8Array([11, 12, 13]).buffer;

        global.fetch.mockImplementation((url) => {
            if (url.endsWith('.m3u8')) {
                return Promise.resolve({
                    ok: true,
                    text: async () => tsPlaylist
                });
            }
            return Promise.resolve({
                ok: true,
                arrayBuffer: async () => mockSegBuffer
            });
        });

        const sendResponse = jest.fn();
        handleMessage({
            action: 'X_START_DOWNLOAD',
            payload: {
                url: 'https://video.twimg.com/ts_video.m3u8',
                filename: 'legacy_ts.mp4',
                isM3U8: true
            }
        }, {}, sendResponse);

        await new Promise(r => setTimeout(r, 100));

        expect(chrome.downloads.download).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: 'legacy_ts.mp4',
                url: expect.stringMatching(/^data:video\/mp4;base64,/)
            }),
            expect.any(Function)
        );
        expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 12345 });
    });

    test('should respond with error if manifest fetch fails', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found'
        });

        const sendResponse = jest.fn();
        handleMessage({
            action: 'X_START_DOWNLOAD',
            payload: {
                url: 'https://video.twimg.com/missing.m3u8',
                filename: 'missing.mp4',
                isM3U8: true
            }
        }, {}, sendResponse);

        await new Promise(r => setTimeout(r, 50));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error: expect.stringContaining('Failed to fetch manifest')
        }));
    });
});
