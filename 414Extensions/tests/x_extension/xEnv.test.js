import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('xEnv.js', () => {
    let originalMutedDescriptor;
    let originalVolumeDescriptor;
    let originalSetAttribute;
    let XEnv;

    beforeAll(() => {
        // We need to capture the descriptors BEFORE they are hijacked by the script
        originalMutedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
        originalVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
        originalSetAttribute = Element.prototype.setAttribute;

        const scriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xEnv.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Mock chrome
        global.chrome = {
            runtime: {
                onMessage: { addListener: jest.fn() }
            }
        };

        // Use eval instead of script injection
        eval(scriptContent);

        XEnv = window.XEnv;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should not hijack Element.prototype.setAttribute (avoids CSP attribution errors)', () => {
        expect(Element.prototype.setAttribute).toBe(originalSetAttribute);
    });

    it('should hijack HTMLMediaElement.prototype.muted', () => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
        expect(descriptor.set).not.toBe(originalMutedDescriptor.set);
    });

    it('should block unmuting by default (Always Mute behavior)', () => {
        const video = document.createElement('video');
        // Ensure it's muted initially
        originalMutedDescriptor.set.call(video, true);
        
        // Try to unmute via hijacked property
        video.muted = false;
        
        // Real state should still be muted
        expect(originalMutedDescriptor.get.call(video)).toBe(true);
        // Shadow state should show false (site thinks it unmuted)
        expect(video.muted).toBe(false);
    });

    it('should enforce the stored volume level', () => {
        const video = document.createElement('video');
        // Current volume default in script is 1.0
        video.volume = 0.5;
        
        // Should be forced back to 1.0
        expect(originalVolumeDescriptor.get.call(video)).toBe(1.0);
    });

    it('should inject download button into the tweet action bar to the left of the bookmark button', () => {
        const article = document.createElement('article');
        article.setAttribute('data-testid', 'tweet');
        article.setAttribute('data-tweet-id', '2113383149011140730');

        const player = document.createElement('div');
        player.setAttribute('data-testid', 'videoPlayer');

        const video = document.createElement('video');
        video.src = 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/test.mp4';
        video.__reactProps$test = {
            variants: [
                { url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/test.mp4', bitrate: 2176000, contentType: 'video/mp4' }
            ]
        };
        player.appendChild(video);
        article.appendChild(player);

        const actionBar = document.createElement('div');
        actionBar.setAttribute('role', 'group');

        const bookmarkWrap = document.createElement('div');
        const bookmarkBtn = document.createElement('button');
        bookmarkBtn.setAttribute('data-testid', 'bookmark');
        bookmarkWrap.appendChild(bookmarkBtn);
        actionBar.appendChild(bookmarkWrap);

        article.appendChild(actionBar);
        document.body.appendChild(article);

        const postMessageSpy = jest.spyOn(window, 'postMessage');
        XEnv.injectDownloadButtons();

        // Download button should NOT be inside the video player frame
        expect(player.querySelector('.vsc-download-btn')).toBeNull();

        // Download button should be inside .x-force-friend-btn-wrap immediately to the left of bookmarkWrap
        const btnWrap = actionBar.querySelector('.x-force-friend-btn-wrap');
        expect(btnWrap).not.toBeNull();
        expect(btnWrap.nextSibling).toBe(bookmarkWrap);

        const btn = btnWrap.querySelector('.vsc-download-btn');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBe('Download Video');
        expect(btn.style.cursor).toBe('pointer');

        // Click button
        btn.click();
        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'X_DOWNLOAD_REQUEST',
                payload: expect.objectContaining({
                    url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/test.mp4',
                    filename: 'X_Video_2113383149011140730.mp4'
                })
            }),
            '*'
        );
    });

    it('should short-circuit /i/api/1.1/promoted_content/log.json in XMLHttpRequest and fetch with a 200 OK stub to prevent 429 rate-limit spam', async () => {
        const xhr = new XMLHttpRequest();
        const loadSpy = jest.fn();
        const readyStateSpy = jest.fn();
        xhr.addEventListener('readystatechange', readyStateSpy);
        xhr.addEventListener('load', loadSpy);

        xhr.open('POST', 'https://x.com/i/api/1.1/promoted_content/log.json', true);
        xhr.send(JSON.stringify({ impression_id: 'test_ad_123' }));

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(readyStateSpy).toHaveBeenCalled();
        expect(loadSpy).toHaveBeenCalled();
        expect(xhr.readyState).toBe(4);
        expect(xhr.status).toBe(200);
        expect(xhr.responseText).toBe('{}');
        expect(xhr.getResponseHeader('Content-Type')).toContain('application/json');

        const fetchRes = await window.fetch('https://x.com/i/api/1.1/promoted_content/log.json', {
            method: 'POST',
            body: '{}'
        });
        expect(fetchRes.status).toBe(200);
        expect(await fetchRes.text()).toBe('{}');
    });
});
