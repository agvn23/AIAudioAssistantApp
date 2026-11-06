import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPendingReason, getPendingReason, setPendingReason } from './pendingReason'
import { createSessionExpiryHandler } from './sessionExpiry'

afterEach(() => {
  clearPendingReason()
})

describe('pending reason', () => {
  it('starts empty, can be set and can be cleared', () => {
    expect(getPendingReason()).toBeNull()
    setPendingReason('logout')
    expect(getPendingReason()).toBe('logout')
    clearPendingReason()
    expect(getPendingReason()).toBeNull()
  })
})

describe('session expiry handler', () => {
  function run(pathname: string) {
    createSessionExpiryHandler({
      clearCache: vi.fn(),
      navigate: vi.fn(),
      getLocation: () => ({ pathname, search: '', hash: '' }),
    })()
  }

  it('marks the session as expired when it redirects', () => {
    run('/tracks')

    expect(getPendingReason()).toBe('expired')
  })

  it('marks nothing when the person is already on the login page', () => {
    run('/login')

    expect(getPendingReason()).toBeNull()
  })
})
