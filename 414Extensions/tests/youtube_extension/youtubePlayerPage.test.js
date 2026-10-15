import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('youtubePlayerPage.js', () => {
    let mockStorageGet;
    let mockSendMessage;
    let mockStorageOnChangedListener;

    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';

        mockSendMessage = jest.fn((msg, cb) => {
            if (msg.action === 'getYouTubeModuleStatus') {
                cb({ isPaused: false });
            }
        });

        mockStorageGet = jest.fn((keys, cb) => {
            cb({ isYouTubeNoSuggestionsEnabled: true });
        });

        mockStorageOnChangedListener = null;

        global.chrome = {
            runtime: {
                sendMessage: (msg, cb) => mockSendMessage(msg, cb),
                lastError: null
            },
            storage: {
                local: {
                    get: (keys, cb) => mockStorageGet(keys, cb)
                },
                onChanged: {
                    addListener: jest.fn((listener) => {
                        mockStorageOnChangedListener = listener;
                    })
                }
            }
        };

        global.console = {
            ...console,
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };
    });

    function loadScript() {
        const scriptPath = path.resolve(__dirname, '../../youtube_extension/content_scripts/youtubePlayerPage.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    }

    test('should inject style when no-suggestions is enabled and module is active', () => {
        loadScript();

        const style = document.getElementById('yt-no-suggestions-style');
        expect(style).not.toBeNull();
        expect(style.textContent).toContain('.ytp-endscreen-content');
    });

    test('should not inject style when no-suggestions is disabled', () => {
        mockStorageGet = jest.fn((keys, cb) => {
            cb({ isYouTubeNoSuggestionsEnabled: false });
        });

        loadScript();

        const style = document.getElementById('yt-no-suggestions-style');
        expect(style).toBeNull();
    });

    test('should remove style when module is paused', () => {
        // Start with style present
        const initialStyle = document.createElement('style');
        initialStyle.id = 'yt-no-suggestions-style';
        document.head.appendChild(initialStyle);

        mockSendMessage = jest.fn((msg, cb) => {
            cb({ isPaused: true });
        });

        loadScript();

        const style = document.getElementById('yt-no-suggestions-style');
        expect(style).toBeNull();
    });

    test('should update state when chrome.storage.onChanged fires', () => {
        loadScript();
        expect(document.getElementById('yt-no-suggestions-style')).not.toBeNull();

        // Change storage to disabled
        mockStorageGet = jest.fn((keys, cb) => {
            cb({ isYouTubeNoSuggestionsEnabled: false });
        });

        mockStorageOnChangedListener({
            isYouTubeNoSuggestionsEnabled: { newValue: false }
        }, 'local');

        expect(document.getElementById('yt-no-suggestions-style')).toBeNull();
    });
});
