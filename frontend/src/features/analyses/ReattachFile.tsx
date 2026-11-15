import { useId, useState, type ChangeEvent } from 'react'
import styles from './ReattachFile.module.css'
import { rememberFile } from './sessionFiles'
import { ACCEPT_ATTRIBUTE, validateAudioFile } from './uploadRules'

export interface ReattachFileProps {
  analysisId: number
}

/**
 * Lets the person pick the audio file again so the waveform can be drawn. The
 * file stays in this tab's memory and is never uploaded. No size limit applies
 * here, because nothing is sent to the server.
 */
export function ReattachFile({ analysisId }: ReattachFileProps) {
  const inputId = useId()
  const problemId = useId()
  const [problem, setProblem] = useState<string | null>(null)

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    // Clear the input so choosing the same file again still fires a change.
    input.value = ''

    const found = validateAudioFile(file, Number.POSITIVE_INFINITY)
    if (found) {
      setProblem(found.message)
      return
    }
    setProblem(null)
    rememberFile(analysisId, file)
  }

  return (
    <div className={styles.picker}>
      <label htmlFor={inputId} className={styles.label}>
        Choose the audio file again
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        onChange={onChange}
        aria-describedby={problem ? problemId : undefined}
      />
      {problem ? (
        <p id={problemId} role="alert" className={styles.problem}>
          {problem}
        </p>
      ) : null}
    </div>
  )
}
