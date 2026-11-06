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
import { LoginPage } from './LoginPage'

const LOGIN_URL = `${API_BASE_URL}/auth/login`
const ME_URL = `${API_BASE_URL}/users/me`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

function serveMe() {
  server.use(http.get(ME_URL, () => HttpResponse.json(account)))
}

function serveLogin() {
  const seen: { form: Record<string, string> } = { form: {} }
  server.use(
    http.post(LOGIN_URL, async ({ request }) => {
      seen.form = Object.fromEntries(new URLSearchParams(await request.text()))
      return HttpResponse.json({ access_token: 'tok-1', token_type: 'bearer' })
    }),
  )
  return seen
}

function serveLoginFailure(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  server.use(http.post(LOGIN_URL, () => HttpResponse.json(body, { status, headers })))
}

function renderLogin(url = '/login') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <p>Register page</p> },
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
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

async function findSummary() {
  return screen.findByRole('region', { name: 'There is a problem' })
}

describe('LoginPage', () => {
  it('shows an empty form without a summary or a session notice', () => {
    renderLogin()

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the session-expired notice for reason=expired', () => {
    renderLogin('/login?reason=expired')

    expect(screen.getByRole('status')).toHaveTextContent(/Your session expired/)
  })

  describe('validation before sending', () => {
    it('lists what is missing, focuses the summary and sends nothing', async () => {
      const { user } = renderLogin()

      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      const summary = await findSummary()
      expect(screen.getByRole('link', { name: 'Enter your email address' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Enter your password' })).toBeInTheDocument()
      await waitFor(() => expect(summary).toHaveFocus())
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/Enter your email address/)
      expect(tokenStore.get()).toBeNull()
    })

    it('rejects something that is not an email address', async () => {
      const { user } = renderLogin()

      await fillAndSubmit(user, 'not-an-email', 'secret-pass')

      await findSummary()
      expect(
        screen.getByRole('link', { name: 'Enter an email address like name@example.com' }),
      ).toBeInTheDocument()
    })
  })

  describe('signing in', () => {
    it('sends the trimmed email as username, stores the token and opens /tracks', async () => {
      const seen = serveLogin()
      serveMe()
      const { user } = renderLogin()

      await fillAndSubmit(user, '  a@example.com ', 'secret-pass')

      expect(await screen.findByText('Tracks page')).toBeInTheDocument()
      expect(tokenStore.get()).toBe('tok-1')
      expect(seen.form).toEqual({
        username: 'a@example.com',
        password: 'secret-pass',
        scope: '',
      })
    })

    it('goes back to the page in returnTo', async () => {
      serveLogin()
      serveMe()
      const { user } = renderLogin('/login?returnTo=%2Ftracks%2F5')

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await screen.findByText('Track detail page')).toBeInTheDocument()
    })

    it('ignores a returnTo that leaves the site', async () => {
      serveLogin()
      serveMe()
      const { user } = renderLogin('/login?returnTo=%2F%2Fevil.example')

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await screen.findByText('Tracks page')).toBeInTheDocument()
    })

    it('skips the form when already signed in', async () => {
      tokenStore.set('tok-existing')
      serveMe()

      renderLogin()

      expect(await screen.findByText('Tracks page')).toBeInTheDocument()
    })
  })

  describe('failures', () => {
    it('shows a wrong password as a form error in our own words', async () => {
      serveLoginFailure(401, errorBody('unauthorized', 'Server wording that must not be shown'))
      const { user, router } = renderLogin()

      await fillAndSubmit(user, 'a@example.com', 'wrong-pass')

      const summary = await findSummary()
      expect(summary).toHaveTextContent('Incorrect email or password.')
      expect(summary).not.toHaveTextContent('Server wording')
      await waitFor(() => expect(summary).toHaveFocus())
      expect(tokenStore.get()).toBeNull()
      expect(router.state.location.pathname).toBe('/login')
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    })

    it('maps 422 field errors onto the inputs, with the email called username', async () => {
      serveLoginFailure(
        422,
        errorBody('validation_error', 'Invalid input', {
          fields: [{ location: 'form', field: 'username', message: 'Not an acceptable address' }],
        }),
      )
      const { user } = renderLogin()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await screen.findByRole('link', { name: 'Not an acceptable address' })).toBeVisible()
      const email = screen.getByLabelText('Email')
      expect(email).toHaveAttribute('aria-invalid', 'true')
      expect(email).toHaveAccessibleDescription(/Not an acceptable address/)
    })

    it('disables the button with a countdown after a 429', async () => {
      serveLoginFailure(429, errorBody('rate_limited', 'Too many attempts'), {
        'Retry-After': '42',
      })
      const { user } = renderLogin()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      const button = await screen.findByRole('button', { name: /^Try again in \d+ s$/ })
      expect(button).toBeDisabled()
      expect((await findSummary()).textContent).toMatch(/Too many requests/)
    })

    it('explains a server failure', async () => {
      serveLoginFailure(500, errorBody('internal_error', 'boom'))
      const { user } = renderLogin()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await findSummary()).toHaveTextContent('Something went wrong on the server.')
    })

    it('explains a lost connection', async () => {
      server.use(http.post(LOGIN_URL, () => HttpResponse.error()))
      const { user } = renderLogin()

      await fillAndSubmit(user, 'a@example.com', 'secret-pass')

      expect(await findSummary()).toHaveTextContent('Could not reach the server.')
    })
  })

  describe('link to registration', () => {
    it('points to /register', () => {
      renderLogin()

      expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register')
    })

    it('carries returnTo along', () => {
      renderLogin('/login?returnTo=%2Ftracks%2F5')

      expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute(
        'href',
        '/register?returnTo=%2Ftracks%2F5',
      )
    })
  })

  it('has no accessibility violations with the notice and the error summary showing', async () => {
    const { user, container } = renderLogin('/login?reason=expired')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await findSummary()

    await expectNoA11yViolations(container)
  })
})
