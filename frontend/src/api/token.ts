const KEY = 'aaa.token'

// Memory copy so the app keeps working if sessionStorage is unavailable
// (some private-browsing modes throw on access).
let memoryToken: string | null = null

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export const tokenStore = {
  get(): string | null {
    if (memoryToken !== null) return memoryToken
    try {
      return sessionStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set(token: string): void {
    memoryToken = token
    try {
      sessionStorage.setItem(KEY, token)
    } catch {
      // Memory copy only: the session ends when the tab closes anyway.
    }
    notify()
  },
  clear(): void {
    memoryToken = null
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // Nothing stored, nothing to clear.
    }
    notify()
  },
  /** For useSyncExternalStore. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
