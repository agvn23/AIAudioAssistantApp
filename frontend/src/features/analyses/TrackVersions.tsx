import { useId, useState } from 'react'
import { Link } from 'react-router'
import { describeError } from '../../api/errors'
import type { Analysis, AnalysisStatus, AnalysisSummary, Stage } from '../../api/types'
import { Button } from '../../components/Button'
import { describeAnalysisError } from './analysisErrors'
import styles from './TrackVersions.module.css'
import { UploadVersionDialog } from './UploadVersionDialog'
import { useTrackAnalyses } from './useAnalyses'
import { rememberFile } from './sessionFiles'

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: 'Waiting to start',
  running: 'Analysing',
  done: 'Done',
  failed: 'Failed',
}

const STAGE_LABEL: Record<Stage, string> = {
  demo: 'Demo',
  mix: 'Mix',
  master: 'Master',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function VersionRow({ version }: { version: AnalysisSummary }) {
  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <Link to={`/analyses/${version.id}`} className={styles.link}>
          {`Version ${version.version_number}`}
        </Link>
        {version.label ? <span className={styles.label}>{version.label}</span> : null}
        <span className={styles.status} data-status={version.status}>
          {STATUS_LABEL[version.status]}
        </span>
      </div>
      <p className={styles.meta}>
        <span>{version.stage ? STAGE_LABEL[version.stage] : 'No stage'}</span>
        <span className={styles.file}>{version.original_filename}</span>
        <time dateTime={version.created_at}>{formatDate(version.created_at)}</time>
      </p>
      {version.status === 'failed' ? (
        <p className={styles.failure}>{describeAnalysisError(version.error_code)}</p>
      ) : null}
    </li>
  )
}

export interface TrackVersionsProps {
  trackId: number
}

/**
 * The versions of one track, oldest first, with the button that opens the
 * upload dialog. The list re-reads itself every 2 s while any version is still
 * being analysed (see useTrackAnalyses).
 */
export function TrackVersions({ trackId }: TrackVersionsProps) {
  const headingId = useId()
  const query = useTrackAnalyses(trackId)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<Analysis | null>(null)
  const versions = query.data

  function openUpload() {
    setUploaded(null)
    setUploading(true)
  }

  let body
  if (versions) {
    body =
      versions.length === 0 ? (
        <p>No versions yet. Upload a file to analyse it.</p>
      ) : (
        <ul className={styles.list}>
          {versions.map((version) => (
            <VersionRow key={version.id} version={version} />
          ))}
        </ul>
      )
  } else if (query.isPending) {
    body = <p role="status">Loading versions…</p>
  } else {
    body = (
      <div role="alert" className={styles.alert}>
        <p>{describeError(query.error)}</p>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </div>
    )
  }

  return (
    <section aria-labelledby={headingId} className={styles.versions}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          Versions
        </h2>
        <Button onClick={openUpload}>Upload new version</Button>
      </div>
      <div role="status" className={styles.note}>
        {uploaded ? (
          <p>
            {`Uploaded “${uploaded.original_filename}” as version ${uploaded.version_number}. The analysis has started and its status below updates by itself.`}
          </p>
        ) : null}
      </div>
      {body}
      {uploading ? (
        <UploadVersionDialog
          trackId={trackId}
          onClose={() => setUploading(false)}
          onUploaded={(analysis, file) => {
            rememberFile(analysis.id, file)
            setUploaded(analysis)
          }}
        />
      ) : null}
    </section>
  )
}
