import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { tokenStore } from '../../api/token'
import type { Analysis } from '../../api/types'
import { routes } from '../../app/routes'
import { server } from '../../test/server'
import { AuthProvider } from '../auth/AuthProvider'
import { getRememberedFile, rememberFile } from './sessionFiles'

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  on: vi.fn(),
  loadBlob: vi.fn(),
  playPause: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('wavesurfer.js', () => ({ default: { create: mock.create } }))

const url = (path: string) => `${API_BASE_URL}${path}`
const account = { id: 1, email: 'a@example.com', created_at: '2026-11-05T00:00:00Z' }

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
  metrics: null,
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

const file = new File(['abc'], 'mix2.wav', { type: 'audio/wav' })

beforeEach(() => {
  mock.on.mockReset()
  mock.on.mockReturnValue(() => {})
  mock.loadBlob.mockReset()
  mock.loadBlob.mockResolvedValue(undefined)
  mock.playPause.mockReset()
  mock.playPause.mockResolvedValue(undefined)
  mock.destroy.mockReset()
  mock.create.mockReset()
  mock.create.mockReturnValue({
    on: mock.on,
    loadBlob: mock.loadBlob,
    playPause: mock.playPause,
    destroy: mock.destroy,
  })
})

function renderPage() {
  tokenStore.set('tok-1')
  server.use(
    http.get(url('/users/me'), () => HttpResponse.json(account)),
    http.get(url('/analyses/7'), () => HttpResponse.json(analysis)),
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

describe('the waveform on the version page', () => {
  it('draws the waveform of the file uploaded in this session', async () => {
    tokenStore.set('tok-1')
    rememberFile(7, file)
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Waveform' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Waveform of mix2.wav' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(mock.loadBlob).toHaveBeenCalledWith(file)
  })

  it('says honestly that there is no waveform without a local file', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Waveform' })).toBeInTheDocument()
    expect(screen.getByText(/never stored on the server/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
    expect(mock.create).not.toHaveBeenCalled()
  })

  it('forgets the file when the version is deleted', async () => {
    tokenStore.set('tok-1')
    rememberFile(7, file)
    server.use(
      http.delete(url('/analyses/7'), () => new HttpResponse(null, { status: 204 })),
      http.get(url('/tracks/3'), () => HttpResponse.json(track)),
      http.get(url('/tracks/3/analyses'), () => HttpResponse.json([])),
    )
    const { user } = renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Version 2' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete this version' }))

    await waitFor(() => expect(getRememberedFile(7)).toBeUndefined())
  })

  it('draws the waveform after the file is chosen again', async () => {
    const { user } = renderPage()

    await user.upload(await screen.findByLabelText('Choose the audio file again'), file)

    expect(await screen.findByRole('img', { name: 'Waveform of mix2.wav' })).toBeInTheDocument()
    expect(mock.loadBlob).toHaveBeenCalledWith(file)
    expect(screen.queryByLabelText('Choose the audio file again')).not.toBeInTheDocument()
  })
})
