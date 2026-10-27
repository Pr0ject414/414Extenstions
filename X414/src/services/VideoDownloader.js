// D:\Dev\X414\src\services\VideoDownloader.js
// Native MP4 & HLS (.m3u8 fMP4) Video Downloader for Google Pixel (Movies/X414 Gallery Album + Quick Share)

function uint8ArrayToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const sub = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
}

export function resolveRelativeUrl(rel, base) {
    try {
        return new URL(rel, base).href;
    } catch (e) {
        return rel;
    }
}

export function parseMasterM3U8BestVariant(masterText, masterUrl) {
    if (!masterText || !masterText.includes('#EXT-X-STREAM-INF')) {
        return masterUrl;
    }
    const lines = masterText.split(/\r?\n/);
    let bestUrl = null;
    let maxBandwidth = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            const bwMatch = line.match(/BANDWIDTH=(\d+)/);
            const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
            let j = i + 1;
            while (j < lines.length && (lines[j].trim().startsWith('#') || lines[j].trim() === '')) {
                j++;
            }
            if (j < lines.length && bw > maxBandwidth) {
                maxBandwidth = bw;
                bestUrl = lines[j].trim();
            }
        }
    }

    return bestUrl ? resolveRelativeUrl(bestUrl, masterUrl) : masterUrl;
}

export function parseMediaM3U8Segments(mediaText, mediaUrl) {
    const lines = (mediaText || '').split(/\r?\n/);
    const segmentUrls = [];
    let mapUri = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXT-X-MAP:')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match && match[1]) {
                mapUri = resolveRelativeUrl(match[1], mediaUrl);
            }
        } else if (!line.startsWith('#')) {
            segmentUrls.push(resolveRelativeUrl(line, mediaUrl));
        }
    }

    const ordered = [];
    if (mapUri) ordered.push(mapUri);
    ordered.push(...segmentUrls);
    return ordered;
}

export function concatUint8Arrays(arrays) {
    const totalLength = arrays.reduce((acc, arr) => acc + arr.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        combined.set(arr, offset);
        offset += arr.byteLength;
    }
    return combined;
}

export class VideoDownloader {
    constructor(options = {}) {
        this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        this.fileSystem = options.fileSystem || null;
        this.mediaLibrary = options.mediaLibrary || null;
        this.sharing = options.sharing || null;
        this.albumName = options.albumName || 'X414';
    }

    getFileSystem() {
        if (this.fileSystem) return this.fileSystem;
        try {
            // eslint-disable-next-line global-require
            return require('expo-file-system');
        } catch (e) {
            return null;
        }
    }

    getMediaLibrary() {
        if (this.mediaLibrary) return this.mediaLibrary;
        try {
            // eslint-disable-next-line global-require
            return require('expo-media-library');
        } catch (e) {
            return null;
        }
    }

    getSharing() {
        if (this.sharing) return this.sharing;
        try {
            // eslint-disable-next-line global-require
            return require('expo-sharing');
        } catch (e) {
            return null;
        }
    }

    sanitizeFilename(rawName) {
        const base = String(rawName || `x_video_${Date.now()}.mp4`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
        return base.endsWith('.mp4') ? base : `${base}.mp4`;
    }

    async downloadAndStitchM3U8(masterUrl) {
        if (!this.fetchFn) {
            throw new Error('Fetch implementation unavailable for M3U8 download.');
        }

        const masterResp = await this.fetchFn(masterUrl);
        if (!masterResp || !masterResp.ok) {
            throw new Error(`Failed to fetch M3U8 playlist (${masterResp?.status || 'network error'})`);
        }
        const masterText = await masterResp.text();

        let mediaUrl = masterUrl;
        let mediaText = masterText;

        if (masterText.includes('#EXT-X-STREAM-INF')) {
            mediaUrl = parseMasterM3U8BestVariant(masterText, masterUrl);
            const mediaResp = await this.fetchFn(mediaUrl);
            if (!mediaResp || !mediaResp.ok) {
                throw new Error(`Failed to fetch M3U8 variant stream (${mediaResp?.status || 'network error'})`);
            }
            mediaText = await mediaResp.text();
        }

        const downloadUrls = parseMediaM3U8Segments(mediaText, mediaUrl);
        if (downloadUrls.length === 0) {
            throw new Error('No video segments found in M3U8 playlist.');
        }

        const buffers = [];
        for (const segUrl of downloadUrls) {
            const segResp = await this.fetchFn(segUrl);
            if (!segResp || !segResp.ok) {
                throw new Error(`Segment download failed (${segResp?.status || 'network error'})`);
            }
            const ab = await segResp.arrayBuffer();
            buffers.push(new Uint8Array(ab));
        }

        return concatUint8Arrays(buffers);
    }

    async saveFileToGallery(localFileUri) {
        const MediaLibrary = this.getMediaLibrary();
        if (!MediaLibrary) {
            return { savedToGallery: false, assetId: null, albumName: this.albumName };
        }

        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm || !perm.granted) {
            throw new Error('Media Library permission is required to save videos to your Pixel Gallery.');
        }

        const asset = await MediaLibrary.createAssetAsync(localFileUri);
        if (asset) {
            try {
                const existingAlbum = await MediaLibrary.getAlbumAsync(this.albumName);
                if (existingAlbum) {
                    await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
                } else {
                    await MediaLibrary.createAlbumAsync(this.albumName, asset, false);
                }
            } catch (albumErr) {
                // On some Android Scoped Storage versions createAssetAsync already places video in Movies
            }
        }

        return {
            savedToGallery: true,
            assetId: asset?.id || null,
            uri: asset?.uri || localFileUri,
            albumName: this.albumName
        };
    }

    async downloadVideo({ url, filename, isM3U8 = false }) {
        if (!url) {
            throw new Error('Missing video URL.');
        }

        const cleanFilename = this.sanitizeFilename(filename);
        const FileSystem = this.getFileSystem();
        const cacheDir = FileSystem?.cacheDirectory || 'file:///cache/';
        const targetUri = `${cacheDir}${cleanFilename}`;

        const isHls = Boolean(isM3U8 || url.includes('.m3u8'));

        if (isHls) {
            const combinedBytes = await this.downloadAndStitchM3U8(url);
            if (FileSystem && typeof FileSystem.writeAsStringAsync === 'function') {
                const b64 = uint8ArrayToBase64(combinedBytes);
                await FileSystem.writeAsStringAsync(targetUri, b64, {
                    encoding: FileSystem.EncodingType?.Base64 || 'base64'
                });
            }
            const galleryRes = await this.saveFileToGallery(targetUri);
            return {
                success: true,
                isM3U8: true,
                filename: cleanFilename,
                fileUri: targetUri,
                byteLength: combinedBytes.byteLength,
                ...galleryRes
            };
        }

        // Direct MP4 download
        if (FileSystem && typeof FileSystem.downloadAsync === 'function') {
            const dlRes = await FileSystem.downloadAsync(url, targetUri);
            if (dlRes && dlRes.status && dlRes.status >= 400) {
                throw new Error(`Direct MP4 download failed with status ${dlRes.status}`);
            }
            const finalUri = dlRes?.uri || targetUri;
            const galleryRes = await this.saveFileToGallery(finalUri);
            return {
                success: true,
                isM3U8: false,
                filename: cleanFilename,
                fileUri: finalUri,
                ...galleryRes
            };
        }

        // Fallback via fetchFn if FileSystem.downloadAsync is not provided
        if (this.fetchFn) {
            const resp = await this.fetchFn(url);
            if (!resp || !resp.ok) {
                throw new Error(`Direct MP4 download failed (${resp?.status || 'network error'})`);
            }
            const ab = await resp.arrayBuffer();
            const bytes = new Uint8Array(ab);
            if (FileSystem && typeof FileSystem.writeAsStringAsync === 'function') {
                await FileSystem.writeAsStringAsync(targetUri, uint8ArrayToBase64(bytes), {
                    encoding: FileSystem.EncodingType?.Base64 || 'base64'
                });
            }
            const galleryRes = await this.saveFileToGallery(targetUri);
            return {
                success: true,
                isM3U8: false,
                filename: cleanFilename,
                fileUri: targetUri,
                byteLength: bytes.byteLength,
                ...galleryRes
            };
        }

        throw new Error('No download backend available.');
    }

    async shareVideo(fileUri) {
        if (!fileUri) return false;
        const Sharing = this.getSharing();
        if (!Sharing || typeof Sharing.isAvailableAsync !== 'function') {
            return false;
        }
        const available = await Sharing.isAvailableAsync();
        if (!available) return false;
        await Sharing.shareAsync(fileUri, {
            mimeType: 'video/mp4',
            dialogTitle: 'Share X Video'
        });
        return true;
    }
}
