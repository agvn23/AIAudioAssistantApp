import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UploadVersionDialog } from './UploadVersionDialog'

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <UploadVersionDialog trackId={3} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), label: screen.getByRole('textbox', { name: 'Label' }) }
}

describe('the label in the upload dialog', () => {
  it('refuses a label over 100 characters before anything is sent', async () => {
    const { user, label } = renderDialog()

    await user.click(label)
    await user.paste('x'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Upload version' }))

    await waitFor(() => expect(label).toHaveAttribute('aria-invalid', 'true'))
    expect(label).toHaveAccessibleDescription(/Error:\s*Use at most 100 characters/)
  })

  it('accepts a label of exactly 100 characters', async () => {
    const { user, label } = renderDialog()

    await user.click(label)
    await user.paste('x'.repeat(100))
    await user.click(screen.getByRole('button', { name: 'Upload version' }))

    // With no file chosen the form stops at the file, not at the label.
    expect((await screen.findAllByText('Choose an audio file.')).length).toBeGreaterThan(0)
    expect(label).not.toHaveAttribute('aria-invalid', 'true')
  })
})
