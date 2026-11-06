import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { AuthProvider } from './AuthProvider'
import { RegisterPage } from './RegisterPage'

const REGISTER_URL = `${API_BASE_URL}/auth/register`
const LOGIN_URL = `${API_BASE_URL}/auth/login`
const ME_URL = `${API_BASE_URL}/users/me`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

function serveMe() {
  server.use(http.get(ME_URL, () => HttpResponse.json(account)))
}

/** Registration and sign-in both succeed. Records what each request carried. */
function serveSuccess() {
  const seen = {
    calls: [] as string[],
    registerBody: undefined as unknown,
    loginForm: {} as Record<string, string>,
  }
  server.use(
    http.post(REGISTER_URL, async ({ request }) => {
      seen.calls.push('register')
      seen.registerBody = await request.json()
      return HttpResponse.json(account, { status: 201 })
    }),
    http.post(LOGIN_URL, async ({ request }) => {
      seen.calls.push('login')
      seen.loginForm = Object.fromEntries(new URLSearchParams(await request.text()))
      return HttpResponse.json({ access_token: 'tok-1', token_type: 'bearer' })
    }),
  )
  serveMe()
  return seen
}

function serveRegisterFailure(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const seen = { loginCalls: 0 }
  server.use(
    http.post(REGISTER_URL, () => HttpResponse.json(body, { status, headers })),
    http.post(LOGIN_URL, () => {
      seen.loginCalls += 1
      return HttpResponse.json({ access_token: 'unexpected', token_type: 'bearer' })
    }),
  )
  return seen
}

function renderRegister(url = '/register') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/register', element: <RegisterPage /> },
      { path: '/login', element: <p>Login page</p> },
      { path: '/tracks', element: <p>Tracks page</p> },
      { path: '/tracks/:id', element: <p>Track detail page</p> },
    ],
    { initialEntries: [url] },
  )
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { router, container: view.container, user: userEvent.setup() }
}

type Typist = ReturnType<typeof userEvent.setup>

async function fillAndSubmit(user: Typist, email: string, password: string) {
  if (email !== '') await user.type(screen.getByLabelText('Email'), email)
  if (password !== '') await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

async function findSummary() {
  return screen.findByRole('region', { name: 'There is a problem' })
}

describe('RegisterPage', () => {
  it('shows an empty form with the password rule as a hint', () => {
    renderRegister()

    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('')
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    expect(password).toHaveAccessibleDescription('8 to 128 characters')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  describe('validation before sending', () => {
    it('lists what is missing, focuses the summary and sends nothing', async () => {
      const seen = serveSuccess()
      const { user } = renderRegister()

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      const summary = await findSummary()
      expect(screen.getByRole('link', { name: 'Enter your email address' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Enter a password' })).toBeInTheDocument()
      await waitFor(() => expect(summary).toHaveFocus())
      expect(seen.calls).toEqual([])
    })

    it('rejects a password that is too short', async () => {
      const seen = serveSuccess()
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'short')

      await findSummary()
      expect(screen.getByRole('link', { name: 'Use at least 8 characters' })).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
      expect(seen.calls).toEqual([])
    })

    it('rejects a password that is too long', async () => {
      const seen = serveSuccess()
      const { user } = renderRegister()

      await user.type(screen.getByLabelText('Email'), 'a@example.com')
      await user.click(screen.getByLabelText('Password'))
      await user.paste('x'.repeat(129))
      await user.click(screen.getByRole('button', { name: 'Create account' }))

      await findSummary()
      expect(screen.getByRole('link', { name: 'Use at most 128 characters' })).toBeInTheDocument()
      expect(seen.calls).toEqual([])
    })
  })

  describe('creating an account', () => {
    it('registers, then signs in with the same credentials and opens /tracks', async () => {
      const seen = serveSuccess()
      const { user } = renderRegister()

      await fillAndSubmit(user, '  a@example.com ', 'secret-pass')

      expect(await screen.findByText('Tracks page')).toBeInTheDocument()
      expect(seen.calls).toEqual(['register', 'login'])
      expect(seen.registerBody).toEqual({ email: 'a@example.com', password: 'secret-pass' })
      expect(seen.loginForm).toEqual({
        username: 'a@example.com',
        password: 'secret-pass',
        scope: '',
      })
      expect(tokenStore.get()).toBe('tok-1')
    })

    it('goes back to the page in returnTo', async () => {
      serveSuccess()
      const { user } = renderRegister('/register?returnTo=%2Ftracks%2F5')

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await screen.findByText('Track detail page')).toBeInTheDocument()
    })

    it('skips the form when already signed in', async () => {
      tokenStore.set('tok-existing')
      serveMe()

      renderRegister()

      expect(await screen.findByText('Tracks page')).toBeInTheDocument()
    })
  })

  describe('failures', () => {
    it('puts a taken email on the email field and does not try to sign in', async () => {
      const seen = serveRegisterFailure(409, errorBody('conflict', 'Server wording'))
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      const summary = await findSummary()
      expect(summary).toHaveTextContent('An account with this email already exists.')
      expect(summary).not.toHaveTextContent('Server wording')
      const email = screen.getByLabelText('Email')
      expect(email).toHaveAttribute('aria-invalid', 'true')
      expect(email).toHaveAccessibleDescription(/already exists/)
      await waitFor(() => expect(summary).toHaveFocus())
      expect(seen.loginCalls).toBe(0)
      expect(tokenStore.get()).toBeNull()
    })

    it('maps 422 field errors onto the inputs', async () => {
      serveRegisterFailure(
        422,
        errorBody('validation_error', 'Invalid input', {
          fields: [
            { location: 'body', field: 'email', message: 'Not a valid address' },
            { location: 'body', field: 'password', message: 'Too weak' },
          ],
        }),
      )
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await screen.findByRole('link', { name: 'Not a valid address' })).toBeVisible()
      expect(screen.getByRole('link', { name: 'Too weak' })).toBeVisible()
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/Not a valid address/)
      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Too weak/)
    })

    it('disables the button with a countdown in minutes after a long 429', async () => {
      serveRegisterFailure(429, errorBody('rate_limited', 'Too many'), { 'Retry-After': '3600' })
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      const button = await screen.findByRole('button', { name: 'Try again in 60 min' })
      expect(button).toBeDisabled()
      expect((await findSummary()).textContent).toMatch(/Too many requests/)
    })

    it('explains a server failure', async () => {
      serveRegisterFailure(500, errorBody('internal_error', 'boom'))
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await findSummary()).toHaveTextContent('Something went wrong on the server.')
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
    })

    it('explains a lost connection', async () => {
      server.use(http.post(REGISTER_URL, () => HttpResponse.error()))
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await findSummary()).toHaveTextContent('Could not reach the server.')
    })
  })

  describe('registered, but the automatic sign-in fails', () => {
    it('says the account exists and retries only the sign-in', async () => {
      const calls: string[] = []
      let loginAttempts = 0
      server.use(
        http.post(REGISTER_URL, () => {
          calls.push('register')
          return HttpResponse.json(account, { status: 201 })
        }),
        http.post(LOGIN_URL, () => {
          calls.push('login')
          loginAttempts += 1
          if (loginAttempts === 1) {
            return HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 })
          }
          return HttpResponse.json({ access_token: 'tok-1', token_type: 'bearer' })
        }),
      )
      serveMe()
      const { user } = renderRegister()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      const summary = await findSummary()
      expect(summary).toHaveTextContent('Your account was created')
      expect(tokenStore.get()).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Create account' }))

      expect(await screen.findByText('Tracks page')).toBeInTheDocument()
      expect(calls).toEqual(['register', 'login', 'login'])
      expect(tokenStore.get()).toBe('tok-1')
    })
  })

  describe('link to sign in', () => {
    it('points to /login', () => {
      renderRegister()

      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    })

    it('carries returnTo along', () => {
      renderRegister('/register?returnTo=%2Ftracks%2F5')

      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        '/login?returnTo=%2Ftracks%2F5',
      )
    })
  })

  it('has no accessibility violations with the error summary showing', async () => {
    const { user, container } = renderRegister()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await findSummary()

    await expectNoA11yViolations(container)
  })
})
