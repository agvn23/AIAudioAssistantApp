import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Analysis } from '../../api/types'
import { createQueryClient } from '../../app/queryClient'
import { expectNoA11yViolations } from '../../test/a11y'
import { sampleFeedback, sampleMetrics } from '../../test/fixtures/analysis'
import { ResultsSection } from './ResultsSection'

const done: Analysis = {
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
  feedback: sampleFeedback,
}

function renderSection(analysis: Analysis) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ResultsSection analysis={analysis} />
    </QueryClientProvider>,
  )
}

describe('ResultsSection', () => {
  it('shows the measurements, the spectrum and the feedback of a finished version', () => {
    renderSection(done)

    expect(screen.getByRole('heading', { level: 2, name: 'Results' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Loudness' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Spectrum' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI feedback' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate feedback' })).toBeInTheDocument()
  })

  it('offers to generate feedback when there is none', () => {
    renderSection({ ...done, feedback: null })

    expect(screen.getByRole('button', { name: 'Generate feedback' })).toBeInTheDocument()
  })

  it.each<['pending' | 'running']>([['pending'], ['running']])(
    'says results are not there yet while the status is %s',
    (status) => {
      renderSection({ ...done, status, metrics: null, feedback: null })

      expect(
        screen.getByText(/Results appear here once the analysis has finished/),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    },
  )

  it('says there are no results when the analysis failed', () => {
    renderSection({
      ...done,
      status: 'failed',
      error_code: 'silent',
      metrics: null,
      feedback: null,
    })

    expect(screen.getByText(/no results because the analysis failed/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says the measurements cannot be read, without a feedback button', () => {
    renderSection({ ...done, metrics: { schema_version: '0.1' }, feedback: null })

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be read/)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Loudness' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderSection(done)

    await expectNoA11yViolations(container)
  })
})
