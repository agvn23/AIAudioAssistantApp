import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Track } from '../../api/types'
import { Button } from '../../components/Button'
import { SubmitButton } from '../../components/SubmitButton'
import { describeFailureWithWait } from '../analyses/describeFailure'
import styles from './DeleteTrackDialog.module.css'
import { useDeleteTrack } from './useTracks'

export interface DeleteTrackDialogProps {
  track: Pick<Track, 'id' | 'title'>
  /** Called when the dialog has closed, however it closed (Cancel, Esc, deleted). */
  onClose: () => void
  /** Called after the track was deleted and the dialog closed. */
  onDeleted?: () => void
}

/**
 * Confirms deleting one track. Render it only while it should be open: it opens
 * itself as a modal when it mounts, with focus on Cancel. It closes through the
 * native close(), so the browser gives focus back to the button that opened it.
 */
export function DeleteTrackDialog({ track, onClose, onDeleted }: DeleteTrackDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const remove = useDeleteTrack()
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    cancelRef.current?.focus()
  }, [])

  function closeDialog() {
    dialogRef.current?.close()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    try {
      await remove.mutateAsync(track.id)
    } catch (error) {
      setFormError(describeFailureWithWait(error))
      return
    }
    closeDialog()
    onDeleted?.()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={styles.dialog}
      onClose={onClose}
      onCancel={(event) => {
        // Esc must not abandon a request that is already on its way.
        if (remove.isPending) event.preventDefault()
      }}
    >
      <h2 id={titleId} className={styles.title}>
        Delete this track?
      </h2>
      <p id={descriptionId} className={styles.warning}>
        <strong>{track.title}</strong> and all of its versions and feedback will be permanently
        deleted. This cannot be undone.
      </p>
      <form onSubmit={(event) => void submit(event)} className={styles.form}>
        {formError !== null ? (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button ref={cancelRef} onClick={closeDialog} disabled={remove.isPending}>
            Cancel
          </Button>
          <SubmitButton variant="danger" pending={remove.isPending} pendingLabel="Deleting…">
            Yes, delete this track
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
