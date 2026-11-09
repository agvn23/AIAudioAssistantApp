import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useForm, type FieldErrors } from 'react-hook-form'
import { ApiError, describeError } from '../../api/errors'
import type { Track } from '../../api/types'
import { Button } from '../../components/Button'
import { ErrorSummary, type ErrorSummaryItem } from '../../components/ErrorSummary'
import { SelectField } from '../../components/SelectField'
import { SubmitButton } from '../../components/SubmitButton'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { formatWait } from '../auth/formatWait'
import { TagInput } from './TagInput'
import {
  emptyFormValues,
  hasChanges,
  platformOptions,
  toCreateBody,
  toUpdateBody,
  TRACK_LIMITS,
  valuesFromTrack,
  type TrackFormValues,
} from './trackForm'
import styles from './TrackFormDialog.module.css'
import { useCreateTrack, useUpdateTrack } from './useTracks'

type FormFields = Omit<TrackFormValues, 'tags'>

/** One row per field: the API's name, the form's name, the element id and the label. */
const FIELDS = [
  { api: 'title', form: 'title', id: 'track-title', label: 'Title' },
  { api: 'genre', form: 'genre', id: 'track-genre', label: 'Genre' },
  {
    api: 'target_platform',
    form: 'targetPlatform',
    id: 'track-platform',
    label: 'Target platform',
  },
  { api: 'notes', form: 'notes', id: 'track-notes', label: 'Notes' },
  { api: 'tags', form: null, id: 'track-tags', label: 'Tags' },
] as const

/** Characters, not UTF-16 units, and after trimming: this is what the server counts. */
function characters(value: string): number {
  return [...value.trim()].length
}

function maxLength(limit: number) {
  return (value: string) => characters(value) <= limit || `Use at most ${limit} characters`
}

function summaryFrom(errors: FieldErrors<FormFields>): ErrorSummaryItem[] {
  const items: ErrorSummaryItem[] = []
  for (const field of FIELDS) {
    if (field.form === null) continue
    const message = errors[field.form]?.message
    if (message) items.push({ id: field.id, message })
  }
  return items
}

/** A failure that is not tied to one field: shown as an alert inside the dialog. */
function describeSaveFailure(error: unknown): string {
  const message = describeError(error)
  if (
    error instanceof ApiError &&
    error.code === 'rate_limited' &&
    error.retryAfter !== undefined
  ) {
    return `${message} Wait about ${formatWait(error.retryAfter)}.`
  }
  return message
}

export interface TrackFormDialogProps {
  /** Leave out to create a track; pass one to edit it. */
  track?: Track
  /** Called when the dialog has closed, however it closed (Cancel, Esc, saved). */
  onClose: () => void
  onSaved?: (track: Track) => void
}

/**
 * Create or edit a track. Render it only while it should be open: it opens
 * itself as a modal when it mounts and the form starts fresh every time. It
 * always closes through the native close(), so the browser gives focus back to
 * the button that opened it, and tells the parent through onClose.
 */
export function TrackFormDialog({ track, onClose, onSaved }: TrackFormDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const create = useCreateTrack()
  const update = useUpdateTrack()

  const [initial] = useState(() => (track ? valuesFromTrack(track) : emptyFormValues()))
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [summary, setSummary] = useState<ErrorSummaryItem[]>([])
  const [focusToken, setFocusToken] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const platforms = useMemo(
    () => [{ value: '', label: 'Not set' }, ...platformOptions(initial.targetPlatform)],
    [initial.targetPlatform],
  )

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    defaultValues: {
      title: initial.title,
      genre: initial.genre,
      targetPlatform: initial.targetPlatform,
      notes: initial.notes,
    },
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>('#track-title')?.focus()
  }, [])

  function closeDialog() {
    dialogRef.current?.close()
  }

  function onInvalid(fieldErrors: FieldErrors<FormFields>) {
    setFormError(null)
    setSummary(summaryFrom(fieldErrors))
    setFocusToken((token) => token + 1)
  }

  function handleFailure(error: unknown) {
    if (error instanceof ApiError && error.code === 'validation_error' && error.fields.length > 0) {
      const items: ErrorSummaryItem[] = []
      for (const fieldError of error.fields) {
        const key = fieldError.field.split('.')[0] ?? ''
        const known = FIELDS.find((field) => field.api === key)
        const formName = known?.form
        if (formName) setError(formName, { type: 'server', message: fieldError.message })
        items.push(
          known
            ? { id: known.id, message: `${known.label}: ${fieldError.message}` }
            : { message: fieldError.message },
        )
      }
      setSummary(items)
      setFocusToken((token) => token + 1)
      return
    }
    setFormError(describeSaveFailure(error))
  }

  async function onValid(fields: FormFields) {
    setFormError(null)
    setSummary([])
    const values: TrackFormValues = { ...fields, tags }
    try {
      let saved: Track
      if (track) {
        const body = toUpdateBody(track, values)
        if (!hasChanges(body)) {
          closeDialog()
          return
        }
        saved = await update.mutateAsync({ id: track.id, body })
      } else {
        saved = await create.mutateAsync(toCreateBody(values))
      }
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
        {track ? 'Edit track' : 'New track'}
      </h2>
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(onValid, onInvalid)(event)}
        className={styles.form}
      >
        <ErrorSummary errors={summary} focusToken={focusToken} />
        <TextField
          id="track-title"
          label="Title"
          autoComplete="off"
          error={errors.title?.message}
          {...register('title', {
            validate: (value) => {
              if (value.trim() === '') return 'Enter a title'
              return maxLength(TRACK_LIMITS.title)(value)
            },
          })}
        />
        <TextField
          id="track-genre"
          label="Genre"
          autoComplete="off"
          error={errors.genre?.message}
          {...register('genre', { validate: maxLength(TRACK_LIMITS.genre) })}
        />
        <SelectField
          id="track-platform"
          label="Target platform"
          hint="Used, with the genre, to tailor the AI feedback."
          options={platforms}
          error={errors.targetPlatform?.message}
          {...register('targetPlatform')}
        />
        <TextAreaField
          id="track-notes"
          label="Notes"
          hint="Only for you. Notes are never sent to the AI."
          error={errors.notes?.message}
          {...register('notes', { validate: maxLength(TRACK_LIMITS.notes) })}
        />
        <TagInput id="track-tags" label="Tags" tags={tags} onChange={setTags} />
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
            {track ? 'Save changes' : 'Create track'}
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
