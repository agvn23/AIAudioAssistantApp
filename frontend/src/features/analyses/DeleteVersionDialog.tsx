import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Analysis } from '../../api/types'
import { Button } from '../../components/Button'
import { SubmitButton } from '../../components/SubmitButton'
import { describeFailureWithWait } from './describeFailure'
import styles from './VersionDialog.module.css'
import { useDeleteAnalysis } from './useAnalyses'

export interface DeleteVersionDialogProps {
  analysis: Pick<Analysis, 'id' | 'track_id' | 'version_number' | 'original_filename'>
  /** Called when the dialog has closed, however it closed (Cancel, Esc, deleted). */
  onClose: () => void
  /** Called after the version was deleted and the dialog closed. */
  onDeleted?: () => void
}

/**
 * Confirms deleting one version. Render it only while it should be open: it
 * opens itself as a modal on mount, with focus on Cancel, and closes through
 * the native close() so focus returns to the button that opened it.
 */
export function DeleteVersionDialog({ analysis, onClose, onDeleted }: DeleteVersionDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const remove = useDeleteAnalysis()
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
      await remove.mutateAsync({ id: analysis.id, trackId: analysis.track_id })
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
        Delete this version?
      </h2>
      <p id={descriptionId} className={styles.warning}>
        <strong>{`Version ${analysis.version_number}`}</strong>
        {` (${analysis.original_filename}) and its measurements and feedback will be permanently deleted. This cannot be undone.`}
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
            Yes, delete this version
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
