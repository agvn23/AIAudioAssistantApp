import type { ReactNode } from 'react'
import {
  formatBpm,
  formatChannels,
  formatDb,
  formatDbfs,
  formatDbtp,
  formatDuration,
  formatHz,
  formatKey,
  formatLu,
  formatLufs,
  formatNumber,
  formatPercent,
} from './format'
import type { Metrics } from './metrics'
import styles from './MetricsCards.module.css'

/**
 * The measurements of one analysis as cards. Numbers come from format.ts, so they
 * match what the AI feedback quotes. A row for an optional field that is missing
 * is left out. Dynamic range is labelled as an approximation, and tempo and key
 * as suggestions.
 */

function Card({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  const headingId = `metrics-${id}-heading`
  return (
    <section aria-labelledby={headingId} className={styles.card}>
      <h3 id={headingId} className={styles.cardTitle}>
        {title}
      </h3>
      <dl className={styles.rows}>{children}</dl>
      {note ? <p className={styles.note}>{note}</p> : null}
    </section>
  )
}

function Row({ term, value }: { term: string; value: string | undefined }) {
  if (value === undefined) return null
  return (
    <div className={styles.row}>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  )
}

function optional<T>(value: T | undefined, format: (value: T) => string): string | undefined {
  return value === undefined ? undefined : format(value)
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No'
}

/** "81% (0.81)": the percentage for reading, the stored number for matching the feedback. */
function formatConfidence(confidence: number): string {
  return `${formatPercent(confidence)} (${formatNumber(confidence)})`
}

export function MetricsCards({ metrics }: { metrics: Metrics }) {
  const { file, loudness, dynamics, tempo, key, stereo, warnings } = metrics

  return (
    <div>
      <div className={styles.cards}>
        <Card id="loudness" title="Loudness">
          <Row term="Integrated loudness" value={formatLufs(loudness.integrated_lufs)} />
          <Row term="Loudness range" value={formatLu(loudness.loudness_range_lu)} />
          <Row term="True peak" value={formatDbtp(loudness.true_peak_dbtp)} />
          <Row term="Short-term max" value={optional(loudness.short_term_max_lufs, formatLufs)} />
          <Row term="Momentary max" value={optional(loudness.momentary_max_lufs, formatLufs)} />
          <Row term="Sample peak" value={optional(loudness.sample_peak_dbfs, formatDbfs)} />
          <Row term="Clipped samples" value={optional(loudness.clipped_samples, formatNumber)} />
        </Card>

        <Card
          id="dynamics"
          title="Dynamics"
          note={
            dynamics.dynamic_range_db === undefined
              ? undefined
              : 'Dynamic range is an approximation of the dynamic range meter idea, not a certified DR14 reading.'
          }
        >
          <Row term="RMS level" value={formatDbfs(dynamics.rms_dbfs)} />
          <Row term="Crest factor" value={formatDb(dynamics.crest_factor_db)} />
          <Row
            term="Dynamic range (approximate)"
            value={optional(dynamics.dynamic_range_db, formatDb)}
          />
        </Card>

        <Card
          id="tempo-key"
          title="Tempo and key"
          note="These are suggestions, not facts. The lower the confidence, the more you should check them in your DAW or by ear."
        >
          <Row term="Tempo" value={formatBpm(tempo.bpm)} />
          <Row term="Tempo confidence" value={formatConfidence(tempo.confidence)} />
          <Row
            term="Other tempo candidates"
            value={
              tempo.alternative_bpms.length === 0
                ? undefined
                : tempo.alternative_bpms.map((bpm) => formatBpm(bpm)).join(', ')
            }
          />
          <Row term="Variable tempo" value={optional(tempo.variable_tempo, yesNo)} />
          <Row term="Key" value={formatKey(key.tonic, key.mode)} />
          <Row term="Key confidence" value={formatConfidence(key.confidence)} />
          <Row
            term="Other key candidates"
            value={
              key.alternatives.length === 0
                ? undefined
                : key.alternatives
                    .map(
                      (candidate) =>
                        `${formatKey(candidate.tonic, candidate.mode)} (${formatPercent(candidate.confidence)})`,
                    )
                    .join(', ')
            }
          />
        </Card>

        <Card id="stereo" title="Stereo">
          <Row term="Phase correlation" value={formatNumber(stereo.phase_correlation)} />
          <Row term="Width" value={formatNumber(stereo.width)} />
          <Row term="Side-to-mid ratio" value={optional(stereo.side_to_mid_db, formatDb)} />
          <Row term="Mono compatible" value={optional(stereo.mono_compatible, yesNo)} />
          <Row term="Mono file" value={optional(stereo.is_mono, yesNo)} />
        </Card>

        <Card id="file" title="File">
          <Row term="Format" value={optional(file.format, (format) => format.toUpperCase())} />
          <Row term="Duration" value={formatDuration(file.duration_sec)} />
          <Row term="Sample rate" value={formatHz(file.sample_rate_hz)} />
          <Row
            term="Bit depth"
            value={
              file.bit_depth === undefined
                ? undefined
                : file.bit_depth === null
                  ? 'Not reported'
                  : `${file.bit_depth}-bit`
            }
          />
          <Row term="Channels" value={formatChannels(file.channels)} />
        </Card>
      </div>

      {warnings.length > 0 ? (
        <section aria-labelledby="metrics-warnings-heading" className={styles.warnings}>
          <h3 id="metrics-warnings-heading" className={styles.cardTitle}>
            Warnings
          </h3>
          <ul className={styles.warningList}>
            {warnings.map((warning) => (
              <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
