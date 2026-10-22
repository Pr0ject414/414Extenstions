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

    test('filterTweet should replace tweet with "Tweet filtered" placeholder and allow showing the tweet', () => {
        const cellWrapper = document.createElement('div');
        const tweet = document.createElement('article');
        tweet.setAttribute('data-testid', 'tweet');
        tweet.textContent = 'Filtered tweet body content';
        cellWrapper.appendChild(tweet);
        document.body.appendChild(cellWrapper);

        const placeholder = window.XLocationUI.filterTweet(tweet, {
            reason: 'East Asia & Pacific',
            screenName: 'someuser',
            location: 'East Asia & Pacific',
            device: 'East Asia & Pacific App Store',
            tweetId: '111222333'
        });

        expect(placeholder).not.toBeNull();
        expect(tweet.style.display).toBe('none');
        expect(tweet.classList.contains('x-tweet-blocked')).toBe(true);
        expect(placeholder.classList.contains('x-tweet-filtered-placeholder')).toBe(true);
        expect(placeholder.textContent).toContain('Tweet filtered');
        expect(placeholder.textContent).toContain('@someuser');
        expect(placeholder.textContent).toContain('East Asia & Pacific');

        const showBtn = placeholder.querySelector('.x-tweet-filtered-show-btn');
        expect(showBtn).not.toBeNull();
        expect(showBtn.textContent).toBe('Show');

        // Click "Show" to reveal the filtered tweet
        showBtn.click();

        expect(tweet.style.display).toBe('');
        expect(tweet.classList.contains('x-tweet-blocked')).toBe(false);
        expect(cellWrapper.querySelector('.x-tweet-filtered-placeholder')).toBeNull();

        // Calling filterTweet again on the same revealed tweet should not re-hide it
        const secondAttempt = window.XLocationUI.filterTweet(tweet, {
            reason: 'East Asia & Pacific',
            screenName: 'someuser',
            tweetId: '111222333'
        });
        expect(secondAttempt).toBeNull();
        expect(tweet.style.display).toBe('');
    });

    test('xObserver should filter tweets matching blockedDeviceRegions or blockedCountries with Tweet filtered banner', async () => {
        jest.useFakeTimers();
        delete window.XObserverInjected;

        global.chrome = {
            runtime: {
                id: 'test-ext-id',
                lastError: null,
                onMessage: { addListener: jest.fn() },
                sendMessage: jest.fn((msg, cb) => {
                    if (msg.action === 'X_FETCH_USER_INFO') {
                        cb({
                            success: true,
                            data: {
                                screenName: 'regionuser',
                                location: 'East Asia & Pacific',
                                device: 'East Asia & Pacific App Store'
                            }
                        });
                    }
                })
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        cb({
                            isGlobalMasterSwitchEnabled: true,
                            isXModuleEnabled: true,
                            isXLocationEnabled: true,
                            isXFriendsSyncEnabled: false,
                            blockedCountries: [],
                            blockedDeviceRegions: ['East Asia & Pacific']
                        });
                    })
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        const cell = document.createElement('div');
        const tweet = document.createElement('article');
        tweet.setAttribute('data-testid', 'tweet');
        const userNameElem = document.createElement('div');
        userNameElem.setAttribute('data-testid', 'User-Name');
        userNameElem.textContent = '@regionuser';
        tweet.appendChild(userNameElem);
        cell.appendChild(tweet);
        document.body.appendChild(cell);

        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(200);

        expect(tweet.style.display).toBe('none');
        const placeholder = cell.querySelector('.x-tweet-filtered-placeholder');
        expect(placeholder).not.toBeNull();
        expect(placeholder.textContent).toContain('Tweet filtered');

        const showBtn = placeholder.querySelector('.x-tweet-filtered-show-btn');
        showBtn.click();
        expect(tweet.style.display).toBe('');
        expect(cell.querySelector('.x-tweet-filtered-placeholder')).toBeNull();

        jest.useRealTimers();
    });

    test('xObserver should keep quote tweet filtered when outer author is in blocked country (e.g. Pakistan) and quoted author is not blocked', () => {
        jest.useFakeTimers();
        delete window.XObserverInjected;

        global.chrome = {
            runtime: {
                id: 'test-ext-id',
                lastError: null,
                onMessage: { addListener: jest.fn() },
                sendMessage: jest.fn((msg, cb) => {
                    if (msg.action === 'X_FETCH_USER_INFO') {
                        if (msg.payload.screenName === 'mountain_lad_1') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'mountain_lad_1',
                                    location: 'Pakistan',
                                    device: 'Pakistan App Store'
                                }
                            });
                        } else if (msg.payload.screenName === 'seqCharm') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'seqCharm',
                                    location: '',
                                    device: 'Web'
                                }
                            });
                        }
                    }
                })
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        cb({
                            isGlobalMasterSwitchEnabled: true,
                            isXModuleEnabled: true,
                            isXLocationEnabled: true,
                            isXFriendsSyncEnabled: false,
                            blockedCountries: ['Pakistan'],
                            blockedDeviceRegions: []
                        });
                    })
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        const cell = document.createElement('div');
        const tweet = document.createElement('article');
        tweet.setAttribute('data-testid', 'tweet');

        // Outer tweet author header (@mountain_lad_1 in Pakistan)
        const outerUserElem = document.createElement('div');
        outerUserElem.setAttribute('data-testid', 'User-Name');
        outerUserElem.textContent = '@mountain_lad_1';
        tweet.appendChild(outerUserElem);

        // Quoted tweet author header inside the same article (@seqCharm, not blocked)
        const quoteWrapper = document.createElement('div');
        const quotedUserElem = document.createElement('div');
        quotedUserElem.setAttribute('data-testid', 'User-Name');
        quotedUserElem.textContent = '@seqCharm';
        quoteWrapper.appendChild(quotedUserElem);
        tweet.appendChild(quoteWrapper);

        cell.appendChild(tweet);
        document.body.appendChild(cell);

        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(200);

        expect(tweet.style.display).toBe('none');
        expect(tweet.classList.contains('x-tweet-blocked')).toBe(true);
        const placeholder = cell.querySelector('.x-tweet-filtered-placeholder');
        expect(placeholder).not.toBeNull();
        expect(placeholder.textContent).toContain('@mountain_lad_1');
        expect(placeholder.textContent).toContain('Pakistan');

        jest.useRealTimers();
    });

    test('xObserver should show outer tweet and only hide/replace the inner quoted tweet card when only the quoted author is in a blocked country', () => {
        jest.useFakeTimers();
        delete window.XObserverInjected;

        global.chrome = {
            runtime: {
                id: 'test-ext-id',
                lastError: null,
                onMessage: { addListener: jest.fn() },
                sendMessage: jest.fn((msg, cb) => {
                    if (msg.action === 'X_FETCH_USER_INFO') {
                        if (msg.payload.screenName === 'Glinner') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'Glinner',
                                    location: 'United States',
                                    device: 'United Kingdom App Store'
                                }
                            });
                        } else if (msg.payload.screenName === 'RenfailSoL') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'RenfailSoL',
                                    location: 'Mexico',
                                    device: 'Mexico Android App'
                                }
                            });
                        }
                    }
                })
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        cb({
                            isGlobalMasterSwitchEnabled: true,
                            isXModuleEnabled: true,
                            isXLocationEnabled: true,
                            isXFriendsSyncEnabled: false,
                            blockedCountries: ['Mexico'],
                            blockedDeviceRegions: []
                        });
                    })
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        const cell = document.createElement('div');
        const tweet = document.createElement('article');
        tweet.setAttribute('data-testid', 'tweet');

        // Outer tweet author header (@Glinner, United States - not blocked)
        const outerUserElem = document.createElement('div');
        outerUserElem.setAttribute('data-testid', 'User-Name');
        outerUserElem.textContent = '@Glinner';
        tweet.appendChild(outerUserElem);

        // Outer tweet text
        const outerText = document.createElement('div');
        outerText.setAttribute('data-testid', 'tweetText');
        outerText.textContent = "This is hilarious. 'Woke' didn't kill Bioware";
        tweet.appendChild(outerText);

        // Quoted tweet container matching X's DOM structure (div[role="link"] inside quote wrapper)
        const quoteOuterWrapper = document.createElement('div');
        const quoteCard = document.createElement('div');
        quoteCard.setAttribute('role', 'link');
        const quotedUserElem = document.createElement('div');
        quotedUserElem.setAttribute('data-testid', 'User-Name');
        quotedUserElem.textContent = '@RenfailSoL';
        quoteCard.appendChild(quotedUserElem);
        quoteOuterWrapper.appendChild(quoteCard);
        tweet.appendChild(quoteOuterWrapper);

        cell.appendChild(tweet);
        document.body.appendChild(cell);

        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(200);

        // Outer tweet remains visible
        expect(tweet.style.display).toBe('');
        expect(tweet.classList.contains('x-tweet-blocked')).toBe(false);

        // Inner quoted card is hidden and replaced with placeholder inside quoteOuterWrapper
        expect(quoteCard.style.display).toBe('none');
        expect(quoteCard.classList.contains('x-tweet-blocked')).toBe(true);

        const placeholder = quoteOuterWrapper.querySelector('.x-tweet-filtered-placeholder');
        expect(placeholder).not.toBeNull();
        expect(placeholder.textContent).toContain('@RenfailSoL');
        expect(placeholder.textContent).toContain('Mexico');

        // Clicking "Show" on the inner placeholder reveals the quoted tweet card
        const showBtn = placeholder.querySelector('.x-tweet-filtered-show-btn');
        showBtn.click();
        expect(quoteCard.style.display).toBe('');
        expect(quoteCard.classList.contains('x-tweet-blocked')).toBe(false);
        expect(quoteOuterWrapper.querySelector('.x-tweet-filtered-placeholder')).toBeNull();

        jest.useRealTimers();
    });
});
