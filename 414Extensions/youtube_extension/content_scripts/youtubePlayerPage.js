// KylesChromeExtensions/youtube_extension/content_scripts/youtubePlayerPage.js

const YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY = 'isYouTubeNoSuggestionsEnabled';
let observer = null;

function removeElementsByClass(className) {
    // This function is what removes the suggestions. It needs to be called at the right time.
    const elements = document.querySelectorAll(`.${className}`);
    if (elements.length > 0) {
        console.log(`YouTubeHelper: Found and removed ${elements.length} suggestion element(s).`);
        elements.forEach(element => {
            element.remove();
        });
    }
}

function startObserver() {
    if (observer) {
        observer.disconnect(); // Ensure no multiple observers are running
    }

    // The target to observe is the main video container.
    // Observing the entire <body> is inefficient and can miss some updates.
    const targetNode = document.querySelector('.html5-video-player');
    if (!targetNode) {
        console.log("YouTubeHelper: Video player not found. Cannot start observer.");
        return;
    }

    // This new observer is simpler and more effective.
    // It will re-run our removal function on ANY change to the player's subtree.
    // This includes when new elements are added OR when existing ones have their attributes (like 'class' or 'style') changed.
    observer = new MutationObserver((mutations) => {
        // We don't need to inspect the mutations. If anything changes,
        // we just run our cleanup function again to be safe.
        removeElementsByClass('ytp-ce-element');
    });

    observer.observe(targetNode, {
        childList: true, // Watches for nodes being added or removed
        subtree: true,   // Watches all descendants of the target
        attributes: true // **Crucially, this now watches for attribute changes (e.g., class, style)**
    });

    console.log("YouTubeHelper: Observer started on video player to remove end-of-video suggestions.");
}

function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
        console.log("YouTubeHelper: Observer stopped.");
    }
}

function initialize() {
    // We will now wait for the video player to exist before doing anything.
    // This is more reliable than starting immediately.
    const videoPlayerCheckInterval = setInterval(() => {
        const player = document.querySelector('.html5-video-player');
        if (player) {
            clearInterval(videoPlayerCheckInterval); // Stop checking once we find it
            console.log("YouTubeHelper: Video player detected. Initializing module.");
            
            // Now we run the same permission check as before
            chrome.runtime.sendMessage({ action: "getYouTubeModuleStatus" }, (response) => {
                if (chrome.runtime.lastError || !response || response.isPaused) {
                    stopObserver();
                    return;
                }

                chrome.storage.local.get([YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY], (result) => {
                    const noSuggestionsEnabled = result[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY] === true;
                    console.log(`YouTubeHelper: Initial state - Remove Suggestions is ${noSuggestionsEnabled ? 'enabled' : 'disabled'}.`);

                    if (noSuggestionsEnabled) {
                        // **Run the removal function immediately once** in case the elements are already there
                        removeElementsByClass('ytp-ce-element');
                        // Then start the observer to catch them if they appear later
                        startObserver();
                    } else {
                        stopObserver();
                    }
                });
            });
        }
    }, 500); // Check for the player every half-second
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]) {
        // If the toggle changes, re-run the entire initialization process
        stopObserver(); // Stop the current observer first
        initialize();
    }
});

initialize();