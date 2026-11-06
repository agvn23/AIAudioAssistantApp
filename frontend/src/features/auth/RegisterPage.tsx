import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { login, register as registerAccount } from '../../api/auth'
import { ApiError, describeError } from '../../api/errors'
import { ErrorSummary } from '../../components/ErrorSummary'
import type { ErrorSummaryItem } from '../../components/ErrorSummary'
import { SubmitButton } from '../../components/SubmitButton'
import { TextField } from '../../components/TextField'
import { formatWait } from './formatWait'
import styles from './RegisterPage.module.css'
import { buildAuthLink, safeReturnTo } from './returnTo'
import { PASSWORD_MAX, PASSWORD_MIN, validateEmail } from './rules'
import { useAuth } from './useAuth'
import { useCountdown } from './useCountdown'

const EMAIL_ID = 'register-email'
const PASSWORD_ID = 'register-password'
const DEFAULT_RETRY_SECONDS = 60

interface RegisterValues {
  email: string
  password: string
}

type RegisterField = 'email' | 'password'

interface Failure {
  fieldErrors: Partial<Record<RegisterField, string>>
  formMessages: string[]
  retryAfter?: number
}

/** Registration failed. Branches on error.code, never on the message. */
function describeRegisterFailure(error: unknown): Failure {
  if (!(error instanceof ApiError)) {
    return { fieldErrors: {}, formMessages: [describeError(error)] }
  }

  switch (error.code) {
    case 'conflict':
      return {
        fieldErrors: { email: 'An account with this email already exists.' },
        formMessages: [],
      }

    case 'rate_limited':
      return {
        fieldErrors: {},
        formMessages: [describeError(error)],
        retryAfter: error.retryAfter ?? DEFAULT_RETRY_SECONDS,
      }

    case 'validation_error': {
      const fieldErrors: Partial<Record<RegisterField, string>> = {}
      const formMessages: string[] = []
      for (const item of error.fields) {
        const field = item.field
        if (field === 'email' || field === 'password') {
          if (fieldErrors[field] === undefined) fieldErrors[field] = item.message
        } else {
          formMessages.push(item.message)
        }
      }
      if (Object.keys(fieldErrors).length === 0 && formMessages.length === 0) {
        formMessages.push(describeError(error))
      }
      return { fieldErrors, formMessages }
    }

    default:
      return { fieldErrors: {}, formMessages: [describeError(error)] }
  }
}

const CREATED_BUT_NOT_SIGNED_IN = 'Your account was created, but signing you in failed.'

/** The account exists, but the automatic sign-in that follows did not work. */
function describeSignInFailure(error: unknown): Failure {
  if (error instanceof ApiError && error.code === 'rate_limited') {
    return {
      fieldErrors: {},
      formMessages: [CREATED_BUT_NOT_SIGNED_IN, describeError(error)],
      retryAfter: error.retryAfter ?? DEFAULT_RETRY_SECONDS,
    }
  }
  if (error instanceof ApiError && error.code === 'unauthorized') {
    return {
      fieldErrors: {},
      formMessages: [`${CREATED_BUT_NOT_SIGNED_IN} Try again from the sign-in page.`],
    }
  }
  return { fieldErrors: {}, formMessages: [CREATED_BUT_NOT_SIGNED_IN, describeError(error)] }
}

export function RegisterPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { secondsLeft, start: startCountdown } = useCountdown()
  const [problems, setProblems] = useState<ErrorSummaryItem[]>([])
  const [focusToken, setFocusToken] = useState(0)
  // Set once registration has succeeded, so a retry only repeats the sign-in
  // (registering the same email again would be a 409).
  const [created, setCreated] = useState<RegisterValues | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ defaultValues: { email: '', password: '' } })

  const returnTo = safeReturnTo(params.get('returnTo'))

  if (auth.status === 'signedIn') return <Navigate to={returnTo} replace />

  function showProblems(items: ErrorSummaryItem[]) {
    setProblems(items)
    setFocusToken((token) => token + 1)
  }

  function onInvalid(fieldErrors: FieldErrors<RegisterValues>) {
    const items: ErrorSummaryItem[] = []
    if (fieldErrors.email?.message) items.push({ id: EMAIL_ID, message: fieldErrors.email.message })
    if (fieldErrors.password?.message) {
      items.push({ id: PASSWORD_ID, message: fieldErrors.password.message })
    }
    showProblems(items)
  }

  async function onValid(values: RegisterValues) {
    setProblems([])
    const email = values.email.trim()
    const password = values.password

    const alreadyCreated = created?.email === email && created.password === password
    let stage: 'register' | 'signIn' = 'register'

    try {
      if (!alreadyCreated) {
        await registerAccount(email, password)
        setCreated({ email, password })
      }
      stage = 'signIn'
      const token = await login(email, password)
      setCreated(null)
      auth.signIn(token)
      void navigate(returnTo, { replace: true })
    } catch (error) {
      const failure =
        stage === 'register' ? describeRegisterFailure(error) : describeSignInFailure(error)
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

  return (
    <section className={styles.page}>
      <h1>Create account</h1>

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
          hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters`}
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password', {
            required: 'Enter a password',
            minLength: {
              value: PASSWORD_MIN,
              message: `Use at least ${PASSWORD_MIN} characters`,
            },
            maxLength: {
              value: PASSWORD_MAX,
              message: `Use at most ${PASSWORD_MAX} characters`,
            },
          })}
        />
        <SubmitButton
          pending={isSubmitting}
          pendingLabel="Creating account…"
          disabled={secondsLeft > 0}
        >
          {secondsLeft > 0 ? `Try again in ${formatWait(secondsLeft)}` : 'Create account'}
        </SubmitButton>
      </form>

      <p className={styles.alternative}>
        Already have an account? <Link to={buildAuthLink('/login', returnTo)}>Sign in</Link>
      </p>
    </section>
  )
}
