import { ApiError, describeError } from '../../api/errors'
import { formatWait } from '../auth/formatWait'

/** Codes where the server says "try again after N seconds". */
const WAIT_CODES = ['rate_limited', 'too_many_active_analyses', 'server_busy']

/** Seconds to wait before the next upload, when the server asked for a wait. */
export function uploadRetryDelay(error: unknown): number | undefined {
  if (!(error instanceof ApiError)) return undefined
  if (!WAIT_CODES.includes(error.code)) return undefined
  return error.retryAfter
}

function withWait(text: string, error: ApiError): string {
  if (error.retryAfter === undefined) return text
  return `${text} You can try again in about ${formatWait(error.retryAfter)}.`
}

/** True when a 422 only concerns the label, so it can sit on the label field. */
export function isLabelOnlyValidation(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.code === 'validation_error' &&
    error.fields.length > 0 &&
    error.fields.every((field) => field.field === 'label')
  )
}

/** Text for a person after a refused upload. Branches on error.code, never on the message. */
export function describeUploadFailure(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'payload_too_large':
        return 'That file is larger than the server accepts. Try a smaller export.'
      case 'quota_exceeded':
        return 'This track has reached its limit of versions. Delete an old version to make room.'
      case 'rate_limited':
        return withWait('You have uploaded too many files recently.', error)
      case 'too_many_active_analyses':
        return withWait('You already have analyses running. Wait for them to finish.', error)
      case 'server_busy':
        return withWait('The server is busy analysing other tracks.', error)
      case 'validation_error': {
        const messages = error.fields.map((field) => field.message)
        if (messages.length > 0) return messages.join(' ')
        if (error.message.trim() !== '') return error.message
        break
      }
    }
  }
  return describeError(error)
}
