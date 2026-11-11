import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../../test/a11y'
import { sampleMetrics } from '../../test/fixtures/analysis'
import { parseMetrics, type Spectrum } from './metrics'
import { SpectrumChart } from './SpectrumChart'

function sample(): Spectrum {
  const parsed = parseMetrics(sampleMetrics)
  if (parsed === null) throw new Error('The sample metrics fixture must parse.')
  return parsed.spectrum
}

function valueOf(term: string): string {
  const dt = screen.getByText(term, { selector: 'dt' })
  return dt.nextElementSibling?.textContent ?? ''
}

function rectsOf(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll('rect'))
}

function attr(element: Element, name: string): number {
  return Number(element.getAttribute(name))
}

function rowCells(table: HTMLElement, band: string): (string | null)[] {
  const row = within(table).getByRole('rowheader', { name: band }).closest('tr')
  if (row === null) throw new Error(`No row for ${band}.`)
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

describe('SpectrumChart', () => {
  it('has a heading and says what the zero line means', () => {
    render(<SpectrumChart spectrum={sample()} />)

    expect(screen.getByRole('heading', { name: 'Spectrum' })).toBeInTheDocument()
    expect(screen.getByText(/Pink noise would read 0 dB/)).toBeInTheDocument()
  })

  it('draws one bar per band', () => {
    const { container } = render(<SpectrumChart spectrum={sample()} />)

    expect(rectsOf(container)).toHaveLength(7)
  })

  it('gives the chart a name and a description', () => {
    render(<SpectrumChart spectrum={sample()} />)

    const chart = screen.getByRole('img', { name: 'Spectrum by band' })
    expect(chart).toHaveAccessibleDescription(/same values are in the table/)
  })

  it('has a table with every band, its range and its value', () => {
    render(<SpectrumChart spectrum={sample()} />)

    const table = screen.getByRole('table', { name: /relative to the average across bands/ })
    expect(within(table).getAllByRole('row')).toHaveLength(8)
    expect(rowCells(table, 'Sub')).toEqual(['20–60 Hz', '6.1 dB'])
    expect(rowCells(table, 'Low mid')).toEqual(['250–500 Hz', '2.2 dB'])
    expect(rowCells(table, 'Mid')).toEqual(['500 Hz–2 kHz', '-1.3 dB'])
    expect(rowCells(table, 'Air')).toEqual(['12–20 kHz', '-8.6 dB'])
  })

  it('draws a positive value above the zero line and a negative one below it', () => {
    const { container } = render(<SpectrumChart spectrum={sample()} />)
    const rects = rectsOf(container)
    const sub = rects[0]
    const air = rects[6]
    if (sub === undefined || air === undefined) throw new Error('Expected a first and a last bar.')

    const subBottom = attr(sub, 'y') + attr(sub, 'height')
    expect(subBottom).toBeCloseTo(attr(air, 'y'))
    expect(attr(sub, 'y')).toBeLessThan(subBottom)
    expect(attr(air, 'height')).toBeGreaterThan(0)
  })

  it('draws bar heights in proportion to the values', () => {
    const { container } = render(<SpectrumChart spectrum={sample()} />)
    const rects = rectsOf(container)
    const sub = rects[0]
    const air = rects[6]
    if (sub === undefined || air === undefined) throw new Error('Expected a first and a last bar.')

    expect(attr(sub, 'height') / attr(air, 'height')).toBeCloseTo(6.1 / 8.6, 3)
  })

  it('shows the spectral centroid and tilt when present', () => {
    render(
      <SpectrumChart
        spectrum={{ ...sample(), spectral_centroid_hz: 227.19, tilt_db_per_octave: -4.2 }}
      />,
    )

    expect(valueOf('Spectral centroid')).toBe('227.19 Hz')
    expect(valueOf('Spectral tilt')).toBe('-4.2 dB per octave')
  })

  it('leaves out the centroid and tilt when they are missing', () => {
    render(<SpectrumChart spectrum={{ bands: sample().bands }} />)

    expect(screen.queryByText('Spectral centroid')).not.toBeInTheDocument()
    expect(screen.queryByText('Spectral tilt')).not.toBeInTheDocument()
  })

  it('draws flat bars, without NaN, when every band is 0', () => {
    const flat: Spectrum = { bands: sample().bands.map((band) => ({ ...band, relative_db: 0 })) }

    const { container } = render(<SpectrumChart spectrum={flat} />)

    for (const rect of rectsOf(container)) {
      expect(rect.getAttribute('height')).toBe('0')
    }
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<SpectrumChart spectrum={sample()} />)

    await expectNoA11yViolations(container)
  })
})
