import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import type { Analysis, Stage } from '../../api/types'
import { Button } from '../../components/Button'
import { ErrorSummary, type ErrorSummaryItem } from '../../components/ErrorSummary'
import { SelectField } from '../../components/SelectField'
import { SubmitButton } from '../../components/SubmitButton'
import { TextField } from '../../components/TextField'
import { formatWait } from '../auth/formatWait'
import { useCountdown } from '../auth/useCountdown'
import { describeUploadFailure, isLabelOnlyValidation, uploadRetryDelay } from './uploadErrors'
import { getMaxUploadBytes } from './uploadLimit'
import { ACCEPT_ATTRIBUTE, formatBytes, validateAudioFile } from './uploadRules'
import styles from './UploadVersionDialog.module.css'
import { useUploadAnalysis } from './useAnalyses'

interface FormFields {
  stage: string
  label: string
}

const FILE_ID = 'upload-file'
const LABEL_ID = 'upload-label'

const STAGES: readonly Stage[] = ['demo', 'mix', 'master']

const STAGE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'demo', label: 'Demo' },
  { value: 'mix', label: 'Mix' },
  { value: 'master', label: 'Master' },
]

function toStage(value: string): Stage | null {
  return STAGES.find((stage) => stage === value) ?? null
}

function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' && cause !== null && 'name' in cause && cause.name === 'AbortError'
  )
}

export interface UploadVersionDialogProps {
  trackId: number
  /** Called when the dialog has closed, however it closed (Cancel, Esc, uploaded). */
  onClose: () => void
  /** The file is passed along so the version page can draw its waveform in this session. */
  onUploaded?: (analysis: Analysis, file: File) => void
}

/**
 * Upload a new version of a track. Render it only while it should be open: it
 * opens itself as a modal on mount and always closes through the native
 * close(), so focus returns to the button that opened it.
 */
export function UploadVersionDialog({ trackId, onClose, onUploaded }: UploadVersionDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const upload = useUploadAnalysis()
  const countdown = useCountdown()

  const [maxBytes] = useState(() => getMaxUploadBytes())
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [summary, setSummary] = useState<ErrorSummaryItem[]>([])
  const [focusToken, setFocusToken] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({ defaultValues: { stage: '', label: '' } })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>(`#${FILE_ID}`)?.focus()
  }, [])

  // A request still running when the dialog goes away must not keep uploading.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const sent = progress !== null && progress >= 1
  const percent = Math.round((progress ?? 0) * 100)
  const waiting = countdown.secondsLeft > 0

  function closeDialog() {
    dialogRef.current?.close()
  }

  function onCancelClick() {
    abortRef.current?.abort()
    closeDialog()
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSummary([])
    setFormError(null)
    const chosen = event.target.files?.[0]
    if (!chosen) {
      setFile(null)
      setFileError(null)
      return
    }
    const problem = validateAudioFile(chosen, maxBytes)
    if (problem) {
      setFile(null)
      setFileError(problem.message)
      return
    }
    setFile(chosen)
    setFileError(null)
  }

  function handleFailure(error: unknown) {
    const delay = uploadRetryDelay(error)
    if (delay !== undefined) countdown.start(delay)

    if (isLabelOnlyValidation(error)) {
      const message = error.fields.map((field) => field.message).join(' ')
      setError('label', { type: 'server', message })
      setSummary([{ id: LABEL_ID, message: `Label: ${message}` }])
      setFocusToken((token) => token + 1)
      return
    }
    setFormError(describeUploadFailure(error))
  }

  async function onValid(fields: FormFields) {
    setFormError(null)
    if (file === null) {
      const message = fileError ?? 'Choose an audio file.'
      setFileError(message)
      setSummary([{ id: FILE_ID, message }])
      setFocusToken((token) => token + 1)
      return
    }
    setSummary([])
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const analysis = await upload.mutateAsync({
        trackId,
        file,
        stage: toStage(fields.stage),
        label: fields.label.trim() === '' ? null : fields.label.trim(),
        signal: controller.signal,
        onProgress: (p) => setProgress(p.fraction),
      })
      closeDialog()
      onUploaded?.(analysis, file)
    } catch (error) {
      if (isAbortError(error)) return
      handleFailure(error)
    } finally {
      abortRef.current = null
    }
  }

  const fileDescribedBy = [`${FILE_ID}-hint`, fileError ? `${FILE_ID}-error` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialog}
      onClose={onClose}
      onCancel={(event) => {
        // Esc must not abandon an upload that is already on its way.
        if (isSubmitting) event.preventDefault()
      }}
    >
      <h2 id={titleId} className={styles.title}>
        Upload a new version
      </h2>
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className={styles.form}
      >
        <ErrorSummary errors={summary} focusToken={focusToken} />
        <p className={styles.note}>
          The audio is analysed and then deleted from the server. Only the measurements are kept.
        </p>
        <div className={styles.field}>
          <label htmlFor={FILE_ID} className={styles.label}>
            Audio file
          </label>
          <p id={`${FILE_ID}-hint`} className={styles.hint}>
            WAV, MP3, FLAC, AIFF, M4A or OGG, up to {formatBytes(maxBytes)}.
          </p>
          {fileError ? (
            <p id={`${FILE_ID}-error`} className={styles.error}>
              <span className="visually-hidden">Error: </span>
              {fileError}
            </p>
          ) : null}
          <input
            id={FILE_ID}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className={styles.fileInput}
            onChange={onFileChange}
            disabled={isSubmitting}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileDescribedBy}
          />
        </div>
        <SelectField
          id="upload-stage"
          label="Stage"
          hint="Sent to the AI together with the measurements."
          options={STAGE_OPTIONS}
          error={errors.stage?.message}
          {...register('stage')}
        />
        <TextField
          id={LABEL_ID}
          label="Label"
          hint="Optional, for example “vocals up”."
          autoComplete="off"
          error={errors.label?.message}
          {...register('label')}
        />
        {isSubmitting ? (
          <div className={styles.progress}>
            <p role="status" className={styles.note}>
              {sent ? 'Upload sent. Waiting for the server…' : 'Uploading…'}
            </p>
            <progress
              className={styles.bar}
              max={100}
              value={percent}
              aria-label="Upload progress"
            />
            <p className={styles.note}>{percent}%</p>
          </div>
        ) : null}
        {formError !== null ? (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button onClick={onCancelClick} disabled={isSubmitting && sent}>
            {isSubmitting ? 'Cancel upload' : 'Cancel'}
          </Button>
          <SubmitButton
            pending={isSubmitting}
            pendingLabel={sent ? 'Waiting…' : 'Uploading…'}
            disabled={waiting}
          >
            {waiting ? `Try again in ${formatWait(countdown.secondsLeft)}` : 'Upload version'}
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
