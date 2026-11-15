import { afterEach, describe, expect, it, vi } from 'vitest'
import { themeStore } from './themeStore'

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initial,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener)
    }),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  )
  return {
    query,
    change(next: boolean) {
      query.matches = next
      for (const listener of [...listeners]) listener()
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('themeStore', () => {
  it('defaults to system and light when there is no saved choice and no OS setting', () => {
    expect(themeStore.get()).toBe('system')
    expect(themeStore.resolved()).toBe('light')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('resolves system through the OS setting', () => {
    stubMatchMedia(true)

    expect(themeStore.get()).toBe('system')
    expect(themeStore.resolved()).toBe('dark')
  })

  it('lets an explicit choice win over the OS setting', () => {
    stubMatchMedia(true)

    themeStore.set('light')

    expect(themeStore.resolved()).toBe('light')
  })

  it('saves a dark choice and puts it on the page', () => {
    themeStore.set('dark')

    expect(themeStore.get()).toBe('dark')
    expect(localStorage.getItem('aaa.theme')).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('sets light and removes the attribute again for system', () => {
    themeStore.set('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    themeStore.set('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem('aaa.theme')).toBe('system')
  })

  it('reads a saved choice', () => {
    themeStore.clear()
    localStorage.setItem('aaa.theme', 'dark')

    expect(themeStore.get()).toBe('dark')
  })

  it('ignores a saved value it does not know', () => {
    themeStore.clear()
    localStorage.setItem('aaa.theme', 'purple')

    expect(themeStore.get()).toBe('system')
  })

  it('keeps the choice in memory when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    try {
      themeStore.set('dark')

      expect(themeStore.get()).toBe('dark')
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    } finally {
      spy.mockRestore()
    }
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = themeStore.subscribe(listener)

    themeStore.set('dark')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    themeStore.set('light')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('applies a saved choice to the page on init', () => {
    themeStore.clear()
    localStorage.setItem('aaa.theme', 'dark')

    const stop = themeStore.init()

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    stop()
  })

  it('notifies subscribers when the OS setting changes, until init is cleaned up', () => {
    const media = stubMatchMedia(false)
    const listener = vi.fn()
    themeStore.subscribe(listener)
    const stop = themeStore.init()

    media.change(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(themeStore.resolved()).toBe('dark')

    stop()
    media.change(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
