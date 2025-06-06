// KylesChromeExtensions/youtube_extension/background_modules/youtubeState.js
import * as YouTubeConstants from './youtubeConstants.js';

// --- YouTube Specific State ---
export let youTubeNoSuggestionsEnabled = false;

// --- YouTube State Modifiers ---
export function setYouTubeNoSuggestionsEnabled(value) {
    if (typeof value === 'boolean') {
        youTubeNoSuggestionsEnabled = value;
    } else {
        console.warn('YouTubeState: Invalid value for setYouTubeNoSuggestionsEnabled. Expected boolean.');
    }
}

// --- Persistence Functions for YouTube State ---
export async function saveYouTubeState() {
    return new Promise(resolve => {
        const stateToSave = {
            [YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]: youTubeNoSuggestionsEnabled,
        };
        chrome.storage.local.set(stateToSave, () => {
            if (chrome.runtime.lastError) {
                console.error("YouTubeState: Error saving YouTube state:", chrome.runtime.lastError.message, stateToSave);
            }
            resolve();
        });
    });
}

export async function loadYouTubeState() {
    console.log("YouTubeState: Attempting to load YouTube state...");
    return new Promise((resolve) => {
        chrome.storage.local.get([
            YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY
        ], (result) => {
            if (chrome.runtime.lastError) {
                console.error("YouTubeState: Error loading YouTube state:", chrome.runtime.lastError.message);
            }

            youTubeNoSuggestionsEnabled = result[YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY] === undefined ? false : result[YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY];

            console.log("YouTubeState: YouTube state loaded.", {
                youTubeNoSuggestionsEnabled
            });
            resolve();
        });
    });
}