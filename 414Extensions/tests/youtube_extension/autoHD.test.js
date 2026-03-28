import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @jest-environment jest-environment-jsdom
 */

describe('youtube_extension/autoHD.js', () => {
    let YouTubeAutoHD;

    beforeAll(() => {
        const scriptPath = path.resolve(__dirname, '../../youtube_extension/content_scripts/autoHD.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        global.chrome = {
            storage: {
                local: {
                    get: jest.fn((keys, callback) => callback({
                        isYouTubeModuleEnabled: true,
                        preferredQuality: '1080',
                        isEnhancedBitrate: true
                    })),
                },
                onChanged: {
                    addListener: jest.fn()
                }
            }
        };

        // Use eval instead of script injection
        eval(scriptContent);

        YouTubeAutoHD = window.YouTubeAutoHD;
    });

    describe('parseQualityLabel', () => {
        it('should parse simple quality labels', () => {
            const result = YouTubeAutoHD.parseQualityLabel('1080p');
            expect(result).toEqual({
                value: 1080,
                isPremium: false,
                label: '1080p'
            });
        });

        it('should identify premium qualities', () => {
            const result = YouTubeAutoHD.parseQualityLabel('1080p Premium');
            expect(result).toEqual({
                value: 1080,
                isPremium: true,
                label: '1080p Premium'
            });
        });

        it('should return null for non-quality labels', () => {
            const result = YouTubeAutoHD.parseQualityLabel('Auto');
            expect(result).toBeNull();
        });
    });

    describe('state initialization', () => {
        it('should have correct initialized state from mock', () => {
            expect(YouTubeAutoHD.state.targetQuality).toBe('1080');
        });
    });
});
