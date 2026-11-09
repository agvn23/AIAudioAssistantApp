import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { describeError } from '../../api/errors'
import type { Track } from '../../api/types'
import { Button } from '../../components/Button'
import { SubmitButton } from '../../components/SubmitButton'
import { TextField } from '../../components/TextField'
import { TrackFormDialog } from './TrackFormDialog'
import { PLATFORMS, TRACK_LIMITS } from './trackForm'
import styles from './TracksPage.module.css'
import {
  DEFAULT_SEARCH,
  pageCount,
  parseTracksSearch,
  toListQuery,
  toSearchParams,
  updateSearch,
  type TracksSearch,
} from './tracksSearch'
import { useTracks } from './useTracks'

function listPath(search: TracksSearch): string {
  const query = toSearchParams(search).toString()
  return query === '' ? '/tracks' : `/tracks?${query}`
}

function platformLabel(value: string): string {
  return PLATFORMS.find((platform) => platform.value === value)?.label ?? value
}

function describeTrack(track: Track): string {
  const parts: string[] = []
  if (track.genre) parts.push(track.genre)
  if (track.target_platform) parts.push(platformLabel(track.target_platform))
  return parts.join(' · ')
}

function countText(total: number, filtered: boolean): string {
  if (filtered) return total === 1 ? '1 track matches' : `${total} tracks match`
  return total === 1 ? '1 track' : `${total} tracks`
}

export function TracksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const search = parseTracksSearch(searchParams)
  const tracks = useTracks(toListQuery(search))

  // The fields hold a draft. When the URL's values change (submit, clear, back
  // button), the draft is reset to them. Setting state while rendering, guarded
  // by a comparison, is React's documented way to do that without an effect.
  const [draft, setDraft] = useState({ q: search.q, genre: search.genre })
  const [seen, setSeen] = useState({ q: search.q, genre: search.genre })
  if (seen.q !== search.q || seen.genre !== search.genre) {
    setSeen({ q: search.q, genre: search.genre })
    setDraft({ q: search.q, genre: search.genre })
  }

  const hasFilters = search.q !== '' || search.genre !== '' || search.tag !== ''
  const data = tracks.data
  // Placeholder data is the previous page, shown while the next one loads. Messages
  // about the result (empty, out of range) wait for the real answer.
  const settled = tracks.isPlaceholderData ? undefined : data
  const pages = pageCount(data?.total ?? 0)

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearchParams(
      toSearchParams(updateSearch(search, { q: draft.q.trim(), genre: draft.genre.trim() })),
    )
  }

  function clearFilters() {
    setSearchParams(toSearchParams(DEFAULT_SEARCH))
  }

  function removeTagFilter() {
    setSearchParams(toSearchParams(updateSearch(search, { tag: '' })))
  }

  let statusText = ''
  if (tracks.isPending) statusText = 'Loading tracks…'
  else if (data) statusText = countText(data.total, hasFilters)

  return (
    <section>
      <div className={styles.header}>
        <h1>Tracks</h1>
        <Button onClick={() => setCreating(true)}>New track</Button>
      </div>

      <form
        role="search"
        aria-label="Filter tracks"
        className={styles.filters}
        onSubmit={applyFilters}
      >
        <div className={styles.field}>
          <TextField
            id="tracks-q"
            name="q"
            type="search"
            label="Search title and notes"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <TextField
            id="tracks-genre"
            name="genre"
            label="Genre"
            maxLength={TRACK_LIMITS.genre}
            value={draft.genre}
            onChange={(event) => setDraft({ ...draft, genre: event.target.value })}
          />
        </div>
        <div className={styles.actions}>
          <SubmitButton>Search</SubmitButton>
          {hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : null}
        </div>
      </form>

      {search.tag !== '' ? (
        <p className={styles.activeTag}>
          <span>
            Filtering by tag <strong>{search.tag}</strong>
          </span>
          <Button onClick={removeTagFilter}>Remove tag filter</Button>
        </p>
      ) : null}

      <p role="status" className={styles.status}>
        {statusText}
      </p>

      {tracks.isError ? (
        <div role="alert" className={styles.alert}>
          <p>{describeError(tracks.error)}</p>
          <Button onClick={() => void tracks.refetch()}>Try again</Button>
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className={styles.list} aria-busy={tracks.isPlaceholderData || undefined}>
          {data.items.map((track) => {
            const description = describeTrack(track)
            return (
              <li key={track.id} className={styles.item}>
                <Link to={`/tracks/${track.id}`} className={styles.title}>
                  {track.title}
                </Link>
                {description !== '' ? <span className={styles.meta}>{description}</span> : null}
                {track.tags.length > 0 ? (
                  <ul className={styles.tags} aria-label={`Tags of ${track.title}`}>
                    {track.tags.map((tag) => (
                      <li key={tag}>
                        <Link
                          to={listPath(updateSearch(search, { tag }))}
                          className={styles.chip}
                          aria-label={`Filter by tag ${tag}`}
                          aria-current={tag === search.tag ? 'true' : undefined}
                        >
                          {tag}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {settled && settled.total === 0 ? (
        <p>{hasFilters ? 'No tracks match your filters.' : 'You have no tracks yet.'}</p>
      ) : null}

      {settled && settled.total > 0 && settled.items.length === 0 ? (
        <p>
          That page does not exist.{' '}
          <Link to={listPath(updateSearch(search, { page: pages }))}>Go to the last page</Link>
        </p>
      ) : null}

      {data && data.items.length > 0 && pages > 1 ? (
        <nav aria-label="Pagination" className={styles.pager}>
          {search.page > 1 ? (
            <Link to={listPath(updateSearch(search, { page: search.page - 1 }))}>
              Previous page
            </Link>
          ) : null}
          <span>{`Page ${search.page} of ${pages}`}</span>
          {search.page < pages ? (
            <Link to={listPath(updateSearch(search, { page: search.page + 1 }))}>Next page</Link>
          ) : null}
        </nav>
      ) : null}
      {creating ? (
        <TrackFormDialog
          onClose={() => setCreating(false)}
          onSaved={(track) => {
            void navigate(`/tracks/${track.id}`)
          }}
        />
      ) : null}
    </section>
  )
}
