const YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY = 'isYouTubeNoSuggestionsEnabled';
const STYLE_ID = 'yt-no-suggestions-style';

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .ytp-ce-element,
        .ytp-endscreen-content {
            display: none !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
    console.log("YouTubeHelper: Injected CSS to hide suggested videos.");
}

function removeStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) {
        style.remove();
        console.log("YouTubeHelper: Removed CSS, showing suggested videos.");
    }
}

function updateState() {
    chrome.runtime.sendMessage({ action: "getYouTubeModuleStatus" }, (response) => {
        if (chrome.runtime.lastError || !response || response.isPaused) {
            removeStyle();
            return;
        }

        chrome.storage.local.get([YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY], (result) => {
            const noSuggestionsEnabled = result[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY] === true;
            console.log(`YouTubeHelper: State update - Remove Suggestions is ${noSuggestionsEnabled ? 'enabled' : 'disabled'}.`);

            if (noSuggestionsEnabled) {
                injectStyle();
            } else {
                removeStyle();
            }
        });
    });
}

function initialize() {
    // Initial check
    updateState();

    // Re-check periodically in case of SPA navigation or re-injection needs (though CSS usually persists)
    // Actually, for SPA, we just need to ensure the style stays.
    // CSS in head persists across YouTube SPA navigations usually.
    // But we listener for storage changes.
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]) {
        updateState();
    }
});

// Run initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}