import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import { server } from '../../test/server'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const ME_URL = `${API_BASE_URL}/users/me`
const user = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

function renderAuth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    )
  }
  return { queryClient, ...renderHook(() => useAuth(), { wrapper }) }
}

function serveMe(seen?: { authorization: string | null; count: number }) {
  server.use(
    http.get(ME_URL, ({ request }) => {
      if (seen) {
        seen.count += 1
        seen.authorization = request.headers.get('authorization')
      }
      return HttpResponse.json(user)
    }),
  )
}

describe('AuthProvider', () => {
  it('is signed out without a token and does not call the API', async () => {
    const seen = { authorization: null, count: 0 }
    serveMe(seen)

    const { result } = renderAuth()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(result.current.status).toBe('signedOut')
    expect(result.current.user).toBeUndefined()
    expect(seen.count).toBe(0)
  })

  it('loads the user when a token is already stored', async () => {
    tokenStore.set('tok-1')
    serveMe()

    const { result } = renderAuth()
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('signedIn'))
    expect(result.current.user).toEqual(user)
  })

  it('signIn stores the token and loads the user with it', async () => {
    const seen = { authorization: null as string | null, count: 0 }
    serveMe(seen)
    const { result } = renderAuth()
    expect(result.current.status).toBe('signedOut')

    act(() => result.current.signIn('tok-2'))

    await waitFor(() => expect(result.current.status).toBe('signedIn'))
    expect(tokenStore.get()).toBe('tok-2')
    expect(seen.authorization).toBe('Bearer tok-2')
  })

  it('signIn drops cached data left over from a previous user', async () => {
    serveMe()
    const { result, queryClient } = renderAuth()
    queryClient.setQueryData(['tracks'], ['previous user data'])

    act(() => result.current.signIn('tok-3'))

    expect(queryClient.getQueryData(['tracks'])).toBeUndefined()
    await waitFor(() => expect(result.current.status).toBe('signedIn'))
  })

  it('signOut clears the token and the whole query cache', async () => {
    tokenStore.set('tok-4')
    serveMe()
    const { result, queryClient } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signedIn'))
    queryClient.setQueryData(['tracks'], ['some data'])

    act(() => result.current.signOut())

    expect(result.current.status).toBe('signedOut')
    expect(result.current.user).toBeUndefined()
    expect(tokenStore.get()).toBeNull()
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
    expect(queryClient.getQueryData(['tracks'])).toBeUndefined()
  })

  it('becomes signed out when something else clears the token', async () => {
    tokenStore.set('tok-5')
    serveMe()
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signedIn'))

    act(() => tokenStore.clear())

    expect(result.current.status).toBe('signedOut')
  })

  it('becomes signed out when /users/me answers 401', async () => {
    tokenStore.set('expired')
    server.use(
      http.get(ME_URL, () =>
        HttpResponse.json(
          { error: { code: 'unauthorized', message: 'Not authenticated' } },
          { status: 401 },
        ),
      ),
    )

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('signedOut'))
    expect(tokenStore.get()).toBeNull()
  })

  it('reports status "error" for a server failure, keeps the token, and can retry', async () => {
    tokenStore.set('tok-6')
    server.use(
      http.get(ME_URL, () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Something went wrong' } },
          { status: 500 },
        ),
      ),
    )

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatchObject({ code: 'internal_error' })
    expect(tokenStore.get()).toBe('tok-6')

    serveMe()
    act(() => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe('signedIn'))
    expect(result.current.error).toBeUndefined()
  })
})

describe('useAuth', () => {
  it('throws outside an AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
  })
})
