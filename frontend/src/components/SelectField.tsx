import type { ComponentPropsWithRef } from 'react'
import styles from './Field.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps extends Omit<
  ComponentPropsWithRef<'select'>,
  'id' | 'className' | 'children'
> {
  /** Required and explicit: the error summary links to this id. */
  id: string
  label: string
  /** Include an empty-value option yourself if "not set" is a valid choice. */
  options: readonly SelectOption[]
  hint?: string
  error?: string | undefined
}

/** A labelled native select, wired up like TextField (hint, error, aria-invalid, ref). */
export function SelectField({ id, label, options, hint, error, ...selectProps }: SelectFieldProps) {
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
      <select
        {...selectProps}
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
