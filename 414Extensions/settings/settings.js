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

    // VSC Settings Elements
    const vscSitesBlacklistInput = document.getElementById('vscSitesBlacklist');
    const saveVscSettingsButton = document.getElementById('saveVscSettings');
    const resetVscSettingsButton = document.getElementById('resetVscSettings');
    const vscStatusMessage = document.getElementById('vscStatus');
    const vscShortcutsContainer = document.getElementById('vscShortcutsContainer');
    
    // VSC Options Inputs
    const vscAudioSupportInput = document.getElementById('vscAudioSupport');
    const vscRememberSpeedInput = document.getElementById('vscRememberSpeed');
    const vscHideDefaultInput = document.getElementById('vscHideDefault');
    const vscForceLastSavedInput = document.getElementById('vscForceLastSaved');
    const vscOpacityInput = document.getElementById('vscOpacity');
    const vscButtonSizeInput = document.getElementById('vscButtonSize');
    const vscKeySpeedInput = document.getElementById('vscKeySpeed');

    // Visibility Settings Elements
    const visibilityVolumeToggle = document.getElementById('visibilityVolumeToggle');
    const visibilityVscToggle = document.getElementById('visibilityVscToggle');
    const visibilityFabToggle = document.getElementById('visibilityFabToggle');
    const visibilityYouTubeToggle = document.getElementById('visibilityYouTubeToggle');
    const visibilityXToggle = document.getElementById('visibilityXToggle');

    // Storage Keys (Must match those defined in coreConstants.js and fabConstants.js)
    const GLOBAL_SETTINGS_STORAGE_KEYS = {
        MAX_RETRIES: 'maxRetries',
        INITIAL_DELAY_MS: 'initialDelayMs',
        MAX_DELAY_MS: 'maxDelayMs',
        // Visibility Keys
        VOLUME_MODULE_VISIBLE: 'isVolumeModuleVisible',
        VSC_MODULE_VISIBLE: 'isVscModuleVisible',
        FAB_MODULE_VISIBLE: 'isFabModuleVisible',
        YOUTUBE_MODULE_VISIBLE: 'isYouTubeModuleVisible',
        X_MODULE_VISIBLE: 'isXModuleVisible'
    };

    const FAB_SETTINGS_STORAGE_KEYS = {
        DELAY_BETWEEN_VERIFICATION_CHECKS_MS: 'delayBetweenVerificationChecksMs',
        DELAY_BETWEEN_TAB_OPEN_MS: 'delayBetweenTabOpenMs',
        MAX_CONCURRENT_FAB_TABS: 'maxConcurrentFabTabs',
        // New keys from fabConstants.js
        FAB_BROWSE_PAGE_SCAN_INTERVAL_MS: 'fabBrowsePageScanIntervalMs',
        FAB_FREE_ITEM_GRACE_CYCLES: 'fabFreeItemGraceCycles'
    };

    const VSC_STORAGE_KEYS = {
        BLACKLIST: 'vsc_blacklist',
        SHORTCUTS: 'vsc_shortcuts',
        OPTIONS: 'vsc_options'
    };
    
    // Default Shortcuts Config
    const DEFAULT_VSC_SHORTCUTS = [
        { id: "toggle", label: "Show/hide controller", key: "v", value: null, valueType: "none" },
        { id: "decrease", label: "Decrease speed", key: "s", value: 0.1, valueType: "number" },
        { id: "increase", label: "Increase speed", key: "d", value: 0.1, valueType: "number" },
        { id: "rewind", label: "Rewind", key: "z", value: 10, valueType: "number" },
        { id: "advance", label: "Advance", key: "x", value: 10, valueType: "number" },
        { id: "reset", label: "Reset speed", key: "r", value: 1.0, valueType: "fixed" },
        { id: "preferred", label: "Preferred speed", key: "g", value: 1.8, valueType: "fixed" }
    ];

    // Default Options Config
    const DEFAULT_VSC_OPTIONS = {
        audio: true,
        rememberSpeed: true,
        hideDefault: false,
        forceLastSaved: false,
        opacity: 0.3,
        buttonSize: 14,
        keySpeed: 2.0
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
            [FAB_SETTINGS_STORAGE_KEYS.FAB_FREE_ITEM_GRACE_CYCLES]: 4,
            [FAB_SETTINGS_STORAGE_KEYS.FAB_BROWSE_PAGE_SCAN_INTERVAL_MS]: 5000,
            [FAB_SETTINGS_STORAGE_KEYS.FAB_FREE_ITEM_GRACE_CYCLES]: 4,
            [VSC_STORAGE_KEYS.BLACKLIST]: '',
            [VSC_STORAGE_KEYS.SHORTCUTS]: DEFAULT_VSC_SHORTCUTS,
            [VSC_STORAGE_KEYS.OPTIONS]: DEFAULT_VSC_OPTIONS
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
            
            if (vscSitesBlacklistInput) vscSitesBlacklistInput.value = result[VSC_STORAGE_KEYS.BLACKLIST];
            
            // Render Shortcuts
            const shortcuts = result[VSC_STORAGE_KEYS.SHORTCUTS] || DEFAULT_VSC_SHORTCUTS;
            renderShortcuts(shortcuts);
            
            // Render Options
            const vscOptions = result[VSC_STORAGE_KEYS.OPTIONS] || DEFAULT_VSC_OPTIONS;
            if (vscAudioSupportInput) vscAudioSupportInput.checked = vscOptions.audio !== false;
            if (vscRememberSpeedInput) vscRememberSpeedInput.checked = vscOptions.rememberSpeed !== false;
            if (vscHideDefaultInput) vscHideDefaultInput.checked = vscOptions.hideDefault === true;
            if (vscForceLastSavedInput) vscForceLastSavedInput.checked = vscOptions.forceLastSaved === true;
            if (vscOpacityInput) vscOpacityInput.value = vscOptions.opacity || 0.3;
            if (vscButtonSizeInput) vscButtonSizeInput.value = vscOptions.buttonSize || 14;
            if (vscKeySpeedInput) vscKeySpeedInput.value = vscOptions.keySpeed || 2.0;

            if (visibilityVolumeToggle) visibilityVolumeToggle.checked = result[GLOBAL_SETTINGS_STORAGE_KEYS.VOLUME_MODULE_VISIBLE] !== false;
            if (visibilityVscToggle) visibilityVscToggle.checked = result[GLOBAL_SETTINGS_STORAGE_KEYS.VSC_MODULE_VISIBLE] !== false;
            if (visibilityFabToggle) visibilityFabToggle.checked = result[GLOBAL_SETTINGS_STORAGE_KEYS.FAB_MODULE_VISIBLE] !== false;
            if (visibilityYouTubeToggle) visibilityYouTubeToggle.checked = result[GLOBAL_SETTINGS_STORAGE_KEYS.YOUTUBE_MODULE_VISIBLE] !== false;
            if (visibilityXToggle) visibilityXToggle.checked = result[GLOBAL_SETTINGS_STORAGE_KEYS.X_MODULE_VISIBLE] !== false;
        });
    }

    function renderShortcuts(shortcuts) {
        if (!vscShortcutsContainer) return;
        vscShortcutsContainer.replaceChildren();
        
        shortcuts.forEach(sc => {
            const row = document.createElement('div');
            row.className = 'shortcut-row';
            row.dataset.id = sc.id;
            
            const label = document.createElement('label');
            label.textContent = sc.label;
            
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.className = 'shortcut-key';
            keyInput.value = sc.key;
            keyInput.maxLength = 1; // Single char usually
            
            const valInput = document.createElement('input');
            if (sc.valueType === 'none') {
                 valInput.disabled = true;
                 valInput.value = 'N/A';
                 valInput.style.visibility = 'hidden'; // Or just placeholder
            } else {
                 valInput.type = 'number';
                 valInput.className = 'shortcut-value';
                 valInput.value = sc.value;
                 valInput.step = 0.1;
            }
            
            row.append(label, keyInput, valInput);
            vscShortcutsContainer.appendChild(row);
        });
    }

    function getShortcutsFromUI() {
        if (!vscShortcutsContainer) return DEFAULT_VSC_SHORTCUTS;
        const rows = vscShortcutsContainer.querySelectorAll('.shortcut-row');
        const shortcuts = [];
        
        rows.forEach(row => {
             const id = row.dataset.id;
             const originalMsg = DEFAULT_VSC_SHORTCUTS.find(x => x.id === id); // To keep label/type info
             const key = row.querySelector('.shortcut-key').value.toLowerCase();
             let val = originalMsg.value;
             
             if (originalMsg.valueType !== 'none') {
                 val = parseFloat(row.querySelector('.shortcut-value').value);
             }
             
             shortcuts.push({
                 ...originalMsg,
                 key: key,
                 value: val
             });
        });
        
        return shortcuts;
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
                [GLOBAL_SETTINGS_STORAGE_KEYS.MAX_DELAY_MS]: maxDelayMsValue,
                [GLOBAL_SETTINGS_STORAGE_KEYS.VOLUME_MODULE_VISIBLE]: visibilityVolumeToggle.checked,
                [GLOBAL_SETTINGS_STORAGE_KEYS.VSC_MODULE_VISIBLE]: visibilityVscToggle.checked,
                [GLOBAL_SETTINGS_STORAGE_KEYS.FAB_MODULE_VISIBLE]: visibilityFabToggle.checked,
                [GLOBAL_SETTINGS_STORAGE_KEYS.YOUTUBE_MODULE_VISIBLE]: visibilityYouTubeToggle.checked,
                [GLOBAL_SETTINGS_STORAGE_KEYS.X_MODULE_VISIBLE]: visibilityXToggle.checked
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

    if (saveVscSettingsButton) {
        saveVscSettingsButton.addEventListener('click', () => {
             const blacklistValue = vscSitesBlacklistInput.value;
             const shortcuts = getShortcutsFromUI();
             const options = {
                 audio: vscAudioSupportInput.checked,
                 rememberSpeed: vscRememberSpeedInput.checked,
                 hideDefault: vscHideDefaultInput.checked,
                 forceLastSaved: vscForceLastSavedInput.checked,
                 opacity: parseFloat(vscOpacityInput.value),
                 buttonSize: parseInt(vscButtonSizeInput.value),
                 keySpeed: parseFloat(vscKeySpeedInput.value)
             };
             
             const settings = {
                 [VSC_STORAGE_KEYS.BLACKLIST]: blacklistValue,
                 [VSC_STORAGE_KEYS.SHORTCUTS]: shortcuts,
                 [VSC_STORAGE_KEYS.OPTIONS]: options
             };
             
             chrome.storage.local.set(settings, () => {
                 if (chrome.runtime.lastError) {
                     showStatusMessage(vscStatusMessage, 'Error saving VSC settings!', 'error');
                 } else {
                     showStatusMessage(vscStatusMessage, 'VSC settings saved!', 'success');
                 }
             });
        });
    }
    
    if (resetVscSettingsButton) {
        resetVscSettingsButton.addEventListener('click', () => {
             // Reset UI to defaults
             renderShortcuts(DEFAULT_VSC_SHORTCUTS);
             vscAudioSupportInput.checked = DEFAULT_VSC_OPTIONS.audio;
             vscRememberSpeedInput.checked = DEFAULT_VSC_OPTIONS.rememberSpeed;
             vscHideDefaultInput.checked = DEFAULT_VSC_OPTIONS.hideDefault;
             vscForceLastSavedInput.checked = DEFAULT_VSC_OPTIONS.forceLastSaved;
             vscOpacityInput.value = DEFAULT_VSC_OPTIONS.opacity;
             vscButtonSizeInput.value = DEFAULT_VSC_OPTIONS.buttonSize;
             vscKeySpeedInput.value = DEFAULT_VSC_OPTIONS.keySpeed;
             showStatusMessage(vscStatusMessage, 'Restored defaults (Hit Save to apply)!', 'warning');
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