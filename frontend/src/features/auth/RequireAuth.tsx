import { Navigate, Outlet, useLocation } from 'react-router'
import { describeError } from '../../api/errors'
import { Button } from '../../components/Button'
import { getPendingReason, setPendingReason } from './pendingReason'
import styles from './RequireAuth.module.css'
import { buildLoginUrl } from './returnTo'
import { useAuth } from './useAuth'

/**
 * Layout route for everything that needs a signed-in user. While the user is
 * loading it shows a status line, and when loading fails for a reason other
 * than a 401 (a lost connection, a 5xx) it offers a retry instead of throwing
 * away a token that may still be valid.
 */
export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()

  switch (auth.status) {
    case 'loading':
      return <p role="status">Checking your session…</p>

    case 'error':
      return (
        <section>
          <h1>We could not check your session</h1>
          <p>{describeError(auth.error)}</p>
          <div className={styles.actions}>
            <Button onClick={auth.retry}>Try again</Button>
            <Button
              onClick={() => {
                setPendingReason('logout')
                auth.signOut()
              }}
            >
              Sign out
            </Button>
          </div>
        </section>
      )

    case 'signedOut': {
      const reason = getPendingReason()
      const here = location.pathname + location.search + location.hash
      const to =
        reason === 'logout' ? '/login' : buildLoginUrl(here, { expired: reason === 'expired' })
      return <Navigate to={to} replace />
    }

    case 'signedIn':
      return <Outlet />
  }
}
