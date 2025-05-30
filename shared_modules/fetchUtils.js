// KylesChromeExtensions/shared_modules/fetchUtils.js
import * as AppState from './appState.js'; // For setRateLimitCoolDown
import * as CoreConstants from './coreConstants.js'; // For retry params, MAX_DELAY_MS

export async function fetchWithBackoff(url, options, attempt = 1, maxRetries = CoreConstants.DEFAULT_MAX_RETRIES, currentDelay = CoreConstants.DEFAULT_INITIAL_DELAY_MS) {
    try {
        const response = await fetch(url, options);

        if (response.status === 429) {
            console.warn(`fetchWithBackoff: Received 429 for ${url} (Attempt ${attempt}/${maxRetries})`);

            if (attempt >= maxRetries) {
                console.error(`fetchWithBackoff: Max retries reached for ${url} after 429. Applying global cool-down.`);
                const coolDownDuration = currentDelay * 2 > CoreConstants.MAX_DELAY_MS ? CoreConstants.MAX_DELAY_MS : currentDelay * 2;
                AppState.setRateLimitCoolDown(Date.now() + coolDownDuration);
                // No need to explicitly save here, the caller or a periodic save should handle it or state manager itself
                return response;
            }

            let delay = currentDelay;
            const retryAfterHeader = response.headers.get('Retry-After');

            if (retryAfterHeader) {
                const retryAfterSeconds = parseInt(retryAfterHeader, 10);
                if (!isNaN(retryAfterSeconds)) {
                    delay = retryAfterSeconds * 1000;
                    console.log(`fetchWithBackoff: Respecting Retry-After header: ${retryAfterSeconds}s`);
                } else {
                    const retryDate = Date.parse(retryAfterHeader);
                    if (!isNaN(retryDate)) {
                        delay = Math.max(0, retryDate - Date.now());
                        console.log(`fetchWithBackoff: Respecting Retry-After header (date): ${new Date(retryDate).toISOString()}`);
                    }
                }
            }

            delay = Math.min(delay, CoreConstants.MAX_DELAY_MS);
            delay = Math.max(delay, 1000); // Ensure at least 1s delay

            console.warn(`fetchWithBackoff: Retrying ${url} in ${Math.round(delay / 1000)}s.`);
            await new Promise(resolve => setTimeout(resolve, delay));

            return fetchWithBackoff(url, options, attempt + 1, maxRetries, currentDelay * 2);
        }
        return response;
    } catch (error) {
        console.error(`fetchWithBackoff: Network or other error for ${url} (Attempt ${attempt}/${maxRetries}):`, error);
        if (attempt >= maxRetries) {
            console.error(`fetchWithBackoff: Max retries reached for ${url} due to network/other errors.`);
            throw error;
        }
        console.warn(`fetchWithBackoff: Retrying ${url} due to error in ${Math.round(currentDelay / 1000)}s.`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        return fetchWithBackoff(url, options, attempt + 1, maxRetries, currentDelay * 2);
    }
}