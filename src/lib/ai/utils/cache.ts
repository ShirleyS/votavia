/**
 * Bounded in-memory TTL cache for successful model responses.
 *
 * Deliberately tiny and process-local: the main application owns durable
 * persistence. This only prevents duplicate calls when a report is reopened.
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface BoundedCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
}

export function createBoundedCache<T>(options: {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
} = {}): BoundedCache<T> {
  const ttlMs = Math.max(0, options.ttlMs ?? 5 * 60_000);
  const maxEntries = Math.max(1, options.maxEntries ?? 200);
  const now = options.now ?? Date.now;
  const store = new Map<string, CacheEntry<T>>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      // Refresh recency so hot entries survive eviction.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (ttlMs === 0) return;
      store.delete(key);
      store.set(key, { value, expiresAt: now() + ttlMs });
      while (store.size > maxEntries) {
        const oldest = store.keys().next();
        if (oldest.done) break;
        store.delete(oldest.value);
      }
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}
