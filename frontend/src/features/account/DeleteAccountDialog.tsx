import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { deleteAccount } from '../../api/auth'
import { ApiError, describeError } from '../../api/errors'
import { Button } from '../../components/Button'
import { SubmitButton } from '../../components/SubmitButton'
import { TextField } from '../../components/TextField'
import { formatWait } from '../auth/formatWait'
import { setPendingReason } from '../auth/pendingReason'
import { PASSWORD_MAX } from '../auth/rules'
import { useAuth } from '../auth/useAuth'
import styles from './DeleteAccountDialog.module.css'

const PASSWORD_ID = 'delete-account-password'

interface DeleteValues {
  password: string
}

export interface DeleteAccountDialogProps {
  open: boolean
  /** Called whenever the dialog closes, including through Esc. */
  onClose: () => void
}

/** A failure that is not "wrong password": shown as an alert inside the dialog. */
function describeDeleteFailure(error: unknown): string {
  const message = describeError(error)
  if (
    error instanceof ApiError &&
    error.code === 'rate_limited' &&
    error.retryAfter !== undefined
  ) {
    return `${message} Wait about ${formatWait(error.retryAfter)}.`
  }
  return message
}

/**
 * Asks for the password before deleting the account. The modal behaviour (focus
 * trap, Esc, backdrop) comes from the native <dialog> opened with showModal().
 * A wrong password (403 invalid_password) is shown on the field; anything else
 * is shown above the buttons. Success (204) signs out and goes to the login page.
 */
export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  const auth = useAuth()
  const navigate = useNavigate()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeleteValues>({ defaultValues: { password: '' } })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setFocus('password')
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, setFocus])

  // Runs for Cancel, Esc and a programmatic close alike: forget what was typed.
  function handleClosed() {
    reset()
    setFormError(null)
    onClose()
  }

  async function onValid({ password }: DeleteValues) {
    setFormError(null)
    try {
      await deleteAccount(password)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid_password') {
        setError('password', { type: 'server', message: describeError(error) })
        setFocus('password')
        return
      }
      setFormError(describeDeleteFailure(error))
      return
    }
    // The route guard redirects as soon as the token is gone. Recording why keeps
    // both redirects on the same URL.
    setPendingReason('deleted')
    auth.signOut()
    void navigate('/login?reason=deleted', { replace: true })
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialog}
      onClose={handleClosed}
      onCancel={(event) => {
        // Esc must not abandon a request that is already on its way.
        if (isSubmitting) event.preventDefault()
      }}
    >
      <h2 id={titleId} className={styles.title}>
        Delete your account?
      </h2>
      <p className={styles.warning}>
        This permanently deletes your account and all of your tracks, versions and feedback. It
        cannot be undone.
      </p>
      <form noValidate onSubmit={handleSubmit(onValid)} className={styles.form}>
        <TextField
          id={PASSWORD_ID}
          label="Your password"
          hint="Enter it to confirm."
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password', {
            required: 'Enter your password',
            maxLength: {
              value: PASSWORD_MAX,
              message: `Use at most ${PASSWORD_MAX} characters`,
            },
          })}
        />
        {formError !== null ? (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <SubmitButton variant="danger" pending={isSubmitting} pendingLabel="Deleting…">
            Yes, delete my account
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
