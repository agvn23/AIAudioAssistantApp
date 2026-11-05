import createClient from 'openapi-fetch'
import { ApiError, buildApiError } from './errors'
import type { paths } from './schema'
import { tokenStore } from './token'

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

let unauthorizedHandler: (() => void) | undefined

/** Called after a 401 from anything except the login request. The auth feature registers it. */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler
}

function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'AbortError'
  )
}

function isLoginRequest(request: Request): boolean {
  return new URL(request.url).pathname.endsWith('/auth/login')
}

/**
 * The single place where HTTP failures become ApiErrors. Wrong-password login
 * is also a 401, so the login request is exempt from the session-expiry handling.
 */
async function apiFetch(request: Request): Promise<Response> {
  const token = tokenStore.get()
  if (token !== null && !request.headers.has('Authorization')) {
    request.headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    // Looked up at call time so test mocks installed after import are used.
    response = await globalThis.fetch(request)
  } catch (cause) {
    if (isAbortError(cause)) throw cause
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: 'Could not reach the server.',
    })
  }

  if (response.ok) return response

  const error = buildApiError(response.status, await response.text(), response.headers)
  if (response.status === 401 && !isLoginRequest(request)) {
    tokenStore.clear()
    unauthorizedHandler?.()
  }
  throw error
}

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, fetch: apiFetch })
}

export const api = createApiClient(API_BASE_URL)
