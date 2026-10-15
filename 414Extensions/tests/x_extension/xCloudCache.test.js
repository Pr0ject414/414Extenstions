import { jest } from '@jest/globals';

global.fetch = jest.fn();

global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

import { XCloudCacheClient } from '../../x_extension/xCloudCache.js';

describe('XCloudCacheClient', () => {
    let client;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new XCloudCacheClient();
    });

    describe('sanitizeInput', () => {
        test('should return trimmed valid string', () => {
            expect(client.sanitizeInput('  Tokyo, Japan  ')).toBe('Tokyo, Japan');
        });

        test('should return null for non-string, empty, or too long input', () => {
            expect(client.sanitizeInput(null)).toBeNull();
            expect(client.sanitizeInput(12345)).toBeNull();
            expect(client.sanitizeInput('')).toBeNull();
            expect(client.sanitizeInput('   ')).toBeNull();
            expect(client.sanitizeInput('a'.repeat(101))).toBeNull();
        });
    });

    describe('lookup', () => {
        test('should return null for empty screenName', async () => {
            const res = await client.lookup('');
            expect(res).toBeNull();
        });

        test('should batch lookups and resolve matched users', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: {
                        user1: { l: 'Seattle, WA', d: 'Twitter for iPhone', a: true, t: 1700000000 },
                        user2: { l: 'London, UK', d: 'Twitter Web App', a: true, t: 1700000000 }
                    }
                })
            });

            const p1 = client.lookup('user1');
            const p2 = client.lookup('user2');
            const p3 = client.lookup('user_not_found');

            const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/lookup?users=user1,user2,user_not_found'),
                expect.any(Object)
            );

            expect(res1).toMatchObject({
                screenName: 'user1',
                location: 'Seattle, WA',
                device: 'Twitter for iPhone',
                fromCloud: true
            });

            expect(res2).toMatchObject({
                screenName: 'user2',
                location: 'London, UK',
                device: 'Twitter Web App',
                fromCloud: true
            });

            expect(res3).toBeNull();
        });

        test('should handle network failures gracefully by resolving null', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            const res = await client.lookup('user1');
            expect(res).toBeNull();
        });
    });

    describe('contribute', () => {
        test('should POST contribution payload to API', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true });

            await client.contribute('testuser', { location: 'New York, NY', device: 'Twitter for Android' });

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/contribute'),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: 'testuser',
                        location: 'New York, NY',
                        device: 'Twitter for Android'
                    })
                })
            );
        });

        test('should deduplicate contributions within 24 hours', async () => {
            global.fetch.mockResolvedValue({ ok: true });

            await client.contribute('dupuser', { location: 'Austin, TX' });
            await client.contribute('dupuser', { location: 'Austin, TX' });

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
