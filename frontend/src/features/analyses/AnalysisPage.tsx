import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, describeError } from '../../api/errors'
import type { Analysis } from '../../api/types'
import { Button } from '../../components/Button'
import { describeAnalysisError } from './analysisErrors'
import styles from './AnalysisPage.module.css'
import { DeleteVersionDialog } from './DeleteVersionDialog'
import { EditVersionDialog } from './EditVersionDialog'
import { STAGE_LABEL, STATUS_LABEL } from './labels'
import { useAnalysis } from './useAnalyses'

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

      <section aria-labelledby="results-heading" className={styles.later}>
        <h2 id="results-heading">Results</h2>
        <p>Measurements and AI feedback are coming in a later slice.</p>
      </section>

      {editing ? <EditVersionDialog analysis={analysis} onClose={() => setEditing(false)} /> : null}
      {deleting ? (
        <DeleteVersionDialog
          analysis={analysis}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
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
