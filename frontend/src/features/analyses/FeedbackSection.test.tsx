import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { createQueryClient } from '../../app/queryClient'
import { expectNoA11yViolations } from '../../test/a11y'
import { sampleFeedback, sampleMetrics } from '../../test/fixtures/analysis'
import { server } from '../../test/server'
import { trackKeys } from '../tracks/queryKeys'
import { FeedbackSection } from './FeedbackSection'
import { useAnalysis } from './useAnalyses'

const base = {
  id: 7,
  track_id: 3,
  version_number: 1,
  label: 'Mix v1',
  stage: 'mix',
  original_filename: 'demo-track.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-10T11:00:00.000000Z',
  metrics: sampleMetrics,
  feedback: null as unknown,
}

/** The track the sample feedback was written for: house, spotify. */
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

const summaryText = /A balanced mix with a slightly strong low end/
const trackChangeHint = /of this track (was|were) changed/

/** Reads the version like the page does, so a new analysis in the cache reaches the section. */
function Harness() {
  const query = useAnalysis(7)
  return query.data ? <FeedbackSection analysis={query.data} /> : <p>Loading</p>
}

function renderSection(body: object = base, trackBody: object = track) {
  server.use(
    http.get(`${API_BASE_URL}/analyses/7`, () => HttpResponse.json(body)),
    http.get(`${API_BASE_URL}/tracks/3`, () => HttpResponse.json(trackBody)),
  )
  const queryClient = createQueryClient()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  )
  return { container: view.container, user: userEvent.setup(), queryClient }
}

function failFeedback(status: number, code: string, headers: Record<string, string> = {}) {
  server.use(
    http.post(`${API_BASE_URL}/analyses/7/feedback`, () =>
      HttpResponse.json({ error: { code, message: 'Server message' } }, { status, headers }),
    ),
  )
}

/** Lets queued query updates reach the screen before a "nothing is shown" check. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe('FeedbackSection', () => {
  it('offers to generate when there is no feedback yet', async () => {
    renderSection()

    expect(await screen.findByRole('button', { name: 'Generate feedback' })).toBeInTheDocument()
    expect(
      screen.getByText('No feedback has been generated for this version yet.'),
    ).toBeInTheDocument()
  })

  it('generates the feedback and then shows it', async () => {
    server.use(
      http.post(`${API_BASE_URL}/analyses/7/feedback`, () =>
        HttpResponse.json({ ...base, feedback: sampleFeedback }),
      ),
    )
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))

    expect(await screen.findByText(summaryText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate feedback' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Feedback is ready.')
    expect(screen.queryByText(/No feedback has been generated/)).not.toBeInTheDocument()
  })

  it('shows saved feedback with a regenerate button', async () => {
    renderSection({ ...base, feedback: sampleFeedback })

    expect(await screen.findByText(summaryText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate feedback' })).toBeInTheDocument()
    expect(screen.queryByText(/No feedback has been generated/)).not.toBeInTheDocument()
  })

  it('says so when the saved feedback cannot be read', async () => {
    renderSection({ ...base, feedback: { unexpected: true } })

    expect(await screen.findByText(/saved feedback could not be read/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate feedback' })).toBeInTheDocument()
  })

  it('keeps the saved feedback and shows the error when regenerating fails', async () => {
    failFeedback(504, 'timeout')
    const { user } = renderSection({ ...base, feedback: sampleFeedback })

    await user.click(await screen.findByRole('button', { name: 'Regenerate feedback' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The AI feedback service took too long. Try again.',
    )
    expect(screen.getByText(summaryText)).toBeInTheDocument()
  })

  it('shows the wait when the rate limit is used up', async () => {
    failFeedback(429, 'rate_limited', { 'Retry-After': '30' })
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 30 s.')
  })

  it('disables the button and says so while generating', async () => {
    server.use(
      http.post(`${API_BASE_URL}/analyses/7/feedback`, async () => {
        await delay('infinite')
        return HttpResponse.json(base)
      }),
    )
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))

    expect(await screen.findByRole('button', { name: 'Generating…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Generating feedback.')
  })

  it('hints that the feedback is out of date when the stage was changed afterwards', async () => {
    renderSection({ ...base, stage: 'master', feedback: sampleFeedback })

    expect(await screen.findByText(/stage of this version was changed/)).toBeInTheDocument()
  })

  it('has no hint when the stage is the one the feedback was written for', async () => {
    renderSection({ ...base, feedback: sampleFeedback })

    await screen.findByText(summaryText)
    expect(screen.queryByText(/stage of this version was changed/)).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderSection({ ...base, feedback: sampleFeedback })
    await screen.findByText(summaryText)

    await expectNoA11yViolations(container)
  })

  it('disables the button with a countdown after a rate limit', async () => {
    failFeedback(429, 'rate_limited', { 'Retry-After': '30' })
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))

    expect(await screen.findByRole('button', { name: 'Try again in 30 s' })).toBeDisabled()
  })

  it('offers the button again when the wait is over', async () => {
    failFeedback(429, 'rate_limited', { 'Retry-After': '1' })
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))
    await screen.findByRole('button', { name: /Try again in/ })

    expect(
      await screen.findByRole('button', { name: 'Generate feedback' }, { timeout: 4000 }),
    ).toBeEnabled()
  })

  it('keeps the button enabled after a failure that has no wait', async () => {
    failFeedback(504, 'timeout')
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))
    await screen.findByRole('alert')

    expect(screen.getByRole('button', { name: 'Generate feedback' })).toBeEnabled()
  })

  it('says a provider failure is often temporary', async () => {
    failFeedback(502, 'provider_error')
    const { user } = renderSection()

    await user.click(await screen.findByRole('button', { name: 'Generate feedback' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/often temporary/)
  })

  it('hints that the feedback is out of date when the genre of the track was changed', async () => {
    renderSection({ ...base, feedback: sampleFeedback }, { ...track, genre: 'techno' })

    expect(await screen.findByText(/The genre of this track was changed/)).toBeInTheDocument()
  })

  it('hints that the feedback is out of date when the platform of the track was changed', async () => {
    renderSection({ ...base, feedback: sampleFeedback }, { ...track, target_platform: 'tidal' })

    expect(
      await screen.findByText(/The target platform of this track was changed/),
    ).toBeInTheDocument()
  })

  it('names both when the genre and the platform were changed', async () => {
    renderSection(
      { ...base, feedback: sampleFeedback },
      { ...track, genre: 'techno', target_platform: 'tidal' },
    )

    expect(
      await screen.findByText(/The genre and target platform of this track were changed/),
    ).toBeInTheDocument()
  })

  it('has no track hint when the genre and the platform are as they were', async () => {
    const { queryClient } = renderSection({ ...base, feedback: sampleFeedback })
    await screen.findByText(summaryText)
    await waitFor(() => expect(queryClient.getQueryData(trackKeys.detail(3))).toBeDefined())
    await flush()

    expect(screen.queryByText(trackChangeHint)).not.toBeInTheDocument()
  })

  it('ignores spacing that the server cleans away', async () => {
    const feedback = {
      ...sampleFeedback,
      meta: {
        ...sampleFeedback.meta,
        context_used: { genre: 'deep house', target_platform: 'spotify', stage: 'mix' },
      },
    }
    const { queryClient } = renderSection(
      { ...base, feedback },
      { ...track, genre: '  deep   house ' },
    )
    await screen.findByText(summaryText)
    await waitFor(() => expect(queryClient.getQueryData(trackKeys.detail(3))).toBeDefined())
    await flush()

    expect(screen.queryByText(trackChangeHint)).not.toBeInTheDocument()
  })

  it('shows no track hint, and keeps the feedback, when the track cannot be loaded', async () => {
    const { queryClient } = renderSection({ ...base, feedback: sampleFeedback })
    // Added before the track is requested, so it comes first.
    server.use(
      http.get(`${API_BASE_URL}/tracks/3`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Track not found' } },
          { status: 404 },
        ),
      ),
    )
    await screen.findByText(summaryText)
    await waitFor(() =>
      expect(queryClient.getQueryState(trackKeys.detail(3))?.status).toBe('error'),
    )
    await flush()

    expect(screen.queryByText(trackChangeHint)).not.toBeInTheDocument()
    expect(screen.getByText(summaryText)).toBeInTheDocument()
  })
})
