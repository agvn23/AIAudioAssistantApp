import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import type { Track } from '../../api/types'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { TrackFormDialog } from './TrackFormDialog'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

const track: Track = {
  id: 7,
  title: 'Night Drive',
  genre: 'house',
  target_platform: 'spotify',
  notes: 'first mix',
  tags: ['demo', 'club'],
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
}

function renderDialog(props: { track?: Track } = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TrackFormDialog track={props.track} onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  )
  return { onClose, onSaved, container: view.container, user: userEvent.setup() }
}

const titleField = () => screen.getByRole('textbox', { name: 'Title' })
const genreField = () => screen.getByRole('textbox', { name: 'Genre' })
const platformField = () => screen.getByRole('combobox', { name: 'Target platform' })
const notesField = () => screen.getByRole('textbox', { name: 'Notes' })
const tagsField = () => screen.getByRole('textbox', { name: 'Tags' })

describe('creating', () => {
  it('opens as a modal dialog with the title field focused', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'New track' })).toBeInTheDocument()
    expect(titleField()).toHaveFocus()
  })

  it('offers "Not set" and the six platforms', () => {
    renderDialog()

    expect(
      within(platformField())
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Not set', 'Spotify', 'Apple Music', 'YouTube', 'Broadcast', 'Club', 'Other'])
    expect(platformField()).toHaveValue('')
  })

  it('creates a track from the form and reports it', async () => {
    let sent: unknown
    server.use(
      http.post(url('/tracks'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(track, { status: 201 })
      }),
    )
    const { onClose, onSaved, user } = renderDialog()

    await user.type(titleField(), '  Night Drive ')
    await user.type(genreField(), 'house')
    await user.selectOptions(platformField(), 'spotify')
    await user.type(notesField(), 'first mix')
    await user.type(tagsField(), 'Demo{Enter}')
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(track))
    expect(sent).toEqual({
      title: 'Night Drive',
      genre: 'house',
      target_platform: 'spotify',
      notes: 'first mix',
      tags: ['demo'],
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves out optional fields that are empty', async () => {
    let sent: unknown
    server.use(
      http.post(url('/tracks'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(track, { status: 201 })
      }),
    )
    const { onSaved, user } = renderDialog()

    await user.type(titleField(), 'Just a title')
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual({ title: 'Just a title', tags: [] })
  })

  it('does not send an empty title and moves focus to the error summary', async () => {
    const { onSaved, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Create track' }))

    expect(await screen.findByRole('link', { name: 'Enter a title' })).toHaveAttribute(
      'href',
      '#track-title',
    )
    expect(titleField()).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByRole('heading', { name: 'There is a problem' }).closest('section'),
    ).toHaveFocus()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('does not send a title over 200 characters', async () => {
    const { user } = renderDialog()

    await user.click(titleField())
    await user.paste('a'.repeat(201))
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    expect(
      await screen.findByRole('link', { name: 'Use at most 200 characters' }),
    ).toBeInTheDocument()
  })

  it('shows the field errors of a 422 in the summary and on the fields', async () => {
    server.use(
      http.post(url('/tracks'), () =>
        HttpResponse.json(
          errorBody('validation_error', 'Invalid input', {
            fields: [
              { location: 'body', field: 'title', message: 'Title already used' },
              { location: 'body', field: 'tags', message: 'Too many tags' },
            ],
          }),
          { status: 422 },
        ),
      ),
    )
    const { onClose, user } = renderDialog()

    await user.type(titleField(), 'Night Drive')
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    expect(await screen.findByRole('link', { name: 'Title: Title already used' })).toHaveAttribute(
      'href',
      '#track-title',
    )
    expect(screen.getByRole('link', { name: 'Tags: Too many tags' })).toHaveAttribute(
      'href',
      '#track-tags',
    )
    expect(screen.getByText('Title already used')).toBeInTheDocument()
    expect(titleField()).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the track limit as an alert and stays open', async () => {
    server.use(
      http.post(url('/tracks'), () =>
        HttpResponse.json(errorBody('quota_exceeded', 'Track limit reached'), { status: 409 }),
      ),
    )
    const { onClose, user } = renderDialog()

    await user.type(titleField(), 'One too many')
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have reached a limit on tracks or versions. Delete something to make room.',
    )
    expect(screen.getByRole('button', { name: 'Create track' })).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables the buttons while saving', async () => {
    server.use(
      http.post(url('/tracks'), async () => {
        await delay('infinite')
        return HttpResponse.json(track, { status: 201 })
      }),
    )
    const { user } = renderDialog()

    await user.type(titleField(), 'Slow one')
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('closes with Cancel without sending anything', async () => {
    const { onClose, onSaved, user } = renderDialog()

    await user.type(titleField(), 'Never saved')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('has no accessibility violations, with errors showing', async () => {
    const { container, user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Create track' }))
    await screen.findByRole('link', { name: 'Enter a title' })

    await expectNoA11yViolations(container)
  })
})

describe('editing', () => {
  it('starts with the track’s values', () => {
    renderDialog({ track })

    expect(screen.getByRole('dialog', { name: 'Edit track' })).toBeInTheDocument()
    expect(titleField()).toHaveValue('Night Drive')
    expect(genreField()).toHaveValue('house')
    expect(platformField()).toHaveValue('spotify')
    expect(notesField()).toHaveValue('first mix')
    const tags = within(screen.getByRole('list', { name: 'Added tags' }))
    expect(tags.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'demo×',
      'club×',
    ])
  })

  it('sends only the fields that changed', async () => {
    let sent: unknown
    const updated = { ...track, title: 'Night Drive 2' }
    server.use(
      http.patch(url('/tracks/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(updated)
      }),
    )
    const { onClose, onSaved, user } = renderDialog({ track })

    await user.clear(titleField())
    await user.type(titleField(), 'Night Drive 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    expect(sent).toEqual({ title: 'Night Drive 2' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sends null for a field that was cleared', async () => {
    let sent: unknown
    server.use(
      http.patch(url('/tracks/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...track, genre: null })
      }),
    )
    const { onSaved, user } = renderDialog({ track })

    await user.clear(genreField())
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual({ genre: null })
  })

  it('sends the whole tag list when a tag is removed', async () => {
    let sent: unknown
    server.use(
      http.patch(url('/tracks/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...track, tags: ['club'] })
      }),
    )
    const { onSaved, user } = renderDialog({ track })

    await user.click(screen.getByRole('button', { name: 'Remove tag demo' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual({ tags: ['club'] })
  })

  it('closes without a request when nothing changed', async () => {
    const { onClose, onSaved, user } = renderDialog({ track })

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('keeps an unknown platform and does not send it when untouched', async () => {
    let sent: unknown
    const original = { ...track, target_platform: 'tidal' }
    server.use(
      http.patch(url('/tracks/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...original, title: 'New' })
      }),
    )
    const { onSaved, user } = renderDialog({ track: original })

    expect(platformField()).toHaveValue('tidal')
    expect(screen.getByRole('option', { name: 'tidal (existing value)' })).toBeInTheDocument()

    await user.clear(titleField())
    await user.type(titleField(), 'New')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual({ title: 'New' })
  })

  it('says so when the track no longer exists', async () => {
    server.use(
      http.patch(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )
    const { onClose, user } = renderDialog({ track })

    await user.clear(titleField())
    await user.type(titleField(), 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not find that. It may have been deleted.',
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderDialog({ track })

    await expectNoA11yViolations(container)
  })
})
