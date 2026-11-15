import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../api/client'
import { tokenStore } from '../api/token'
import { AuthProvider } from '../features/auth/AuthProvider'
import { server } from '../test/server'
import { Layout } from './Layout'

const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/', element: <Layout />, children: [{ index: true, element: <p>Page</p> }] }],
    { initialEntries: ['/'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('the theme control in the header', () => {
  it('is there when signed out', () => {
    renderLayout()

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('is there when signed in, next to Log out', async () => {
    tokenStore.set('tok-1')
    server.use(http.get(`${API_BASE_URL}/users/me`, () => HttpResponse.json(account)))
    renderLayout()

    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
  })
})
