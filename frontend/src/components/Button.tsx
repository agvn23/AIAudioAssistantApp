import type { ComponentPropsWithRef } from 'react'
import styles from './Button.module.css'

export type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'className'>

/** A secondary button. It never submits a form unless asked to. */
export function Button({ type = 'button', ...rest }: ButtonProps) {
  return <button {...rest} type={type} className={styles.button} />
}
