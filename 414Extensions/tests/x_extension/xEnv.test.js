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
});
