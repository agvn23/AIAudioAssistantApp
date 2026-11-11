import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sampleMetrics } from '../../test/fixtures/analysis'
import { expectNoA11yViolations } from '../../test/a11y'
import { MetricsCards } from './MetricsCards'
import { parseMetrics, type Metrics } from './metrics'

function sample(): Metrics {
  const parsed = parseMetrics(sampleMetrics)
  if (parsed === null) throw new Error('The sample metrics fixture must parse.')
  return parsed
}

/** The text of the value next to a term. Terms are unique across the cards. */
function valueOf(term: string): string {
  const dt = screen.getByText(term, { selector: 'dt' })
  return dt.nextElementSibling?.textContent ?? ''
}

function hasTerm(term: string): boolean {
  return screen.queryByText(term, { selector: 'dt' }) !== null
}

describe('MetricsCards', () => {
  it('has a heading for every card and for the warnings', () => {
    render(<MetricsCards metrics={sample()} />)

    for (const name of ['Loudness', 'Dynamics', 'Tempo and key', 'Stereo', 'File', 'Warnings']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('shows the loudness values as stored', () => {
    render(<MetricsCards metrics={sample()} />)

    expect(valueOf('Integrated loudness')).toBe('-12.8 LUFS')
    expect(valueOf('Loudness range')).toBe('6.2 LU')
    expect(valueOf('True peak')).toBe('-0.8 dBTP')
    expect(valueOf('Short-term max')).toBe('-10.4 LUFS')
    expect(valueOf('Momentary max')).toBe('-8.9 LUFS')
    expect(valueOf('Sample peak')).toBe('-0.9 dBFS')
    expect(valueOf('Clipped samples')).toBe('0')
  })

  it('labels dynamic range as an approximation', () => {
    render(<MetricsCards metrics={sample()} />)

    expect(valueOf('RMS level')).toBe('-15.3 dBFS')
    expect(valueOf('Crest factor')).toBe('13.2 dB')
    expect(valueOf('Dynamic range (approximate)')).toBe('9.4 dB')
    expect(screen.getByText(/not a certified DR14 reading/)).toBeInTheDocument()
  })

  it('shows tempo and key with their confidence, as suggestions', () => {
    render(<MetricsCards metrics={sample()} />)

    expect(valueOf('Tempo')).toBe('124 BPM')
    expect(valueOf('Tempo confidence')).toBe('81% (0.81)')
    expect(valueOf('Other tempo candidates')).toBe('62 BPM, 248 BPM')
    expect(valueOf('Key')).toBe('A minor')
    expect(valueOf('Key confidence')).toBe('64% (0.64)')
    expect(screen.getByText(/These are suggestions, not facts/)).toBeInTheDocument()
  })

  it('shows the stereo values', () => {
    render(<MetricsCards metrics={sample()} />)

    expect(valueOf('Phase correlation')).toBe('0.71')
    expect(valueOf('Width')).toBe('0.22')
    expect(valueOf('Side-to-mid ratio')).toBe('-7.4 dB')
    expect(valueOf('Mono compatible')).toBe('Yes')
    expect(valueOf('Mono file')).toBe('No')
  })

  it('shows the file details without repeating the file name', () => {
    render(<MetricsCards metrics={sample()} />)

    expect(valueOf('Format')).toBe('WAV')
    expect(valueOf('Duration')).toBe('5:01')
    expect(valueOf('Sample rate')).toBe('44.1 kHz')
    expect(valueOf('Bit depth')).toBe('24-bit')
    expect(valueOf('Channels')).toBe('Stereo')
    expect(screen.queryByText('demo-track.wav')).not.toBeInTheDocument()
  })

  it('leaves out rows and notes for optional fields that are missing', () => {
    const metrics = sample()
    const { loudness, dynamics, stereo } = metrics
    render(
      <MetricsCards
        metrics={{
          ...metrics,
          loudness: {
            integrated_lufs: loudness.integrated_lufs,
            true_peak_dbtp: loudness.true_peak_dbtp,
            loudness_range_lu: loudness.loudness_range_lu,
          },
          dynamics: { rms_dbfs: dynamics.rms_dbfs, crest_factor_db: dynamics.crest_factor_db },
          stereo: { phase_correlation: stereo.phase_correlation, width: stereo.width },
          tempo: { ...metrics.tempo, alternative_bpms: [] },
        }}
      />,
    )

    for (const term of [
      'Short-term max',
      'Momentary max',
      'Sample peak',
      'Clipped samples',
      'Dynamic range (approximate)',
      'Side-to-mid ratio',
      'Mono compatible',
      'Mono file',
      'Other tempo candidates',
    ]) {
      expect(hasTerm(term)).toBe(false)
    }
    expect(screen.queryByText(/not a certified DR14 reading/)).not.toBeInTheDocument()
  })

  it('says "Not detected" when there is no tempo or key', () => {
    const metrics = sample()
    render(
      <MetricsCards
        metrics={{
          ...metrics,
          tempo: { ...metrics.tempo, bpm: null },
          key: { ...metrics.key, tonic: null, mode: null },
        }}
      />,
    )

    expect(valueOf('Tempo')).toBe('Not detected')
    expect(valueOf('Key')).toBe('Not detected')
  })

  it('shows key candidates and variable tempo when present', () => {
    const metrics = sample()
    render(
      <MetricsCards
        metrics={{
          ...metrics,
          tempo: { ...metrics.tempo, variable_tempo: true },
          key: {
            ...metrics.key,
            alternatives: [
              { tonic: 'C', mode: 'major', confidence: 0.41 },
              { tonic: 'E', mode: 'minor', confidence: 0.33 },
            ],
          },
        }}
      />,
    )

    expect(valueOf('Variable tempo')).toBe('Yes')
    expect(valueOf('Other key candidates')).toBe('C major (41%), E minor (33%)')
  })

  it('lists the warnings', () => {
    render(<MetricsCards metrics={sample()} />)

    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('tempo and key use the first 240 s only')
  })

  it('has no warnings section when there are none', () => {
    render(<MetricsCards metrics={{ ...sample(), warnings: [] }} />)

    expect(screen.queryByRole('heading', { name: 'Warnings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MetricsCards metrics={sample()} />)

    await expectNoA11yViolations(container)
  })
})
