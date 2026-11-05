import type { FieldError } from './types'

// Stable codes from docs/API.md. The OpenAPI spec only documents 422 and 500,
// so this list is maintained by hand. Add a code here when the API adds one.
export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'invalid_password',
  'not_found',
  'method_not_allowed',
  'conflict',
  'quota_exceeded',
  'payload_too_large',
  'unsupported_media_type',
  'validation_error',
  'rate_limited',
  'too_many_active_analyses',
  'internal_error',
  'provider_error',
  'invalid_output',
  'not_configured',
  'server_busy',
  'timeout',
] as const

export type KnownErrorCode = (typeof ERROR_CODES)[number]

// Raised by the client itself, never sent by the server.
type ClientErrorCode = 'network_error' | 'unknown'

const ERROR_COPY: Record<KnownErrorCode | ClientErrorCode, string> = {
  bad_request: 'The request could not be understood.',
  unauthorized: 'You are not signed in, or your session has expired.',
  invalid_password: 'That password is not correct.',
  not_found: 'We could not find that. It may have been deleted.',
  method_not_allowed: 'That action is not supported.',
  conflict: 'That could not be done because it conflicts with existing data.',
  quota_exceeded: 'You have reached a limit on tracks or versions. Delete something to make room.',
  payload_too_large: 'That file or request is too large.',
  unsupported_media_type: 'That file type is not supported. Use WAV, MP3, FLAC, AIFF, M4A or OGG.',
  validation_error: 'Some fields need attention.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  too_many_active_analyses:
    'You already have analyses running. Wait for them to finish, then try again.',
  internal_error: 'Something went wrong on the server.',
  provider_error: 'The AI feedback service failed. Your analysis is unchanged. Try again.',
  invalid_output:
    'The AI feedback could not be checked against your measurements, so it was not shown. Try again.',
  not_configured: 'AI feedback is not set up on this server.',
  server_busy: 'The server is busy analysing other tracks. Try again shortly.',
  timeout: 'The AI feedback service took too long. Try again.',
  network_error: 'Could not reach the server. Check that the API is running and your connection.',
  unknown: 'Something unexpected happened.',
}

export interface ApiErrorInit {
  status: number
  code: string
  message: string
  fields?: FieldError[]
  requestId?: string
  retryAfter?: number
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldError[]
  readonly requestId: string | undefined
  /** Seconds, from the Retry-After header. Only whole-second values are understood. */
  readonly retryAfter: number | undefined

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.fields = init.fields ?? []
    this.requestId = init.requestId
    this.retryAfter = init.retryAfter
  }
}

export interface HeaderReader {
  get(name: string): string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldError(value: unknown): value is FieldError {
  return (
    isRecord(value) &&
    typeof value.location === 'string' &&
    typeof value.field === 'string' &&
    typeof value.message === 'string'
  )
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  return Number(value.trim())
}

/**
 * Turns a non-2xx response into an ApiError. Anything that is not the API's
 * { error: { code, message } } envelope (a proxy's HTML page, FastAPI's own
 * { detail }) becomes code "unknown", so callers never see a raw body.
 */
export function buildApiError(status: number, bodyText: string, headers: HeaderReader): ApiError {
  const headerRequestId = headers.get('X-Request-ID') ?? undefined
  const retryAfter = parseRetryAfter(headers.get('Retry-After'))

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    parsed = undefined
  }

  const envelope = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined
  if (!envelope || typeof envelope.code !== 'string' || typeof envelope.message !== 'string') {
    return new ApiError({
      status,
      code: 'unknown',
      message: `Unexpected response (HTTP ${status}).`,
      requestId: headerRequestId,
      retryAfter,
    })
  }

  return new ApiError({
    status,
    code: envelope.code,
    message: envelope.message,
    fields: Array.isArray(envelope.fields) ? envelope.fields.filter(isFieldError) : [],
    requestId: typeof envelope.request_id === 'string' ? envelope.request_id : headerRequestId,
    retryAfter,
  })
}

function isKnown(code: string): code is KnownErrorCode | ClientErrorCode {
  return code in ERROR_COPY
}

/** Text for a person. Our copy per code first; the server's message only as a fallback. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (isKnown(error.code)) return ERROR_COPY[error.code]
    if (error.message.trim() !== '') return error.message
  }
  return ERROR_COPY.unknown
}
