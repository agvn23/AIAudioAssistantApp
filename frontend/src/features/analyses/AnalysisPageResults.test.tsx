import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import { routes } from '../../app/routes'
import { sampleFeedback, sampleMetrics } from '../../test/fixtures/analysis'
import { server } from '../../test/server'
import { AuthProvider } from '../auth/AuthProvider'

const url = (path: string) => `${API_BASE_URL}${path}`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

const analysis = {
  id: 7,
  track_id: 3,
  version_number: 2,
  label: 'vocals up',
  stage: 'mix',
  original_filename: 'mix2.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-10T09:30:00Z',
  metrics: sampleMetrics,
  feedback: null as unknown,
}

function renderPage(body: object) {
  tokenStore.set('tok-1')
  server.use(
    http.get(url('/users/me'), () => HttpResponse.json(account)),
    http.get(url('/analyses/7'), () => HttpResponse.json(body)),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: ['/analyses/7'] })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { user: userEvent.setup() }
}

describe('results on the version page', () => {
  it('shows measurements, the spectrum and feedback for a finished version', async () => {
    renderPage({ ...analysis, feedback: sampleFeedback })

    expect(await screen.findByRole('heading', { level: 3, name: 'Loudness' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Spectrum' })).toBeInTheDocument()
    expect(screen.getByText(/A balanced mix with a slightly strong low end/)).toBeInTheDocument()
  })

  it('generates feedback from the page', async () => {
    server.use(
      http.post(url('/analyses/7/feedback'), () =>
        HttpResponse.json({ ...analysis, feedback: sampleFeedback }),
      ),
    )
    const { user } = renderPage(analysis)

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))

    expect(
      await screen.findByText(/A balanced mix with a slightly strong low end/),
    ).toBeInTheDocument()
  })

  it('shows a waiting line, not results, while the version is still being analysed', async () => {
    renderPage({ ...analysis, status: 'running', metrics: null })

    expect(
      await screen.findByText(/Results appear here once the analysis has finished/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Loudness' })).not.toBeInTheDocument()
  })
})
