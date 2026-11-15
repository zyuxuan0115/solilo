interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

class UserScopedTimelineCache {
  private store = new Map<string, Map<string, CacheEntry<unknown>>>()

  get<T>(uid: string, queryKey: string): T | null {
    const userBucket = this.store.get(uid)
    if (!userBucket) return null

    const entry = userBucket.get(queryKey)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      userBucket.delete(queryKey)
      return null
    }
    return entry.value as T
  }

  set<T>(uid: string, queryKey: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    let userBucket = this.store.get(uid)
    if (!userBucket) {
      userBucket = new Map()
      this.store.set(uid, userBucket)
    }
    userBucket.set(queryKey, {
      value,
      expiresAt: Date.now() + ttlMs,
    })
  }

  invalidateUser(uid: string): void {
    this.store.delete(uid)
  }
}

export const publicTimelineCache = new UserScopedTimelineCache()
