import { setUnauthorizedHandler } from '../../api/client'
import { buildLoginUrl, isAuthPath } from './returnTo'

export interface SessionExpiryDeps {
  /** Drop every cached query: it belongs to the user who just lost their session. */
  clearCache: () => void
  getLocation: () => { pathname: string; search: string; hash: string }
  navigate: (to: string) => void
}

/**
 * What happens after a 401 on anything except the login request. The API client
 * has already cleared the token. We clear cached data and send the person to
 * /login with the page they were on, flagged as expired. On the login or
 * register page there is nothing to leave, so only the cache is cleared.
 */
export function createSessionExpiryHandler(deps: SessionExpiryDeps): () => void {
  return () => {
    deps.clearCache()
    const { pathname, search, hash } = deps.getLocation()
    if (isAuthPath(pathname)) return
    deps.navigate(buildLoginUrl(pathname + search + hash, { expired: true }))
  }
}

export function registerSessionExpiry(deps: SessionExpiryDeps): void {
  setUnauthorizedHandler(createSessionExpiryHandler(deps))
}
