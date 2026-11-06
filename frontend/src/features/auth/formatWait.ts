/** "N s" up to a minute and a half, then whole minutes (rounded up). For 429 countdowns. */
export function formatWait(seconds: number): string {
  if (seconds <= 90) return `${seconds} s`
  return `${Math.ceil(seconds / 60)} min`
}
