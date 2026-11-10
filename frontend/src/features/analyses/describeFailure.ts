import { ApiError, describeError } from '../../api/errors'
import { formatWait } from '../auth/formatWait'

/** Text for a person after a failed request. A rate limit also says how long to wait. */
export function describeFailureWithWait(error: unknown): string {
  const message = describeError(error)
  if (
    error instanceof ApiError &&
    error.code === 'rate_limited' &&
    error.retryAfter !== undefined
  ) {
    return `${message} Wait about ${formatWait(error.retryAfter)}.`
  }
  return message
}
