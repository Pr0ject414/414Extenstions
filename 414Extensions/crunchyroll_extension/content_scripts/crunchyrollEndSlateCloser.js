// KylesChromeExtensions/crunchyroll_extension/content_scripts/crunchyrollEndSlateCloser.js
(function() {
    'use strict';

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const CRUNCHYROLL_MODULE_ENABLED_KEY = 'isCrunchyrollModuleEnabled';
    const CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY = 'isCrunchyrollAutoCloseEndSlateEnabled';

    let isFeatureActive = false;
    let observer = null;

    function log(...args) {
        console.log('[Crunchyroll Helper]', ...args);
    }

    function checkAndCloseEndSlate() {
        if (!isFeatureActive) return;

        // Target the recommendations carousel dialog
        const endSlateDialogs = document.querySelectorAll('dialog.erc-end-slate-recommendations-carousel, dialog[class*="erc-end-slate"]');
        
        endSlateDialogs.forEach(dialog => {
            if (dialog.hasAttribute('open')) {
                log('Closing end-slate recommendations carousel popup.');
                dialog.removeAttribute('open');
                
                if (typeof dialog.close === 'function') {
                    try {
                        dialog.close();
                    } catch (e) {
                        // Ignore error if dialog is already closed or not attached
                    }
                }
            }
        });
    }

    function startObserver() {
        if (observer) return;

        observer = new MutationObserver((mutations) => {
            if (!isFeatureActive) return;

            let shouldCheck = false;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'open') {
                    shouldCheck = true;
                    break;
                }
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldCheck = true;
                    break;
                }
            }

            if (shouldCheck) {
                checkAndCloseEndSlate();
            }
        });

        const target = document.body || document.documentElement;
        if (target) {
            observer.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['open', 'class']
            });
        }
    }

    function updateSettings() {
        chrome.storage.local.get([
            GLOBAL_MASTER_SWITCH_ENABLED_KEY,
            CRUNCHYROLL_MODULE_ENABLED_KEY,
            CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY
        ], (result) => {
            const globalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const moduleOn = result[CRUNCHYROLL_MODULE_ENABLED_KEY] !== false;
            const featureOn = result[CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY] !== false;

            isFeatureActive = globalOn && moduleOn && featureOn;

            if (isFeatureActive) {
                startObserver();
                checkAndCloseEndSlate();
            }
        });
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateSettings);
    } else {
        updateSettings();
    }

    // Real-time settings updates
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes[GLOBAL_MASTER_SWITCH_ENABLED_KEY] ||
                changes[CRUNCHYROLL_MODULE_ENABLED_KEY] ||
                changes[CRUNCHYROLL_AUTO_CLOSE_END_SLATE_KEY]) {
                updateSettings();
            }
        }
    });

})();
