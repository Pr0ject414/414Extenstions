import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('popup.js', () => {
    let mockStorageData;
    let mockSendMessage;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../popup/popup.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        document.documentElement.innerHTML = htmlContent;

        mockStorageData = {
            isGlobalMasterSwitchEnabled: true,
            isVolumeModuleVisible: true,
            isVscModuleVisible: true,
            isFabModuleVisible: true,
            isYouTubeModuleVisible: true,
            isXModuleVisible: true,
            isCrunchyrollModuleVisible: true,
            isXModuleEnabled: true,
            isXAlwaysMuteEnabled: false
        };

        mockSendMessage = jest.fn((msg, cb) => {
            if (cb) cb({ success: true });
            return Promise.resolve({ success: true });
        });

        global.chrome = {
            runtime: {
                sendMessage: mockSendMessage,
                lastError: null
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        const res = {};
                        if (Array.isArray(keys)) {
                            keys.forEach(k => { res[k] = mockStorageData[k]; });
                        }
                        cb(res);
                    }),
                    set: jest.fn((items, cb) => {
                        Object.assign(mockStorageData, items);
                        if (cb) cb();
                    })
                },
                session: {
                    get: jest.fn((keys, cb) => cb && cb({})),
                    set: jest.fn((items, cb) => cb && cb())
                }
            },
            tabs: {
                query: jest.fn((query, cb) => cb([{ id: 1, url: 'https://fab.com' }])),
                sendMessage: jest.fn().mockResolvedValue({})
            }
        };

        const scriptPath = path.resolve(__dirname, '../popup/popup.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);

        // Dispatch DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('should initialize with globalMasterSwitchToggle checked', () => {
        const masterToggle = document.getElementById('globalMasterSwitchToggle');
        expect(masterToggle.checked).toBe(true);
    });

    test('should disable all modules when globalMasterSwitchToggle is unchecked', () => {
        const masterToggle = document.getElementById('globalMasterSwitchToggle');
        masterToggle.checked = false;
        masterToggle.dispatchEvent(new Event('change'));

        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            isGlobalMasterSwitchEnabled: false
        });
        expect(mockSendMessage).toHaveBeenCalledWith({
            action: 'setGlobalMasterSwitch',
            enabled: false
        }, expect.any(Function));

        // Verify dependent modules are disabled
        const fabControls = document.getElementById('fab-controls');
        expect(fabControls.classList.contains('effectively-disabled')).toBe(true);

        const vscPowerToggle = document.getElementById('vscPowerToggle');
        if (vscPowerToggle) {
            expect(vscPowerToggle.disabled).toBe(true);
        }
    });

    test('should switch active tab when tab button is clicked', () => {
        const speedTabBtn = document.querySelector('.tab-button[data-tab="speed-controls"]');
        expect(speedTabBtn).not.toBeNull();

        speedTabBtn.click();

        expect(speedTabBtn.classList.contains('active')).toBe(true);
        const speedContent = document.getElementById('speed-controls');
        expect(speedContent.classList.contains('active')).toBe(true);

        const volumeContent = document.getElementById('volume-controls');
        expect(volumeContent.classList.contains('active')).toBe(false);
    });

    test('updateStatusIndicator should properly update class and label', () => {
        const indicator = document.createElement('span');
        const label = document.createElement('span');

        window.updateStatusIndicator(indicator, label, 'EXTENSION_DISABLED');
        expect(indicator.classList.contains('status-extension-disabled')).toBe(true);
        expect(label.textContent).toBe('Ext. Disabled');

        window.updateStatusIndicator(indicator, label, 'OK_ACTIVE');
        expect(indicator.classList.contains('status-ok-active')).toBe(true);
        expect(label.textContent).toBe('Active');
    });

    test('should filter country dropdown when typing in xCountrySearchInput and block country', () => {
        const searchInput = document.getElementById('xCountrySearchInput');
        const countrySelect = document.getElementById('xCountrySelect');
        const addBtn = document.getElementById('xAddCountryBtn');
        const chipsContainer = document.getElementById('xBlockedChipsContainer');

        expect(searchInput).not.toBeNull();
        expect(countrySelect).not.toBeNull();

        searchInput.value = 'japan';
        searchInput.dispatchEvent(new Event('input'));

        expect(countrySelect.value).toBe('Japan');
        const options = Array.from(countrySelect.options).map(o => o.value).filter(Boolean);
        expect(options).toEqual(['Japan']);

        addBtn.click();

        expect(mockStorageData.blockedCountries).toEqual(['Japan']);
        expect(chipsContainer.textContent).toContain('Japan');
        expect(searchInput.value).toBe('');
    });

    test('should filter device store & region dropdown and block selected region or device store', () => {
        const searchInput = document.getElementById('xDeviceRegionSearchInput');
        const selectEl = document.getElementById('xDeviceRegionSelect');
        const addBtn = document.getElementById('xAddDeviceRegionBtn');
        const chipsContainer = document.getElementById('xBlockedDeviceRegionChipsContainer');

        expect(searchInput).not.toBeNull();
        expect(selectEl).not.toBeNull();
        expect(addBtn).not.toBeNull();
        expect(chipsContainer).not.toBeNull();

        searchInput.value = 'east asia';
        searchInput.dispatchEvent(new Event('input'));

        const options = Array.from(selectEl.options).map(o => o.value).filter(Boolean);
        expect(options).toContain('East Asia');
        expect(options).toContain('East Asia & Pacific');
        expect(options).toContain('East Asia & Pacific App Store');
        expect(selectEl.value).toBe('East Asia');

        addBtn.click();

        expect(mockStorageData.blockedDeviceRegions).toEqual(['East Asia']);
        expect(chipsContainer.textContent).toContain('East Asia');
        expect(searchInput.value).toBe('');
    });

    test('should toggle Hide Promoted Ads (xHideAdsToggle) and persist isXHideAdsEnabled', () => {
        const hideAdsToggle = document.getElementById('xHideAdsToggle');
        expect(hideAdsToggle).not.toBeNull();
        expect(hideAdsToggle.checked).toBe(true);

        hideAdsToggle.checked = false;
        hideAdsToggle.dispatchEvent(new Event('change'));
        expect(mockStorageData.isXHideAdsEnabled).toBe(false);

        hideAdsToggle.checked = true;
        hideAdsToggle.dispatchEvent(new Event('change'));
        expect(mockStorageData.isXHideAdsEnabled).toBe(true);
    });
});
