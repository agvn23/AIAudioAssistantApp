import { useAuth } from '../auth/useAuth'

export function AccountPage() {
  const { user } = useAuth()

  return (
    <section>
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
    </section>
  )
}
