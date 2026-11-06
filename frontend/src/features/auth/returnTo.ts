/** Where a signed-in user lands when there is nothing better to return to. */
export const DEFAULT_RETURN_TO = '/tracks'

const AUTH_PATHS = ['/login', '/register']
const PLACEHOLDER_ORIGIN = 'http://placeholder.invalid'

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.includes(pathname.replace(/\/+$/, ''))
}

/**
 * Accepts only a same-origin path (with optional query and hash). Anything else,
 * including "//host", "/\host", absolute URLs and the login or register pages
 * themselves (which would loop), becomes the fallback. The query string is
 * user-controlled, so this runs on every returnTo before it is used.
 */
export function safeReturnTo(
  value: string | null | undefined,
  fallback: string = DEFAULT_RETURN_TO,
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }

  let url: URL
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN)
  } catch {
    return fallback
  }

  // The URL parser drops tabs and newlines, so "/\t/host" turns into "//host".
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback
  if (isAuthPath(url.pathname)) return fallback

  return url.pathname + url.search + url.hash
}

export interface LoginUrlOptions {
  expired?: boolean
}

/** "/login", plus returnTo when it is not just the default, plus reason=expired. */
export function buildLoginUrl(
  returnTo: string | null | undefined,
  options: LoginUrlOptions = {},
): string {
  const params = new URLSearchParams()
  const target = safeReturnTo(returnTo)
  if (target !== DEFAULT_RETURN_TO) params.set('returnTo', target)
  if (options.expired) params.set('reason', 'expired')

  const query = params.toString()
  return query === '' ? '/login' : `/login?${query}`
}
