import { useId } from 'react'
import { formatBandName, formatDb, formatHz, formatNumber } from './format'
import type { Spectrum } from './metrics'
import styles from './SpectrumChart.module.css'
import { barFor, formatBandRange, niceScale, yFor, type Plot } from './spectrumLayout'

/**
 * The level of each frequency band as a hand-written SVG bar chart. Values are the
 * stored ones (relative to the average across bands, so pink noise reads 0), shown
 * with the same formatting as the rest of the results. The SVG is an image for
 * assistive technology; the same numbers are in a visually hidden table.
 */

const WIDTH = 640
const HEIGHT = 312
const PLOT: Plot = { left: 48, top: 24, width: 576, height: 220 }

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className={styles.row}>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  )
}

export function SpectrumChart({ spectrum }: { spectrum: Spectrum }) {
  const titleId = useId()
  const descId = useId()
  const { bands, spectral_centroid_hz: centroid, tilt_db_per_octave: tilt } = spectrum
  const scale = niceScale(bands.map((band) => band.relative_db))
  const slot = PLOT.width / bands.length
  const bottom = PLOT.top + PLOT.height

  return (
    <section aria-labelledby="spectrum-heading" className={styles.section}>
      <h3 id="spectrum-heading" className={styles.title}>
        Spectrum
      </h3>
      <p className={styles.note}>
        The level of each band in dB, relative to the average across bands. Pink noise would read 0
        dB in every band. Real music usually falls towards the top, so compare with reference tracks
        rather than expecting 0.
      </p>

      <div
        className={styles.scroll}
        tabIndex={0}
        role="group"
        aria-label="Spectrum chart, scrolls sideways on small screens"
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={styles.svg}
        >
          <title id={titleId}>Spectrum by band</title>
          <desc id={descId}>
            Bar chart of the level in each frequency band in dB, relative to the average across
            bands. The same values are in the table that follows.
          </desc>

          <text x={PLOT.left - 8} y={PLOT.top - 10} textAnchor="end" className={styles.axisText}>
            dB
          </text>
          {scale.ticks.map((tick) => {
            const y = yFor(tick, scale, PLOT)
            return (
              <g key={tick}>
                <line
                  x1={PLOT.left}
                  x2={PLOT.left + PLOT.width}
                  y1={y}
                  y2={y}
                  className={tick === 0 ? styles.zeroLine : styles.gridLine}
                />
                <text
                  x={PLOT.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={styles.axisText}
                >
                  {formatNumber(tick)}
                </text>
              </g>
            )
          })}

          {bands.map((band, index) => {
            const bar = barFor(index, bands.length, band.relative_db, scale, PLOT)
            const centre = PLOT.left + slot * index + slot / 2
            return (
              <g key={`${band.name}-${band.low_hz}`}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  className={styles.bar}
                />
                <text x={centre} y={bottom + 20} textAnchor="middle" className={styles.bandName}>
                  {formatBandName(band.name)}
                </text>
                <text x={centre} y={bottom + 36} textAnchor="middle" className={styles.bandRange}>
                  {formatBandRange(band.low_hz, band.high_hz)}
                </text>
                <text x={centre} y={bottom + 52} textAnchor="middle" className={styles.bandValue}>
                  {formatDb(band.relative_db)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="visually-hidden">
        <table>
          <caption>Level of each band relative to the average across bands</caption>
          <thead>
            <tr>
              <th scope="col">Band</th>
              <th scope="col">Range</th>
              <th scope="col">Relative level</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={`${band.name}-${band.low_hz}`}>
                <th scope="row">{formatBandName(band.name)}</th>
                <td>{formatBandRange(band.low_hz, band.high_hz)}</td>
                <td>{formatDb(band.relative_db)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {centroid !== undefined || tilt !== undefined ? (
        <dl className={styles.rows}>
          {centroid !== undefined ? (
            <Row term="Spectral centroid" value={formatHz(centroid)} />
          ) : null}
          {tilt !== undefined ? (
            <Row term="Spectral tilt" value={`${formatNumber(tilt)} dB per octave`} />
          ) : null}
        </dl>
      ) : null}
    </section>
  )
}
