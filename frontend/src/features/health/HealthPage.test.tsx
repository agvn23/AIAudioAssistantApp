import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { server } from '../../test/server'
import { HealthPage } from './HealthPage'

const HEALTH_URL = `${API_BASE_URL}/health`

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthPage />
    </QueryClientProvider>,
  )
}

describe('HealthPage', () => {
  it('shows a connected state when the API answers', async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.json({ status: 'ok' })))
    renderPage()
    expect(await screen.findByText(/connected/i)).toBeInTheDocument()
  })

  it('explains a failed connection in plain words', async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.error()))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })

  it('shows the error code and request id from a server error', async () => {
    server.use(
      http.get(HEALTH_URL, () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'x', request_id: 'req-42' } },
          { status: 500 },
        ),
      ),
    )
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('internal_error')
    expect(alert).toHaveTextContent('req-42')
  })

  it('recovers when the user retries', async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.error()))
    renderPage()
    await screen.findByRole('alert')

    server.use(http.get(HEALTH_URL, () => HttpResponse.json({ status: 'ok' })))
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/connected/i)).toBeInTheDocument()
  })
})
