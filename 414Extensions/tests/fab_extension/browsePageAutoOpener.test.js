import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('browsePageAutoOpener.js', () => {
    let mockSendMessage;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
        window.FabContentModules = {};

        mockSendMessage = jest.fn();
        global.chrome = {
            runtime: {
                sendMessage: mockSendMessage
            }
        };

        const scriptPath = path.resolve(__dirname, '../../fab_extension/content_scripts/modules/browsePageAutoOpener.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    });

    afterEach(() => {
        if (window.FabContentModules.stopAutoOpener) {
            window.FabContentModules.stopAutoOpener();
        }
        jest.useRealTimers();
    });

    test('should queue free item after grace period', () => {
        const item = document.createElement('div');
        item.className = 'nTa5u2sc';
        item.innerHTML = `
            <a class="fabkit-Typography-root bc6TaIqU fabkit-Focusable-root" href="https://www.fab.com/listings/free-item-1">Item Title</a>
            <span class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</span>
        `;
        document.body.appendChild(item);

        window.FabContentModules.initializeAutoOpener({ graceCyclesMs: 2000 });

        expect(mockSendMessage).not.toHaveBeenCalled();

        jest.advanceTimersByTime(2000);

        expect(mockSendMessage).toHaveBeenCalledWith({
            action: 'openTabInBackground',
            url: 'https://www.fab.com/listings/free-item-1'
        });
        expect(item.style.display).toBe('none');
        expect(item.getAttribute('data-fab-hidden')).toBe('true');
    });

    test('should ignore already owned items even if marked free', () => {
        const item = document.createElement('div');
        item.className = 'nTa5u2sc';
        item.innerHTML = `
            <a class="fabkit-Typography-root bc6TaIqU fabkit-Focusable-root" href="https://www.fab.com/listings/free-owned-item">Item Title</a>
            <span class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</span>
            <i class="fabkit-Icon--intent-success"></i>
        `;
        document.body.appendChild(item);

        window.FabContentModules.initializeAutoOpener({ graceCyclesMs: 2000 });
        jest.advanceTimersByTime(2500);

        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    test('should abort queuing if item is scrolled away before grace period finishes', () => {
        const item = document.createElement('div');
        item.className = 'nTa5u2sc';
        item.innerHTML = `
            <a class="fabkit-Typography-root bc6TaIqU fabkit-Focusable-root" href="https://www.fab.com/listings/scrolled-away-item">Item Title</a>
            <span class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</span>
        `;
        document.body.appendChild(item);

        window.FabContentModules.initializeAutoOpener({ graceCyclesMs: 2000 });

        // Scrolled away after 1000ms
        jest.advanceTimersByTime(1000);
        document.body.removeChild(item);

        jest.advanceTimersByTime(1500);
        expect(mockSendMessage).not.toHaveBeenCalled();
    });
});
