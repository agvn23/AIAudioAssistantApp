import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { DeleteTrackDialog } from './DeleteTrackDialog'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const track = { id: 7, title: 'Night Drive' }

function renderDialog() {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeleteTrackDialog track={track} onClose={onClose} onDeleted={onDeleted} />
    </QueryClientProvider>,
  )
  return { onClose, onDeleted, container: view.container, user: userEvent.setup() }
}

const deleteButton = () => screen.getByRole('button', { name: 'Yes, delete this track' })

describe('DeleteTrackDialog', () => {
  it('opens as a modal dialog that names the track, with focus on Cancel', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Delete this track?' })
    expect(dialog).toHaveAccessibleDescription(/Night Drive/)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('deletes the track, closes and reports it', async () => {
    let method = ''
    server.use(
      http.delete(url('/tracks/7'), ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { onClose, onDeleted, user } = renderDialog()

    await user.click(deleteButton())

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(method).toBe('DELETE')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes with Cancel without sending anything', async () => {
    const { onClose, onDeleted, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('disables both buttons while deleting', async () => {
    server.use(
      http.delete(url('/tracks/7'), async () => {
        await delay('infinite')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderDialog()

    await user.click(deleteButton())

    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows a server failure as an alert, stays open and lets the person retry', async () => {
    server.use(
      http.delete(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 }),
      ),
    )
    const { onClose, onDeleted, user } = renderDialog()

    await user.click(deleteButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server.',
    )
    expect(deleteButton()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('says so when the track no longer exists and stays open', async () => {
    server.use(
      http.delete(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )
    const { onClose, user } = renderDialog()

    await user.click(deleteButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not find that. It may have been deleted.',
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('adds the wait time to a rate-limit message', async () => {
    server.use(
      http.delete(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('rate_limited', 'Slow down'), {
          status: 429,
          headers: { 'Retry-After': '42' },
        }),
      ),
    )
    const { user } = renderDialog()

    await user.click(deleteButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Too many requests/)
    expect(alert).toHaveTextContent(/Wait about/)
  })

  it('has no accessibility violations, with an error showing', async () => {
    server.use(
      http.delete(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 }),
      ),
    )
    const { container, user } = renderDialog()
    await user.click(deleteButton())
    await screen.findByRole('alert')

    await expectNoA11yViolations(container)
  })
})
