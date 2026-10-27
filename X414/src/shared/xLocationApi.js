// AUTO-SYNCED FROM 414Extensions/x_extension/xLocationApi.js — DO NOT EDIT DIRECTLY
// 414Extensions/x_extension/xLocationApi.js
import { API_CONFIG, BEARER_TOKEN } from './xLocationConstants.js';

function hasHeader(headers, name) {
    const wanted = name.toLowerCase();
    return Object.keys(headers || {}).some(key => key.toLowerCase() === wanted);
}

class RequestQueue {
    constructor(maxConcurrent = API_CONFIG.MAX_CONCURRENT, minInterval = API_CONFIG.MIN_INTERVAL_MS) {
        this.maxConcurrent = maxConcurrent;
        this.minInterval = minInterval;
        this.activeRequests = 0;
        this.lastRequestTime = 0;
        this.queue = [];
        this.rateLimitReset = 0;
        this.scheduled = false;
    }

    async add(request) {
        return new Promise((resolve, reject) => {
            this.queue.push({ request, resolve, reject });
            this.process();
        });
    }

    process() {
        if (this.queue.length === 0 || this.activeRequests >= this.maxConcurrent) return;

        const now = Date.now();
        if (this.rateLimitReset > now) {
            this.scheduleProcess(Math.min(this.rateLimitReset - now, 60000));
            return;
        }

        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < this.minInterval) {
            this.scheduleProcess(this.minInterval - timeSinceLast);
            return;
        }

        const item = this.queue.shift();
        if (!item) return;

        this.activeRequests++;
        this.lastRequestTime = Date.now();
        this.runItem(item);

        if (this.queue.length > 0) this.scheduleProcess(this.minInterval);
    }

    async runItem(item) {
        try {
            const result = await item.request();
            item.resolve(result);
        } catch (error) {
            if (error.code === 'RATE_LIMITED') {
                this.rateLimitReset = error.retryAfter || (Date.now() + 60000);
            }
            item.reject(error);
        } finally {
            this.activeRequests--;
            if (this.queue.length > 0) this.scheduleProcess(0);
        }
    }

    scheduleProcess(delay) {
        if (this.scheduled) return;
        this.scheduled = true;
        setTimeout(() => {
            this.scheduled = false;
            this.process();
        }, delay);
    }
}

class RequestDeduplicator {
    constructor(maxSize = 200) {
        this.pending = new Map();
        this.maxSize = maxSize;
    }

    async dedupe(key, requestFn) {
        if (this.pending.has(key)) {
            return this.pending.get(key);
        }

        if (this.pending.size >= this.maxSize) {
            const firstKey = this.pending.keys().next().value;
            if (firstKey) this.pending.delete(firstKey);
        }

        const promise = requestFn().finally(() => {
            this.pending.delete(key);
        });

        this.pending.set(key, promise);
        return promise;
    }
}

export class XLocationApiClient {
    constructor() {
        this.headers = null;
        this.queue = new RequestQueue();
        this.deduplicator = new RequestDeduplicator();
        this.notFoundCache = new Map(); // Expiring negative cache for users not found
    }

    setHeaders(headers) {
        if (hasHeader(headers, 'authorization') && hasHeader(headers, 'x-csrf-token')) {
            this.headers = { ...headers };
            chrome.storage.local.set({ x_api_headers: this.headers });
            return true;
        }
        return false;
    }

    async loadHeadersFromStorage() {
        try {
            const res = await chrome.storage.local.get(['x_api_headers']);
            if (res?.x_api_headers) {
                this.headers = res.x_api_headers;
            }
        } catch (e) {
            console.warn("XLocationApiClient: Error loading headers from storage:", e);
        }
    }

    getHeaders() {
        return this.headers ? { ...this.headers } : null;
    }

    async fetchUserInfo(screenName) {
        const lowerName = screenName.toLowerCase();

        // Check negative cache
        const notFound = this.notFoundCache.get(lowerName);
        if (notFound && notFound > Date.now()) {
            return { error: 'Account not found (cached)', code: 'NOT_FOUND' };
        }

        return this.deduplicator.dedupe(lowerName, async () => {
            return this.queue.add(async () => {
                return this.executeRequest(screenName);
            });
        });
    }

    async getFallbackHeaders() {
        try {
            const cookie = await chrome.cookies.get({ url: 'https://x.com', name: 'ct0' });
            if (cookie && cookie.value) {
                return {
                    'authorization': BEARER_TOKEN,
                    'x-csrf-token': cookie.value,
                    'x-twitter-active-user': 'yes',
                    'x-twitter-auth-type': 'OAuth2Session',
                    'content-type': 'application/json'
                };
            }
        } catch (e) {
            console.warn('X Location API: Fallback cookie read failed', e);
        }
        return null;
    }

    async executeRequest(screenName) {
        if (!this.headers) {
            await this.loadHeadersFromStorage();
        }

        if (!this.headers) {
            this.headers = await this.getFallbackHeaders();
        }

        if (!this.headers) {
            throw { message: 'No API headers available', code: 'NO_HEADERS' };
        }

        const variables = encodeURIComponent(JSON.stringify({ screenName }));
        const url = `${API_CONFIG.BASE_URL}/${API_CONFIG.QUERY_ID}/AboutAccountQuery?variables=${variables}`;

        const requestHeaders = {
            ...this.headers,
            'accept-language': 'en-US,en;q=0.9'
        };

        try {
            const response = await fetch(url, {
                headers: requestHeaders,
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10) * 1000;
                    throw { message: 'Rate limited by X', code: 'RATE_LIMITED', retryAfter: Date.now() + retryAfter };
                }
                if (response.status === 401 || response.status === 403) {
                    this.headers = null;
                    chrome.storage.local.remove(['x_api_headers']);
                    throw { message: 'Authentication expired', code: 'UNAUTHORIZED' };
                }
                throw { message: `HTTP Error ${response.status}`, code: 'HTTP_ERROR' };
            }

            const data = await response.json();
            const parsed = this.parseAboutAccount(data, screenName);
            
            if (!parsed) {
                // Negative cache for 5 minutes
                this.notFoundCache.set(screenName.toLowerCase(), Date.now() + 300000);
                throw { message: 'Account not found', code: 'NOT_FOUND' };
            }

            return parsed;

        } catch (err) {
            throw err.code ? err : { message: err.message || 'Network error', code: 'NETWORK_ERROR' };
        }
    }

    parseAboutAccount(data, screenName) {
        const user = data?.data?.user_result_by_screen_name?.result;
        if (!user) return null;

        const profile = user?.about_profile;

        return {
            screenName,
            location: profile?.account_based_in || null,
            device: profile?.source || null,
            locationAccurate: profile?.location_accurate !== false,
            meta: {
                name: user?.core?.name || null,
                avatarUrl: user?.avatar?.image_url || null,
                createdAt: user?.core?.created_at || null,
                restId: user?.rest_id || null,
                verified: user?.verification_type || user?.is_blue_verified || false
            },
            updatedAt: Date.now()
        };
    }
}
