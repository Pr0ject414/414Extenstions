import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('crunchyrollEndSlateCloser.js', () => {
    let mockStorageGet;
    let mockOnChangedListener;

    beforeEach(() => {
        document.body.innerHTML = '';
        mockStorageGet = jest.fn((keys, callback) => callback({
            isGlobalMasterSwitchEnabled: true,
            isCrunchyrollModuleEnabled: true,
            isCrunchyrollAutoCloseEndSlateEnabled: true
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

    function loadScript() {
        const scriptPath = path.resolve(__dirname, '../../crunchyroll_extension/content_scripts/crunchyrollEndSlateCloser.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    }

    it('should close end-slate dialog on initialization when open', () => {
        const dialog = document.createElement('dialog');
        dialog.className = 'erc-end-slate-recommendations-carousel';
        dialog.setAttribute('open', '');
        dialog.close = jest.fn();
        document.body.appendChild(dialog);

        loadScript();

        expect(dialog.hasAttribute('open')).toBe(false);
        expect(dialog.close).toHaveBeenCalled();
    });

    it('should not close dialog if feature toggle is disabled', () => {
        mockStorageGet = jest.fn((keys, callback) => callback({
            isGlobalMasterSwitchEnabled: true,
            isCrunchyrollModuleEnabled: true,
            isCrunchyrollAutoCloseEndSlateEnabled: false
        }));
        global.chrome.storage.local.get = mockStorageGet;

        const dialog = document.createElement('dialog');
        dialog.className = 'erc-end-slate-recommendations-carousel';
        dialog.setAttribute('open', '');
        document.body.appendChild(dialog);

        loadScript();

        expect(dialog.hasAttribute('open')).toBe(true);
    });
});
