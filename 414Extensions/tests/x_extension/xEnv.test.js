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
    let XEnv;

    beforeAll(() => {
        // We need to capture the descriptors BEFORE they are hijacked by the script
        originalMutedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
        originalVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');

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

    it('should inject a white, clickable, interactive download button into video players', () => {
        const player = document.createElement('div');
        player.setAttribute('data-testid', 'videoPlayer');

        const video = document.createElement('video');
        video.src = 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/test.mp4';
        // Mock React Fiber/Props on video
        video.__reactProps$test = {
            variants: [
                { url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/test.mp4', bitrate: 2176000, contentType: 'video/mp4' }
            ]
        };
        player.appendChild(video);

        const settingsBtn = document.createElement('button');
        settingsBtn.setAttribute('aria-label', 'Settings');
        const controlGroup = document.createElement('div');
        controlGroup.appendChild(settingsBtn);
        player.appendChild(controlGroup);

        document.body.appendChild(player);

        // Run injection
        const postMessageSpy = jest.spyOn(window, 'postMessage');
        XEnv.injectDownloadButtons();

        const btn = player.querySelector('.vsc-download-btn');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBe('Download Video');
        expect(btn.style.cursor).toBe('pointer');

        // Check SVG fill
        const svg = btn.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg.innerHTML).toContain('fill="#ffffff"');

        // Click button
        btn.click();
        expect(postMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'X_DOWNLOAD_REQUEST',
                payload: expect.objectContaining({
                    url: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/test.mp4'
                })
            }),
            '*'
        );
    });
});
