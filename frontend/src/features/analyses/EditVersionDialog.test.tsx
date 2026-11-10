import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import type { Analysis } from '../../api/types'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { EditVersionDialog } from './EditVersionDialog'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

const version: Analysis = {
  id: 7,
  track_id: 3,
  version_number: 2,
  label: 'vocals up',
  stage: 'mix',
  original_filename: 'mix2.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-10T09:30:00Z',
  metrics: null,
  feedback: null,
}

function renderDialog(analysis: Analysis = version) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <EditVersionDialog analysis={analysis} onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  )
  return { onClose, onSaved, container: view.container, user: userEvent.setup() }
}

const stageField = () => screen.getByRole('combobox', { name: 'Stage' })
const labelField = () => screen.getByRole('textbox', { name: 'Label' })
const saveButton = () => screen.getByRole('button', { name: 'Save changes' })

describe('EditVersionDialog', () => {
  it('opens as a modal dialog with the stage focused and the current values', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Edit version' })).toBeInTheDocument()
    expect(stageField()).toHaveFocus()
    expect(stageField()).toHaveValue('mix')
    expect(labelField()).toHaveValue('vocals up')
    expect(
      within(stageField())
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Not set', 'Demo', 'Mix', 'Master'])
  })

  it('starts empty for a version without stage and label', () => {
    renderDialog({ ...version, stage: null, label: null })

    expect(stageField()).toHaveValue('')
    expect(labelField()).toHaveValue('')
  })

  it('sends only the stage when only the stage changed', async () => {
    let sent: unknown
    const updated = { ...version, stage: 'master' }
    server.use(
      http.patch(url('/analyses/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(updated)
      }),
    )
    const { onClose, onSaved, user } = renderDialog()

    await user.selectOptions(stageField(), 'master')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    expect(sent).toEqual({ stage: 'master' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sends a trimmed new label', async () => {
    let sent: unknown
    server.use(
      http.patch(url('/analyses/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...version, label: 'final vocals' })
      }),
    )
    const { onSaved, user } = renderDialog()

    await user.clear(labelField())
    await user.type(labelField(), '  final vocals ')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual({ label: 'final vocals' })
  })

  it('sends null for a cleared label and for a cleared stage', async () => {
    let sent: unknown
    server.use(
      http.patch(url('/analyses/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...version, label: null, stage: null })
      }),
    )
    const { onSaved, user } = renderDialog()

    await user.clear(labelField())
    await user.selectOptions(stageField(), '')
    await user.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual({ stage: null, label: null })
  })

  it('closes without a request when nothing changed', async () => {
    const { onClose, onSaved, user } = renderDialog()

    await user.click(saveButton())

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('closes with Cancel without sending anything', async () => {
    const { onClose, onSaved, user } = renderDialog()

    await user.type(labelField(), ' more')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('disables the buttons while saving', async () => {
    server.use(
      http.patch(url('/analyses/7'), async () => {
        await delay('infinite')
        return HttpResponse.json(version)
      }),
    )
    const { user } = renderDialog()

    await user.selectOptions(stageField(), 'demo')
    await user.click(saveButton())

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('puts a label error of a 422 on the label field and in the summary', async () => {
    server.use(
      http.patch(url('/analyses/7'), () =>
        HttpResponse.json(
          errorBody('validation_error', 'Invalid input', {
            fields: [{ location: 'body', field: 'label', message: 'Label too long' }],
          }),
          { status: 422 },
        ),
      ),
    )
    const { onClose, user } = renderDialog()

    await user.type(labelField(), ' more')
    await user.click(saveButton())

    expect(await screen.findByRole('link', { name: 'Label: Label too long' })).toHaveAttribute(
      'href',
      '#version-label',
    )
    expect(labelField()).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says so when the version no longer exists and stays open', async () => {
    server.use(
      http.patch(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Analysis not found'), { status: 404 }),
      ),
    )
    const { onClose, user } = renderDialog()

    await user.selectOptions(stageField(), 'master')
    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not find that. It may have been deleted.',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(saveButton()).toBeEnabled()
  })

  it('has no accessibility violations, with an error showing', async () => {
    server.use(
      http.patch(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 }),
      ),
    )
    const { container, user } = renderDialog()
    await user.selectOptions(stageField(), 'master')
    await user.click(saveButton())
    await screen.findByRole('alert')

    await expectNoA11yViolations(container)
  })
})
