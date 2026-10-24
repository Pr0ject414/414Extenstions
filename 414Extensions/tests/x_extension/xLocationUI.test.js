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

        delete window.XObserverInjected;
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

        delete window.XObserverInjected;
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

        delete window.XObserverInjected;
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

    test('xObserver should filter tweets by Display Name Flags (e.g. Transgender Flag or Russian Flag in name) even when account location is United States, while ignoring injected location badge flags', () => {
        jest.useFakeTimers();
        delete window.XObserverInjected;

        global.chrome = {
            runtime: {
                id: 'test-ext-id',
                lastError: null,
                onMessage: { addListener: jest.fn() },
                sendMessage: jest.fn((msg, cb) => {
                    if (msg.action === 'X_FETCH_USER_INFO') {
                        if (msg.payload.screenName === 'transflag_user') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'transflag_user',
                                    location: 'United States',
                                    device: 'United States App Store'
                                }
                            });
                        } else if (msg.payload.screenName === 'ruflag_in_us') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'ruflag_in_us',
                                    location: 'United States',
                                    device: 'Web'
                                }
                            });
                        } else if (msg.payload.screenName === 'actual_russian_no_name_flag') {
                            cb({
                                success: true,
                                data: {
                                    screenName: 'actual_russian_no_name_flag',
                                    location: 'Russia',
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
                            blockedCountries: [], // Russia is NOT blocked by origin country
                            blockedDeviceRegions: [],
                            blockedNameFlags: ['Transgender Flag', 'Russia']
                        });
                    })
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        // Tweet 1: US user with Twemoji Transgender Flag <img> in display name -> should be filtered
        const cell1 = document.createElement('div');
        const tweet1 = document.createElement('article');
        tweet1.setAttribute('data-testid', 'tweet');
        const header1 = document.createElement('div');
        header1.setAttribute('data-testid', 'User-Name');
        const nameSpan1 = document.createElement('span');
        nameSpan1.textContent = 'Alex ';
        const flagImg1 = document.createElement('img');
        flagImg1.setAttribute('alt', '🏳️‍⚧️');
        nameSpan1.appendChild(flagImg1);
        const handle1 = document.createElement('span');
        handle1.textContent = ' @transflag_user';
        header1.appendChild(nameSpan1);
        header1.appendChild(handle1);
        tweet1.appendChild(header1);
        cell1.appendChild(tweet1);
        document.body.appendChild(cell1);

        // Tweet 2: US user with Russian Flag 🇷🇺 in display name -> should be filtered
        const cell2 = document.createElement('div');
        const tweet2 = document.createElement('article');
        tweet2.setAttribute('data-testid', 'tweet');
        const header2 = document.createElement('div');
        header2.setAttribute('data-testid', 'User-Name');
        const flagImg2 = document.createElement('img');
        flagImg2.setAttribute('alt', '🇷🇺');
        header2.appendChild(flagImg2);
        const handle2 = document.createElement('span');
        handle2.textContent = ' @ruflag_in_us';
        header2.appendChild(handle2);
        tweet2.appendChild(header2);
        cell2.appendChild(tweet2);
        document.body.appendChild(cell2);

        // Tweet 3: User located in Russia (so our badge injects <img alt="🇷🇺"> inside .x-location-inline-badge),
        // but NO Russian flag in their display name, and Russia is NOT in blockedCountries -> should NOT be filtered
        const cell3 = document.createElement('div');
        const tweet3 = document.createElement('article');
        tweet3.setAttribute('data-testid', 'tweet');
        const header3 = document.createElement('div');
        header3.setAttribute('data-testid', 'User-Name');
        header3.textContent = 'Ivan @actual_russian_no_name_flag';
        tweet3.appendChild(header3);
        cell3.appendChild(tweet3);
        document.body.appendChild(cell3);

        delete window.XObserverInjected;
        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(200);

        expect(tweet1.style.display).toBe('none');
        expect(cell1.querySelector('.x-tweet-filtered-placeholder').textContent).toContain('Name Flag: 🏳️‍⚧️ Transgender Flag');

        expect(tweet2.style.display).toBe('none');
        expect(cell2.querySelector('.x-tweet-filtered-placeholder').textContent).toContain('Name Flag: 🇷🇺 Russia');

        expect(tweet3.style.display).toBe('');
        expect(cell3.querySelector('.x-tweet-filtered-placeholder')).toBeNull();

        jest.useRealTimers();
    });

    test('renderForceTweetButton should inject action bar button and toggle forced state on click', () => {
        const article = document.createElement('article');
        article.setAttribute('data-testid', 'tweet');
        const actionBar = document.createElement('div');
        actionBar.setAttribute('role', 'group');
        article.appendChild(actionBar);
        document.body.appendChild(article);

        const onToggle = jest.fn();
        const btn = window.XLocationUI.renderForceTweetButton(
            article,
            '1850000000000000777',
            { forcedByMe: false, forcedByFriends: ['Bob (bob@example.com)'] },
            onToggle
        );

        expect(btn).not.toBeNull();
        expect(btn.classList.contains('is-forced')).toBe(false);
        expect(btn.classList.contains('is-friend-forced')).toBe(true);
        expect(btn.title).toContain('Forced by Bob');

        // Click to force to friends
        btn.click();
        expect(btn.classList.contains('is-forced')).toBe(true);
        expect(onToggle).toHaveBeenCalledWith('1850000000000000777', true, article);

        // Click again to unforce
        btn.click();
        expect(btn.classList.contains('is-forced')).toBe(false);
        expect(onToggle).toHaveBeenCalledWith('1850000000000000777', false, article);
    });

    test('ensureFriendsTimelineTab and renderFriendsTimeline should inject Friends tab and render seen & forced posts', () => {
        const tabList = document.createElement('div');
        tabList.setAttribute('role', 'tablist');
        const forYouTab = document.createElement('a');
        forYouTab.setAttribute('role', 'tab');
        forYouTab.textContent = 'For you';
        const followingTab = document.createElement('a');
        followingTab.setAttribute('role', 'tab');
        followingTab.textContent = 'Following';
        tabList.appendChild(forYouTab);
        tabList.appendChild(followingTab);
        document.body.appendChild(tabList);

        const host = document.createElement('div');
        document.body.appendChild(host);

        const sampleData = {
            timelinePosts: [
                {
                    tweetId: '1850000000000000888',
                    isForced: true,
                    forcedBy: ['Alice (alice@example.com)'],
                    seenBy: ['Alice (alice@example.com)'],
                    forcedByMe: false,
                    isSeenByMe: false,
                    meta: {
                        screenName: 'openai',
                        authorName: 'OpenAI',
                        text: 'Forced announcement post!'
                    }
                },
                {
                    tweetId: '1850000000000000889',
                    isForced: false,
                    forcedBy: [],
                    seenBy: ['Bob (bob@example.com)'],
                    forcedByMe: false,
                    isSeenByMe: true,
                    meta: {
                        screenName: 'github',
                        authorName: 'GitHub',
                        text: 'Normal post seen by Bob.'
                    }
                }
            ],
            unseenForcedPosts: [{ tweetId: '1850000000000000888' }],
            connectedFriends: [
                { email: 'alice@example.com', displayName: 'Alice', label: 'Alice (alice@example.com)' },
                { email: 'bob@example.com', displayName: 'Bob', label: 'Bob (bob@example.com)' }
            ]
        };

        const onSelectFriendsTab = jest.fn();
        const friendsTab = window.XLocationUI.ensureFriendsTimelineTab(tabList, sampleData, { onSelectFriendsTab });
        expect(friendsTab).not.toBeNull();
        expect(friendsTab.textContent).toContain('Friends');
        expect(friendsTab.querySelector('.x-friends-tab-badge').textContent).toBe('1');

        // Click Friends tab
        friendsTab.click();
        expect(window.XLocationUI.isFriendsTimelineTabSelected()).toBe(true);
        expect(onSelectFriendsTab).toHaveBeenCalledWith(true);

        // Render timeline
        const root = window.XLocationUI.renderFriendsTimeline(host, sampleData, {});
        const cards = root.querySelectorAll('.x-friend-tweet-card');
        expect(cards.length).toBe(2);
        expect(cards[0].textContent).toContain('Forced by Alice');
        expect(cards[0].textContent).toContain('Forced announcement post!');
        expect(cards[1].textContent).toContain('Seen by Bob');

        // Click "Forced" filter pill
        const forcedFilterBtn = root.querySelector('[data-filter="forced"]');
        forcedFilterBtn.click();
        expect(root.querySelectorAll('.x-friend-tweet-card').length).toBe(1);

        // Click native "For you" tab -> should deselect Friends tab
        forYouTab.click();
        expect(window.XLocationUI.isFriendsTimelineTabSelected()).toBe(false);
        expect(onSelectFriendsTab).toHaveBeenCalledWith(false);
    });

    test('ensureFriendsTimelineTab should insert Friends tab right after Following in X ScrollSnap-List DOM', () => {
        document.body.innerHTML = `<div role="tablist" class="css-g5y9jx r-18u37iz r-16y2uox r-1wbh5a2 r-tzz3ar r-1pi2tsx r-buy8e9 r-mfh4gg r-2eszeu r-10m9thr r-lltvgl r-o2224p" data-testid="ScrollSnap-List" style="scroll-padding: 0px 36px;"><div role="presentation" class="css-g5y9jx r-14tvyh0 r-cpa5s6 r-16y2uox"><div role="tab" aria-selected="true" tabindex="0" class="css-g5y9jx r-1awozwy r-6koalj r-eqz5dr r-16y2uox r-1h3ijdo r-17s6mgv r-s8bhmr r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l"><div class="css-g5y9jx"><div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-1pi2tsx r-1777fci r-1l7z4oj r-95jzfe r-bnwqim" style="color: rgb(231, 233, 234);"><span class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">For you</span><div class="css-g5y9jx r-xoduu5 r-1kihuf0 r-sdzlij r-1p0dtai r-hdaws3 r-s8bhmr r-u8s1d r-13qz1uu" style="background-color: rgb(29, 155, 240);"></div></div></div></div></div><div role="presentation" class="css-g5y9jx r-14tvyh0 r-cpa5s6 r-16y2uox"><div role="tab" aria-selected="false" tabindex="-1" class="css-g5y9jx r-1awozwy r-6koalj r-eqz5dr r-16y2uox r-1h3ijdo r-17s6mgv r-s8bhmr r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l"><div class="css-g5y9jx"><div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-majxgm r-1awozwy r-6koalj r-18u37iz r-1pi2tsx r-1777fci r-1l7z4oj r-95jzfe r-bnwqim" style="color: rgb(113, 118, 123);"><span class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">Following</span><div class="css-g5y9jx r-xoduu5"></div></div></div></div></div><div role="presentation" class="css-g5y9jx r-14tvyh0 r-cpa5s6 r-16y2uox"><div role="tab" aria-selected="false" tabindex="-1" class="css-g5y9jx r-1awozwy r-6koalj r-eqz5dr r-16y2uox r-1h3ijdo r-17s6mgv r-s8bhmr r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l"><div class="css-g5y9jx"><div dir="ltr" class="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-majxgm r-1awozwy r-6koalj r-18u37iz r-1pi2tsx r-1777fci r-1l7z4oj r-95jzfe r-bnwqim" style="color: rgb(113, 118, 123);"><span class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">NFL</span><div class="css-g5y9jx r-xoduu5"></div></div></div></div></div></div>`;

        const tabList = document.querySelector('[role="tablist"]');
        const friendsTab = window.XLocationUI.ensureFriendsTimelineTab(tabList, {}, {});
        expect(friendsTab).not.toBeNull();

        const presentations = Array.from(tabList.querySelectorAll(':scope > [role="presentation"]'));
        expect(presentations.length).toBe(4);
        expect(presentations[0].textContent).toContain('For you');
        expect(presentations[1].textContent).toContain('Following');
        expect(presentations[2].textContent).toContain('Friends');
        expect(presentations[3].textContent).toContain('NFL');
        expect(presentations[2].className).toContain('r-14tvyh0');
    });

    test('renderForcedPostsInHomeFeed should inject unseen forced posts at top of Home feed and allow dismissing', () => {
        const homeFeed = document.createElement('section');
        const existingTweet = document.createElement('article');
        existingTweet.textContent = 'Native timeline tweet';
        homeFeed.appendChild(existingTweet);
        document.body.appendChild(homeFeed);

        const onDismissForced = jest.fn();
        const container = window.XLocationUI.renderForcedPostsInHomeFeed(
            homeFeed,
            [
                {
                    tweetId: '1850000000000000700',
                    forcedBy: ['Alice (alice@example.com)'],
                    seenBy: ['Alice (alice@example.com)'],
                    meta: {
                        screenName: 'nasa',
                        authorName: 'NASA',
                        text: 'Check out this rocket launch!'
                    }
                }
            ],
            { onDismissForced }
        );

        expect(container).not.toBeNull();
        expect(homeFeed.firstChild).toBe(container);
        expect(container.textContent).toContain('Forced to Your Timeline by Friends (1)');
        expect(container.textContent).toContain('Check out this rocket launch!');

        const dismissBtn = container.querySelector('.x-forced-dismiss-btn');
        dismissBtn.click();
        expect(onDismissForced).toHaveBeenCalledWith('1850000000000000700');
        expect(homeFeed.querySelector('#x-forced-home-feed')).toBeNull();
    });

    test('renderFriendsTimeline should paginate posts (20 per page), request hydration for unhydrated bare IDs, and upgrade cards to playable video posts', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);

        // Reset filter to 'all'
        const manyPosts = Array.from({ length: 25 }, (_, idx) => ({
            tweetId: String(1850000000000001000n + BigInt(idx)),
            isForced: false,
            forcedBy: [],
            seenBy: ['morgkorg'],
            forcedByMe: false,
            isSeenByMe: false,
            meta: null
        }));

        const onHydrateTweets = jest.fn();
        const root = window.XLocationUI.renderFriendsTimeline(host, {
            timelinePosts: manyPosts,
            unseenForcedPosts: [],
            connectedFriends: [{ email: 'morgkorg', displayName: 'morgkorg', label: 'morgkorg' }]
        }, { onHydrateTweets });

        // Make sure 'all' filter is selected
        const allFilterBtn = root.querySelector('[data-filter="all"]');
        if (allFilterBtn && !allFilterBtn.classList.contains('is-active')) {
            allFilterBtn.click();
        }

        // Only 20 posts rendered on first page + "Show more posts (5 remaining)" button
        expect(root.querySelectorAll('article.x-friend-tweet-card').length).toBe(20);
        const loadMoreBtn = root.querySelector('.x-friends-load-more-btn');
        expect(loadMoreBtn).not.toBeNull();
        expect(loadMoreBtn.textContent).toContain('5 remaining');

        // Should have requested hydration for the first 20 unhydrated IDs
        expect(onHydrateTweets).toHaveBeenCalled();
        const firstId = manyPosts[0].tweetId;
        expect(onHydrateTweets.mock.calls[0][0]).toContain(firstId);

        // No manual "Mark Seen" or "Open Post" pill buttons should exist
        expect(root.querySelector('.x-friend-card-seen-btn')).toBeNull();
        expect(root.querySelector('.x-friend-card-open-link')).toBeNull();

        // Hydrate the first card with playable video and parent reply
        window.XLocationUI.updateHydratedCardsInDOM({
            [firstId]: {
                id: firstId,
                screenName: 'morg_author',
                authorName: 'Morg Author',
                isVerified: true,
                text: 'Real hydrated post with video!',
                isHydrated: true,
                favoriteCount: 2500,
                replyCount: 42,
                media: [
                    {
                        type: 'video',
                        posterUrl: 'https://pbs.twimg.com/thumb.jpg',
                        videoUrl: 'https://video.twimg.com/clip.mp4'
                    }
                ],
                parentTweet: {
                    id: '1850000000000000001',
                    screenName: 'parent_user',
                    authorName: 'Parent User',
                    text: 'Replying to this parent post'
                }
            }
        });

        const updatedCard = root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${firstId}"]`);
        expect(updatedCard).not.toBeNull();
        expect(updatedCard.getAttribute('data-testid')).toBe('tweet');
        expect(updatedCard.textContent).toContain('Real hydrated post with video!');
        expect(updatedCard.textContent).toContain('Replying to this parent post');

        const videoEl = updatedCard.querySelector('video.x-friend-card-video');
        expect(videoEl).not.toBeNull();
        expect(videoEl.src).toBe('https://video.twimg.com/clip.mp4');

        // Automatic seen marking updates the card in-place
        window.XLocationUI.markCardSeenInDOM(firstId);
        expect(updatedCard.classList.contains('is-seen-by-me')).toBe(true);
        const mySeenPill = updatedCard.querySelector('[data-testid="x-card-my-seen"]');
        expect(mySeenPill.style.display).toBe('');
    });

    test('createFriendTweetCard should render authentic Quote Retweets, strip self-quote URLs, deduplicate quote media, and request hydration when quote metadata is incomplete', () => {
        const card = window.XLocationUI.createFriendTweetCard({
            tweetId: '1850000000000009001',
            seenBy: ['Alice'],
            forcedBy: [],
            forcedByMe: false,
            isSeenByMe: false,
            meta: {
                id: '1850000000000009001',
                screenName: 'outer_author',
                authorName: 'Outer Author',
                avatarUrl: 'https://pbs.twimg.com/profile_images/outer.jpg',
                isVerified: true,
                text: 'Wild quote post here https://x.com/quoted_user/status/1850000000000008000 https://t.co/abc123xyz',
                isHydrated: true,
                hydrationVersion: 1, // v1 should trigger re-hydration for quote post
                media: [
                    { type: 'photo', url: 'https://pbs.twimg.com/media/quote_photo.jpg' }
                ],
                quotedTweet: {
                    id: '1850000000000008000',
                    screenName: 'quoted_user',
                    authorName: 'Quoted User',
                    avatarUrl: 'https://pbs.twimg.com/profile_images/quoted.jpg',
                    isVerified: true,
                    createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
                    text: 'Original quoted post content',
                    media: [
                        { type: 'photo', url: 'https://pbs.twimg.com/media/quote_photo.jpg' }
                    ]
                }
            }
        });

        // Should flag needs-hydration because hydrationVersion !== 2 on a quote post
        expect(card.getAttribute('data-needs-hydration')).toBe('true');

        // Outer body text should have stripped both the self-quote status URL and trailing t.co link
        const outerBody = card.querySelector('.x-friend-card-body');
        expect(outerBody).not.toBeNull();
        expect(outerBody.textContent).toBe('Wild quote post here');

        // Duplicated quote photo should only appear inside the quote card, not in outer media
        const allMediaGrids = card.querySelectorAll('.x-friend-card-media-grid');
        expect(allMediaGrids.length).toBe(1);
        expect(allMediaGrids[0].classList.contains('x-friend-card-quote-media')).toBe(true);

        // Quoted tweet card structure
        const quoteBox = card.querySelector('.x-friend-card-quote');
        expect(quoteBox).not.toBeNull();
        const quoteHeader = quoteBox.querySelector('.x-friend-card-quote-header');
        expect(quoteHeader.querySelector('[data-testid="User-Name"]')).not.toBeNull();
        expect(quoteHeader.querySelector('.x-friend-card-quote-avatar').src).toContain('quoted.jpg');
        expect(quoteHeader.querySelector('.x-friend-card-quote-author').textContent).toBe('Quoted User');
        expect(quoteHeader.querySelector('.x-friend-card-quote-handle').textContent).toBe('@quoted_user');
        expect(quoteHeader.querySelector('.x-friend-card-quote-time').textContent).toContain('1h');
        expect(quoteBox.querySelector('.x-friend-card-quote-text').textContent).toBe('Original quoted post content');
    });

    test('seen posts should stay on screen when dwell time passes and only be removed after scrolling past (rect.bottom <= 0)', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);

        const postA = {
            tweetId: '1850000000000009101',
            isForced: false,
            forcedBy: [],
            seenBy: ['Alice'],
            forcedByMe: false,
            isSeenByMe: false,
            meta: {
                id: '1850000000000009101',
                screenName: 'user_a',
                authorName: 'User A',
                text: 'First post on screen',
                isHydrated: true,
                hydrationVersion: 2
            }
        };
        const postB = {
            tweetId: '1850000000000009102',
            isForced: false,
            forcedBy: [],
            seenBy: ['Alice'],
            forcedByMe: false,
            isSeenByMe: false,
            meta: {
                id: '1850000000000009102',
                screenName: 'user_b',
                authorName: 'User B',
                text: 'Second post on screen',
                isHydrated: true,
                hydrationVersion: 2
            }
        };

        const timelineData = {
            timelinePosts: [postA, postB],
            unseenForcedPosts: [],
            connectedFriends: [{ email: 'alice@example.com', displayName: 'Alice', label: 'Alice' }]
        };

        const root = window.XLocationUI.renderFriendsTimeline(host, timelineData, {});
        // Switch to 'unseen' filter to verify even in Unseen filter, dwell-seen posts are NOT removed while still on screen
        const unseenFilterBtn = root.querySelector('[data-filter="unseen"]');
        unseenFilterBtn.click();

        let cardA = root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${postA.tweetId}"]`);
        expect(cardA).not.toBeNull();

        // Simulate cardA being on-screen (rect.top = 120, rect.bottom = 340, rect.height = 220)
        cardA.getBoundingClientRect = () => ({
            top: 120,
            bottom: 340,
            left: 0,
            right: 600,
            width: 600,
            height: 220
        });

        // Dwell time passes -> mark cardA as seen
        postA.isSeenByMe = true;
        window.XLocationUI.markCardSeenInDOM(postA.tweetId);

        // Even if syncFriendsTimelineUI re-renders the timeline, cardA MUST stay in the DOM while on screen
        window.XLocationUI.renderFriendsTimeline(host, timelineData, {});
        cardA = root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${postA.tweetId}"]`);
        expect(cardA).not.toBeNull();
        expect(cardA.classList.contains('is-seen-by-me')).toBe(true);

        // Calling removeSeenCardsScrolledPast while cardA is still on screen (bottom = 340 > 0) does NOT remove it
        cardA.getBoundingClientRect = () => ({
            top: 120,
            bottom: 340,
            left: 0,
            right: 600,
            width: 600,
            height: 220
        });
        expect(window.XLocationUI.removeSeenCardsScrolledPast()).toBe(0);
        expect(root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${postA.tweetId}"]`)).not.toBeNull();

        // Now user scrolls down past cardA (rect.bottom = -15 <= 0, height = 220)
        window.scrollBy = jest.fn();
        cardA.getBoundingClientRect = () => ({
            top: -235,
            bottom: -15,
            left: 0,
            right: 600,
            width: 600,
            height: 220
        });

        const cardBRefBefore = root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${postB.tweetId}"]`);
        expect(cardBRefBefore).not.toBeNull();

        expect(window.XLocationUI.removeSeenCardsScrolledPast()).toBe(1);
        expect(root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${postA.tweetId}"]`)).toBeNull();
        expect(window.scrollBy).toHaveBeenCalledWith(0, -220);

        // Even when renderFriendsTimeline is called again after removal, Post B's DOM node is NEVER recreated
        window.XLocationUI.renderFriendsTimeline(host, timelineData, {});
        const cardBRefAfter = root.querySelector(`article.x-friend-tweet-card[data-tweet-id="${postB.tweetId}"]`);
        expect(cardBRefAfter).toBe(cardBRefBefore);
    });

    test('createFriendTweetCard should render For You quote layout, deduplicate DOM vs Syndication media URLs, and place Force button left of Bookmark', () => {
        const card = window.XLocationUI.createFriendTweetCard({
            tweetId: '2113383149011140730',
            seenBy: ['Alice'],
            forcedBy: [],
            forcedByMe: false,
            isSeenByMe: false,
            meta: {
                id: '2113383149011140730',
                screenName: 'MKBHD',
                authorName: 'Marques Brownlee',
                avatarUrl: 'https://pbs.twimg.com/profile_images/1990855181785759745/CP3H7WsL_bigger.jpg',
                isVerified: true,
                text: 'Honestly the resemblance is uncanny',
                // Unhydrated DOM format URL that matches the quote tweet's Syndication media asset ID
                media: [
                    { type: 'photo', url: 'https://pbs.twimg.com/media/HVO5iJBWsAA5wrD?format=jpg&name=900x900' }
                ],
                quotedTweet: {
                    id: '2113278199459455320',
                    screenName: 'zachblank',
                    authorName: 'Zach Blank',
                    avatarUrl: 'https://pbs.twimg.com/profile_images/2018873530486480896/m1GPH5yK_bigger.jpg',
                    isVerified: true,
                    createdAt: '2026-04-20T18:00:00.000Z',
                    text: 'Saw @MKBHD at the airport today',
                    media: [
                        { type: 'photo', url: 'https://pbs.twimg.com/media/HVO5iJBWsAA5wrD.jpg' }
                    ]
                },
                isHydrated: true,
                hydrationVersion: 3
            }
        });
        document.body.appendChild(card);

        // 1. Outer tweet should NOT duplicate the quote tweet's photo even when URL query format differs
        const allMediaGrids = card.querySelectorAll('.x-friend-card-media-grid');
        expect(allMediaGrids.length).toBe(1);
        expect(allMediaGrids[0].classList.contains('x-friend-card-quote-media')).toBe(true);

        // 2. Quote card header has 24x24 Tweet-User-Avatar sibling before User-Name
        const quoteBox = card.querySelector('.x-friend-card-quote');
        expect(quoteBox).not.toBeNull();
        const qAvatarWrap = quoteBox.querySelector('[data-testid="Tweet-User-Avatar"]');
        const qUserMeta = quoteBox.querySelector('[data-testid="User-Name"]');
        expect(qAvatarWrap).not.toBeNull();
        expect(qUserMeta).not.toBeNull();
        expect(qAvatarWrap.nextSibling).toBe(qUserMeta);

        // 3. Inline location badge rendered on quote User-Name stays INSIDE qUserMeta right after @zachblank
        window.XLocationUI.renderInlineBadge(qUserMeta, {
            screenName: 'zachblank',
            location: 'United States',
            device: 'United States App Store'
        });
        const inlineBadge = qUserMeta.querySelector('.x-location-inline-badge');
        expect(inlineBadge).not.toBeNull();

        // 4. Force button wrap is positioned immediately to the left of the Bookmark button in footer[role="group"]
        const footer = card.querySelector('div[role="group"]');
        const forceWrap = footer.querySelector('.x-force-friend-btn-wrap');
        const bookmarkBtn = footer.querySelector('[data-testid="bookmark"]');
        expect(forceWrap).not.toBeNull();
        expect(bookmarkBtn).not.toBeNull();
        expect(forceWrap.nextSibling).toBe(bookmarkBtn);
    });

    test('createFriendTweetCard should render parentTweet in bottom .x-friend-card-quote box, strip leading @mention, and show Replying to @handle', () => {
        const replyCard = window.XLocationUI.createFriendTweetCard({
            tweetId: '2113364772632838435',
            seenBy: ['morgkorg'],
            forcedBy: [],
            forcedByMe: false,
            isSeenByMe: true,
            meta: {
                id: '2113364772632838435',
                screenName: 'printpaint6',
                authorName: 'Jcheezer',
                avatarUrl: 'https://pbs.twimg.com/profile_images/2065072534270193664/_2gSIOgj_bigger.jpg',
                isVerified: true,
                inReplyToScreenName: 'InsiderWire',
                text: '@InsiderWire',
                media: [
                    { type: 'photo', url: 'https://pbs.twimg.com/media/HVQGBj3XUAAuLTs.jpg' }
                ],
                parentTweet: {
                    id: '2113351340177154267',
                    screenName: 'InsiderWire',
                    authorName: 'Insider Wire',
                    avatarUrl: 'https://pbs.twimg.com/profile_images/2004360023804096512/NSyJqypN_bigger.jpg',
                    isVerified: true,
                    createdAt: '2026-04-20T16:00:00.000Z',
                    inReplyToScreenName: 'RepNancyMace',
                    text: "#BREAKING: Ilhan Omar's real name is Ilhan Nur Said Elmi, the same surname as her ex-husband."
                },
                isHydrated: true,
                hydrationVersion: 4
            }
        });
        document.body.appendChild(replyCard);

        // Should NOT render top .x-friend-card-parent box
        expect(replyCard.querySelector('.x-friend-card-parent')).toBeNull();

        // Outer body text should strip the bare "@InsiderWire" reply prefix so no redundant "@InsiderWire" body is shown
        expect(replyCard.querySelector('.x-friend-card-body')).toBeNull();

        // Parent tweet should be rendered in the bottom .x-friend-card-quote box inside .x-friend-card-right
        const quoteBox = replyCard.querySelector('.x-friend-card-right .x-friend-card-quote');
        expect(quoteBox).not.toBeNull();
        expect(quoteBox.querySelector('.x-friend-card-quote-author').textContent).toBe('Insider Wire');
        expect(quoteBox.querySelector('.x-friend-card-quote-handle').textContent).toBe('@InsiderWire');
        expect(quoteBox.querySelector('[data-testid="icon-verified"]')).not.toBeNull();
        expect(quoteBox.querySelector('.x-friend-card-quote-replying').textContent).toBe('Replying to @RepNancyMace');
        expect(quoteBox.querySelector('.x-friend-card-quote-text').textContent).toContain("Ilhan Omar's real name");
    });

    test('clicking Home link (AppTabBar_Home_Link) while on Friends tab should switch back to For you tab and deactivate Friends', () => {
        const tabList = document.createElement('div');
        tabList.setAttribute('role', 'tablist');

        const forYouTab = document.createElement('div');
        forYouTab.setAttribute('role', 'tab');
        forYouTab.setAttribute('aria-selected', 'false');
        forYouTab.textContent = 'For you';
        const forYouClickSpy = jest.fn(() => {
            forYouTab.setAttribute('aria-selected', 'true');
        });
        forYouTab.addEventListener('click', forYouClickSpy);

        const followingTab = document.createElement('div');
        followingTab.setAttribute('role', 'tab');
        followingTab.setAttribute('aria-selected', 'true');
        followingTab.textContent = 'Following';

        tabList.appendChild(forYouTab);
        tabList.appendChild(followingTab);
        document.body.appendChild(tabList);

        const homeNavLink = document.createElement('a');
        homeNavLink.setAttribute('data-testid', 'AppTabBar_Home_Link');
        homeNavLink.setAttribute('href', '/home');
        document.body.appendChild(homeNavLink);

        const onSelectFriendsTab = jest.fn();
        const friendsTab = window.XLocationUI.ensureFriendsTimelineTab(tabList, {}, { onSelectFriendsTab });

        // Activate Friends tab
        friendsTab.click();
        expect(window.XLocationUI.isFriendsTimelineTabSelected()).toBe(true);
        expect(friendsTab.classList.contains('is-active')).toBe(true);

        // Click Home button in navigation bar
        homeNavLink.click();
        expect(window.XLocationUI.isFriendsTimelineTabSelected()).toBe(false);
        expect(friendsTab.classList.contains('is-active')).toBe(false);
        expect(forYouClickSpy).toHaveBeenCalled();
        expect(onSelectFriendsTab).toHaveBeenLastCalledWith(false);
    });

    test('xObserver syncFriendsTimelineUI should toggle .x-native-feed-hidden instead of display:none when switching between Friends and For you tabs', () => {
        jest.useFakeTimers();

        global.chrome = {
            runtime: {
                id: 'test-extension-id',
                lastError: null,
                sendMessage: jest.fn((msg, cb) => {
                    if (msg.action === 'X_GET_FRIENDS_TIMELINE' && cb) {
                        cb({
                            success: true,
                            timelinePosts: [],
                            unseenForcedPosts: [],
                            connectedFriends: []
                        });
                    } else if (cb) {
                        cb({ success: true });
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
                            isXFriendsSyncEnabled: true,
                            blockedCountries: [],
                            blockedDeviceRegions: [],
                            blockedNameFlags: []
                        });
                    })
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        const tabList = document.createElement('div');
        tabList.setAttribute('role', 'tablist');
        const forYouTab = document.createElement('div');
        forYouTab.setAttribute('role', 'tab');
        forYouTab.textContent = 'For you';
        tabList.appendChild(forYouTab);
        document.body.appendChild(tabList);

        const primaryCol = document.createElement('div');
        primaryCol.setAttribute('data-testid', 'primaryColumn');
        const nativeFeed = document.createElement('section');
        nativeFeed.setAttribute('role', 'region');
        primaryCol.appendChild(nativeFeed);
        document.body.appendChild(primaryCol);

        delete window.XObserverInjected;
        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(300);

        const friendsTab = tabList.querySelector('.x-friends-timeline-tab');
        expect(friendsTab).not.toBeNull();

        // Click Friends tab -> nativeFeed should get .x-native-feed-hidden and NOT display:none
        friendsTab.click();
        expect(nativeFeed.classList.contains('x-native-feed-hidden')).toBe(true);
        expect(nativeFeed.style.display).toBe('');

        // Click For you tab -> .x-native-feed-hidden removed
        forYouTab.click();
        expect(nativeFeed.classList.contains('x-native-feed-hidden')).toBe(false);
        expect(nativeFeed.style.display).toBe('');

        jest.useRealTimers();
    });

    test('videos in Friends timeline should autoplay muted when in viewport and pause when scrolled away or tab is deactivated', () => {
        window.innerHeight = 800;
        window.XLocationUI.setFriendsTimelineTabSelected(true);

        const host = document.createElement('div');
        document.body.appendChild(host);

        const root = window.XLocationUI.renderFriendsTimeline(host, {
            timelinePosts: [
                {
                    tweetId: '2113400000000000001',
                    seenBy: ['Alice'],
                    forcedBy: [],
                    forcedByMe: false,
                    isSeenByMe: false,
                    meta: {
                        id: '2113400000000000001',
                        screenName: 'viduser1',
                        authorName: 'Video One',
                        text: 'First video post',
                        media: [
                            { type: 'video', url: 'https://pbs.twimg.com/poster1.jpg', videoUrl: 'https://video.twimg.com/v1.mp4' }
                        ],
                        isHydrated: true,
                        hydrationVersion: 4
                    }
                },
                {
                    tweetId: '2113400000000000002',
                    seenBy: ['Alice'],
                    forcedBy: [],
                    forcedByMe: false,
                    isSeenByMe: false,
                    meta: {
                        id: '2113400000000000002',
                        screenName: 'viduser2',
                        authorName: 'Video Two',
                        text: 'Second video post',
                        media: [
                            { type: 'video', url: 'https://pbs.twimg.com/poster2.jpg', videoUrl: 'https://video.twimg.com/v2.mp4' }
                        ],
                        isHydrated: true,
                        hydrationVersion: 4
                    }
                }
            ],
            unseenForcedPosts: [],
            connectedFriends: []
        });

        const videos = root.querySelectorAll('video.x-friend-card-video');
        expect(videos.length).toBe(2);
        const [v1, v2] = videos;

        expect(v1.muted).toBe(true);
        expect(v1.loop).toBe(true);

        let v1Paused = true;
        let v2Paused = true;
        Object.defineProperty(v1, 'paused', { get: () => v1Paused, configurable: true });
        Object.defineProperty(v2, 'paused', { get: () => v2Paused, configurable: true });
        v1.play = jest.fn(() => { v1Paused = false; return Promise.resolve(); });
        v1.pause = jest.fn(() => { v1Paused = true; });
        v2.play = jest.fn(() => { v2Paused = false; return Promise.resolve(); });
        v2.pause = jest.fn(() => { v2Paused = true; });

        // v1 is 100% visible in viewport, v2 is below viewport
        v1.getBoundingClientRect = () => ({ top: 150, bottom: 450, left: 0, right: 500, width: 500, height: 300 });
        v2.getBoundingClientRect = () => ({ top: 850, bottom: 1150, left: 0, right: 500, width: 500, height: 300 });

        window.XLocationUI.evaluateVideoAutoplay();
        expect(v1.play).toHaveBeenCalledTimes(1);
        expect(v1Paused).toBe(false);
        expect(v2Paused).toBe(true);

        // Scroll down so v1 is offscreen and v2 is in viewport -> v1 pauses, v2 plays
        v1.getBoundingClientRect = () => ({ top: -350, bottom: -50, left: 0, right: 500, width: 500, height: 300 });
        v2.getBoundingClientRect = () => ({ top: 200, bottom: 500, left: 0, right: 500, width: 500, height: 300 });

        window.XLocationUI.evaluateVideoAutoplay();
        expect(v1.pause).toHaveBeenCalled();
        expect(v1Paused).toBe(true);
        expect(v2.play).toHaveBeenCalledTimes(1);
        expect(v2Paused).toBe(false);

        // Switching out of Friends tab pauses v2
        window.XLocationUI.setFriendsTimelineTabSelected(false);
        expect(v2.pause).toHaveBeenCalled();
        expect(v2Paused).toBe(true);

        // Clicking on a muted video frame unmutes it
        expect(v1.muted).toBe(true);
        v1.click();
        expect(v1.muted).toBe(false);
    });

    test('clicking Like or Repost on Friends card should perform in-place X GraphQL mutation and update counts', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
        document.cookie = 'ct0=mock_csrf_token_123';

        const card = window.XLocationUI.createFriendTweetCard({
            tweetId: '2113500000000000111',
            seenBy: ['Alice'],
            forcedBy: [],
            forcedByMe: false,
            isSeenByMe: false,
            meta: {
                id: '2113500000000000111',
                screenName: 'author1',
                authorName: 'Author One',
                text: 'Test post for like and repost',
                favoriteCount: 9,
                retweetCount: 4,
                isHydrated: true,
                hydrationVersion: 4
            }
        });
        document.body.appendChild(card);

        const likeBtn = card.querySelector('[data-testid="like"]');
        const repostBtn = card.querySelector('[data-testid="retweet"]');
        expect(likeBtn).not.toBeNull();
        expect(repostBtn).not.toBeNull();
        expect(likeBtn.textContent).toBe('9');
        expect(repostBtn.textContent).toBe('4');

        // Click Like -> toggles .is-liked, increments count to 10, calls FavoriteTweet
        likeBtn.click();
        expect(likeBtn.classList.contains('is-liked')).toBe(true);
        expect(likeBtn.getAttribute('data-testid')).toBe('unlike');
        expect(likeBtn.textContent).toBe('10');
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/FavoriteTweet'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'x-csrf-token': 'mock_csrf_token_123' })
            })
        );

        // Click Repost -> toggles .is-reposted, increments count to 5, calls CreateRetweet
        repostBtn.click();
        expect(repostBtn.classList.contains('is-reposted')).toBe(true);
        expect(repostBtn.getAttribute('data-testid')).toBe('unretweet');
        expect(repostBtn.textContent).toBe('5');
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/mbRO74GrOvSfRcJnlMapnQ/CreateRetweet'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'x-csrf-token': 'mock_csrf_token_123' })
            })
        );

        // When #react-root is present (live X web app), Bookmark delegates to MAIN world (xEnv.js) via postMessage
        const reactRoot = document.createElement('div');
        reactRoot.id = 'react-root';
        document.body.appendChild(reactRoot);
        const postMessageSpy = jest.spyOn(window, 'postMessage');

        const bookmarkBtn = card.querySelector('[data-testid="bookmark"]');
        expect(bookmarkBtn).not.toBeNull();
        bookmarkBtn.click();
        expect(bookmarkBtn.classList.contains('is-bookmarked')).toBe(true);
        expect(bookmarkBtn.getAttribute('data-testid')).toBe('removeBookmark');
        expect(postMessageSpy).toHaveBeenCalledWith(
            {
                type: 'X_PERFORM_TWEET_ACTION',
                payload: { actionType: 'bookmark', tweetId: '2113500000000000111' }
            },
            '*'
        );

        postMessageSpy.mockRestore();
        reactRoot.remove();
    });

    test('filtered tweets should automatically be marked as seen and removed cleanly when scrolled past', () => {
        jest.useFakeTimers();

        const sendMessageSpy = jest.fn((msg, cb) => {
            if (msg.action === 'X_FETCH_USER_INFO' && cb) {
                cb({
                    success: true,
                    data: {
                        screenName: 'blocked_user_br',
                        location: 'Brazil',
                        device: 'Web'
                    }
                });
            } else if (cb) {
                cb({ success: true, seenMap: {}, forcedMap: {}, forcedByMe: [], mySeenIds: [] });
            }
        });

        global.chrome = {
            runtime: {
                id: 'test-extension-id',
                lastError: null,
                sendMessage: sendMessageSpy
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        cb({
                            isGlobalMasterSwitchEnabled: true,
                            isXModuleEnabled: true,
                            isXLocationEnabled: true,
                            isXFriendsSyncEnabled: true,
                            blockedCountries: ['Brazil'],
                            blockedDeviceRegions: [],
                            blockedNameFlags: []
                        });
                    })
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        const host = document.createElement('div');
        document.body.appendChild(host);

        const root = window.XLocationUI.renderFriendsTimeline(host, {
            timelinePosts: [
                {
                    tweetId: '2113600000000000999',
                    seenBy: ['Alice'],
                    forcedBy: [],
                    forcedByMe: false,
                    isSeenByMe: false,
                    meta: {
                        id: '2113600000000000999',
                        screenName: 'blocked_user_br',
                        authorName: 'Blocked User',
                        text: 'Post from blocked country',
                        isHydrated: true,
                        hydrationVersion: 4
                    }
                }
            ],
            unseenForcedPosts: [],
            connectedFriends: []
        });

        delete window.XObserverInjected;
        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(300);

        const filteredCard = root.querySelector('article.x-friend-tweet-card[data-tweet-id="2113600000000000999"]');
        const placeholder = root.querySelector('.x-tweet-filtered-placeholder');
        expect(filteredCard).not.toBeNull();
        expect(placeholder).not.toBeNull();
        // Card was automatically marked as seen when filtered!
        expect(filteredCard.classList.contains('is-seen-by-me')).toBe(true);

        // Advance flush timer so X_MARK_TWEETS_SEEN is sent
        jest.advanceTimersByTime(2500);
        expect(sendMessageSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'X_MARK_TWEETS_SEEN',
                payload: expect.objectContaining({
                    tweetIds: expect.arrayContaining(['2113600000000000999'])
                })
            }),
            expect.any(Function)
        );

        // When user scrolls past the "Tweet filtered" placeholder, both placeholder and card are removed
        placeholder.getBoundingClientRect = () => ({ top: -80, bottom: -10, left: 0, right: 500, width: 500, height: 70 });
        expect(window.XLocationUI.removeSeenCardsScrolledPast()).toBe(1);
        expect(root.querySelector('.x-tweet-filtered-placeholder')).toBeNull();
        expect(root.querySelector('article.x-friend-tweet-card[data-tweet-id="2113600000000000999"]')).toBeNull();

        jest.useRealTimers();
    });

    test('forced posts should appear in both Friends and For You/Following timelines, mark as seen without disappearing on scroll, and update live without manual refresh', () => {
        const host = document.createElement('div');
        const nativeFeed = document.createElement('section');
        nativeFeed.setAttribute('role', 'region');
        const nativeArticle = document.createElement('article');
        nativeArticle.textContent = 'Native For You post';
        nativeFeed.appendChild(nativeArticle);
        host.appendChild(nativeFeed);
        document.body.appendChild(host);

        const regularPost = {
            tweetId: '2113700000000000101',
            isForced: false,
            forcedBy: [],
            seenBy: ['Alice'],
            forcedByMe: false,
            isSeenByMe: false,
            meta: {
                id: '2113700000000000101',
                screenName: 'regular_author',
                authorName: 'Regular Author',
                text: 'Regular seen post',
                isHydrated: true,
                hydrationVersion: 4
            }
        };

        // 1. Initial render with only a regular seen post
        const root = window.XLocationUI.renderFriendsTimeline(host, {
            timelinePosts: [regularPost],
            unseenForcedPosts: [],
            connectedFriends: [{ email: 'alice@example.com', displayName: 'Alice', label: 'Alice' }]
        }, {});

        const allFilterBtn = root.querySelector('[data-filter="all"]');
        if (allFilterBtn && !allFilterBtn.classList.contains('is-active')) {
            allFilterBtn.click();
        }

        expect(root.querySelectorAll('article.x-friend-tweet-card').length).toBe(1);

        // 2. Friend force-pushes a new post AND forces the existing regularPost — live update WITHOUT clicking Sync Relays
        const newForcedPost = {
            tweetId: '2113700000000000202',
            isForced: true,
            forcedBy: ['Alice'],
            seenBy: ['Alice'],
            forcedByMe: false,
            isSeenByMe: false,
            isDismissed: false,
            meta: {
                id: '2113700000000000202',
                screenName: 'forced_author',
                authorName: 'Forced Author',
                text: 'Brand new forced post!',
                isHydrated: true,
                hydrationVersion: 4
            }
        };
        const upgradedRegularPost = {
            ...regularPost,
            isForced: true,
            forcedBy: ['Alice'],
            isDismissed: false
        };

        window.XLocationUI.renderFriendsTimeline(host, {
            timelinePosts: [newForcedPost, upgradedRegularPost],
            unseenForcedPosts: [newForcedPost, upgradedRegularPost],
            connectedFriends: [{ email: 'alice@example.com', displayName: 'Alice', label: 'Alice' }]
        }, {});
        const homeForcedContainer = window.XLocationUI.renderForcedPostsInHomeFeed(
            nativeFeed,
            [newForcedPost, upgradedRegularPost],
            {}
        );

        // Verify both Friends timeline and For You/Following (#x-forced-home-feed) have the forced posts at the top
        const friendsCards = root.querySelectorAll('article.x-friend-tweet-card');
        expect(friendsCards.length).toBe(2);
        expect(friendsCards[0].getAttribute('data-tweet-id')).toBe('2113700000000000202');
        expect(friendsCards[0].classList.contains('is-forced-card')).toBe(true);
        expect(friendsCards[1].getAttribute('data-tweet-id')).toBe('2113700000000000101');
        expect(friendsCards[1].classList.contains('is-forced-card')).toBe(true);
        expect(friendsCards[1].querySelector('.x-card-badge-forced').textContent).toContain('Forced by Alice');

        expect(homeForcedContainer).not.toBeNull();
        const homeCards = homeForcedContainer.querySelectorAll('article.x-friend-tweet-card');
        expect(homeCards.length).toBe(2);

        // 3. Mark the forced post as seen -> should display "✓ Seen by you" in both timelines and NEVER be removed on scroll or re-render
        newForcedPost.isSeenByMe = true;
        window.XLocationUI.markCardSeenInDOM('2113700000000000202');

        const seenFriendsCard = root.querySelector('article.x-friend-tweet-card[data-tweet-id="2113700000000000202"]');
        const seenHomeCard = homeForcedContainer.querySelector('article.x-friend-tweet-card[data-tweet-id="2113700000000000202"]');
        expect(seenFriendsCard.classList.contains('is-seen-by-me')).toBe(true);
        expect(seenFriendsCard.querySelector('[data-testid="x-card-my-seen"]').style.display).toBe('');
        expect(seenHomeCard.classList.contains('is-seen-by-me')).toBe(true);
        expect(seenHomeCard.querySelector('[data-testid="x-card-my-seen"]').style.display).toBe('');

        // Simulate scrolling past both cards (rect.bottom < 0)
        seenFriendsCard.getBoundingClientRect = () => ({ top: -300, bottom: -50, left: 0, right: 600, width: 600, height: 250 });
        seenHomeCard.getBoundingClientRect = () => ({ top: -300, bottom: -50, left: 0, right: 600, width: 600, height: 250 });

        expect(window.XLocationUI.removeSeenCardsScrolledPast()).toBe(0);
        expect(root.querySelector('article.x-friend-tweet-card[data-tweet-id="2113700000000000202"]')).not.toBeNull();
        expect(homeForcedContainer.querySelector('article.x-friend-tweet-card[data-tweet-id="2113700000000000202"]')).not.toBeNull();

        // Subsequent live timeline updates also keep the seen forced post in both timelines
        window.XLocationUI.renderFriendsTimeline(host, {
            timelinePosts: [newForcedPost, upgradedRegularPost],
            unseenForcedPosts: [newForcedPost, upgradedRegularPost],
            connectedFriends: [{ email: 'alice@example.com', displayName: 'Alice', label: 'Alice' }]
        }, {});
        window.XLocationUI.renderForcedPostsInHomeFeed(
            nativeFeed,
            [newForcedPost, upgradedRegularPost],
            {}
        );
        expect(root.querySelector('article.x-friend-tweet-card[data-tweet-id="2113700000000000202"]')).not.toBeNull();
        expect(homeForcedContainer.querySelector('article.x-friend-tweet-card[data-tweet-id="2113700000000000202"]')).not.toBeNull();
    });

    test('isAdTweet, collapseAdTweet, and xObserver should stealth-collapse promoted ads without display:none or DOM removal and skip location/seen API calls', () => {
        jest.useFakeTimers();
        delete window.XObserverInjected;

        let hideAdsEnabled = true;
        let storageChangedListener = null;
        const sendMessageMock = jest.fn((msg, cb) => {
            if (msg.action === 'X_FETCH_USER_INFO') {
                cb({
                    success: true,
                    data: {
                        screenName: msg.payload.screenName,
                        location: 'United States',
                        device: 'Web'
                    }
                });
            } else if (msg.action === 'X_CHECK_TWEETS_SEEN') {
                cb({ success: true, seenMap: {}, forcedMap: {}, myForcedIds: [] });
            } else if (msg.action === 'X_GET_FRIENDS_TIMELINE') {
                cb({ success: true, timelinePosts: [], unseenForcedPosts: [], connectedFriends: [] });
            }
        });

        global.chrome = {
            runtime: {
                id: 'test-ext-id',
                lastError: null,
                onMessage: { addListener: jest.fn() },
                sendMessage: sendMessageMock
            },
            storage: {
                local: {
                    get: jest.fn((keys, cb) => {
                        cb({
                            isGlobalMasterSwitchEnabled: true,
                            isXModuleEnabled: true,
                            isXLocationEnabled: true,
                            isXHideAdsEnabled: hideAdsEnabled,
                            isXFriendsSyncEnabled: true,
                            blockedCountries: [],
                            blockedDeviceRegions: [],
                            blockedNameFlags: []
                        });
                    })
                },
                onChanged: {
                    addListener: jest.fn((fn) => {
                        storageChangedListener = fn;
                    })
                }
            }
        };

        // 1. Build exact UnderArmour Ad HTML inside a virtualized cellInnerDiv
        const cellInnerDiv = document.createElement('div');
        cellInnerDiv.setAttribute('data-testid', 'cellInnerDiv');
        const cellBorderWrapper = document.createElement('div');
        cellBorderWrapper.className = 'css-g5y9jx r-qklmqi';
        const adArticle = document.createElement('article');
        adArticle.setAttribute('data-testid', 'tweet');
        adArticle.innerHTML = `<div class="css-g5y9jx r-zl2h9q"><div class="css-g5y9jx r-k4xj1c r-18u37iz r-1wtj0ep"><div class="css-g5y9jx r-1d09ksm r-18u37iz r-1wbh5a2"><div class="css-g5y9jx r-1wbh5a2 r-dnmrzs r-1ny4l3l"><div class="css-g5y9jx r-1wbh5a2 r-dnmrzs r-1ny4l3l r-1awozwy r-18u37iz" id="id__aj14wjjkj1u" data-testid="User-Name"><div class="css-g5y9jx r-1awozwy r-18u37iz r-1wbh5a2 r-dnmrzs"><div class="css-g5y9jx r-1wbh5a2 r-dnmrzs"><a href="/UnderArmour" role="link" class="css-g5y9jx r-1wbh5a2 r-dnmrzs r-1ny4l3l r-1loqt21"><div class="css-g5y9jx r-1awozwy r-18u37iz r-1wbh5a2 r-dnmrzs"><div dir="ltr" class="css-146c3p1"><span class="css-1jxf684"><span class="css-1jxf684">Under Armour</span></span></div></div></a></div></div><div class="css-g5y9jx r-18u37iz r-1wbh5a2 r-1ez5h0i"><div class="css-g5y9jx r-1d09ksm r-18u37iz r-1wbh5a2"><div class="css-g5y9jx r-1wbh5a2 r-dnmrzs"><a href="/UnderArmour" role="link" tabindex="-1"><div dir="ltr" class="css-146c3p1"><span class="css-1jxf684">@UnderArmour</span></div></a></div></div></div></div></div></div><div class="css-g5y9jx r-1kkk96v"><div class="css-g5y9jx r-1awozwy r-18u37iz r-1cmwbt1 r-1wtj0ep"><div dir="ltr" class="css-146c3p1" style="color: rgb(113, 118, 123);"><span class="css-1jxf684">Ad</span></div><div class="css-g5y9jx r-1awozwy r-6koalj r-18u37iz"><div class="css-g5y9jx"><div class="css-g5y9jx r-18u37iz r-1h0z5md"><button aria-expanded="false" aria-haspopup="menu" aria-label="More" role="button" data-testid="caret" type="button"></button></div></div></div></div></div></div></div>`;
        cellBorderWrapper.appendChild(adArticle);
        cellInnerDiv.appendChild(cellBorderWrapper);
        document.body.appendChild(cellInnerDiv);

        // 2. Build a normal tweet where author name is "Ad" and text mentions "Ad" (must NOT false-positive)
        const normalArticle = document.createElement('article');
        normalArticle.setAttribute('data-testid', 'tweet');
        normalArticle.innerHTML = `
            <div class="header-row">
                <div data-testid="User-Name">
                    <span>Ad</span>
                    <a href="/realuser">@realuser</a>
                    <a href="/realuser/status/1900000000000000123"><time datetime="2026-10-22T12:00:00Z">2h</time></a>
                </div>
                <div class="caret-wrap">
                    <button data-testid="caret" type="button"></button>
                </div>
            </div>
            <div data-testid="tweetText"><span>Ad</span></div>
        `;
        document.body.appendChild(normalArticle);

        expect(window.XLocationUI.isAdTweet(adArticle)).toBe(true);
        expect(window.XLocationUI.isAdTweet(normalArticle)).toBe(false);

        const observerScriptPath = path.resolve(__dirname, '../../x_extension/content_scripts/xObserver.js');
        const observerScriptContent = fs.readFileSync(observerScriptPath, 'utf8');
        eval(observerScriptContent);

        jest.advanceTimersByTime(200);

        // Ad article and its inner cell border wrapper are stealth-collapsed (without display:none or DOM removal)
        expect(adArticle.isConnected).toBe(true);
        expect(adArticle.style.display).not.toBe('none');
        expect(adArticle.style.height).toBe('0px');
        expect(adArticle.style.maxHeight).toBe('0px');
        expect(adArticle.style.overflow).toBe('hidden');
        expect(adArticle.style.opacity).toBe('0');
        expect(adArticle.style.pointerEvents).toBe('none');
        expect(cellBorderWrapper.style.height).toBe('0px');
        expect(cellInnerDiv.style.height).toBe('');

        // Should NOT have fetched location for @UnderArmour while ad is hidden, but SHOULD have fetched for @realuser
        const fetchedHandles = sendMessageMock.mock.calls
            .filter(([m]) => m.action === 'X_FETCH_USER_INFO')
            .map(([m]) => m.payload.screenName);
        expect(fetchedHandles).toContain('realuser');
        expect(fetchedHandles).not.toContain('UnderArmour');

        // Normal tweet remains untouched and visible
        expect(normalArticle.style.height).toBe('');
        expect(normalArticle.style.opacity).toBe('');

        // 3. Toggle isXHideAdsEnabled OFF -> ad should restore cleanly and fetch location badge
        hideAdsEnabled = false;
        if (storageChangedListener) {
            storageChangedListener({ isXHideAdsEnabled: { newValue: false } }, 'local');
        }
        jest.advanceTimersByTime(200);

        expect(adArticle.style.height).toBe('');
        expect(adArticle.style.opacity).toBe('');
        expect(cellBorderWrapper.style.height).toBe('');

        jest.useRealTimers();
    });

    test('should toggle hovercard dossier on touch tap/click of info (i) and friend seen (✓) badges with narrow viewport clamping', () => {
        Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true, writable: true });

        const article = document.createElement('article');
        article.setAttribute('data-testid', 'tweet');
        const parentClickSpy = jest.fn();
        article.addEventListener('click', parentClickSpy);

        const header = document.createElement('div');
        header.setAttribute('data-testid', 'User-Name');
        const handleLink = document.createElement('a');
        handleLink.href = '/pixeluser';
        handleLink.textContent = '@pixeluser';
        header.appendChild(handleLink);
        article.appendChild(header);
        document.body.appendChild(article);

        window.XLocationUI.renderInlineBadge(header, {
            screenName: 'pixeluser',
            location: 'United States',
            device: 'Pixel Android App',
            meta: {
                name: 'Pixel Tester',
                restId: '123456',
                createdAt: '2022-01-15T00:00:00Z'
            }
        });

        window.XLocationUI.renderFriendSeenBadge(
            header,
            'pixeluser',
            ['Alice (alice@example.com)'],
            ['Bob (bob@example.com)']
        );

        const infoBtn = header.querySelector('.x-location-info-btn');
        const seenBadge = header.querySelector('.x-friend-seen-badge');
        expect(infoBtn).not.toBeNull();
        expect(seenBadge).not.toBeNull();

        // Simulate button near right edge of 360px Pixel screen
        infoBtn.getBoundingClientRect = () => ({
            top: 80,
            bottom: 98,
            left: 340,
            right: 356,
            width: 16,
            height: 18
        });

        // 1. Tap info button -> opens hovercard clamped inside 360px viewport and stops propagation to article
        infoBtn.click();
        const hc = document.getElementById('x-location-hovercard-root');
        expect(hc).not.toBeNull();
        expect(hc.classList.contains('visible')).toBe(true);
        expect(parentClickSpy).not.toHaveBeenCalled();

        const leftPx = parseFloat(hc.style.left);
        expect(leftPx).toBeGreaterThanOrEqual(10);
        expect(leftPx).toBeLessThanOrEqual(80); // 360 - 270 - 10 = 80
        expect(hc.innerHTML).toContain('Forced by:');
        expect(hc.innerHTML).toContain('Bob (bob@example.com)');
        expect(hc.innerHTML).toContain('Seen by:');
        expect(hc.innerHTML).toContain('Alice (alice@example.com)');

        // 2. Tap info button again -> toggles hovercard closed
        infoBtn.click();
        expect(hc.classList.contains('visible')).toBe(false);

        // 3. Tap friend seen badge -> opens hovercard without triggering parent article navigation
        seenBadge.click();
        expect(hc.classList.contains('visible')).toBe(true);
        expect(parentClickSpy).not.toHaveBeenCalled();

        // 4. Tap outside on document.body -> dismisses hovercard
        document.body.click();
        expect(hc.classList.contains('visible')).toBe(false);
    });

    test('ensureMobileSettingsTrigger should render floating 414 button above the New Tweet button (not inside BottomBar) and dispatch X_OPEN_NATIVE_SETTINGS', () => {
        const sendMessageMock = jest.fn();
        global.chrome = {
            runtime: {
                sendMessage: sendMessageMock
            }
        };

        const bottomNav = document.createElement('nav');
        bottomNav.setAttribute('role', 'navigation');
        bottomNav.setAttribute('data-testid', 'BottomBar');
        document.body.appendChild(bottomNav);

        const composeBtn = document.createElement('a');
        composeBtn.setAttribute('href', '/compose/post');
        composeBtn.getBoundingClientRect = () => ({
            top: 660,
            bottom: 716,
            left: 284,
            right: 340,
            width: 56,
            height: 56
        });
        Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true });
        Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true, writable: true });
        document.body.appendChild(composeBtn);

        const trigger = window.XLocationUI.ensureMobileSettingsTrigger({
            pendingIncomingCount: 3
        });

        expect(trigger).not.toBeNull();
        expect(trigger.id).toBe('x-414-floating-pill');
        expect(bottomNav.contains(trigger)).toBe(false);
        expect(trigger.style.bottom).toBe('152px'); // 800 - 660 + 12 = 152px (12px above New Tweet button)
        expect(trigger.style.right).toBe('24px');   // centered over 56px compose button at right: 20px

        const badge = trigger.querySelector('.x-414-nav-unread-badge');
        expect(badge).not.toBeNull();
        expect(badge.textContent).toBe('3');
        expect(badge.style.display).toBe('inline-flex');

        trigger.click();
        expect(sendMessageMock).toHaveBeenCalledWith({ action: 'X_OPEN_NATIVE_SETTINGS' });
    });
});

