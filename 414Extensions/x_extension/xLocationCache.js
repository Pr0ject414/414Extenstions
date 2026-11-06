// 414Extensions/x_extension/xLocationCache.js
import { CACHE_CONFIG, CLOUD_CACHE_CONFIG } from './xLocationConstants.js';

class LRUCache {
    constructor(maxSize = CACHE_CONFIG.MAX_ENTRIES) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        const item = this.cache.get(key.toLowerCase());
        if (!item) return null;
        // Move to end (most recently used)
        this.cache.delete(key.toLowerCase());
        this.cache.set(key.toLowerCase(), item);
        return item;
    }

    set(key, value) {
        if (!key || !value || typeof value !== 'object' || value.error) return;
        const lowerKey = key.toLowerCase();
        if (this.cache.has(lowerKey)) {
            this.cache.delete(lowerKey);
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest (first item in Map iterator)
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(lowerKey, value);
    }

    has(key) {
        return this.cache.has(key.toLowerCase());
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }

    toObject() {
        return Object.fromEntries(this.cache.entries());
    }

    fromObject(obj) {
        this.cache.clear();
        let truncated = false;
        if (obj && typeof obj === 'object') {
            const rawEntries = Object.entries(obj);
            const validEntries = rawEntries.filter(([k, v]) => k && v && typeof v === 'object' && !v.error);
            if (validEntries.length !== rawEntries.length || validEntries.length > this.maxSize) {
                truncated = true;
            }
            const kept = validEntries.length > this.maxSize
                ? validEntries.slice(-this.maxSize)
                : validEntries;
            for (const [k, v] of kept) {
                this.cache.set(k.toLowerCase(), v);
            }
        }
        return truncated;
    }
}

export class XLocationCacheManager {
    constructor() {
        this.lru = new LRUCache();
        this.isLoaded = false;
        this.dirty = false;
        this.saveInterval = null;
    }

    async init() {
        if (this.isLoaded) return;
        try {
            const data = await chrome.storage.local.get(['x_location_cache_v4']);
            if (data && data.x_location_cache_v4) {
                const truncated = this.lru.fromObject(data.x_location_cache_v4);
                if (truncated) {
                    this.dirty = true;
                    await this.saveToStorage();
                }
            }
        } catch (err) {
            console.warn('X Location Cache: Load failed', err);
        }
        this.isLoaded = true;
        this.startAutoSave();
    }

    startAutoSave() {
        if (this.saveInterval) clearInterval(this.saveInterval);
        this.saveInterval = setInterval(() => {
            if (this.dirty) {
                this.saveToStorage();
            }
        }, CACHE_CONFIG.SAVE_INTERVAL_MS);
        if (typeof this.saveInterval?.unref === 'function') {
            this.saveInterval.unref();
        }
    }

    async saveToStorage() {
        if (!this.dirty) return;
        try {
            await chrome.storage.local.set({ x_location_cache_v4: this.lru.toObject() });
            this.dirty = false;
        } catch (err) {
            console.warn('X Location Cache: Save failed', err);
        }
    }

    get(screenName) {
        return this.lru.get(screenName);
    }

    set(screenName, data) {
        this.lru.set(screenName, data);
        this.dirty = true;
    }

    async clear() {
        this.lru.clear();
        this.dirty = false;
        await chrome.storage.local.remove(['x_location_cache_v4']);
    }

    getStats() {
        return {
            totalCached: this.lru.size,
            maxCapacity: CACHE_CONFIG.MAX_ENTRIES
        };
    }

    // Optional Cloud Cache Lookup
    async fetchFromCloud(screenNames) {
        if (!screenNames || screenNames.length === 0) return {};
        try {
            const resp = await fetch(`${CLOUD_CACHE_CONFIG.API_URL}/api/lookup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users: screenNames })
            });
            if (!resp.ok) return {};
            const data = await resp.json();
            return data.results || {};
        } catch (err) {
            return {};
        }
    }
}

export const locationCache = new XLocationCacheManager();
