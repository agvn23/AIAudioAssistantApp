import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMe } from '../../api/auth'
import { API_BASE_URL, setUnauthorizedHandler } from '../../api/client'
import { tokenStore } from '../../api/token'
import { server } from '../../test/server'
import { createSessionExpiryHandler, registerSessionExpiry } from './sessionExpiry'

afterEach(() => {
  setUnauthorizedHandler(undefined)
})

function setup(location: { pathname: string; search?: string; hash?: string }) {
  const calls: string[] = []
  const clearCache = vi.fn(() => {
    calls.push('clear')
  })
  const navigate = vi.fn((to: string) => {
    calls.push('navigate')
    void to
  })
  const deps = {
    clearCache,
    navigate,
    getLocation: () => ({ search: '', hash: '', ...location }),
  }
  return { calls, clearCache, navigate, deps }
}

describe('createSessionExpiryHandler', () => {
  it('clears the cache, then goes to login with the current page and reason=expired', () => {
    const { calls, navigate, deps } = setup({ pathname: '/tracks/5', search: '?tag=house' })

    createSessionExpiryHandler(deps)()

    expect(calls).toEqual(['clear', 'navigate'])
    expect(navigate).toHaveBeenCalledOnce()
    const to = new URL(navigate.mock.calls[0]?.[0] ?? '', 'http://app.test')
    expect(to.pathname).toBe('/login')
    expect(to.searchParams.get('returnTo')).toBe('/tracks/5?tag=house')
    expect(to.searchParams.get('reason')).toBe('expired')
  })

  it('does not add returnTo when the person was on the default page', () => {
    const { navigate, deps } = setup({ pathname: '/tracks' })

    createSessionExpiryHandler(deps)()

    expect(navigate).toHaveBeenCalledWith('/login?reason=expired')
  })

  it('only clears the cache when already on the login page', () => {
    const { clearCache, navigate, deps } = setup({ pathname: '/login', search: '?reason=expired' })

    createSessionExpiryHandler(deps)()

    expect(clearCache).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('registerSessionExpiry', () => {
  it('runs after a 401 from the API client', async () => {
    const { clearCache, navigate, deps } = setup({ pathname: '/account' })
    registerSessionExpiry(deps)
    tokenStore.set('expired')
    server.use(
      http.get(`${API_BASE_URL}/users/me`, () =>
        HttpResponse.json(
          { error: { code: 'unauthorized', message: 'Not authenticated' } },
          { status: 401 },
        ),
      ),
    )

    await expect(getMe()).rejects.toMatchObject({ code: 'unauthorized' })

    expect(tokenStore.get()).toBeNull()
    expect(clearCache).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/login?returnTo=%2Faccount&reason=expired')
  })
})
