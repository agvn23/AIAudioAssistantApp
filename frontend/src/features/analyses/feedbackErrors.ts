import { describeError, ApiError } from '../../api/errors'
import { formatWait } from '../auth/formatWait'

/**
 * Text for a person when generating or regenerating AI feedback fails. Two codes
 * need feedback-specific copy; everything else (timeout, provider_error,
 * invalid_output, not_configured) uses the shared copy. Branches on the code,
 * never on the server's message.
 */
export function describeFeedbackError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'conflict') {
      return 'Feedback can only be generated once the analysis has finished.'
    }
    if (error.code === 'rate_limited' && error.retryAfter !== undefined) {
      return `You have used up your AI feedback requests for now. Try again in ${formatWait(error.retryAfter)}.`
    }
  }
  return describeError(error)
}
