// D:\Dev\X414\tests\videoDownloader.test.js
import { jest } from '@jest/globals';
import {
    VideoDownloader,
    parseMasterM3U8BestVariant,
    parseMediaM3U8Segments
} from '../src/services/VideoDownloader.js';

describe('VideoDownloader (Direct MP4 & HLS .m3u8 fMP4 Stitching)', () => {
    test('parseMasterM3U8BestVariant should select the highest BANDWIDTH stream', () => {
        const masterPlaylist = `
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=432000,RESOLUTION=320x180
/ext_tw_video/123/pu/pl/320x180/low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2176000,RESOLUTION=1280x720
/ext_tw_video/123/pu/pl/1280x720/high.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=832000,RESOLUTION=640x360
/ext_tw_video/123/pu/pl/640x360/med.m3u8
        `.trim();

        const bestUrl = parseMasterM3U8BestVariant(
            masterPlaylist,
            'https://video.twimg.com/ext_tw_video/123/pu/pl/master.m3u8'
        );
        expect(bestUrl).toBe('https://video.twimg.com/ext_tw_video/123/pu/pl/1280x720/high.m3u8');
    });

    test('parseMediaM3U8Segments should place #EXT-X-MAP init segment first followed by all media segments', () => {
        const mediaPlaylist = `
#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-MAP:URI="/ext_tw_video/123/pu/vid/init.mp4"
#EXTINF:3.000,
seg1.m4s
#EXTINF:3.000,
seg2.m4s
#EXT-X-ENDLIST
        `.trim();

        const urls = parseMediaM3U8Segments(
            mediaPlaylist,
            'https://video.twimg.com/ext_tw_video/123/pu/pl/1280x720/high.m3u8'
        );
        expect(urls).toEqual([
            'https://video.twimg.com/ext_tw_video/123/pu/vid/init.mp4',
            'https://video.twimg.com/ext_tw_video/123/pu/pl/1280x720/seg1.m4s',
            'https://video.twimg.com/ext_tw_video/123/pu/pl/1280x720/seg2.m4s'
        ]);
    });

    test('downloadVideo should stitch HLS .m3u8 segments and save to Pixel Gallery Movies/X414 album', async () => {
        const writtenFiles = new Map();
        const mockFileSystem = {
            cacheDirectory: 'file:///cache/',
            EncodingType: { Base64: 'base64' },
            writeAsStringAsync: jest.fn(async (uri, b64) => {
                writtenFiles.set(uri, Buffer.from(b64, 'base64'));
            }),
            downloadAsync: jest.fn(async (url, uri) => ({ uri, status: 200 }))
        };

        const mockMediaLibrary = {
            requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
            createAssetAsync: jest.fn(async (uri) => ({ id: 'asset_99', uri })),
            getAlbumAsync: jest.fn(async () => null),
            createAlbumAsync: jest.fn(async () => ({ id: 'album_x414', title: 'X414' })),
            addAssetsToAlbumAsync: jest.fn(async () => true)
        };

        const mockSharing = {
            isAvailableAsync: jest.fn(async () => true),
            shareAsync: jest.fn(async () => true)
        };

        const mockFetch = jest.fn(async (url) => {
            if (url.endsWith('master.m3u8')) {
                return {
                    ok: true,
                    text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh.m3u8'
                };
            }
            if (url.endsWith('high.m3u8')) {
                return {
                    ok: true,
                    text: async () => '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\nseg1.m4s\n#EXTINF:2.0,\nseg2.m4s'
                };
            }
            if (url.endsWith('init.mp4')) {
                return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
            }
            if (url.endsWith('seg1.m4s')) {
                return { ok: true, arrayBuffer: async () => new Uint8Array([4, 5]).buffer };
            }
            if (url.endsWith('seg2.m4s')) {
                return { ok: true, arrayBuffer: async () => new Uint8Array([6, 7, 8]).buffer };
            }
            return { ok: false, status: 404 };
        });

        const downloader = new VideoDownloader({
            fetchFn: mockFetch,
            fileSystem: mockFileSystem,
            mediaLibrary: mockMediaLibrary,
            sharing: mockSharing
        });

        const res = await downloader.downloadVideo({
            url: 'https://video.twimg.com/ext_tw_video/1/master.m3u8',
            filename: 'clip_test.mp4',
            isM3U8: true
        });

        expect(res.success).toBe(true);
        expect(res.isM3U8).toBe(true);
        expect(res.byteLength).toBe(8);
        expect(res.albumName).toBe('X414');
        expect(res.savedToGallery).toBe(true);

        const savedBuffer = writtenFiles.get('file:///cache/clip_test.mp4');
        expect(Array.from(savedBuffer)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(mockMediaLibrary.createAlbumAsync).toHaveBeenCalledWith('X414', expect.objectContaining({ id: 'asset_99' }), false);

        // Quick Share action
        const shared = await downloader.shareVideo(res.fileUri);
        expect(shared).toBe(true);
        expect(mockSharing.shareAsync).toHaveBeenCalledWith('file:///cache/clip_test.mp4', expect.objectContaining({
            mimeType: 'video/mp4'
        }));
    });

    test('downloadVideo should download direct MP4 and throw descriptive error if MediaLibrary permission is denied', async () => {
        const mockFileSystem = {
            cacheDirectory: 'file:///cache/',
            downloadAsync: jest.fn(async (url, uri) => ({ uri, status: 200 }))
        };
        const mockMediaLibraryDenied = {
            requestPermissionsAsync: jest.fn(async () => ({ granted: false }))
        };

        const downloader = new VideoDownloader({
            fileSystem: mockFileSystem,
            mediaLibrary: mockMediaLibraryDenied
        });

        await expect(
            downloader.downloadVideo({
                url: 'https://video.twimg.com/direct.mp4',
                filename: 'direct.mp4',
                isM3U8: false
            })
        ).rejects.toThrow(/Media Library permission/i);
    });
});
