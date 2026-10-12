// 414Extensions/x_extension/xCloudCache.js
import { CLOUD_CACHE_CONFIG } from './xLocationConstants.js';

export class XCloudCacheClient {
    constructor() {
        this.apiUrl = CLOUD_CACHE_CONFIG.API_URL;
        this.lookupBatch = new Set();
        this.lookupBatchTimeout = null;
        this.lookupBatchResolvers = [];
        this.recentContributions = new Map();
        this.CONTRIBUTION_DEDUP_MS = 24 * 60 * 60 * 1000; // 24 hours
    }

    sanitizeInput(str) {
        if (!str || typeof str !== 'string') return null;
        const trimmed = str.trim();
        if (trimmed.length === 0 || trimmed.length > 100) return null;
        return trimmed;
    }

    async lookup(screenName) {
        if (!screenName) return null;
        const lowerName = screenName.toLowerCase();

        return new Promise((resolve) => {
            this.lookupBatch.add(lowerName);
            this.lookupBatchResolvers.push({ screenName: lowerName, resolve });

            if (this.lookupBatch.size >= CLOUD_CACHE_CONFIG.BATCH_SIZE) {
                if (this.lookupBatchTimeout) {
                    clearTimeout(this.lookupBatchTimeout);
                    this.lookupBatchTimeout = null;
                }
                this.executeBatchedLookup();
                return;
            }

            if (!this.lookupBatchTimeout) {
                this.lookupBatchTimeout = setTimeout(() => {
                    this.executeBatchedLookup();
                }, CLOUD_CACHE_CONFIG.BATCH_DELAY_MS);
            }
        });
    }

    async executeBatchedLookup() {
        const batch = Array.from(this.lookupBatch);
        const resolvers = [...this.lookupBatchResolvers];

        this.lookupBatch.clear();
        this.lookupBatchResolvers = [];
        this.lookupBatchTimeout = null;

        if (batch.length === 0) {
            resolvers.forEach(r => r.resolve(null));
            return;
        }

        try {
            const url = `${this.apiUrl}/lookup?users=${batch.join(',')}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CLOUD_CACHE_CONFIG.LOOKUP_TIMEOUT_MS);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                resolvers.forEach(r => r.resolve(null));
                return;
            }

            const data = await response.json();
            const resultsMap = new Map();

            if (data && data.results) {
                const now = Date.now();
                for (const [username, info] of Object.entries(data.results)) {
                    const loc = this.sanitizeInput(info.l);
                    const dev = this.sanitizeInput(info.d);

                    if (loc || dev) {
                        const normalized = username.toLowerCase();
                        resultsMap.set(normalized, {
                            screenName: username,
                            location: loc,
                            device: dev,
                            locationAccurate: info.a !== false,
                            fromCloud: true,
                            updatedAt: info.t ? info.t * 1000 : now
                        });
                        this.recentContributions.set(normalized, now);
                    }
                }
            }

            resolvers.forEach(r => {
                const res = resultsMap.get(r.screenName) || null;
                r.resolve(res);
            });

        } catch (err) {
            console.warn('X Cloud Cache: Lookup failed', err.message || err);
            resolvers.forEach(r => r.resolve(null));
        }
    }

    async contribute(screenName, data) {
        if (!screenName || !data) return;
        const normalized = screenName.toLowerCase();
        const lastContrib = this.recentContributions.get(normalized);

        if (lastContrib && (Date.now() - lastContrib) < this.CONTRIBUTION_DEDUP_MS) {
            return;
        }

        try {
            const payload = {
                username: screenName,
                location: data.location || null,
                device: data.device || null
            };

            await fetch(`${this.apiUrl}/contribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            this.recentContributions.set(normalized, Date.now());
        } catch (e) {
            // Ignore contribution errors silently
        }
    }
}
