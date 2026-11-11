export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

const KEY = 'aaa.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

// Memory copy so the choice still works for this tab if localStorage is
// unavailable (some private-browsing modes throw on access).
let memoryPreference: ThemePreference | null = null

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function systemQuery(): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== 'function') return null
  return globalThis.matchMedia(DARK_QUERY)
}

function readPreference(): ThemePreference {
  if (memoryPreference !== null) return memoryPreference
  try {
    const stored = localStorage.getItem(KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function apply(): void {
  const preference = readPreference()
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', preference)
  }
}

export const themeStore = {
  /** What the person chose: system, light or dark. */
  get(): ThemePreference {
    return readPreference()
  },
  /** What is actually shown: system is resolved through the OS setting. */
  resolved(): ResolvedTheme {
    const preference = readPreference()
    if (preference !== 'system') return preference
    return systemQuery()?.matches === true ? 'dark' : 'light'
  },
  set(preference: ThemePreference): void {
    memoryPreference = preference
    try {
      localStorage.setItem(KEY, preference)
    } catch {
      // Memory copy only: the choice lasts until the tab closes.
    }
    apply()
    notify()
  },
  /** Forget the saved choice (back to system). Used by tests. */
  clear(): void {
    memoryPreference = null
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing stored, nothing to clear.
    }
    apply()
    notify()
  },
  /**
   * Call once at startup: applies the saved choice to the page and tells
   * subscribers when the OS setting changes. Returns a cleanup function.
   */
  init(): () => void {
    apply()
    const query = systemQuery()
    if (query === null) return () => {}
    query.addEventListener('change', notify)
    return () => {
      query.removeEventListener('change', notify)
    }
  },
  /** For useSyncExternalStore. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
