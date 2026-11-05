import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { createApiClient, setUnauthorizedHandler } from './client'
import { ApiError } from './errors'
import { tokenStore } from './token'

const BASE = 'http://api.test'
const client = createApiClient(BASE)

function envelope(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const result = await promise.then(
    () => null,
    (error: unknown) => error,
  )
  expect(result).toBeInstanceOf(ApiError)
  return result as ApiError
}

describe('api client', () => {
  it('returns typed data on success', async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'ok' })))
    const { data } = await client.GET('/health')
    expect(data).toEqual({ status: 'ok' })
  })

  it('sends the stored token as a bearer header', async () => {
    let seen: string | null = null
    server.use(
      http.get(`${BASE}/users/me`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ id: 1, email: 'a@b.c', created_at: '2026-11-05T00:00:00Z' })
      }),
    )
    tokenStore.set('abc123')
    await client.GET('/users/me')
    expect(seen).toBe('Bearer abc123')
  })

  it('does not send an Authorization header without a token', async () => {
    let seen: string | null = 'unset'
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        seen = request.headers.get('authorization')
        return HttpResponse.json({ status: 'ok' })
      }),
    )
    await client.GET('/health')
    expect(seen).toBeNull()
  })

  it('throws an ApiError carrying the code from the envelope', async () => {
    server.use(
      http.get(`${BASE}/tracks/:id`, () =>
        HttpResponse.json(envelope('not_found', 'Track not found'), {
          status: 404,
          headers: { 'X-Request-ID': 'req-1' },
        }),
      ),
    )
    const error = await failure(
      client.GET('/tracks/{track_id}', { params: { path: { track_id: 9 } } }),
    )
    expect(error.status).toBe(404)
    expect(error.code).toBe('not_found')
    expect(error.requestId).toBe('req-1')
  })

  it('exposes 422 field errors', async () => {
    server.use(
      http.post(`${BASE}/tracks`, () =>
        HttpResponse.json(
          envelope('validation_error', 'Invalid input', {
            fields: [{ location: 'body', field: 'title', message: 'Field required' }],
          }),
          { status: 422 },
        ),
      ),
    )
    const error = await failure(client.POST('/tracks', { body: { title: '' } }))
    expect(error.code).toBe('validation_error')
    expect(error.fields).toEqual([{ location: 'body', field: 'title', message: 'Field required' }])
  })

  it('exposes Retry-After on 429', async () => {
    server.use(
      http.get(`${BASE}/tracks`, () =>
        HttpResponse.json(envelope('rate_limited', 'Too many requests'), {
          status: 429,
          headers: { 'Retry-After': '42' },
        }),
      ),
    )
    const error = await failure(client.GET('/tracks'))
    expect(error.code).toBe('rate_limited')
    expect(error.retryAfter).toBe(42)
  })

  it('maps a non-envelope proxy error to code "unknown"', async () => {
    server.use(
      http.get(
        `${BASE}/tracks`,
        () =>
          new HttpResponse('<html>Bad gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    )
    const error = await failure(client.GET('/tracks'))
    expect(error.code).toBe('unknown')
    expect(error.status).toBe(502)
  })

  it('maps a failed connection to code "network_error"', async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.error()))
    const error = await failure(client.GET('/health'))
    expect(error.code).toBe('network_error')
    expect(error.status).toBe(0)
  })

  it('treats 204 as success without a body', async () => {
    server.use(http.delete(`${BASE}/users/me`, () => new HttpResponse(null, { status: 204 })))
    const { data } = await client.DELETE('/users/me', { body: { password: 'secret-pw' } })
    expect(data).toBeUndefined()
  })

  describe('401 handling', () => {
    it('clears the token and calls the handler on 401', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      server.use(
        http.get(`${BASE}/users/me`, () =>
          HttpResponse.json(envelope('unauthorized', 'Not authenticated'), { status: 401 }),
        ),
      )
      tokenStore.set('expired')
      const error = await failure(client.GET('/users/me'))
      expect(error.code).toBe('unauthorized')
      expect(tokenStore.get()).toBeNull()
      expect(handler).toHaveBeenCalledOnce()
      setUnauthorizedHandler(undefined)
    })

    it('leaves a wrong-password login alone', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      server.use(
        http.post(`${BASE}/auth/login`, () =>
          HttpResponse.json(envelope('unauthorized', 'Incorrect email or password'), {
            status: 401,
          }),
        ),
      )
      tokenStore.set('still-valid')
      const error = await failure(
        client.POST('/auth/login', {
          body: { username: 'a@b.c', password: 'wrong-pw', scope: '' },
        }),
      )
      expect(error.code).toBe('unauthorized')
      expect(tokenStore.get()).toBe('still-valid')
      expect(handler).not.toHaveBeenCalled()
      setUnauthorizedHandler(undefined)
    })
  })
})
