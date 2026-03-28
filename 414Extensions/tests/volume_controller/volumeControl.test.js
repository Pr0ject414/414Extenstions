import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('volumeControl.js', () => {
    let mockChrome;
    let mockAudioContext;
    let mockGainNode;
    let currentGainValue = 1.0;

    beforeAll(async () => {
        const scriptPath = path.resolve(__dirname, '../../volume_controller/content_scripts/volumeControl.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Setup DOM with a video element so scanForMedia finds something
        document.body.innerHTML = '<video id="test-video" src="test.mp4"></video>';

        mockGainNode = {
            gain: {
                get value() { return currentGainValue; },
                set value(v) { 
                    currentGainValue = v; 
                }
            },
            connect: jest.fn()
        };

        mockAudioContext = {
            createGain: jest.fn(() => mockGainNode),
            createMediaElementSource: jest.fn(() => ({
                connect: jest.fn()
            })),
            destination: {},
            state: 'running',
            resume: jest.fn(() => Promise.resolve())
        };

        window.AudioContext = jest.fn().mockImplementation(() => mockAudioContext);
        window.webkitAudioContext = window.AudioContext;

        mockChrome = {
            runtime: {
                onMessage: {
                    addListener: jest.fn()
                },
                sendMessage: jest.fn((msg, cb) => {
                    if (msg.action === 'getStoredVolume' && cb) {
                        cb({ volume: 1.0 });
                    }
                })
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => cb({
                        isGlobalMasterSwitchEnabled: true,
                        isVolumeModuleVisible: true
                    }))
                }
            }
        };
        global.chrome = mockChrome;

        eval(scriptContent);
        
        // Wait for storage callback and scanForMedia to complete
        await new Promise(r => setTimeout(r, 50));
    });

    it('should initialize and listen for messages', () => {
        expect(mockChrome.storage.local.get).toHaveBeenCalled();
        expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should update volume when receiving setVolume message', () => {
        const listeners = mockChrome.runtime.onMessage.addListener.mock.calls;
        const listener = listeners[listeners.length - 1][0];
        
        listener({ action: 'setVolume', volume: 0.5 });
        expect(currentGainValue).toBe(0.5);
    });

    it('should respond to getVolume message', () => {
        const listeners = mockChrome.runtime.onMessage.addListener.mock.calls;
        const listener = listeners[listeners.length - 1][0];
        const sendResponse = jest.fn();
        
        listener({ action: 'getVolume' }, {}, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ volume: expect.any(Number) }));
    });
});
