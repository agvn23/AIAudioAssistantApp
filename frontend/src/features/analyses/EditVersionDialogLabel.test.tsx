import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import type { Analysis } from '../../api/types'
import { server } from '../../test/server'
import { EditVersionDialog } from './EditVersionDialog'

const saved: Analysis = {
  id: 7,
  track_id: 3,
  version_number: 2,
  label: 'x'.repeat(100),
  stage: null,
  original_filename: 'mix2.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-10T09:30:00Z',
  metrics: null,
  feedback: null,
}

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <EditVersionDialog analysis={{ id: 7, label: null, stage: null }} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), label: screen.getByRole('textbox', { name: 'Label' }) }
}

describe('the label in the edit dialog', () => {
  it('refuses a label over 100 characters before anything is sent', async () => {
    const { user, label } = renderDialog()

    await user.click(label)
    await user.paste('x'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(label).toHaveAttribute('aria-invalid', 'true'))
    expect(label).toHaveAccessibleDescription(/Error:\s*Use at most 100 characters/)
  })

  it('saves a label of exactly 100 characters', async () => {
    let sent: unknown
    server.use(
      http.patch(`${API_BASE_URL}/analyses/7`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(saved)
      }),
    )
    const onClose = vi.fn()
    const { user, label } = renderDialog(onClose)

    await user.click(label)
    await user.paste('x'.repeat(100))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(sent).toEqual({ label: 'x'.repeat(100) })
  })
})
