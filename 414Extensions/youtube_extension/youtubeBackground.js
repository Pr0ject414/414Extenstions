// KylesChromeExtensions/youtube_extension/youtubeBackground.js
import * as YouTubeState from './background_modules/youtubeState.js';
import * as AppState from '../../shared_modules/appState.js';

// --- Lifecycle Functions ---
export async function init() {
    console.log("YouTubeBackground: Initializing...");
    await YouTubeState.loadYouTubeState();
    console.log("YouTubeBackground: Initialized.");
}

export async function onStartup() {
    console.log("YouTubeBackground: onStartup sequence.");
    // Covered by init() in main background.js
}

export async function onInstalled(details) {
    console.log("YouTubeBackground: onInstalled sequence. Reason:", details.reason);
    await YouTubeState.loadYouTubeState();
}


// --- Event Handlers ---
export function handleMessage(request, sender, sendResponse) {
    console.log("YouTubeBackground: Received message", request.action);

    if (request.action === "getYouTubeModuleStatus") {
        const isPaused = !AppState.globalMasterSwitchEnabled || !AppState.youTubeModuleEnabled || !AppState.youTubeModuleVisible;
        sendResponse({ isPaused: isPaused });
        return true;
    }
    
    if (request.action === "getYouTubeGlobalStats") {
        let operationalStatus;
        if (!AppState.globalMasterSwitchEnabled) {
            operationalStatus = "EXTENSION_DISABLED";
        } else if (!AppState.youTubeModuleEnabled || !AppState.youTubeModuleVisible) {
            operationalStatus = "YOUTUBE_DISABLED";
        } else {
            operationalStatus = "OK_IDLE"; // YouTube module is simple, so it's always idle unless disabled
        }

        let responseData = {
            operationalStatus: operationalStatus,
            globalMasterSwitchEnabled: AppState.globalMasterSwitchEnabled,
            youTubeModuleEnabled: AppState.youTubeModuleEnabled,
            youTubeNoSuggestionsEnabled: YouTubeState.youTubeNoSuggestionsEnabled,
        };

        sendResponse(responseData);
        return true;

    } else if (request.action === "setYouTubeNoSuggestionsEnabled") {
        if (typeof request.enabled === 'boolean') {
            YouTubeState.setYouTubeNoSuggestionsEnabled(request.enabled);
            YouTubeState.saveYouTubeState();
            console.log(`YouTubeBackground: No Suggestions set to ${request.enabled}.`);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: "Invalid 'enabled' value for NoSuggestions." });
        }
        return true;
    }


    console.warn(`YouTubeBackground: Unhandled message action: ${request.action}`);
    sendResponse({ success: false, error: "Unknown YouTube action" });
    return false;
}