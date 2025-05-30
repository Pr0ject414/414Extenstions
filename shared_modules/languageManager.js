// KylesChromeExtensions/background_modules/languageManager.js

export let uniqueLanguages = new Set();

export function loadLanguages() {
    chrome.storage.local.get('uniqueLanguages', (data) => {
        if (data.uniqueLanguages) {
            uniqueLanguages = new Set(data.uniqueLanguages);
        } else {
            uniqueLanguages = new Set();
            saveLanguages(); // Initialize if not present
        }
        // console.log("LanguageManager: Languages loaded", uniqueLanguages);
    });
}

export function saveLanguages() {
    chrome.storage.local.set({ uniqueLanguages: Array.from(uniqueLanguages) }, () => {
        if (chrome.runtime.lastError) {
            console.error("LanguageManager: Error saving languages:", chrome.runtime.lastError.message);
        } else {
            // console.log("LanguageManager: Languages saved.");
        }
    });
}

export function addLanguage(language) {
    if (language && typeof language === 'string' && language.trim() !== '' && !uniqueLanguages.has(language.trim())) {
        uniqueLanguages.add(language.trim());
        saveLanguages();
        return true; // Added
    }
    return false; // Not added (exists or invalid)
}

export function getLanguagesArray() {
    return Array.from(uniqueLanguages);
}