import type { Analysis } from '../../api/types'
import { MetricsCards } from '../results/MetricsCards'
import { parseMetrics } from '../results/metrics'
import { SpectrumChart } from '../results/SpectrumChart'
import { FeedbackSection } from './FeedbackSection'
import styles from './ResultsSection.module.css'

/**
 * The results of one version: measurements, spectrum and AI feedback. Only a
 * finished version with readable measurements shows them. Feedback is offered
 * only then, because it is written from the measurements.
 */
function ResultsBody({ analysis }: { analysis: Analysis }) {
  if (analysis.status === 'pending' || analysis.status === 'running') {
    return <p>Results appear here once the analysis has finished.</p>
  }
  if (analysis.status === 'failed') {
    return <p>There are no results because the analysis failed.</p>
  }

  const metrics = parseMetrics(analysis.metrics)
  if (metrics === null) {
    return (
      <p role="alert" className={styles.alert}>
        The measurements of this version could not be read, so no results are shown.
      </p>
    )
  }

  return (
    <>
      <MetricsCards metrics={metrics} />
      <SpectrumChart spectrum={metrics.spectrum} />
      <FeedbackSection analysis={analysis} />
    </>
  )
}

export function ResultsSection({ analysis }: { analysis: Analysis }) {
  return (
    <section aria-labelledby="results-heading" className={styles.section}>
      <h2 id="results-heading">Results</h2>
      <ResultsBody analysis={analysis} />
    </section>
  )
}
