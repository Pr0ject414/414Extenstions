// KylesChromeExtensions/youtube_extension/content_scripts/youtubePlayerPage.js

const YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY = 'isYouTubeNoSuggestionsEnabled';
let noSuggestionsEnabled = false;
let observer = null;

function removeElementsByClass(className) {
    const elements = document.querySelectorAll(`.${className}`);
    if (elements.length > 0) {
        console.log(`YouTubeHelper: Removing ${elements.length} suggested video elements.`);
        elements.forEach(element => {
            element.remove();
        });
    }
}

function startObserver() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                // Check if any added node is or contains the target element
                let hasTarget = false;
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        if (node.classList.contains('ytp-ce-element') || node.querySelector('.ytp-ce-element')) {
                            hasTarget = true;
                        }
                    }
                });

                if (hasTarget) {
                    removeElementsByClass('ytp-ce-element');
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    console.log("YouTubeHelper: Observer started to remove end-of-video suggestions.");
}

function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
        console.log("YouTubeHelper: Observer stopped.");
    }
}


function initialize() {
    chrome.storage.local.get([YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY], (result) => {
        noSuggestionsEnabled = result[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY] === true;
        console.log(`YouTubeHelper: Initial state - Remove Suggestions is ${noSuggestionsEnabled ? 'enabled' : 'disabled'}.`);

        if (noSuggestionsEnabled) {
            startObserver();
        } else {
            stopObserver();
        }
    });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY]) {
        noSuggestionsEnabled = changes[YOUTUBE_NO_SUGGESTIONS_ENABLED_KEY].newValue;
        console.log(`YouTubeHelper: Setting changed - Remove Suggestions is now ${noSuggestionsEnabled ? 'enabled' : 'disabled'}.`);
        if (noSuggestionsEnabled) {
            startObserver();
        } else {
            stopObserver();
        }
    }
});

initialize();