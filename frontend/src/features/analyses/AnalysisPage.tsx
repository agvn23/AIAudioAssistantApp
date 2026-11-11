import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, describeError } from '../../api/errors'
import type { Analysis } from '../../api/types'
import { Button } from '../../components/Button'
import { describeAnalysisError } from './analysisErrors'
import styles from './AnalysisPage.module.css'
import { DeleteVersionDialog } from './DeleteVersionDialog'
import { EditVersionDialog } from './EditVersionDialog'
import { STAGE_LABEL, STATUS_LABEL } from './labels'
import { forgetFile, getRememberedFile } from './sessionFiles'
import { ResultsSection } from './ResultsSection'
import { useAnalysis } from './useAnalyses'

// Loaded only when there is a local file to draw, so wavesurfer stays out of the main bundle.
const Waveform = lazy(() => import('./Waveform').then((module) => ({ default: module.Waveform })))

function parseId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function statusMessage(analysis: Analysis): string {
  switch (analysis.status) {
    case 'pending':
      return 'Waiting to start. This page updates by itself.'
    case 'running':
      return 'Analysing the file. This page updates by itself.'
    case 'done':
      return 'The analysis is finished.'
    case 'failed':
      return describeAnalysisError(analysis.error_code)
  }
}

function NotSet() {
  return <span className={styles.muted}>Not set</span>
}

function VersionMissing() {
  return (
    <section>
      <h1>Version not found</h1>
      <p>We could not find that version. It may have been deleted.</p>
      <p>
        <Link to="/tracks">Back to all tracks</Link>
      </p>
    </section>
  )
}

/** The waveform of the file uploaded in this session, or an honest note that there is none. */
function WaveformSection({ analysisId }: { analysisId: number }) {
  const file = getRememberedFile(analysisId)
  return (
    <section aria-labelledby="waveform-heading" className={styles.later}>
      <h2 id="waveform-heading">Waveform</h2>
      {file ? (
        <Suspense fallback={<p role="status">Loading waveform…</p>}>
          <Waveform key={analysisId} file={file} />
        </Suspense>
      ) : (
        <p>
          The waveform is drawn from the file on your computer, which is never stored on the server.
          It is only available in the browser tab where you uploaded the file, until you reload the
          page or sign out.
        </p>
      )}
    </section>
  )
}

function VersionDetail({ id }: { id: number }) {
  const navigate = useNavigate()
  const query = useAnalysis(id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const analysis = query.data

  // A 404 wins over cached data: the version was deleted (here or elsewhere).
  if (query.error instanceof ApiError && query.error.code === 'not_found') {
    return <VersionMissing />
  }

  if (!analysis) {
    if (query.isPending) {
      return (
        <section>
          <h1>Version</h1>
          <p role="status">Loading version…</p>
        </section>
      )
    }
    return (
      <section>
        <h1>Version</h1>
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
        <Link to={`/tracks/${analysis.track_id}`}>Back to track</Link>
      </p>

      <div className={styles.header}>
        <h1 className={styles.title}>{`Version ${analysis.version_number}`}</h1>
        <div className={styles.actions}>
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Button onClick={() => setDeleting(true)}>Delete</Button>
        </div>
      </div>

      <div role="status" className={styles.status} data-status={analysis.status}>
        <p>{statusMessage(analysis)}</p>
      </div>

      <dl className={styles.details}>
        <div>
          <dt className={styles.term}>Status</dt>
          <dd className={styles.value}>{STATUS_LABEL[analysis.status]}</dd>
        </div>
        <div>
          <dt className={styles.term}>Stage</dt>
          <dd className={styles.value}>
            {analysis.stage ? STAGE_LABEL[analysis.stage] : <NotSet />}
          </dd>
        </div>
        <div>
          <dt className={styles.term}>Label</dt>
          <dd className={styles.value}>{analysis.label ? analysis.label : <NotSet />}</dd>
        </div>
        <div>
          <dt className={styles.term}>File</dt>
          <dd className={styles.value}>{analysis.original_filename}</dd>
        </div>
        <div>
          <dt className={styles.term}>Uploaded</dt>
          <dd className={styles.value}>
            <time dateTime={analysis.created_at}>{formatDateTime(analysis.created_at)}</time>
          </dd>
        </div>
      </dl>

      <WaveformSection analysisId={analysis.id} />

      <ResultsSection analysis={analysis} />

      {editing ? <EditVersionDialog analysis={analysis} onClose={() => setEditing(false)} /> : null}
      {deleting ? (
        <DeleteVersionDialog
          analysis={analysis}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            forgetFile(analysis.id)
            void navigate(`/tracks/${analysis.track_id}`)
          }}
        />
      ) : null}
    </section>
  )
}

export function AnalysisPage() {
  const { id } = useParams()
  const analysisId = parseId(id)
  return analysisId === null ? <VersionMissing /> : <VersionDetail id={analysisId} />
}
