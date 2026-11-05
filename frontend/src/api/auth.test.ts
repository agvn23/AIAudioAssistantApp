import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { deleteAccount, getMe, login, register } from './auth'
import { API_BASE_URL, setUnauthorizedHandler } from './client'
import { ApiError } from './errors'
import { tokenStore } from './token'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

const user = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

afterEach(() => {
  setUnauthorizedHandler(undefined)
})

describe('login', () => {
  it('sends the email as username in a form-encoded body and returns the token', async () => {
    const seen: { contentType: string | null; form: Record<string, string> } = {
      contentType: null,
      form: {},
    }
    server.use(
      http.post(url('/auth/login'), async ({ request }) => {
        seen.contentType = request.headers.get('content-type')
        seen.form = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json({ access_token: 'tok-123', token_type: 'bearer' })
      }),
    )

    await expect(login('a@example.com', 'secret-pass')).resolves.toBe('tok-123')
    expect(seen.contentType).toMatch(/^application\/x-www-form-urlencoded/)
    expect(seen.form).toEqual({
      username: 'a@example.com',
      password: 'secret-pass',
      scope: '',
    })
  })

  it('rejects with code "unauthorized" on a wrong password without triggering session expiry', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    server.use(
      http.post(url('/auth/login'), () =>
        HttpResponse.json(errorBody('unauthorized', 'Incorrect email or password'), {
          status: 401,
        }),
      ),
    )

    const error = await login('a@example.com', 'wrong').catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('keeps Retry-After on a 429', async () => {
    server.use(
      http.post(url('/auth/login'), () =>
        HttpResponse.json(errorBody('rate_limited', 'Too many attempts'), {
          status: 429,
          headers: { 'Retry-After': '42' },
        }),
      ),
    )

    const error = await login('a@example.com', 'x').catch((cause: unknown) => cause)

    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 42 })
  })
})

describe('register', () => {
  it('posts JSON and returns the new user', async () => {
    let sent: unknown
    server.use(
      http.post(url('/auth/register'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(user, { status: 201 })
      }),
    )

    await expect(register('a@example.com', 'secret-pass')).resolves.toEqual(user)
    expect(sent).toEqual({ email: 'a@example.com', password: 'secret-pass' })
  })

  it('rejects with code "conflict" when the email is taken', async () => {
    server.use(
      http.post(url('/auth/register'), () =>
        HttpResponse.json(errorBody('conflict', 'Email already registered'), { status: 409 }),
      ),
    )

    const error = await register('a@example.com', 'secret-pass').catch((cause: unknown) => cause)

    expect(error).toMatchObject({ status: 409, code: 'conflict' })
  })

  it('exposes the field errors of a 422', async () => {
    const fields = [{ location: 'body', field: 'password', message: 'Too short' }]
    server.use(
      http.post(url('/auth/register'), () =>
        HttpResponse.json(errorBody('validation_error', 'Invalid input', { fields }), {
          status: 422,
        }),
      ),
    )

    const error = await register('a@example.com', 'short').catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).fields).toEqual(fields)
  })
})

describe('getMe', () => {
  it('sends the stored token as a bearer header and returns the user', async () => {
    tokenStore.set('tok-abc')
    let authorization: string | null = null
    server.use(
      http.get(url('/users/me'), ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json(user)
      }),
    )

    await expect(getMe()).resolves.toEqual(user)
    expect(authorization).toBe('Bearer tok-abc')
  })

  it('clears the token and calls the unauthorized handler on a 401', async () => {
    tokenStore.set('expired')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    server.use(
      http.get(url('/users/me'), () =>
        HttpResponse.json(errorBody('unauthorized', 'Not authenticated'), { status: 401 }),
      ),
    )

    await expect(getMe()).rejects.toMatchObject({ status: 401, code: 'unauthorized' })

    expect(tokenStore.get()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})

describe('deleteAccount', () => {
  it('sends the password in a JSON body and resolves on 204', async () => {
    tokenStore.set('tok-abc')
    let sent: unknown
    server.use(
      http.delete(url('/users/me'), async ({ request }) => {
        sent = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteAccount('secret-pass')).resolves.toBeUndefined()
    expect(sent).toEqual({ password: 'secret-pass' })
  })

  it('rejects with code "invalid_password" on a 403', async () => {
    tokenStore.set('tok-abc')
    server.use(
      http.delete(url('/users/me'), () =>
        HttpResponse.json(errorBody('invalid_password', 'Incorrect password'), { status: 403 }),
      ),
    )

    await expect(deleteAccount('wrong')).rejects.toMatchObject({
      status: 403,
      code: 'invalid_password',
    })
  })
})
