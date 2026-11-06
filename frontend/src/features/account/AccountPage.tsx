import { useId, useState } from 'react'
import { Button } from '../../components/Button'
import { useAuth } from '../auth/useAuth'
import styles from './AccountPage.module.css'
import { DeleteAccountDialog } from './DeleteAccountDialog'

export function AccountPage() {
  const { user } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const dangerId = useId()

  return (
    <section>
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>

      <section aria-labelledby={dangerId} className={styles.danger}>
        <h2 id={dangerId}>Delete account</h2>
        <p>Permanently deletes your account and everything you uploaded. This cannot be undone.</p>
        <Button onClick={() => setDeleting(true)}>Delete account</Button>
      </section>

      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </section>
  )
}
