import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('xLocationUI.js', () => {
    beforeEach(() => {
        delete window.XLocationUI;
        document.body.innerHTML = '';

        const scriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xLocationUI.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        eval(scriptContent);
    });

    test('should render inline badge with country flag and device icon', () => {
        const container = document.createElement('div');
        const userHeader = document.createElement('div');
        const handleLink = document.createElement('a');
        handleLink.textContent = '@elonmusk';
        userHeader.appendChild(handleLink);
        container.appendChild(userHeader);
        document.body.appendChild(container);

        window.XLocationUI.renderInlineBadge(container, {
            screenName: 'elonmusk',
            location: 'Austin, Texas, USA',
            device: 'Twitter for iPhone'
        });

        const badge = container.querySelector('.x-location-inline-badge');
        expect(badge).not.toBeNull();

        const flag = badge.querySelector('.x-location-flag');
        expect(flag).not.toBeNull();
        expect(flag.innerHTML).toContain('abs-0.twimg.com/emoji/v2/svg');

        const device = badge.querySelector('.x-location-device-icon');
        expect(device).not.toBeNull();
        expect(device.title).toContain('Twitter for iPhone');
    });

    test('should fallback to globe icon for unknown locations', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        window.XLocationUI.renderInlineBadge(container, {
            screenName: 'unknownuser',
            location: 'Far Far Away Galaxy'
        });

        const flag = container.querySelector('.x-location-flag');
        expect(flag.innerHTML).toBe('🌐');
    });

    test('should not inject duplicate badge if already present', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        window.XLocationUI.renderInlineBadge(container, {
            screenName: 'testuser',
            location: 'Japan'
        });

        const badgesFirst = container.querySelectorAll('.x-location-inline-badge');
        expect(badgesFirst.length).toBe(1);

        window.XLocationUI.renderInlineBadge(container, {
            screenName: 'testuser',
            location: 'Japan'
        });

        const badgesSecond = container.querySelectorAll('.x-location-inline-badge');
        expect(badgesSecond.length).toBe(1);
    });

    test('showHovercard should render hovercard with user details', () => {
        const btn = document.createElement('button');
        document.body.appendChild(btn);

        window.XLocationUI.showHovercard(btn, {
            screenName: 'superstar',
            name: 'Super Star',
            location: 'Canada',
            device: 'Twitter Web App',
            meta: {
                restId: '987654321',
                createdAt: '2020-01-01T00:00:00Z'
            }
        });

        const hovercard = document.getElementById('x-location-hovercard-root');
        expect(hovercard).not.toBeNull();
        expect(hovercard.classList.contains('visible')).toBe(true);
        expect(hovercard.innerHTML).toContain('@superstar');
        expect(hovercard.innerHTML).toContain('987654321');
    });

    test('renderFriendSeenBadge should render green checkmark alongside location badge and standalone', () => {
        const container = document.createElement('div');
        const userHeader = document.createElement('div');
        const handleLink = document.createElement('a');
        handleLink.textContent = '@kyle';
        userHeader.appendChild(handleLink);
        container.appendChild(userHeader);
        document.body.appendChild(container);

        // 1. Render seen badge first (e.g., before location loads or when location is disabled)
        window.XLocationUI.renderFriendSeenBadge(container, 'kyle', ['friend1@test.com', 'friend2@test.com']);

        const seenBadge = container.querySelector('.x-friend-seen-badge');
        expect(seenBadge).not.toBeNull();
        expect(seenBadge.title).toBe('Seen by: friend1@test.com, friend2@test.com');
        expect(seenBadge.querySelector('svg')).not.toBeNull();

        // 2. Render location badge afterward -> should share the same .x-location-inline-badge container
        window.XLocationUI.renderInlineBadge(container, {
            screenName: 'kyle',
            location: 'United States',
            device: 'Twitter Web App'
        });

        const inlineBadges = container.querySelectorAll('.x-location-inline-badge');
        expect(inlineBadges.length).toBe(1);
        expect(inlineBadges[0].querySelector('.x-location-flag')).not.toBeNull();
        expect(inlineBadges[0].querySelector('.x-friend-seen-badge')).not.toBeNull();
    });
});
