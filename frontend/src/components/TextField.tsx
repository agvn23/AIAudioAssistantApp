import type { ComponentPropsWithRef } from 'react'
import styles from './TextField.module.css'

export interface TextFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'id' | 'className'> {
  /** Required and explicit: the error summary links to this id. */
  id: string
  label: string
  hint?: string
  error?: string | undefined
}

/**
 * A labelled input. The hint and the error are tied to the input with
 * aria-describedby; the error is also marked aria-invalid. The error text starts
 * with a visually hidden "Error:" so it is not signalled by colour alone.
 * Accepts a ref as a normal prop (React 19), which is what react-hook-form's
 * register() needs.
 */
export function TextField({ id, label, hint, error, ...inputProps }: TextFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          <span className="visually-hidden">Error: </span>
          {error}
        </p>
      ) : null}
      <input
        {...inputProps}
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
      />
    </div>
  )
}
