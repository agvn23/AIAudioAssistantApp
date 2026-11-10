import { ApiError } from '../../api/errors'
import type { AnalysisStatus } from '../../api/types'

/** How often a pending or running analysis is re-read (docs/API.md: poll until done or failed). */
export const POLL_INTERVAL_MS = 2000

/** True while the server is still working on the analysis. */
export function isActiveStatus(status: AnalysisStatus): boolean {
  return status === 'pending' || status === 'running'
}

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

/**
 * The delay before the next poll, or false to stop. A 4xx will not fix itself
 * (a deleted version is a 404), so it stops the polling; a network error or a
 * 5xx keeps it going.
 */
export function pollDelay(
  active: boolean,
  error: unknown,
  intervalMs: number = POLL_INTERVAL_MS,
): number | false {
  if (isClientError(error)) return false
  return active ? intervalMs : false
}
