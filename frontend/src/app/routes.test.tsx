import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../api/client'
import { tokenStore } from '../api/token'
import { AuthProvider } from '../features/auth/AuthProvider'
import {
  clearPendingReason,
  getPendingReason,
  setPendingReason,
} from '../features/auth/pendingReason'
import { expectNoA11yViolations } from '../test/a11y'
import { server } from '../test/server'
import { routes } from './routes'

const ME_URL = `${API_BASE_URL}/users/me`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

type TestRouter = ReturnType<typeof createMemoryRouter>

afterEach(() => {
  clearPendingReason()
})

function serveMe() {
  server.use(http.get(ME_URL, () => HttpResponse.json(account)))
}

function serveEmptyTracks() {
  server.use(
    http.get(`${API_BASE_URL}/tracks`, () =>
      HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
    ),
  )
}

function signIn() {
  tokenStore.set('tok-1')
  serveMe()
}

function renderApp(url: string) {
  serveEmptyTracks()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { router, container: view.container, user: userEvent.setup() }
}

function where(router: TestRouter): string {
  const { pathname, search } = router.state.location
  return pathname + search
}

describe('signed out', () => {
  it('sends a guarded page to the login page', async () => {
    const { router } = renderApp('/tracks')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(where(router)).toBe('/login')
  })

  it('remembers where the person was going', async () => {
    const { router } = renderApp('/tracks/5?tab=x')

    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(where(router)).toBe('/login?returnTo=%2Ftracks%2F5%3Ftab%3Dx')
  })

  it('sends the root to the login page', async () => {
    const { router } = renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(where(router)).toBe('/login')
  })

  it('shows the session-expired notice when the redirect was caused by an expiry', async () => {
    setPendingReason('expired')
    const { router } = renderApp('/account')

    expect(await screen.findByRole('status')).toHaveTextContent(/Your session expired/)
    expect(where(router)).toBe('/login?returnTo=%2Faccount&reason=expired')
    expect(getPendingReason()).toBeNull()
  })

  it('shows the header with the brand only', async () => {
    renderApp('/login')

    expect(screen.getByRole('link', { name: 'AI Audio Assistant' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('shows the not-found page for an unknown address', async () => {
    renderApp('/nope')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('signed in', () => {
  it('shows the header with navigation, the email and Log out', async () => {
    signIn()
    renderApp('/tracks')

    expect(await screen.findByRole('heading', { level: 1, name: 'Tracks' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tracks' })).toHaveAttribute('aria-current', 'page')
  })

  it('sends the root to /tracks', async () => {
    signIn()
    const { router } = renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Tracks' })
    expect(where(router)).toBe('/tracks')
  })

  it.each([
    ['/analyses/7', 'Analysis'],
    ['/account', 'Account'],
  ])('opens %s', async (url, heading) => {
    signIn()
    renderApp(url)

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('shows the email on the account page', async () => {
    signIn()
    renderApp('/account')

    await screen.findByRole('heading', { level: 1, name: 'Account' })
    expect(screen.getAllByText('a@example.com').length).toBeGreaterThan(0)
  })

  it('logs out: clears the token and goes to a plain login page', async () => {
    signIn()
    const { router, user } = renderApp('/account')
    await screen.findByRole('heading', { level: 1, name: 'Account' })

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(where(router)).toBe('/login')
    expect(tokenStore.get()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    signIn()
    const { container } = renderApp('/tracks')
    await screen.findByRole('heading', { level: 1, name: 'Tracks' })
    await screen.findByText('You have no tracks yet.')

    await expectNoA11yViolations(container)
  })
})

describe('while the session is being checked', () => {
  it('shows a status line while /users/me is loading', async () => {
    tokenStore.set('tok-1')
    server.use(
      http.get(ME_URL, async () => {
        await delay('infinite')
        return HttpResponse.json(account)
      }),
    )

    renderApp('/tracks')

    expect(await screen.findByRole('status')).toHaveTextContent('Checking your session…')
  })

  it('offers a retry when the check fails for a reason other than a 401, and keeps the token', async () => {
    tokenStore.set('tok-1')
    server.use(
      http.get(ME_URL, () =>
        HttpResponse.json({ error: { code: 'internal_error', message: 'boom' } }, { status: 500 }),
      ),
    )
    const { user } = renderApp('/tracks')

    expect(
      await screen.findByRole('heading', { name: 'We could not check your session' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Something went wrong on the server.')).toBeInTheDocument()
    expect(tokenStore.get()).toBe('tok-1')

    serveMe()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Tracks' })).toBeInTheDocument()
  })
})
