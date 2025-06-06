// KylesChromeExtensions/youtube_extension/background_modules/youtubeState.js
import * as YouTubeConstants from './youtubeConstants.js';
import { loadStateFromStorage, saveStateToStorage } from '../../../shared_modules/storageUtils.js';

// --- YouTube Specific State ---
export let youTubeNoSuggestionsEnabled = false;

// Default values for YouTube state
const YOUTUBE_STATE_DEFAULTS = {
    [YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]: false,
};


// --- YouTube State Modifiers ---
export function setYouTubeNoSuggestionsEnabled(value) {
    youTubeNoSuggestionsEnabled = !!value;
}


// --- Persistence Functions for YouTube State ---
export async function saveYouTubeState() {
    try {
        const stateToSave = {
            [YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]: youTubeNoSuggestionsEnabled,
        };
        await saveStateToStorage(stateToSave);
    } catch (error) {
        console.error("YouTubeState: Error saving YouTube state:", error);
    }
}

export async function loadYouTubeState() {
    try {
        console.log("YouTubeState: Attempting to load YouTube state...");
        const loadedState = await loadStateFromStorage(YOUTUBE_STATE_DEFAULTS);
        
        youTubeNoSuggestionsEnabled = loadedState[YouTubeConstants.YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY];

        console.log("YouTubeState: YouTube state loaded.", { youTubeNoSuggestionsEnabled });
    } catch (error) {
        console.error("YouTubeState: Error loading YouTube state:", error);
    }
}