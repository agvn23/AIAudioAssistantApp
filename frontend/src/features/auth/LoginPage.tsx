import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { login } from '../../api/auth'
import { ApiError, describeError } from '../../api/errors'
import { ErrorSummary } from '../../components/ErrorSummary'
import type { ErrorSummaryItem } from '../../components/ErrorSummary'
import { SubmitButton } from '../../components/SubmitButton'
import { TextField } from '../../components/TextField'
import styles from './LoginPage.module.css'
import { buildAuthLink, safeReturnTo } from './returnTo'
import { clearPendingReason } from './pendingReason'
import { PASSWORD_MAX, validateEmail } from './rules'
import { useAuth } from './useAuth'
import { useCountdown } from './useCountdown'

const EMAIL_ID = 'login-email'
const PASSWORD_ID = 'login-password'
const DEFAULT_RETRY_SECONDS = 30

interface LoginValues {
  email: string
  password: string
}

type LoginField = 'email' | 'password'

interface LoginFailure {
  fieldErrors: Partial<Record<LoginField, string>>
  formMessages: string[]
  retryAfter?: number
}

/**
 * Branches on error.code, never on the message. A wrong password is a 401
 * "unauthorized" (the API client leaves login requests alone), shown in our own
 * words because the generic copy for that code talks about expired sessions.
 */
function describeLoginFailure(error: unknown): LoginFailure {
  if (!(error instanceof ApiError)) {
    return { fieldErrors: {}, formMessages: [describeError(error)] }
  }

  switch (error.code) {
    case 'unauthorized':
      return { fieldErrors: {}, formMessages: ['Incorrect email or password.'] }

    case 'rate_limited':
      return {
        fieldErrors: {},
        formMessages: [describeError(error)],
        retryAfter: error.retryAfter ?? DEFAULT_RETRY_SECONDS,
      }

    case 'validation_error': {
      // The email travels in the form field called "username".
      const fieldErrors: Partial<Record<LoginField, string>> = {}
      for (const item of error.fields) {
        const field: LoginField | null =
          item.field === 'username' || item.field === 'email'
            ? 'email'
            : item.field === 'password'
              ? 'password'
              : null
        if (field !== null && fieldErrors[field] === undefined) fieldErrors[field] = item.message
      }
      if (fieldErrors.email === undefined && fieldErrors.password === undefined) {
        return { fieldErrors: {}, formMessages: [describeError(error)] }
      }
      return { fieldErrors, formMessages: [] }
    }

    default:
      return { fieldErrors: {}, formMessages: [describeError(error)] }
  }
}

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { secondsLeft, start: startCountdown } = useCountdown()
  const [problems, setProblems] = useState<ErrorSummaryItem[]>([])
  const [focusToken, setFocusToken] = useState(0)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ defaultValues: { email: '', password: '' } })
  // The login page is where a pending redirect reason ends.
  useEffect(() => {
    clearPendingReason()
  }, [])

  const returnTo = safeReturnTo(params.get('returnTo'))
  const reason = params.get('reason')

  // Visiting /login while already signed in has nothing to show.
  if (auth.status === 'signedIn') return <Navigate to={returnTo} replace />

  function showProblems(items: ErrorSummaryItem[]) {
    setProblems(items)
    setFocusToken((token) => token + 1)
  }

  function onInvalid(fieldErrors: FieldErrors<LoginValues>) {
    const items: ErrorSummaryItem[] = []
    if (fieldErrors.email?.message) items.push({ id: EMAIL_ID, message: fieldErrors.email.message })
    if (fieldErrors.password?.message) {
      items.push({ id: PASSWORD_ID, message: fieldErrors.password.message })
    }
    showProblems(items)
  }

  async function onValid(values: LoginValues) {
    setProblems([])
    try {
      const token = await login(values.email.trim(), values.password)
      auth.signIn(token)
      void navigate(returnTo, { replace: true })
    } catch (error) {
      const failure = describeLoginFailure(error)
      const items: ErrorSummaryItem[] = []
      if (failure.fieldErrors.email !== undefined) {
        setError('email', { type: 'server', message: failure.fieldErrors.email })
        items.push({ id: EMAIL_ID, message: failure.fieldErrors.email })
      }
      if (failure.fieldErrors.password !== undefined) {
        setError('password', { type: 'server', message: failure.fieldErrors.password })
        items.push({ id: PASSWORD_ID, message: failure.fieldErrors.password })
      }
      for (const message of failure.formMessages) items.push({ message })
      if (failure.retryAfter !== undefined) startCountdown(failure.retryAfter)
      showProblems(items)
    }
  }

  const registerHref = buildAuthLink('/register', returnTo)

  return (
    <section className={styles.page}>
      <h1>Sign in</h1>

      {reason === 'expired' ? (
        <p role="status" className={styles.notice}>
          Your session expired. Sign in again to continue.
        </p>
      ) : null}

      {reason === 'deleted' ? (
        <p role="status" className={styles.notice}>
          Your account and all its data were deleted.
        </p>
      ) : null}

      <ErrorSummary errors={problems} focusToken={focusToken} />

      <form noValidate onSubmit={handleSubmit(onValid, onInvalid)} className={styles.form}>
        <TextField
          id={EMAIL_ID}
          label="Email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.email?.message}
          {...register('email', { validate: validateEmail })}
        />
        <TextField
          id={PASSWORD_ID}
          label="Password"
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
        <SubmitButton pending={isSubmitting} pendingLabel="Signing in…" disabled={secondsLeft > 0}>
          {secondsLeft > 0 ? `Try again in ${secondsLeft} s` : 'Sign in'}
        </SubmitButton>
      </form>

      <p className={styles.alternative}>
        No account yet? <Link to={registerHref}>Create one</Link>
      </p>
    </section>
  )
}
