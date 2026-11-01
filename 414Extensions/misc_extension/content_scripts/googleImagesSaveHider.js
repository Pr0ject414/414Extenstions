// KylesChromeExtensions/misc_extension/content_scripts/googleImagesSaveHider.js
(function () {
    'use strict';

    const GLOBAL_MASTER_SWITCH_ENABLED_KEY = 'isGlobalMasterSwitchEnabled';
    const MISC_MODULE_ENABLED_KEY = 'isMiscModuleEnabled';
    const GOOGLE_IMAGES_HIDE_SAVE_KEY = 'isGoogleImagesHideSaveEnabled';

    const ROOT_HIDE_CLASS = 'ext414-hide-gimg-save';
    const ELEMENT_HIDE_CLASS = 'ext414-gimg-save-hidden';

    const SAVE_WIDGET_SELECTORS = [
        'div[jsname="la3Mvf"]',
        'div[jscontroller="iG3Zmf"]',
        'div[jsname="CL9xOb"][role="button"]',
        'div[jsname="TomQf"][role="button"]'
    ].join(', ');

    let isFeatureActive = false;
    let observer = null;

    function getSaveContainers(root = document) {
        const matched = new Set();
        if (!root || typeof root.querySelectorAll !== 'function') return matched;

        if (root instanceof Element && root.matches(SAVE_WIDGET_SELECTORS)) {
            const outer = root.closest('div[jsname="la3Mvf"]') || root.closest('div[jscontroller="iG3Zmf"]') || root;
            matched.add(outer);
        }

        const nodes = root.querySelectorAll(SAVE_WIDGET_SELECTORS);
        nodes.forEach((node) => {
            const outer = node.closest('div[jsname="la3Mvf"]') || node.closest('div[jscontroller="iG3Zmf"]') || node;
            matched.add(outer);
        });

        return matched;
    }

    function applySaveButtonVisibility(root = document) {
        if (document.documentElement) {
            document.documentElement.classList.toggle(ROOT_HIDE_CLASS, isFeatureActive);
        }

        if (isFeatureActive) {
            const containers = getSaveContainers(root);
            containers.forEach((el) => {
                el.classList.add(ELEMENT_HIDE_CLASS);
            });
        } else {
            const hiddenNodes = document.querySelectorAll(`.${ELEMENT_HIDE_CLASS}`);
            hiddenNodes.forEach((el) => {
                el.classList.remove(ELEMENT_HIDE_CLASS);
            });
        }
    }

    function startObserver() {
        applySaveButtonVisibility(document);
        if (observer || typeof MutationObserver === 'undefined') return;

        const target = document.body || document.documentElement;
        if (!target) return;

        observer = new MutationObserver((mutations) => {
            if (!isFeatureActive) return;
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        applySaveButtonVisibility(node);
                    }
                });
            }
        });

        observer.observe(target, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        applySaveButtonVisibility(document);
    }

    function updateSettings() {
        chrome.storage.local.get([
            GLOBAL_MASTER_SWITCH_ENABLED_KEY,
            MISC_MODULE_ENABLED_KEY,
            GOOGLE_IMAGES_HIDE_SAVE_KEY
        ], (result) => {
            const globalOn = result[GLOBAL_MASTER_SWITCH_ENABLED_KEY] !== false;
            const moduleOn = result[MISC_MODULE_ENABLED_KEY] !== false;
            // Default to OFF (false) unless explicitly enabled
            const hideSaveOn = result[GOOGLE_IMAGES_HIDE_SAVE_KEY] === true;

            isFeatureActive = globalOn && moduleOn && hideSaveOn;

            if (isFeatureActive) {
                startObserver();
            } else {
                stopObserver();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateSettings);
    } else {
        updateSettings();
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes[GLOBAL_MASTER_SWITCH_ENABLED_KEY] ||
                changes[MISC_MODULE_ENABLED_KEY] ||
                changes[GOOGLE_IMAGES_HIDE_SAVE_KEY]) {
                updateSettings();
            }
        }
    });
})();
