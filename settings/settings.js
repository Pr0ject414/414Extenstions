// KylesChromeExtensions/settings/settings.js
document.addEventListener('DOMContentLoaded', () => {
    // Global Network Settings Elements
    const maxRetriesInput = document.getElementById('maxRetries');
    const initialDelaySInput = document.getElementById('initialDelayS');
    const maxDelaySInput = document.getElementById('maxDelayS');
    const saveGlobalSettingsButton = document.getElementById('saveGlobalSettings');
    const globalStatusMessage = document.getElementById('globalStatus');

    // FAB Helper Settings Elements
    const delayBetweenVerificationChecksSInput = document.getElementById('delayBetweenVerificationChecksS');
    const delayBetweenTabOpenSInput = document.getElementById('delayBetweenTabOpenS');
    const maxConcurrentFabTabsInput = document.getElementById('maxConcurrentFabTabs');
    const fabBrowsePageScanIntervalSInput = document.getElementById('fabBrowsePageScanIntervalS'); // New
    const fabFreeItemGraceCyclesInput = document.getElementById('fabFreeItemGraceCycles'); // New
    const saveFabSettingsButton = document.getElementById('saveFabSettings');
    const fabStatusMessage = document.getElementById('fabStatus');

    // Queue Item Manually Elements
    const itemQueueUrlInput = document.getElementById('itemQueueUrl');
    const queueItemButton = document.getElementById('queueItemButton');
    const queueStatusMessage = document.getElementById('queueStatus');

    // Storage Keys (Must match those defined in coreConstants.js and fabConstants.js)
    const GLOBAL_SETTINGS_STORAGE_KEYS = {
        MAX_RETRIES: 'maxRetries',
        INITIAL_DELAY_MS: 'initialDelayMs',
        MAX_DELAY_MS: 'maxDelayMs'
    };

    const FAB_SETTINGS_STORAGE_KEYS = {
        DELAY_BETWEEN_VERIFICATION_CHECKS_MS: 'delayBetweenVerificationChecksMs',
        DELAY_BETWEEN_TAB_OPEN_MS: 'delayBetweenTabOpenMs',
        MAX_CONCURRENT_FAB_TABS: 'maxConcurrentFabTabs',
        // New keys from fabConstants.js
        FAB_BROWSE_PAGE_SCAN_INTERVAL_MS: 'fabBrowsePageScanIntervalMs',
        FAB_FREE_ITEM_GRACE_CYCLES: 'fabFreeItemGraceCycles'
    };

    function showStatusMessage(element, message, type = 'success') {
        if (!element) return;
        element.textContent = message;
        element.className = `status-message ${type}`;
        setTimeout(() => {
            if (element) element.textContent = '';
            if (element) element.className = 'status-message';
        }, 3000);
    }

    function loadSettings() {
        // Combine all keys needed for settings page
        const allSettingKeysDefaults = {
            [GLOBAL_SETTINGS_STORAGE_KEYS.MAX_RETRIES]: 5,
            [GLOBAL_SETTINGS_STORAGE_KEYS.INITIAL_DELAY_MS]: 30000,
            [GLOBAL_SETTINGS_STORAGE_KEYS.MAX_DELAY_MS]: 300000,
            [FAB_SETTINGS_STORAGE_KEYS.DELAY_BETWEEN_VERIFICATION_CHECKS_MS]: 5000,
            [FAB_SETTINGS_STORAGE_KEYS.DELAY_BETWEEN_TAB_OPEN_MS]: 2000,
            [FAB_SETTINGS_STORAGE_KEYS.MAX_CONCURRENT_FAB_TABS]: 2,
            [FAB_SETTINGS_STORAGE_KEYS.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS]: 5000,
            [FAB_SETTINGS_STORAGE_KEYS.FAB_FREE_ITEM_GRACE_CYCLES]: 4
        };

        chrome.storage.local.get(allSettingKeysDefaults, (result) => {
            if (maxRetriesInput) maxRetriesInput.value = result[GLOBAL_SETTINGS_STORAGE_KEYS.MAX_RETRIES];
            if (initialDelaySInput) initialDelaySInput.value = result[GLOBAL_SETTINGS_STORAGE_KEYS.INITIAL_DELAY_MS] / 1000;
            if (maxDelaySInput) maxDelaySInput.value = result[GLOBAL_SETTINGS_STORAGE_KEYS.MAX_DELAY_MS] / 1000;

            if (delayBetweenVerificationChecksSInput) delayBetweenVerificationChecksSInput.value = result[FAB_SETTINGS_STORAGE_KEYS.DELAY_BETWEEN_VERIFICATION_CHECKS_MS] / 1000;
            if (delayBetweenTabOpenSInput) delayBetweenTabOpenSInput.value = result[FAB_SETTINGS_STORAGE_KEYS.DELAY_BETWEEN_TAB_OPEN_MS] / 1000;
            if (maxConcurrentFabTabsInput) maxConcurrentFabTabsInput.value = result[FAB_SETTINGS_STORAGE_KEYS.MAX_CONCURRENT_FAB_TABS];
            
            if (fabBrowsePageScanIntervalSInput) fabBrowsePageScanIntervalSInput.value = result[FAB_SETTINGS_STORAGE_KEYS.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS] / 1000;
            if (fabFreeItemGraceCyclesInput) fabFreeItemGraceCyclesInput.value = result[FAB_SETTINGS_STORAGE_KEYS.FAB_FREE_ITEM_GRACE_CYCLES];
        });
    }

    if (saveGlobalSettingsButton) {
        saveGlobalSettingsButton.addEventListener('click', () => {
            const initialDelayMsValue = parseFloat(initialDelaySInput.value) * 1000;
            const maxDelayMsValue = parseFloat(maxDelaySInput.value) * 1000;
            const maxRetriesValue = parseInt(maxRetriesInput.value);

            if (isNaN(initialDelayMsValue) || isNaN(maxDelayMsValue) || isNaN(maxRetriesValue) ||
                initialDelayMsValue < 1000 || maxDelayMsValue < 1000 || maxRetriesValue < 0) { // Basic validation (e.g. min 1s)
                showStatusMessage(globalStatusMessage, 'Invalid input values. Please check minimums.', 'error');
                return;
            }
            if (initialDelayMsValue > maxDelayMsValue) {
                showStatusMessage(globalStatusMessage, 'Initial delay cannot exceed maximum delay.', 'warning');
                return;
            }

            const settings = {
                [GLOBAL_SETTINGS_STORAGE_KEYS.MAX_RETRIES]: maxRetriesValue,
                [GLOBAL_SETTINGS_STORAGE_KEYS.INITIAL_DELAY_MS]: initialDelayMsValue,
                [GLOBAL_SETTINGS_STORAGE_KEYS.MAX_DELAY_MS]: maxDelayMsValue
            };
            chrome.storage.local.set(settings, () => {
                if (chrome.runtime.lastError) {
                    showStatusMessage(globalStatusMessage, 'Error saving settings!', 'error');
                } else {
                    showStatusMessage(globalStatusMessage, 'Global settings saved!', 'success');
                    chrome.runtime.sendMessage({ action: "settingsUpdated", type: "global" });
                }
            });
        });
    }

    if (saveFabSettingsButton) {
        saveFabSettingsButton.addEventListener('click', () => {
            const delayVerificationMsValue = parseFloat(delayBetweenVerificationChecksSInput.value) * 1000;
            const delayTabOpenMsValue = parseFloat(delayBetweenTabOpenSInput.value) * 1000;
            const maxConcurrentTabsValue = parseInt(maxConcurrentFabTabsInput.value);
            const browseScanIntervalMsValue = parseFloat(fabBrowsePageScanIntervalSInput.value) * 1000;
            const freeItemGraceCyclesValue = parseInt(fabFreeItemGraceCyclesInput.value);

            if (isNaN(delayVerificationMsValue) || delayVerificationMsValue < 1000 ||
                isNaN(delayTabOpenMsValue) || delayTabOpenMsValue < 100 || // Min 0.1s
                isNaN(maxConcurrentTabsValue) || maxConcurrentTabsValue < 1 ||
                isNaN(browseScanIntervalMsValue) || browseScanIntervalMsValue < 500 || // Min 0.5s
                isNaN(freeItemGraceCyclesValue) || freeItemGraceCyclesValue < 0) {
                showStatusMessage(fabStatusMessage, 'Invalid input values. Please check ranges.', 'error');
                return;
            }

            const settings = {
                [FAB_SETTINGS_STORAGE_KEYS.DELAY_BETWEEN_VERIFICATION_CHECKS_MS]: delayVerificationMsValue,
                [FAB_SETTINGS_STORAGE_KEYS.DELAY_BETWEEN_TAB_OPEN_MS]: delayTabOpenMsValue,
                [FAB_SETTINGS_STORAGE_KEYS.MAX_CONCURRENT_FAB_TABS]: maxConcurrentTabsValue,
                [FAB_SETTINGS_STORAGE_KEYS.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS]: browseScanIntervalMsValue,
                [FAB_SETTINGS_STORAGE_KEYS.FAB_FREE_ITEM_GRACE_CYCLES]: freeItemGraceCyclesValue
            };
            chrome.storage.local.set(settings, () => {
                if (chrome.runtime.lastError) {
                    showStatusMessage(fabStatusMessage, 'Error saving settings!', 'error');
                } else {
                    showStatusMessage(fabStatusMessage, 'FAB Helper settings saved!', 'success');
                    chrome.runtime.sendMessage({ action: "settingsUpdated", type: "fab" });
                }
            });
        });
    }

    if (queueItemButton) {
        queueItemButton.addEventListener('click', () => {
            const url = itemQueueUrlInput.value.trim();
            if (url && (url.startsWith('https://www.fab.com/listings/') || url.startsWith('https://fab.com/listings/'))) {
                chrome.runtime.sendMessage({ action: "queueFabItemOnly", url: url }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.success) {
                        showStatusMessage(queueStatusMessage, response?.error || 'Failed to queue item!', 'error');
                    } else {
                        showStatusMessage(queueStatusMessage, response?.message || 'Item queued successfully!', 'success');
                        if (itemQueueUrlInput) itemQueueUrlInput.value = '';
                    }
                });
            } else {
                showStatusMessage(queueStatusMessage, 'Please enter a valid FAB product URL!', 'warning');
            }
        });
    }

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabButtons.length > 0 && tabContents.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                const targetTabId = button.getAttribute('data-tab');
                const targetTabContent = document.getElementById(targetTabId);
                if (targetTabContent) {
                    targetTabContent.classList.add('active');
                }
            });
        });

        const isAnyTabActiveHTML = document.querySelector('.tab-content.active');
        const isAnyButtonActiveHTML = document.querySelector('.tab-button.active');
        if (!isAnyTabActiveHTML || !isAnyButtonActiveHTML) {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            if (tabButtons[0]) {
                tabButtons[0].classList.add('active');
                const firstTabId = tabButtons[0].getAttribute('data-tab');
                const firstTabContent = document.getElementById(firstTabId);
                if (firstTabContent) {
                    firstTabContent.classList.add('active');
                }
            }
        }
    }
    loadSettings();
});