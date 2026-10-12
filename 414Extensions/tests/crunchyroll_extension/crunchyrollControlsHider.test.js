import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('crunchyrollControlsHider.js (Option 1)', () => {
    let mockStorageGet;
    let mockOnChangedListener;

    beforeEach(() => {
        document.body.innerHTML = '';
        jest.useFakeTimers();

        mockStorageGet = jest.fn((keys, callback) => callback({
            isGlobalMasterSwitchEnabled: true,
            isCrunchyrollModuleEnabled: true,
            isCrunchyrollHideControlsOnSpeedEnabled: true
        }));
        mockOnChangedListener = jest.fn();

        global.chrome = {
            storage: {
                local: {
                    get: mockStorageGet
                },
                onChanged: {
                    addListener: mockOnChangedListener
                }
            }
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function loadScript() {
        const scriptPath = path.resolve(__dirname, '../../crunchyroll_extension/content_scripts/crunchyrollControlsHider.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    }

    it('should add cr-speed-controls-hidden when speeding up and mouse is idle', () => {
        const controlsRoot = document.createElement('div');
        controlsRoot.setAttribute('data-testid', 'player-controls-root');
        document.body.appendChild(controlsRoot);

        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: false, writable: true });
        Object.defineProperty(video, 'ended', { value: false, writable: true });
        Object.defineProperty(video, 'playbackRate', { value: 1.5, writable: true });
        document.body.appendChild(video);

        loadScript();
        jest.advanceTimersByTime(350);

        expect(controlsRoot.classList.contains('cr-speed-controls-hidden')).toBe(true);
    });

    it('should reveal controls when mouse moves and hide them again when mouse stops', () => {
        const controlsRoot = document.createElement('div');
        controlsRoot.setAttribute('data-testid', 'player-controls-root');
        document.body.appendChild(controlsRoot);

        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: false, writable: true });
        Object.defineProperty(video, 'ended', { value: false, writable: true });
        Object.defineProperty(video, 'playbackRate', { value: 2.0, writable: true });
        document.body.appendChild(video);

        loadScript();
        jest.advanceTimersByTime(350);
        expect(controlsRoot.classList.contains('cr-speed-controls-hidden')).toBe(true);

        // Simulate mouse move over controls
        controlsRoot.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        expect(controlsRoot.classList.contains('cr-speed-controls-hidden')).toBe(false);

        // Advance past idle timeout (1200ms)
        jest.advanceTimersByTime(1300);
        expect(controlsRoot.classList.contains('cr-speed-controls-hidden')).toBe(true);
    });

    it('should remove cr-speed-controls-hidden when video speed is 1.0', () => {
        const controlsRoot = document.createElement('div');
        controlsRoot.setAttribute('data-testid', 'player-controls-root');
        controlsRoot.classList.add('cr-speed-controls-hidden');
        document.body.appendChild(controlsRoot);

        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: false, writable: true });
        Object.defineProperty(video, 'ended', { value: false, writable: true });
        Object.defineProperty(video, 'playbackRate', { value: 1.0, writable: true });
        document.body.appendChild(video);

        loadScript();
        jest.advanceTimersByTime(350);

        expect(controlsRoot.classList.contains('cr-speed-controls-hidden')).toBe(false);
    });
});
