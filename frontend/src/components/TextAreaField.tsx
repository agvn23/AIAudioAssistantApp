import type { ComponentPropsWithRef } from 'react'
import fieldStyles from './Field.module.css'
import styles from './TextAreaField.module.css'

export interface TextAreaFieldProps extends Omit<
  ComponentPropsWithRef<'textarea'>,
  'id' | 'className'
> {
  /** Required and explicit: the error summary links to this id. */
  id: string
  label: string
  hint?: string
  error?: string | undefined
}

/** A labelled textarea, wired up like TextField (hint, error, aria-invalid, ref). */
export function TextAreaField({ id, label, hint, error, ...textareaProps }: TextAreaFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={fieldStyles.error}>
          <span className="visually-hidden">Error: </span>
          {error}
        </p>
      ) : null}
      <textarea
        rows={4}
        {...textareaProps}
        id={id}
        className={`${fieldStyles.input} ${styles.textarea}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
      />
    </div>
  )
}
