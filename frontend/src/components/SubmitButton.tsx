import type { ComponentPropsWithRef } from 'react'
import styles from './SubmitButton.module.css'

export interface SubmitButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'type' | 'className'
> {
  /** True while the request is in flight: disables the button and swaps its label. */
  pending?: boolean
  pendingLabel?: string
}

export function SubmitButton({
  pending = false,
  pendingLabel = 'Please wait…',
  disabled,
  children,
  ...rest
}: SubmitButtonProps) {
  return (
    <button
      {...rest}
      type="submit"
      className={styles.button}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
