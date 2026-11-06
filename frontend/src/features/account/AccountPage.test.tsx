import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from '../../app/routes'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { AuthProvider } from '../auth/AuthProvider'
import { clearPendingReason } from '../auth/pendingReason'

const ME_URL = `${API_BASE_URL}/users/me`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

afterEach(() => {
  clearPendingReason()
})

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

function renderAccount() {
  tokenStore.set('tok-1')
  server.use(http.get(ME_URL, () => HttpResponse.json(account)))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: ['/account'] })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { router, container: view.container, user: userEvent.setup() }
}

// The closed dialog may or may not count as hidden in jsdom, so always ask for it
// explicitly and check its open attribute instead.
const dialogEl = () => screen.getByRole<HTMLDialogElement>('dialog', { hidden: true })

type Typist = ReturnType<typeof userEvent.setup>

async function openDialog(user: Typist) {
  await screen.findByRole('heading', { level: 1, name: 'Account' })
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  expect(dialogEl()).toHaveAttribute('open')
  return within(dialogEl())
}

function serveDelete(status: number, body?: Record<string, unknown>, headers = {}) {
  const seen: { body: unknown; authorization: string | null; calls: number } = {
    body: undefined,
    authorization: null,
    calls: 0,
  }
  server.use(
    http.delete(ME_URL, async ({ request }) => {
      seen.calls += 1
      seen.body = await request.json()
      seen.authorization = request.headers.get('authorization')
      if (status === 204) return new HttpResponse(null, { status })
      return HttpResponse.json(body ?? {}, { status, headers })
    }),
  )
  return seen
}

describe('AccountPage', () => {
  it('shows the email and a closed delete dialog', async () => {
    renderAccount()

    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument()
    expect(screen.getAllByText('a@example.com').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
    expect(dialogEl()).not.toHaveAttribute('open')
  })

  it('opens the dialog with the password field focused', async () => {
    const { user } = renderAccount()

    const dialog = await openDialog(user)

    expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeInTheDocument()
    expect(dialog.getByLabelText('Your password')).toHaveFocus()
    expect(dialogEl()).toHaveAccessibleName('Delete your account?')
  })

  it('closes on Cancel and forgets what was typed', async () => {
    const { user } = renderAccount()
    const dialog = await openDialog(user)
    await user.type(dialog.getByLabelText('Your password'), 'secret-pass')

    await user.click(dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(dialogEl()).not.toHaveAttribute('open'))

    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(dialogEl()).toHaveAttribute('open')
    expect(within(dialogEl()).getByLabelText('Your password')).toHaveValue('')
  })

  it('can be reopened after the dialog closed itself, as Esc does', async () => {
    const { user } = renderAccount()
    await openDialog(user)

    act(() => {
      dialogEl().close()
    })
    expect(dialogEl()).not.toHaveAttribute('open')

    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(dialogEl()).toHaveAttribute('open')
  })

  it('asks for the password and sends nothing when it is empty', async () => {
    const seen = serveDelete(204)
    const { user } = renderAccount()
    const dialog = await openDialog(user)

    await user.click(dialog.getByRole('button', { name: 'Yes, delete my account' }))

    const field = dialog.getByLabelText('Your password')
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect(field).toHaveAccessibleDescription(/Enter your password/)
    expect(seen.calls).toBe(0)
  })

  it('deletes the account, signs out and opens the login page with a notice', async () => {
    const seen = serveDelete(204)
    const { user, router } = renderAccount()
    const dialog = await openDialog(user)

    await user.type(dialog.getByLabelText('Your password'), 'secret-pass')
    await user.click(dialog.getByRole('button', { name: 'Yes, delete my account' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/account and all its data were deleted/)
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/login?reason=deleted',
    )
    expect(tokenStore.get()).toBeNull()
    expect(seen.body).toEqual({ password: 'secret-pass' })
    expect(seen.authorization).toBe('Bearer tok-1')
  })

  it('shows a wrong password on the field, keeps the dialog open and the session intact', async () => {
    serveDelete(403, errorBody('invalid_password', 'Server wording'))
    const { user } = renderAccount()
    const dialog = await openDialog(user)

    await user.type(dialog.getByLabelText('Your password'), 'wrong-pass')
    await user.click(dialog.getByRole('button', { name: 'Yes, delete my account' }))

    const field = dialog.getByLabelText('Your password')
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect(field).toHaveAccessibleDescription(/That password is not correct\./)
    expect(field).toHaveFocus()
    expect(dialogEl()).toHaveAttribute('open')
    expect(tokenStore.get()).toBe('tok-1')
    expect(dialog.getByRole('button', { name: 'Yes, delete my account' })).toBeEnabled()
  })

  it('explains a rate limit with the wait time', async () => {
    serveDelete(429, errorBody('rate_limited', 'Too many'), { 'Retry-After': '3600' })
    const { user } = renderAccount()
    const dialog = await openDialog(user)

    await user.type(dialog.getByLabelText('Your password'), 'secret-pass')
    await user.click(dialog.getByRole('button', { name: 'Yes, delete my account' }))

    const alert = await dialog.findByRole('alert')
    expect(alert).toHaveTextContent('Too many requests.')
    expect(alert).toHaveTextContent('Wait about 60 min.')
    expect(tokenStore.get()).toBe('tok-1')
  })

  it('explains a server failure and stays open', async () => {
    serveDelete(500, errorBody('internal_error', 'boom'))
    const { user } = renderAccount()
    const dialog = await openDialog(user)

    await user.type(dialog.getByLabelText('Your password'), 'secret-pass')
    await user.click(dialog.getByRole('button', { name: 'Yes, delete my account' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server.',
    )
    expect(dialogEl()).toHaveAttribute('open')
  })

  it('has no accessibility violations with the dialog open', async () => {
    const { user, container } = renderAccount()
    await openDialog(user)

    await expectNoA11yViolations(container)
  })
})
