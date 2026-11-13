import type { FeedbackContext } from '../results/feedback'
import { useTrack } from '../tracks/useTracks'
import { changedTrackFields, describeTrackChange } from './contextText'
import styles from './FeedbackSection.module.css'

export interface StaleTrackHintProps {
  trackId: number
  /** The genre, platform and stage the feedback was written for (meta.context_used). */
  used: FeedbackContext
}

/**
 * Says when the track's genre or platform changed after the feedback was
 * written. It is an extra: while the track loads, or if it cannot be loaded,
 * nothing is shown and the feedback is not affected.
 */
export function StaleTrackHint({ trackId, used }: StaleTrackHintProps) {
  const query = useTrack(trackId)
  if (!query.data) return null

  const changed = changedTrackFields(query.data, used)
  if (changed.length === 0) return null

  return <p className={styles.stale}>{describeTrackChange(changed)}</p>
}
