document.addEventListener('DOMContentLoaded', () => {
    chrome.runtime.sendMessage({ action: 'getLanguages' }, (response) => {
        const languageList = document.getElementById('languageList');
        response.languages.forEach(language => {
            const li = document.createElement('li');
            li.textContent = language;
            languageList.appendChild(li);
        });
    });
});
