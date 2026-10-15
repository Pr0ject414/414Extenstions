import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('settings.js', () => {
    let mockStorageData;
    let mockSendMessage;

    beforeEach(() => {
        const htmlPath = path.resolve(__dirname, '../settings/settings.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        document.documentElement.innerHTML = htmlContent;

        mockStorageData = {
            maxRetries: 5,
            initialDelayMs: 30000,
            maxDelayMs: 300000,
            delayBetweenVerificationChecksMs: 5000,
            delayBetweenTabOpenMs: 2000,
            maxConcurrentFabTabs: 2,
            vsc_blacklist: 'example.com',
            vsc_global_default_speed: 1.0
        };

        mockSendMessage = jest.fn((msg, cb) => {
            if (cb) cb({ success: true, message: 'Item queued successfully.' });
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
                        if (typeof keys === 'object' && !Array.isArray(keys)) {
                            Object.keys(keys).forEach(k => {
                                res[k] = mockStorageData[k] !== undefined ? mockStorageData[k] : keys[k];
                            });
                        }
                        cb(res);
                    }),
                    set: jest.fn((items, cb) => {
                        Object.assign(mockStorageData, items);
                        if (cb) cb();
                    })
                }
            }
        };

        const scriptPath = path.resolve(__dirname, '../settings/settings.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);

        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('should populate input fields with loaded settings', () => {
        const maxRetries = document.getElementById('maxRetries');
        expect(maxRetries.value).toBe('5');

        const initialDelay = document.getElementById('initialDelayS');
        expect(initialDelay.value).toBe('30'); // 30000ms / 1000

        const blacklist = document.getElementById('vscSitesBlacklist');
        expect(blacklist.value).toBe('example.com');
    });

    test('should save global network settings on button click', () => {
        const maxRetries = document.getElementById('maxRetries');
        maxRetries.value = '8';

        const saveGlobalBtn = document.getElementById('saveGlobalSettings');
        saveGlobalBtn.click();

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ maxRetries: 8 }),
            expect.any(Function)
        );
        expect(mockStorageData.maxRetries).toBe(8);
    });

    test('should save FAB settings on button click', () => {
        const maxTabs = document.getElementById('maxConcurrentFabTabs');
        maxTabs.value = '4';

        const saveFabBtn = document.getElementById('saveFabSettings');
        saveFabBtn.click();

        expect(chrome.storage.local.set).toHaveBeenCalledWith(
            expect.objectContaining({ maxConcurrentFabTabs: 4 }),
            expect.any(Function)
        );
        expect(mockStorageData.maxConcurrentFabTabs).toBe(4);
    });

    test('should send message to queue item manually', () => {
        const urlInput = document.getElementById('itemQueueUrl');
        urlInput.value = 'https://www.fab.com/listings/manual-test-id';

        const queueBtn = document.getElementById('queueItemButton');
        queueBtn.click();

        expect(mockSendMessage).toHaveBeenCalledWith(
            {
                action: 'queueFabItemOnly',
                url: 'https://www.fab.com/listings/manual-test-id'
            },
            expect.any(Function)
        );
    });
});
