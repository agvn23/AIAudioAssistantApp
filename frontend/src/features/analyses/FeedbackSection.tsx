import type { Analysis } from '../../api/types'
import { Button } from '../../components/Button'
import { parseFeedback } from '../results/feedback'
import { FeedbackCards } from '../results/FeedbackCards'
import { describeFeedbackError } from './feedbackErrors'
import styles from './FeedbackSection.module.css'
import { useCreateFeedback } from './useCreateFeedback'

/**
 * The AI feedback of a finished version, with the button that generates or
 * regenerates it. A failed call leaves the stored feedback on screen. The
 * "stale" hint compares the stage only: genre and platform live on the track,
 * which this page does not load.
 */
export function FeedbackSection({ analysis }: { analysis: Analysis }) {
  const create = useCreateFeedback()
  const stored = analysis.feedback ?? null
  const feedback = stored === null ? null : parseFeedback(stored)

  const stale =
    feedback !== null &&
    feedback.meta !== undefined &&
    (feedback.meta.context_used.stage ?? null) !== (analysis.stage ?? null)

  function generate() {
    create.mutate({ id: analysis.id })
  }

  let buttonLabel = stored === null ? 'Generate feedback' : 'Regenerate feedback'
  if (create.isPending) buttonLabel = 'Generating…'

  let statusText = ''
  if (create.isPending) statusText = 'Generating feedback. This can take a while.'
  else if (create.isSuccess) statusText = 'Feedback is ready.'

  return (
    <section aria-labelledby="feedback-heading" className={styles.section}>
      <h3 id="feedback-heading" className={styles.title}>
        AI feedback
      </h3>
      <p className={styles.note}>
        The AI reads the measurements above and your track&rsquo;s genre, platform and stage. It
        never hears the audio.
        {stored === null ? '' : ' Regenerating replaces the feedback below.'}
      </p>

      {stored === null ? <p>No feedback has been generated for this version yet.</p> : null}
      {stored !== null && feedback === null ? (
        <p>The saved feedback could not be read. Generate it again to replace it.</p>
      ) : null}
      {stale ? (
        <p className={styles.stale}>
          The stage of this version was changed after this feedback was written. Regenerate it to
          match.
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button onClick={generate} disabled={create.isPending}>
          {buttonLabel}
        </Button>
      </div>

      <p role="status" className={styles.status}>
        {statusText}
      </p>
      {create.isError ? (
        <div role="alert" className={styles.alert}>
          <p>{describeFeedbackError(create.error)}</p>
        </div>
      ) : null}

      {feedback !== null ? <FeedbackCards feedback={feedback} /> : null}
    </section>
  )
}
