export type ShortLivedCacheStatus = "hit" | "miss" | "deduplicated";

export type ShortLivedCacheResult<T> = {
  status: ShortLivedCacheStatus;
  value: T;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type ShortLivedCacheOptions = {
  maxEntries: number;
  now?: () => number;
  ttlMs: number;
};

export function createShortLivedCache<T>({ maxEntries, now = Date.now, ttlMs }: ShortLivedCacheOptions) {
  const entries = new Map<string, CacheEntry<T>>();
  const inFlight = new Map<string, Promise<T>>();

  function prune(timestamp: number) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= timestamp || entries.size > maxEntries) entries.delete(key);
      if (entries.size <= maxEntries) break;
    }
  }

  async function get(
    key: string,
    load: () => Promise<T>,
    getTtlMs: (value: T) => number = () => ttlMs,
  ): Promise<ShortLivedCacheResult<T>> {
    const timestamp = now();
    const cached = entries.get(key);
    if (cached && cached.expiresAt > timestamp) return { status: "hit", value: cached.value };
    if (cached) entries.delete(key);

    const pending = inFlight.get(key);
    if (pending) return { status: "deduplicated", value: await pending };

    const request = load();
    inFlight.set(key, request);
    try {
      const value = await request;
      const valueTtlMs = getTtlMs(value);
      if (valueTtlMs > 0) entries.set(key, { expiresAt: now() + valueTtlMs, value });
      prune(now());
      return { status: "miss", value };
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  }

  return { get };
}
