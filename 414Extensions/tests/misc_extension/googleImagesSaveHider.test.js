import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('googleImagesSaveHider.js', () => {
    let mockStorageData;
    let mockOnChangedListeners;

    const GOOGLE_SAVE_HTML = `
        <div jsname="la3Mvf" class="LNjG3" data-ved="2ahUKEwiZ9v-FyOeXAxXbiCsGHYwYKuUQhKIWegUIoQMQAQ">
            <div class="O9ZfDb" jscontroller="iG3Zmf" data-dclid="" data-dipt="1" data-elntcp="1" data-ete="1" data-force-open-list-picker="1" data-is="0" data-ists="0" data-iusi="0" data-lsoi="0" data-sbs="0" data-tie="1" data-ubil="1" jsdata="kZ5ond;;19 rj9Cic;;20 XmO9C;;21" jsaction="rcuQ6b:npT2md;tErFub:hwpOM;fRiDjd:J29LQb;lJSrC:qNwU7b;nG8r9:kiwclb">
                <div data-ved="0CAAQ3OYUahcKEwiQnL2GyOeXAxUAAAAAHQAAAAAQcw" jsname="CL9xOb" role="button" tabindex="0" aria-label="Save Pontiac GTO Who? The Ultimate Guide to 1950s Muscle Cars - autoevolution" jsaction="RWmtEc">
                    <div class="DVuPgc fXVarf sjVJQd btku5b">
                        <div class="niO4u VDgVie SlP8xc">Save</div>
                    </div>
                </div>
                <div id="jsuid_12">
                    <div data-ved="0CAIQ3eYUahcKEwiQnL2GyOeXAxUAAAAAHQAAAAAQcw" style="display:none;" jsname="TomQf" id="jsuid_13" role="button" tabindex="0" aria-label="Saved. Edit save for Pontiac GTO Who? The Ultimate Guide to 1950s Muscle Cars - autoevolution" jsaction="RWmtEc">
                        <div class="DVuPgc fXVarf sjVJQd btku5b">
                            <div class="niO4u VDgVie SlP8xc">Saved</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    beforeEach(() => {
        document.documentElement.className = '';
        document.body.innerHTML = GOOGLE_SAVE_HTML;
        mockOnChangedListeners = [];

        mockStorageData = {
            isGlobalMasterSwitchEnabled: true,
            isMiscModuleEnabled: true
            // isGoogleImagesHideSaveEnabled intentionally omitted to verify default is OFF (false)
        };

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((keys, callback) => {
                        const res = {};
                        keys.forEach((k) => {
                            res[k] = mockStorageData[k];
                        });
                        callback(res);
                    })
                },
                onChanged: {
                    addListener: jest.fn((fn) => {
                        mockOnChangedListeners.push(fn);
                    })
                }
            }
        };
    });

    function loadScript() {
        const scriptPath = path.resolve(__dirname, '../../misc_extension/content_scripts/googleImagesSaveHider.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    }

    it('should default to OFF (do not hide Save button when isGoogleImagesHideSaveEnabled is unset or false)', () => {
        loadScript();

        const saveWrapper = document.querySelector('div[jsname="la3Mvf"]');
        expect(document.documentElement.classList.contains('ext414-hide-gimg-save')).toBe(false);
        expect(saveWrapper.classList.contains('ext414-gimg-save-hidden')).toBe(false);
    });

    it('should hide Save button when isGoogleImagesHideSaveEnabled is true', () => {
        mockStorageData.isGoogleImagesHideSaveEnabled = true;
        loadScript();

        const saveWrapper = document.querySelector('div[jsname="la3Mvf"]');
        expect(document.documentElement.classList.contains('ext414-hide-gimg-save')).toBe(true);
        expect(saveWrapper.classList.contains('ext414-gimg-save-hidden')).toBe(true);
    });

    it('should dynamically toggle visibility when storage changes and hide newly injected Save buttons', async () => {
        loadScript();
        const saveWrapper = document.querySelector('div[jsname="la3Mvf"]');
        expect(saveWrapper.classList.contains('ext414-gimg-save-hidden')).toBe(false);

        // Toggle ON
        mockStorageData.isGoogleImagesHideSaveEnabled = true;
        mockOnChangedListeners.forEach((fn) =>
            fn({ isGoogleImagesHideSaveEnabled: { newValue: true } }, 'local')
        );

        expect(document.documentElement.classList.contains('ext414-hide-gimg-save')).toBe(true);
        expect(saveWrapper.classList.contains('ext414-gimg-save-hidden')).toBe(true);

        // Dynamically inject another Google Images result card
        const newCard = document.createElement('div');
        newCard.innerHTML = GOOGLE_SAVE_HTML;
        document.body.appendChild(newCard);

        await Promise.resolve();

        const allSaveWrappers = document.querySelectorAll('div[jsname="la3Mvf"]');
        expect(allSaveWrappers.length).toBe(2);
        allSaveWrappers.forEach((el) => {
            expect(el.classList.contains('ext414-gimg-save-hidden')).toBe(true);
        });

        // Disable via Misc module power switch
        mockStorageData.isMiscModuleEnabled = false;
        mockOnChangedListeners.forEach((fn) =>
            fn({ isMiscModuleEnabled: { newValue: false } }, 'local')
        );

        expect(document.documentElement.classList.contains('ext414-hide-gimg-save')).toBe(false);
        allSaveWrappers.forEach((el) => {
            expect(el.classList.contains('ext414-gimg-save-hidden')).toBe(false);
        });
    });
});
