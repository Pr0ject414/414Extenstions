import { jest } from '@jest/globals';

global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    },
    cookies: {
        get: jest.fn()
    }
};

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { XLocationApiClient } from '../../x_extension/xLocationApi.js';

describe('xLocationApi - XLocationApiClient', () => {
    let client;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new XLocationApiClient();
    });

    test('setHeaders should accept valid authorization and csrf headers', () => {
        const validHeaders = {
            'authorization': 'Bearer ABC123XYZ',
            'x-csrf-token': 'csrf-token-val'
        };
        const success = client.setHeaders(validHeaders);
        expect(success).toBe(true);
        expect(client.getHeaders()).toEqual(validHeaders);
        expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ x_api_headers: validHeaders });
    });

    test('setHeaders should reject headers missing required tokens', () => {
        const invalidHeaders = { 'x-csrf-token': 'csrf-token-val' };
        const success = client.setHeaders(invalidHeaders);
        expect(success).toBe(false);
        expect(client.getHeaders()).toBeNull();
    });

    test('parseAboutAccount should correctly parse GraphQL payload', () => {
        const mockResponse = {
            data: {
                user_result_by_screen_name: {
                    result: {
                        rest_id: '12345',
                        about_profile: {
                            account_based_in: 'United States',
                            source: 'Twitter for iPhone',
                            location_accurate: true
                        },
                        core: {
                            name: 'Test Account',
                            created_at: 'Wed Oct 06 18:00:00 +0000 2021'
                        },
                        avatar: {
                            image_url: 'https://pbs.twimg.com/profile_images/pic.jpg'
                        },
                        is_blue_verified: true
                    }
                }
            }
        };

        const parsed = client.parseAboutAccount(mockResponse, 'TestAccount');
        expect(parsed).toEqual(expect.objectContaining({
            screenName: 'TestAccount',
            location: 'United States',
            device: 'Twitter for iPhone',
            locationAccurate: true,
            meta: expect.objectContaining({
                name: 'Test Account',
                avatarUrl: 'https://pbs.twimg.com/profile_images/pic.jpg',
                restId: '12345',
                verified: true
            })
        }));
    });

    test('parseAboutAccount should return null if user result is missing', () => {
        expect(client.parseAboutAccount({}, 'Unknown')).toBeNull();
        expect(client.parseAboutAccount({ data: {} }, 'Unknown')).toBeNull();
    });

    test('fetchUserInfo should return cached not-found error if in negative cache', async () => {
        client.notFoundCache.set('ghostuser', Date.now() + 60000);
        const result = await client.fetchUserInfo('ghostuser');
        expect(result).toEqual({ error: 'Account not found (cached)', code: 'NOT_FOUND' });
    });
});
