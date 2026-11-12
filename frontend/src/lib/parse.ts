/**
 * Small readers shared by the runtime parsers for free-form API objects
 * (features/results/metrics.ts and feedback.ts). Each one checks a single value
 * and never throws or guesses.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A finite number, or undefined for anything else (NaN and Infinity included). */
export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
