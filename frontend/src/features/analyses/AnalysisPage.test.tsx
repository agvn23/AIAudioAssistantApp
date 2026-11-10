import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import type { Analysis } from '../../api/types'
import { routes } from '../../app/routes'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { AuthProvider } from '../auth/AuthProvider'

const url = (path: string) => `${API_BASE_URL}${path}`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

type TestRouter = ReturnType<typeof createMemoryRouter>

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const analysis: Analysis = {
  id: 7,
  track_id: 3,
  version_number: 2,
  label: 'vocals up',
  stage: 'mix',
  original_filename: 'mix2.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-10T09:30:00Z',
  metrics: { schema_version: '0.1' },
  feedback: null,
}

const track = {
  id: 3,
  title: 'Night Drive',
  genre: 'house',
  target_platform: 'spotify',
  notes: null,
  tags: [],
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
}

function serveAnalysis(body: object = analysis) {
  server.use(http.get(url('/analyses/7'), () => HttpResponse.json(body)))
}

function renderPage(initialUrl: string) {
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

describe('showing a version', () => {
  it('shows the details of the version', async () => {
    serveAnalysis()
    renderPage('/analyses/7')

    expect(await screen.findByRole('heading', { level: 1, name: 'Version 2' })).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Mix')).toBeInTheDocument()
    expect(screen.getByText('vocals up')).toBeInTheDocument()
    expect(screen.getByText('mix2.wav')).toBeInTheDocument()
    expect(screen.getByText('The analysis is finished.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to track' })).toHaveAttribute('href', '/tracks/3')
    expect(screen.getByText(/2026/).closest('time')).toHaveAttribute(
      'datetime',
      '2026-11-10T09:30:00Z',
    )
  })

  it('says "Not set" for a missing stage and label', async () => {
    serveAnalysis({ ...analysis, stage: null, label: null })
    renderPage('/analyses/7')

    await screen.findByRole('heading', { level: 1, name: 'Version 2' })
    expect(screen.getAllByText('Not set')).toHaveLength(2)
  })

  it('says the analysis is still running', async () => {
    serveAnalysis({ ...analysis, status: 'running', metrics: null })
    renderPage('/analyses/7')

    expect(
      await screen.findByText('Analysing the file. This page updates by itself.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Analysing')).toBeInTheDocument()
  })

  it('says the analysis is waiting to start', async () => {
    serveAnalysis({ ...analysis, status: 'pending', metrics: null })
    renderPage('/analyses/7')

    expect(
      await screen.findByText('Waiting to start. This page updates by itself.'),
    ).toBeInTheDocument()
  })

  it('explains why the analysis failed', async () => {
    serveAnalysis({ ...analysis, status: 'failed', error_code: 'silent', metrics: null })
    renderPage('/analyses/7')

    expect(
      await screen.findByText('The file is silent, so there was nothing to measure.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('shows a loading line while the version is loading', async () => {
    server.use(
      http.get(url('/analyses/7'), async () => {
        await delay('infinite')
        return HttpResponse.json(analysis)
      }),
    )
    renderPage('/analyses/7')

    expect(await screen.findByText('Loading version…')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    serveAnalysis()
    const { container } = renderPage('/analyses/7')
    await screen.findByRole('heading', { level: 1, name: 'Version 2' })

    await expectNoA11yViolations(container)
  })
})

describe('a version that cannot be shown', () => {
  it('says the version was not found on a 404', async () => {
    server.use(
      http.get(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Analysis not found'), { status: 404 }),
      ),
    )
    renderPage('/analyses/7')

    expect(await screen.findByRole('heading', { name: 'Version not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to all tracks' })).toBeInTheDocument()
  })

  it('says the version was not found for an id that is not a number', async () => {
    renderPage('/analyses/abc')

    expect(await screen.findByRole('heading', { name: 'Version not found' })).toBeInTheDocument()
  })

  it('shows an error with a retry button for other failures, then recovers', async () => {
    server.use(
      http.get(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 }),
      ),
    )
    const { user } = renderPage('/analyses/7')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server.',
    )

    serveAnalysis()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Version 2' })).toBeInTheDocument()
  })
})

describe('editing', () => {
  it('opens the edit dialog and shows the saved change in place', async () => {
    serveAnalysis()
    server.use(
      http.patch(url('/analyses/7'), () => HttpResponse.json({ ...analysis, stage: 'master' })),
    )
    const { user } = renderPage('/analyses/7')
    await screen.findByRole('heading', { level: 1, name: 'Version 2' })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit version' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stage' }), 'master')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Master')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('deleting', () => {
  it('asks first and goes back to the track after deleting', async () => {
    serveAnalysis()
    server.use(
      http.delete(url('/analyses/7'), () => new HttpResponse(null, { status: 204 })),
      http.get(url('/tracks/3'), () => HttpResponse.json(track)),
      http.get(url('/tracks/3/analyses'), () => HttpResponse.json([])),
    )
    const { router, user } = renderPage('/analyses/7')
    await screen.findByRole('heading', { level: 1, name: 'Version 2' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete this version?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, delete this version' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Night Drive' }),
    ).toBeInTheDocument()
    expect(where(router)).toBe('/tracks/3')
  })

  it('stays on the page when the person cancels', async () => {
    serveAnalysis()
    const { router, user } = renderPage('/analyses/7')
    await screen.findByRole('heading', { level: 1, name: 'Version 2' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(where(router)).toBe('/analyses/7')
  })
})
