import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('browsePageHider.js', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
        window.FabContentModules = {};

        const scriptPath = path.resolve(__dirname, '../../fab_extension/content_scripts/modules/browsePageHider.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    });

    afterEach(() => {
        if (window.FabContentModules.stopHider) {
            window.FabContentModules.stopHider();
        }
        jest.useRealTimers();
    });

    test('should hide owned items after 1.5s grace period and increment hidden count', () => {
        const productCard = document.createElement('div');
        productCard.className = 'nTa5u2sc';
        productCard.innerHTML = '<i class="fabkit-Icon--intent-success"></i>';
        document.body.appendChild(productCard);

        window.FabContentModules.initializeHider();

        expect(productCard.style.display).not.toBe('none');
        expect(window.FabContentModules.getHiddenCount()).toBe(0);

        // Advance 1500ms
        jest.advanceTimersByTime(1500);

        expect(productCard.style.display).toBe('none');
        expect(productCard.getAttribute('data-fab-hidden')).toBe('true');
        expect(window.FabContentModules.getHiddenCount()).toBe(1);
    });

    test('should abort hiding if item is removed from DOM before grace period expires', () => {
        const productCard = document.createElement('div');
        productCard.className = 'nTa5u2sc';
        productCard.innerHTML = '<i class="fabkit-Icon--intent-success"></i>';
        document.body.appendChild(productCard);

        window.FabContentModules.initializeHider();

        // Simulate virtual scroll removal before 1500ms
        jest.advanceTimersByTime(500);
        document.body.removeChild(productCard);

        jest.advanceTimersByTime(1000);
        expect(window.FabContentModules.getHiddenCount()).toBe(0);
    });

    test('should observe newly added nodes and hide them', async () => {
        window.FabContentModules.initializeHider();

        const newCard = document.createElement('div');
        newCard.className = 'nTa5u2sc';
        newCard.innerHTML = '<i class="fabkit-Icon--intent-success"></i>';
        document.body.appendChild(newCard);

        await Promise.resolve();

        jest.advanceTimersByTime(1500);
        expect(newCard.style.display).toBe('none');
        expect(newCard.getAttribute('data-fab-hidden')).toBe('true');
    });

    test('stopHider should disconnect observer and clear pending items', () => {
        window.FabContentModules.initializeHider();
        window.FabContentModules.stopHider();

        const card = document.createElement('div');
        card.className = 'nTa5u2sc';
        card.innerHTML = '<i class="fabkit-Icon--intent-success"></i>';
        document.body.appendChild(card);

        jest.advanceTimersByTime(2000);
        expect(card.style.display).not.toBe('none');
    });
});
