import { Outlet } from 'react-router'
import styles from './Layout.module.css'

export function Layout() {
  return (
    <>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <span className={styles.brand}>AI Audio Assistant</span>
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </>
  )
}
