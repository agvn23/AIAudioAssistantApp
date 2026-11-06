import { useEffect, useEffectEvent, useId, useRef } from 'react'
import styles from './ErrorSummary.module.css'

export interface ErrorSummaryItem {
  /** Id of the input to link to. Leave out for errors that belong to no field. */
  id?: string
  message: string
}

export interface ErrorSummaryProps {
  errors: ErrorSummaryItem[]
  /**
   * Increase this (for example once per failed submit) to move focus to the
   * summary. Focus is never moved just because the list changed, so fixing a
   * field does not pull the cursor away from the person typing.
   */
  focusToken?: number
  title?: string
}

export function ErrorSummary({
  errors,
  focusToken = 0,
  title = 'There is a problem',
}: ErrorSummaryProps) {
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)

  const focusSummary = useEffectEvent(() => {
    ref.current?.focus()
  })
  useEffect(() => {
    if (focusToken > 0) focusSummary()
  }, [focusToken])

  if (errors.length === 0) return null

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby={headingId} className={styles.summary}>
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>
      <ul className={styles.list}>
        {errors.map((item, index) => {
          const targetId = item.id
          return (
            <li key={`${index}-${item.message}`}>
              {targetId ? (
                <a
                  href={`#${targetId}`}
                  onClick={(event) => {
                    event.preventDefault()
                    document.getElementById(targetId)?.focus()
                  }}
                >
                  {item.message}
                </a>
              ) : (
                item.message
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
