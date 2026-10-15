import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('volumeMainWorld.js', () => {
    let pristineAttachShadow;
    let pristinePlay;
    let registeredListeners = [];
    let origAddEventListener;

    beforeAll(() => {
        pristineAttachShadow = Element.prototype.attachShadow;
        pristinePlay = HTMLMediaElement.prototype.play;
        origAddEventListener = window.addEventListener;
        window.addEventListener = function(type, listener, options) {
            registeredListeners.push({ type, listener, options });
            return origAddEventListener.call(window, type, listener, options);
        };
    });

    afterAll(() => {
        window.addEventListener = origAddEventListener;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        delete window.hasVolumeMainWorldInjected;
        
        Object.defineProperty(navigator, 'userActivation', {
            value: undefined,
            configurable: true
        });

        document.body.innerHTML = '';
        Element.prototype.attachShadow = pristineAttachShadow;
        HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());

        // Mock speechSynthesis
        window.speechSynthesis = {
            speak: jest.fn()
        };

        // Mock Web Audio API
        const mockGainNode = {
            gain: { value: 1.0 },
            connect: jest.fn()
        };

        class MockAudioNode {
            constructor() {
                this.context = {
                    destination: {}
                };
            }
            connect(dest, out, inChan) {
                return dest;
            }
        }
        window.AudioNode = MockAudioNode;

        class MockAudioContext {
            constructor() {
                this.destination = {};
                this.state = 'running';
            }
            createGain() {
                return { ...mockGainNode, gain: { value: 1.0 } };
            }
            createMediaElementSource(el) {
                return new MockAudioNode();
            }
            resume() {
                return Promise.resolve();
            }
        }
        window.AudioContext = MockAudioContext;
        window.webkitAudioContext = MockAudioContext;
    });

    afterEach(() => {
        jest.useRealTimers();
        registeredListeners.forEach(({ type, listener, options }) => {
            window.removeEventListener(type, listener, options);
        });
        registeredListeners = [];
        document.body.innerHTML = '';
        Element.prototype.attachShadow = pristineAttachShadow;
        HTMLMediaElement.prototype.play = pristinePlay;
    });

    function loadScript() {
        const scriptPath = path.resolve(__dirname, '../../volume_controller/content_scripts/volumeMainWorld.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    }

    test('should track shadow root on attachShadow', () => {
        loadScript();

        const host = document.createElement('div');
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        expect(shadow).toBeDefined();
    });

    test('should limit speech synthesis volume according to currentVolume', () => {
        loadScript();

        // Dispatch message to boost volume to 0.5
        window.dispatchEvent(new MessageEvent('message', {
            source: window,
            data: { type: 'SET_VOLUME_BOOST', volume: 0.5 }
        }));

        const utterance = { volume: 1.0 };
        window.speechSynthesis.speak(utterance);
        expect(utterance.volume).toBe(0.5);
    });

    test('should prevent duplicate script injection', () => {
        loadScript();
        expect(window.hasVolumeMainWorldInjected).toBe(true);

        const firstAttachShadow = Element.prototype.attachShadow;
        loadScript(); // Second call
        expect(Element.prototype.attachShadow).toBe(firstAttachShadow);
    });

    test('should handle SET_VOLUME_BOOST message', () => {
        loadScript();

        const video = document.createElement('video');
        document.body.appendChild(video);

        // Boost volume to 2.5
        window.dispatchEvent(new MessageEvent('message', {
            source: window,
            data: { type: 'SET_VOLUME_BOOST', volume: 2.5 }
        }));

        // Advance timer for interval
        jest.advanceTimersByTime(2500);
        expect(window.hasVolumeMainWorldInjected).toBe(true);
    });

    test('should not resume suspended AudioContexts when video plays without user activation', () => {
        loadScript();

        const resumeSpy = jest.fn(() => Promise.resolve());
        const fakeCtx = {
            destination: {},
            state: 'suspended',
            createGain: () => ({ gain: { value: 1.0 }, connect: jest.fn() }),
            resume: resumeSpy
        };
        const node = new window.AudioNode();
        node.context = fakeCtx;

        // Connect node to destination -> adds fakeCtx to allAudioContexts
        node.connect(fakeCtx.destination);

        const video = document.createElement('video');
        video.play();

        // resumeSpy should NOT be called because user has not interacted
        expect(resumeSpy).not.toHaveBeenCalled();
    });

    test('should resume suspended AudioContexts when user performs a gesture', () => {
        loadScript();

        const resumeSpy = jest.fn(() => Promise.resolve());
        const fakeCtx = {
            destination: {},
            state: 'suspended',
            createGain: () => ({ gain: { value: 1.0 }, connect: jest.fn() }),
            resume: resumeSpy
        };
        const node = new window.AudioNode();
        node.context = fakeCtx;
        node.connect(fakeCtx.destination);

        // Dispatch user gesture (e.g. click)
        window.dispatchEvent(new MouseEvent('click'));

        expect(resumeSpy).toHaveBeenCalledTimes(1);
    });

    test('should resume suspended AudioContexts on play if navigator.userActivation.hasBeenActive is true', () => {
        Object.defineProperty(navigator, 'userActivation', {
            value: { hasBeenActive: true, isActive: true },
            configurable: true
        });

        loadScript();

        const resumeSpy = jest.fn(() => Promise.resolve());
        const fakeCtx = {
            destination: {},
            state: 'suspended',
            createGain: () => ({ gain: { value: 1.0 }, connect: jest.fn() }),
            resume: resumeSpy
        };
        const node = new window.AudioNode();
        node.context = fakeCtx;
        node.connect(fakeCtx.destination);

        const video = document.createElement('video');
        video.play();

        expect(resumeSpy).toHaveBeenCalledTimes(1);
    });

    test('should not create internal AudioContext before user activation when volume > 1', () => {
        const createMediaElementSourceSpy = jest.fn(() => new window.AudioNode());
        class TestAudioContext {
            constructor() {
                this.destination = {};
                this.state = 'suspended';
                this.createMediaElementSource = createMediaElementSourceSpy;
                this.createGain = () => ({ gain: { value: 1.0 }, connect: jest.fn() });
                this.resume = jest.fn(() => Promise.resolve());
            }
        }
        window.AudioContext = TestAudioContext;
        window.webkitAudioContext = TestAudioContext;

        loadScript();

        // Boost volume
        window.dispatchEvent(new MessageEvent('message', {
            source: window,
            data: { type: 'SET_VOLUME_BOOST', volume: 2.0 }
        }));

        const video = document.createElement('video');
        video.play();

        // Should not have attached yet because user has not interacted
        expect(createMediaElementSourceSpy).not.toHaveBeenCalled();

        // Now user clicks
        window.dispatchEvent(new MouseEvent('click'));
        expect(createMediaElementSourceSpy).toHaveBeenCalledWith(video);
    });
});

