import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '../../app/routes'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { AuthProvider } from '../auth/AuthProvider'

const url = (path: string) => `${API_BASE_URL}${path}`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

type TestRouter = ReturnType<typeof createMemoryRouter>

function makeTrack(id: number) {
  return {
    id,
    title: `Track ${id}`,
    genre: 'house',
    target_platform: id % 2 === 1 ? 'spotify' : 'tidal',
    notes: null,
    tags: ['demo'],
    created_at: '2026-11-05T10:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
  }
}

/** Serves a list of `total` tracks, honouring limit and offset. Returns the requests seen. */
function serveTracks(total: number): URL[] {
  const requests: URL[] = []
  server.use(
    http.get(url('/tracks'), ({ request }) => {
      const seen = new URL(request.url)
      requests.push(seen)
      const limit = Number(seen.searchParams.get('limit'))
      const offset = Number(seen.searchParams.get('offset'))
      const count = Math.max(0, Math.min(limit, total - offset))
      const items = Array.from({ length: count }, (_, index) => makeTrack(offset + index + 1))
      return HttpResponse.json({ items, total, limit, offset })
    }),
  )
  return requests
}

function renderTracks(initialUrl: string) {
  tokenStore.set('tok-1')
  server.use(http.get(url('/users/me'), () => HttpResponse.json(account)))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

describe('the list', () => {
  it('shows the tracks as links with their details and a count', async () => {
    serveTracks(3)
    renderTracks('/tracks')

    expect(await screen.findByRole('link', { name: 'Track 1' })).toHaveAttribute(
      'href',
      '/tracks/1',
    )
    expect(screen.getAllByText('house · Spotify')).toHaveLength(2)
    expect(screen.getByText('house · tidal')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 tracks')
  })

  it('shows a loading line while the list is loading', async () => {
    server.use(
      http.get(url('/tracks'), async () => {
        await delay('infinite')
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 })
      }),
    )
    renderTracks('/tracks')

    await screen.findByRole('heading', { level: 1, name: 'Tracks' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading tracks…')
  })

  it('says so when there are no tracks at all', async () => {
    serveTracks(0)
    renderTracks('/tracks')

    expect(await screen.findByText('You have no tracks yet.')).toBeInTheDocument()
  })

  it('says so when the filters match nothing', async () => {
    serveTracks(0)
    renderTracks('/tracks?q=zzz')

    expect(await screen.findByText('No tracks match your filters.')).toBeInTheDocument()
  })

  it('shows an error with a retry button, then recovers', async () => {
    server.use(
      http.get(url('/tracks'), () =>
        HttpResponse.json({ error: { code: 'internal_error', message: 'boom' } }, { status: 500 }),
      ),
    )
    const { user } = renderTracks('/tracks')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server.',
    )

    serveTracks(3)
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('link', { name: 'Track 1' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    serveTracks(3)
    const { container } = renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    await expectNoA11yViolations(container)
  })
})

describe('the URL is the state', () => {
  it('sends the URL state to the API and fills the fields from it', async () => {
    const requests = serveTracks(41)
    renderTracks('/tracks?q=night&genre=house&tag=demo&page=2')

    await screen.findByRole('link', { name: 'Track 21' })
    expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toEqual({
      q: 'night',
      genre: 'house',
      tag: 'demo',
      limit: '20',
      offset: '20',
    })
    expect(screen.getByRole('searchbox', { name: 'Search title and notes' })).toHaveValue('night')
    expect(screen.getByRole('textbox', { name: 'Genre' })).toHaveValue('house')
    expect(screen.getByRole('status')).toHaveTextContent('41 tracks match')
  })

  it('searches on Enter, goes back to page 1 and keeps the tag', async () => {
    serveTracks(41)
    const { router, user } = renderTracks('/tracks?page=2&tag=demo')
    await screen.findByRole('link', { name: 'Track 21' })

    await user.type(
      screen.getByRole('searchbox', { name: 'Search title and notes' }),
      'night{Enter}',
    )

    expect(where(router)).toBe('/tracks?q=night&tag=demo')
    expect(await screen.findByRole('link', { name: 'Track 1' })).toBeInTheDocument()
  })

  it('filters by genre with the Search button', async () => {
    serveTracks(3)
    const { router, user } = renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    await user.type(screen.getByRole('textbox', { name: 'Genre' }), ' house ')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(where(router)).toBe('/tracks?genre=house')
  })

  it('clears every filter', async () => {
    serveTracks(3)
    const { router, user } = renderTracks('/tracks?q=night&genre=house&tag=demo')
    await screen.findByRole('link', { name: 'Track 1' })

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(where(router)).toBe('/tracks')
    expect(screen.getByRole('searchbox', { name: 'Search title and notes' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Genre' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('shows the tag filter from the URL and removes only that filter', async () => {
    serveTracks(3)
    const { router, user } = renderTracks('/tracks?q=x&tag=demo')
    await screen.findByRole('link', { name: 'Track 1' })
    expect(screen.getByText(/Filtering by tag/)).toHaveTextContent('demo')

    await user.click(screen.getByRole('button', { name: 'Remove tag filter' }))

    expect(where(router)).toBe('/tracks?q=x')
    expect(screen.queryByRole('button', { name: 'Remove tag filter' })).not.toBeInTheDocument()
  })
})

describe('paging', () => {
  it('has no pagination for a single page', async () => {
    serveTracks(3)
    renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('links to the next page and keeps the filters', async () => {
    const requests = serveTracks(41)
    const { router, user } = renderTracks('/tracks?q=a')
    await screen.findByRole('link', { name: 'Track 1' })

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument()
    const next = screen.getByRole('link', { name: 'Next page' })
    expect(next).toHaveAttribute('href', '/tracks?q=a&page=2')

    await user.click(next)

    expect(where(router)).toBe('/tracks?q=a&page=2')
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Track 21' })).toBeInTheDocument()
    expect(requests.at(-1)?.searchParams.get('offset')).toBe('20')
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/tracks?q=a',
    )
  })

  it('has no Next link on the last page', async () => {
    serveTracks(41)
    renderTracks('/tracks?page=3')
    await screen.findByRole('link', { name: 'Track 41' })

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument()
  })

  it('offers a way back when the page is past the end', async () => {
    serveTracks(41)
    renderTracks('/tracks?page=9')

    expect(await screen.findByText('That page does not exist.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the last page' })).toHaveAttribute(
      'href',
      '/tracks?page=3',
    )
  })
})

describe('tag chips', () => {
  it('shows each track\u2019s tags as links that filter by that tag', async () => {
    serveTracks(3)
    renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    expect(screen.getAllByRole('link', { name: 'Filter by tag demo' })).toHaveLength(3)
    const tags = within(screen.getByRole('list', { name: 'Tags of Track 1' }))
    expect(tags.getByRole('link', { name: 'Filter by tag demo' })).toHaveAttribute(
      'href',
      '/tracks?tag=demo',
    )
  })

  it('keeps the other filters and goes back to page 1', async () => {
    serveTracks(41)
    renderTracks('/tracks?q=a&page=2')
    await screen.findByRole('link', { name: 'Track 21' })

    const tags = within(screen.getByRole('list', { name: 'Tags of Track 21' }))
    expect(tags.getByRole('link', { name: 'Filter by tag demo' })).toHaveAttribute(
      'href',
      '/tracks?q=a&tag=demo',
    )
  })

  it('applies the tag filter when a chip is clicked', async () => {
    const requests = serveTracks(3)
    const { router, user } = renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    const tags = within(screen.getByRole('list', { name: 'Tags of Track 1' }))
    await user.click(tags.getByRole('link', { name: 'Filter by tag demo' }))

    expect(where(router)).toBe('/tracks?tag=demo')
    expect(await screen.findByText(/Filtering by tag/)).toHaveTextContent('demo')
    expect(requests.at(-1)?.searchParams.get('tag')).toBe('demo')
  })

  it('marks the chip of the active tag', async () => {
    serveTracks(3)
    renderTracks('/tracks?tag=demo')
    await screen.findByRole('link', { name: 'Track 1' })

    for (const chip of screen.getAllByRole('link', { name: 'Filter by tag demo' })) {
      expect(chip).toHaveAttribute('aria-current', 'true')
    }
  })

  it('shows no tag list for a track without tags', async () => {
    server.use(
      http.get(url('/tracks'), () =>
        HttpResponse.json({
          items: [{ ...makeTrack(1), tags: [] }],
          total: 1,
          limit: 20,
          offset: 0,
        }),
      ),
    )
    renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    expect(screen.queryByRole('list', { name: 'Tags of Track 1' })).not.toBeInTheDocument()
  })
})

describe('creating a track', () => {
  it('opens the dialog from the New track button and closes it with Cancel', async () => {
    serveTracks(3)
    const { user } = renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New track' }))
    expect(screen.getByRole('dialog', { name: 'New track' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('goes to the new track after saving', async () => {
    serveTracks(3)
    server.use(
      http.post(url('/tracks'), () => HttpResponse.json(makeTrack(99), { status: 201 })),
      http.get(url('/tracks/99'), () => HttpResponse.json(makeTrack(99))),
      http.get(url('/tracks/99/analyses'), () => HttpResponse.json([])),
    )
    const { router, user } = renderTracks('/tracks')
    await screen.findByRole('link', { name: 'Track 1' })

    await user.click(screen.getByRole('button', { name: 'New track' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Brand new')
    await user.click(screen.getByRole('button', { name: 'Create track' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Track 99' })).toBeInTheDocument()
    expect(where(router)).toBe('/tracks/99')
  })
})
