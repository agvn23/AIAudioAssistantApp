import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { setPendingReason } from '../features/auth/pendingReason'
import { useAuth } from '../features/auth/useAuth'
import styles from './Layout.module.css'

export function Layout() {
  const auth = useAuth()
  const navigate = useNavigate()

  function logOut() {
    // The route guard redirects too once the token is gone. Recording that this
    // is a deliberate logout keeps both redirects on the same plain /login.
    setPendingReason('logout')
    auth.signOut()
    void navigate('/login', { replace: true })
  }

  return (
    <>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          AI Audio Assistant
        </Link>
        {auth.status === 'signedIn' ? (
          <>
            <nav aria-label="Main" className={styles.nav}>
              <NavLink to="/tracks" className={styles.link}>
                Tracks
              </NavLink>
              <NavLink to="/account" className={styles.link}>
                Account
              </NavLink>
            </nav>
            <div className={styles.session}>
              <span className={styles.email}>{auth.user?.email}</span>
              <Button onClick={logOut}>Log out</Button>
            </div>
          </>
        ) : null}
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </>
  )
}
