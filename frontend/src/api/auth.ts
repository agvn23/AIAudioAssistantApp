import { api } from './client'
import { ApiError } from './errors'
import type { User } from './types'

/**
 * Thin, typed wrappers over the auth endpoints. They return plain data and
 * throw ApiError on any failure (the custom fetch in client.ts does that), so
 * callers branch on error.code. Nothing here touches the token store: signing
 * in and out is the auth provider's job.
 */

function requireData<T>(data: T | undefined, status: number): T {
  if (data === undefined) {
    throw new ApiError({
      status,
      code: 'unknown',
      message: 'The server sent an empty response.',
    })
  }
  return data
}

/** The login endpoint is an OAuth2 password form, not JSON. */
function formBody(body: unknown): URLSearchParams {
  const params = new URLSearchParams()
  if (typeof body === 'object' && body !== null) {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') params.set(key, value)
    }
  }
  return params
}

/** Resolves to the access token. The OAuth2 form calls the email "username". */
export async function login(email: string, password: string): Promise<string> {
  const { data, response } = await api.POST('/auth/login', {
    // The generated type marks scope as required even though the API defaults it.
    body: { username: email, password, scope: '' },
    bodySerializer: formBody,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return requireData(data, response.status).access_token
}

export async function register(email: string, password: string): Promise<User> {
  const { data, response } = await api.POST('/auth/register', {
    body: { email, password },
  })
  return requireData(data, response.status)
}

export async function getMe(): Promise<User> {
  const { data, response } = await api.GET('/users/me')
  return requireData(data, response.status)
}

/** 204 on success. A wrong password is a 403 with code "invalid_password". */
export async function deleteAccount(password: string): Promise<void> {
  await api.DELETE('/users/me', { body: { password } })
}
