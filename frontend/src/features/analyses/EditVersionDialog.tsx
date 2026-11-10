import { useEffect, useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../../api/errors'
import type { Analysis, AnalysisUpdate } from '../../api/types'
import { Button } from '../../components/Button'
import { ErrorSummary, type ErrorSummaryItem } from '../../components/ErrorSummary'
import { SelectField } from '../../components/SelectField'
import { SubmitButton } from '../../components/SubmitButton'
import { TextField } from '../../components/TextField'
import { describeFailureWithWait } from './describeFailure'
import { STAGE_OPTIONS, toStage } from './labels'
import styles from './VersionDialog.module.css'
import { useUpdateAnalysis } from './useAnalyses'

interface FormFields {
  stage: string
  label: string
}

const STAGE_ID = 'version-stage'
const LABEL_ID = 'version-label'

function emptyToNull(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

export interface EditVersionDialogProps {
  analysis: Pick<Analysis, 'id' | 'label' | 'stage'>
  /** Called when the dialog has closed, however it closed (Cancel, Esc, saved). */
  onClose: () => void
  onSaved?: (analysis: Analysis) => void
}

/**
 * Edit the stage and label of one version. Render it only while it should be
 * open: it opens itself as a modal on mount and closes through the native
 * close(), so focus returns to the button that opened it.
 */
export function EditVersionDialog({ analysis, onClose, onSaved }: EditVersionDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const update = useUpdateAnalysis()

  const [initial] = useState(() => ({ stage: analysis.stage ?? '', label: analysis.label ?? '' }))
  const [summary, setSummary] = useState<ErrorSummaryItem[]>([])
  const [focusToken, setFocusToken] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({ defaultValues: initial })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLSelectElement>(`#${STAGE_ID}`)?.focus()
  }, [])

  function closeDialog() {
    dialogRef.current?.close()
  }

  function handleFailure(error: unknown) {
    if (error instanceof ApiError && error.code === 'validation_error' && error.fields.length > 0) {
      const items: ErrorSummaryItem[] = []
      for (const fieldError of error.fields) {
        if (fieldError.field === 'label') {
          setError('label', { type: 'server', message: fieldError.message })
          items.push({ id: LABEL_ID, message: `Label: ${fieldError.message}` })
        } else if (fieldError.field === 'stage') {
          setError('stage', { type: 'server', message: fieldError.message })
          items.push({ id: STAGE_ID, message: `Stage: ${fieldError.message}` })
        } else {
          items.push({ message: fieldError.message })
        }
      }
      setSummary(items)
      setFocusToken((token) => token + 1)
      return
    }
    setFormError(describeFailureWithWait(error))
  }

  async function onValid(fields: FormFields) {
    setFormError(null)
    setSummary([])
    const body: AnalysisUpdate = {}
    const nextStage = toStage(fields.stage)
    if (nextStage !== analysis.stage) body.stage = nextStage
    const nextLabel = emptyToNull(fields.label)
    if (nextLabel !== emptyToNull(analysis.label)) body.label = nextLabel
    if (Object.keys(body).length === 0) {
      closeDialog()
      return
    }
    try {
      const saved = await update.mutateAsync({ id: analysis.id, body })
      closeDialog()
      onSaved?.(saved)
    } catch (error) {
      handleFailure(error)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialog}
      onClose={onClose}
      onCancel={(event) => {
        // Esc must not abandon a request that is already on its way.
        if (isSubmitting) event.preventDefault()
      }}
    >
      <h2 id={titleId} className={styles.title}>
        Edit version
      </h2>
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onValid)(event)}
        className={styles.form}
      >
        <ErrorSummary errors={summary} focusToken={focusToken} />
        <SelectField
          id={STAGE_ID}
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
        {formError !== null ? (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button onClick={closeDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <SubmitButton pending={isSubmitting} pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
