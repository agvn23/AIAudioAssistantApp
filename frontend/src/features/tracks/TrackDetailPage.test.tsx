import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import type { AnalysisSummary } from '../../api/types'
import { routes } from '../../app/routes'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { AuthProvider } from '../auth/AuthProvider'
import { trackKeys } from './queryKeys'

const url = (path: string) => `${API_BASE_URL}${path}`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

type TestRouter = ReturnType<typeof createMemoryRouter>

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const track = {
  id: 7,
  title: 'Night Drive',
  genre: 'house',
  target_platform: 'spotify',
  notes: 'first mix',
  tags: ['demo', 'club'],
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
}

function serveTrack(body: object = track) {
  server.use(
    http.get(url('/tracks/7'), () => HttpResponse.json(body)),
    http.get(url('/tracks/7/analyses'), () => HttpResponse.json([])),
  )
}

function renderPage(initialUrl: string, seed?: object) {
  tokenStore.set('tok-1')
  server.use(http.get(url('/users/me'), () => HttpResponse.json(account)))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (seed) queryClient.setQueryData(trackKeys.detail(7), seed)
  const router = createMemoryRouter(routes, { initialEntries: [initialUrl] })
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

describe('showing a track', () => {
  it('shows the details of the track', async () => {
    serveTrack()
    renderPage('/tracks/7')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Night Drive' }),
    ).toBeInTheDocument()
    expect(screen.getByText('house')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
    expect(screen.getByText('first mix')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Versions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to all tracks' })).toHaveAttribute(
      'href',
      '/tracks',
    )
  })

  it('links each tag to the list filtered by it', async () => {
    serveTrack()
    renderPage('/tracks/7')

    expect(await screen.findByRole('link', { name: 'Show tracks tagged demo' })).toHaveAttribute(
      'href',
      '/tracks?tag=demo',
    )
    expect(screen.getByRole('link', { name: 'Show tracks tagged club' })).toHaveAttribute(
      'href',
      '/tracks?tag=club',
    )
  })

  it('says "Not set" for empty fields and "No tags" without tags', async () => {
    serveTrack({ ...track, genre: null, target_platform: null, notes: null, tags: [] })
    renderPage('/tracks/7')

    await screen.findByRole('heading', { level: 1, name: 'Night Drive' })
    expect(screen.getAllByText('Not set')).toHaveLength(3)
    expect(screen.getByText('No tags')).toBeInTheDocument()
  })

  it('shows an unknown platform exactly as stored', async () => {
    serveTrack({ ...track, target_platform: 'tidal' })
    renderPage('/tracks/7')

    expect(await screen.findByText('tidal')).toBeInTheDocument()
  })

  it('shows a loading line while the track is loading', async () => {
    server.use(
      http.get(url('/tracks/7'), async () => {
        await delay('infinite')
        return HttpResponse.json(track)
      }),
    )
    renderPage('/tracks/7')

    expect(await screen.findByText('Loading track…')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    serveTrack()
    const { container } = renderPage('/tracks/7')
    await screen.findByRole('heading', { level: 1, name: 'Night Drive' })

    await expectNoA11yViolations(container)
  })
})

describe('a track that cannot be shown', () => {
  it('says the track was not found on a 404', async () => {
    server.use(
      http.get(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )
    renderPage('/tracks/7')

    expect(await screen.findByRole('heading', { name: 'Track not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to all tracks' })).toBeInTheDocument()
  })

  it('says the track was not found for an id that is not a number, without a request', async () => {
    renderPage('/tracks/abc')

    expect(await screen.findByRole('heading', { name: 'Track not found' })).toBeInTheDocument()
  })

  it('shows an error with a retry button for other failures, then recovers', async () => {
    server.use(
      http.get(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 }),
      ),
    )
    const { user } = renderPage('/tracks/7')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server.',
    )

    serveTrack()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Night Drive' }),
    ).toBeInTheDocument()
  })

  it('prefers "not found" over cached data when the refresh answers 404', async () => {
    server.use(
      http.get(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
      http.get(url('/tracks/7/analyses'), () => HttpResponse.json([])),
    )
    renderPage('/tracks/7', track)

    expect(await screen.findByRole('heading', { name: 'Track not found' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })
})

describe('editing', () => {
  it('opens the edit dialog and shows the saved changes in place', async () => {
    serveTrack()
    server.use(
      http.patch(url('/tracks/7'), () => HttpResponse.json({ ...track, title: 'Renamed' })),
    )
    const { user } = renderPage('/tracks/7')
    await screen.findByRole('heading', { level: 1, name: 'Night Drive' })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit track' })).toBeInTheDocument()
    const title = screen.getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Renamed' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('deleting', () => {
  it('asks first and goes back to the list after deleting', async () => {
    serveTrack()
    server.use(
      http.delete(url('/tracks/7'), () => new HttpResponse(null, { status: 204 })),
      http.get(url('/tracks'), () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    )
    const { router, user } = renderPage('/tracks/7')
    await screen.findByRole('heading', { level: 1, name: 'Night Drive' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete this track?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, delete this track' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Tracks' })).toBeInTheDocument()
    expect(where(router)).toBe('/tracks')
  })

  it('stays on the page when the person cancels', async () => {
    serveTrack()
    const { router, user } = renderPage('/tracks/7')
    await screen.findByRole('heading', { level: 1, name: 'Night Drive' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where(router)).toBe('/tracks/7')
  })
})

describe('versions', () => {
  const version: AnalysisSummary = {
    id: 21,
    track_id: 7,
    version_number: 1,
    label: 'rough idea',
    stage: 'demo',
    original_filename: 'idea.wav',
    status: 'done',
    error_code: null,
    created_at: '2026-11-01T10:00:00Z',
  }

  it('lists the versions of the track and links to each one', async () => {
    server.use(
      http.get(url('/tracks/7'), () => HttpResponse.json(track)),
      http.get(url('/tracks/7/analyses'), () => HttpResponse.json([version])),
    )
    renderPage('/tracks/7')

    expect(await screen.findByRole('link', { name: 'Version 1' })).toHaveAttribute(
      'href',
      '/analyses/21',
    )
    expect(screen.getByText('idea.wav')).toBeInTheDocument()
  })

  it('opens the upload dialog from the Versions section', async () => {
    serveTrack()
    const { user } = renderPage('/tracks/7')
    await screen.findByText('No versions yet. Upload a file to analyse it.')

    await user.click(screen.getByRole('button', { name: 'Upload new version' }))

    expect(screen.getByRole('dialog', { name: 'Upload a new version' })).toBeInTheDocument()
  })
})
