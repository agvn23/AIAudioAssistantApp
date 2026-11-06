/** Limits from docs/API.md: passwords are 8 to 128 characters. */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

// Deliberately loose: the server has the final say on what is a valid address.
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

/** For react-hook-form's validate option: true when fine, otherwise the message. */
export function validateEmail(value: string): true | string {
  const trimmed = value.trim()
  if (trimmed === '') return 'Enter your email address'
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter an email address like name@example.com'
  return true
}
