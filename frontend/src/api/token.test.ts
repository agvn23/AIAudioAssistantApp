import { describe, expect, it, vi } from 'vitest'
import { tokenStore } from './token'

describe('tokenStore', () => {
  it('stores and clears the token', () => {
    expect(tokenStore.get()).toBeNull()
    tokenStore.set('abc')
    expect(tokenStore.get()).toBe('abc')
    tokenStore.clear()
    expect(tokenStore.get()).toBeNull()
  })

  it('writes to sessionStorage so a reload keeps the session', () => {
    tokenStore.set('abc')
    expect(sessionStorage.getItem('aaa.token')).toBe('abc')
    tokenStore.clear()
    expect(sessionStorage.getItem('aaa.token')).toBeNull()
  })

  it('reads from sessionStorage when the memory copy is empty (a page reload)', () => {
    tokenStore.clear()
    sessionStorage.setItem('aaa.token', 'from-storage')
    expect(tokenStore.get()).toBe('from-storage')
  })

  it('notifies subscribers on set and clear, and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = tokenStore.subscribe(listener)

    tokenStore.set('abc')
    tokenStore.clear()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    tokenStore.set('def')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
