// KylesChromeExtensions/shared_modules/storageUtils.js

/**
 * Saves a key-value pair to chrome.storage.local.
 * @param {string} key - The key to save.
 * @param {*} value - The value to save.
 * @returns {Promise<void>}
 */
export function saveToStorage(key, value) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve();
        });
    });
}

/**
 * Loads a value from chrome.storage.local for a given key.
 * @param {string} key - The key to load.
 * @returns {Promise<*>} A promise that resolves with the loaded value.
 */
export function loadFromStorage(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result[key]);
        });
    });
}


/**
 * Loads multiple keys from storage, applying defaults for any keys that are not found.
 * @param {object} keysWithDefaults - An object where keys are storage keys and values are their defaults.
 * @returns {Promise<object>} A promise that resolves with an object containing the loaded state.
 */
export function loadStateFromStorage(keysWithDefaults) {
    return new Promise((resolve, reject) => {
        const keys = Object.keys(keysWithDefaults);
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            const loadedState = {};
            for (const key of keys) {
                // If the result from storage is undefined, use the provided default.
                loadedState[key] = result[key] === undefined ? keysWithDefaults[key] : result[key];
            }
            resolve(loadedState);
        });
    });
}

/**
 * Saves an object of key-value pairs to storage.
 * @param {object} stateObject - The object to save.
 * @returns {Promise<void>}
 */
export function saveStateToStorage(stateObject) {
     return new Promise((resolve, reject) => {
        chrome.storage.local.set(stateObject, () => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve();
        });
    });
}