import { describeError, ApiError } from '../../api/errors'
import { formatWait } from '../auth/formatWait'

/**
 * Text for a person when generating or regenerating AI feedback fails. Three
 * codes need feedback-specific copy; everything else (timeout, invalid_output,
 * not_configured) uses the shared copy. Branches on the code, never on the
 * server's message.
 */
export function describeFeedbackError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'conflict') {
      return 'Feedback can only be generated once the analysis has finished.'
    }
    if (error.code === 'rate_limited' && error.retryAfter !== undefined) {
      return `You have used up your AI feedback requests for now. Try again in ${formatWait(error.retryAfter)}.`
    }
    if (error.code === 'provider_error') {
      return 'The AI service had a problem, which is often temporary (for example when it is overloaded). Your analysis and any earlier feedback are unchanged. Wait a moment and try again.'
    }
  }
  return describeError(error)
}

/** Seconds to wait before the next feedback request, when the server asked for a wait. */
export function feedbackRetryDelay(error: unknown): number | undefined {
  if (error instanceof ApiError && error.code === 'rate_limited') return error.retryAfter
  return undefined
}
