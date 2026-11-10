import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { DeleteVersionDialog } from './DeleteVersionDialog'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const version = { id: 7, track_id: 3, version_number: 2, original_filename: 'mix2.wav' }

function renderDialog() {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeleteVersionDialog analysis={version} onClose={onClose} onDeleted={onDeleted} />
    </QueryClientProvider>,
  )
  return { onClose, onDeleted, container: view.container, user: userEvent.setup() }
}

const deleteButton = () => screen.getByRole('button', { name: 'Yes, delete this version' })

describe('DeleteVersionDialog', () => {
  it('opens as a modal dialog that names the version, with focus on Cancel', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Delete this version?' })
    expect(dialog).toHaveAccessibleDescription(/Version 2/)
    expect(dialog).toHaveAccessibleDescription(/mix2\.wav/)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('deletes the version, closes and reports it', async () => {
    let method = ''
    server.use(
      http.delete(url('/analyses/7'), ({ request }) => {
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
      http.delete(url('/analyses/7'), async () => {
        await delay('infinite')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderDialog()

    await user.click(deleteButton())

    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('shows a failure as an alert, stays open and lets the person retry', async () => {
    server.use(
      http.delete(url('/analyses/7'), () =>
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

  it('has no accessibility violations, with an error showing', async () => {
    server.use(
      http.delete(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Analysis not found'), { status: 404 }),
      ),
    )
    const { container, user } = renderDialog()
    await user.click(deleteButton())
    await screen.findByRole('alert')

    await expectNoA11yViolations(container)
  })
})
