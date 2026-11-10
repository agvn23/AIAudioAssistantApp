import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, describeError } from '../../api/errors'
import { Button } from '../../components/Button'
import { TrackVersions } from '../analyses/TrackVersions'
import { DeleteTrackDialog } from './DeleteTrackDialog'
import { PLATFORMS } from './trackForm'
import { TrackFormDialog } from './TrackFormDialog'
import styles from './TrackDetailPage.module.css'
import { DEFAULT_SEARCH, toSearchParams } from './tracksSearch'
import { useTrack } from './useTracks'

function parseId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function platformLabel(value: string): string {
  return PLATFORMS.find((platform) => platform.value === value)?.label ?? value
}

function tagFilterPath(tag: string): string {
  return `/tracks?${toSearchParams({ ...DEFAULT_SEARCH, tag }).toString()}`
}

function NotSet({ children = 'Not set' }: { children?: string }) {
  return <span className={styles.muted}>{children}</span>
}

function TrackMissing() {
  return (
    <section>
      <h1>Track not found</h1>
      <p>We could not find that track. It may have been deleted.</p>
      <p>
        <Link to="/tracks">Back to all tracks</Link>
      </p>
    </section>
  )
}

function TrackDetail({ id }: { id: number }) {
  const navigate = useNavigate()
  const query = useTrack(id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const track = query.data

  // A 404 wins over cached data: the track was deleted (here or elsewhere).
  if (query.error instanceof ApiError && query.error.code === 'not_found') {
    return <TrackMissing />
  }

  if (!track) {
    if (query.isPending) {
      return (
        <section>
          <h1>Track</h1>
          <p role="status">Loading track…</p>
        </section>
      )
    }
    return (
      <section>
        <h1>Track</h1>
        <div role="alert" className={styles.alert}>
          <p>{describeError(query.error)}</p>
          <Button onClick={() => void query.refetch()}>Try again</Button>
        </div>
        <p>
          <Link to="/tracks">Back to all tracks</Link>
        </p>
      </section>
    )
  }

  return (
    <section>
      <p>
        <Link to="/tracks">Back to all tracks</Link>
      </p>

      <div className={styles.header}>
        <h1 className={styles.title}>{track.title}</h1>
        <div className={styles.actions}>
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Button onClick={() => setDeleting(true)}>Delete</Button>
        </div>
      </div>

      <dl className={styles.details}>
        <div>
          <dt className={styles.term}>Genre</dt>
          <dd className={styles.value}>{track.genre ? track.genre : <NotSet />}</dd>
        </div>
        <div>
          <dt className={styles.term}>Target platform</dt>
          <dd className={styles.value}>
            {track.target_platform ? platformLabel(track.target_platform) : <NotSet />}
          </dd>
        </div>
        <div>
          <dt className={styles.term}>Notes</dt>
          <dd className={`${styles.value} ${styles.notes}`}>
            {track.notes ? track.notes : <NotSet />}
          </dd>
        </div>
        <div>
          <dt className={styles.term}>Tags</dt>
          <dd className={styles.value}>
            {track.tags.length > 0 ? (
              <ul className={styles.tags}>
                {track.tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      to={tagFilterPath(tag)}
                      className={styles.chip}
                      aria-label={`Show tracks tagged ${tag}`}
                    >
                      {tag}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <NotSet>No tags</NotSet>
            )}
          </dd>
        </div>
      </dl>

      <TrackVersions trackId={track.id} />

      {editing ? <TrackFormDialog track={track} onClose={() => setEditing(false)} /> : null}
      {deleting ? (
        <DeleteTrackDialog
          track={track}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            void navigate('/tracks')
          }}
        />
      ) : null}
    </section>
  )
}

export function TrackDetailPage() {
  const { id } = useParams()
  const trackId = parseId(id)
  return trackId === null ? <TrackMissing /> : <TrackDetail id={trackId} />
}
