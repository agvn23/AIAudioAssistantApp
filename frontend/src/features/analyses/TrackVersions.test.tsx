import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import type { Analysis, AnalysisSummary } from '../../api/types'
import { uploadAnalysis } from '../../api/uploadAnalysis'
import { expectNoA11yViolations } from '../../test/a11y'
import { server } from '../../test/server'
import { TrackVersions } from './TrackVersions'

vi.mock('../../api/uploadAnalysis', () => ({ uploadAnalysis: vi.fn() }))
const uploadMock = vi.mocked(uploadAnalysis)

const url = (path: string) => `${API_BASE_URL}${path}`

const first: AnalysisSummary = {
  id: 21,
  track_id: 3,
  version_number: 1,
  label: 'rough idea',
  stage: 'demo',
  original_filename: 'idea.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-01T10:00:00Z',
}
const second: AnalysisSummary = {
  ...first,
  id: 22,
  version_number: 2,
  label: null,
  stage: null,
  original_filename: 'mix2.flac',
  status: 'running',
  created_at: '2026-11-02T10:00:00Z',
}
const third: AnalysisSummary = {
  ...first,
  id: 23,
  version_number: 3,
  label: 'bad export',
  stage: 'master',
  original_filename: 'broken.mp3',
  status: 'failed',
  error_code: 'silent',
  created_at: '2026-11-03T10:00:00Z',
}
const created: Analysis = { ...second, status: 'pending', metrics: null, feedback: null }

function serveVersions(items: AnalysisSummary[]) {
  server.use(http.get(url('/tracks/3/analyses'), () => HttpResponse.json(items)))
}

function renderVersions() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/', element: <TrackVersions trackId={3} /> },
      { path: '/analyses/:id', element: <p>Version page</p> },
    ],
    { initialEntries: ['/'] },
  )
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return {
    container: view.container,
    user: userEvent.setup({ applyAccept: false }),
  }
}

function row(index: number) {
  const item = screen.getAllByRole('listitem')[index]
  if (!item) throw new Error(`No row at index ${index}`)
  return within(item)
}

beforeEach(() => {
  uploadMock.mockReset()
})

describe('the list', () => {
  it('shows a loading line while the versions load', async () => {
    server.use(
      http.get(url('/tracks/3/analyses'), async () => {
        await delay('infinite')
        return HttpResponse.json([])
      }),
    )
    renderVersions()

    expect(await screen.findByText('Loading versions…')).toBeInTheDocument()
  })

  it('says so when there are no versions yet', async () => {
    serveVersions([])
    renderVersions()

    expect(
      await screen.findByText('No versions yet. Upload a file to analyse it.'),
    ).toBeInTheDocument()
  })

  it('shows every version in the order the server sent them', async () => {
    serveVersions([first, second, third])
    renderVersions()

    await screen.findByRole('link', { name: 'Version 1' })
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    expect(row(0).getByRole('link', { name: 'Version 1' })).toHaveAttribute('href', '/analyses/21')
    expect(row(0).getByText('rough idea')).toBeInTheDocument()
    expect(row(0).getByText('Done')).toBeInTheDocument()
    expect(row(0).getByText('Demo')).toBeInTheDocument()
    expect(row(0).getByText('idea.wav')).toBeInTheDocument()

    expect(row(1).getByRole('link', { name: 'Version 2' })).toHaveAttribute('href', '/analyses/22')
    expect(row(1).getByText('Analysing')).toBeInTheDocument()
    expect(row(1).getByText('No stage')).toBeInTheDocument()
    expect(row(1).getByText('mix2.flac')).toBeInTheDocument()

    expect(row(2).getByText('Failed')).toBeInTheDocument()
    expect(row(2).getByText('Master')).toBeInTheDocument()
  })

  it('shows the date as a time element', async () => {
    serveVersions([first])
    renderVersions()

    await screen.findByRole('link', { name: 'Version 1' })
    expect(row(0).getByText(/2026/).closest('time')).toHaveAttribute(
      'datetime',
      '2026-11-01T10:00:00Z',
    )
  })

  it('explains why a version failed', async () => {
    serveVersions([third])
    renderVersions()

    expect(
      await screen.findByText('The file is silent, so there was nothing to measure.'),
    ).toBeInTheDocument()
  })

  it('shows "Waiting to start" for a pending version', async () => {
    serveVersions([{ ...second, status: 'pending' }])
    renderVersions()

    expect(await screen.findByText('Waiting to start')).toBeInTheDocument()
  })

  it('shows an error with a retry button, then recovers', async () => {
    server.use(
      http.get(url('/tracks/3/analyses'), () =>
        HttpResponse.json({ error: { code: 'internal_error', message: 'boom' } }, { status: 500 }),
      ),
    )
    const { user } = renderVersions()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on the server.',
    )

    serveVersions([first])
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('link', { name: 'Version 1' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    serveVersions([first, second, third])
    const { container } = renderVersions()
    await screen.findByRole('link', { name: 'Version 1' })

    await expectNoA11yViolations(container)
  })
})

describe('uploading a version', () => {
  it('opens the dialog and closes it again with Cancel', async () => {
    serveVersions([])
    const { user } = renderVersions()
    await screen.findByText('No versions yet. Upload a file to analyse it.')

    await user.click(screen.getByRole('button', { name: 'Upload new version' }))
    const dialog = screen.getByRole('dialog', { name: 'Upload a new version' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('announces the upload and shows the new version in the list', async () => {
    let uploadedYet = false
    server.use(
      http.get(url('/tracks/3/analyses'), () =>
        HttpResponse.json(uploadedYet ? [first, created] : [first]),
      ),
    )
    uploadMock.mockImplementation(async () => {
      uploadedYet = true
      return created
    })
    const { user } = renderVersions()
    await screen.findByRole('link', { name: 'Version 1' })

    await user.click(screen.getByRole('button', { name: 'Upload new version' }))
    const dialog = screen.getByRole('dialog', { name: 'Upload a new version' })
    await user.upload(
      within(dialog).getByLabelText<HTMLInputElement>('Audio file'),
      new File(['abc'], 'mix2.flac', { type: 'audio/flac' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Upload version' }))

    expect(await screen.findByText(/Uploaded “mix2\.flac” as version 2/)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Version 2' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(uploadMock).toHaveBeenCalledWith(3, expect.any(File), expect.any(Object))
  })
})
