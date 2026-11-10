import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { describeUploadFailure, isLabelOnlyValidation, uploadRetryDelay } from './uploadErrors'

function apiError(
  code: string,
  status: number,
  extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {},
) {
  return new ApiError({ status, code, message: 'server text', ...extra })
}

describe('describeUploadFailure', () => {
  it('explains a file that is too large', () => {
    expect(describeUploadFailure(apiError('payload_too_large', 413))).toBe(
      'That file is larger than the server accepts. Try a smaller export.',
    )
  })

  it('reuses the shared copy for an unsupported type', () => {
    expect(describeUploadFailure(apiError('unsupported_media_type', 415))).toBe(
      'That file type is not supported. Use WAV, MP3, FLAC, AIFF, M4A or OGG.',
    )
  })

  it('explains the version quota', () => {
    expect(describeUploadFailure(apiError('quota_exceeded', 409))).toBe(
      'This track has reached its limit of versions. Delete an old version to make room.',
    )
  })

  it.each([
    ['rate_limited', 429, 'You have uploaded too many files recently.'],
    [
      'too_many_active_analyses',
      429,
      'You already have analyses running. Wait for them to finish.',
    ],
    ['server_busy', 503, 'The server is busy analysing other tracks.'],
  ])('adds the wait to %s', (code, status, base) => {
    expect(describeUploadFailure(apiError(code, status, { retryAfter: 30 }))).toBe(
      `${base} You can try again in about 30 s.`,
    )
  })

  it('leaves the wait out when there is no Retry-After', () => {
    expect(describeUploadFailure(apiError('server_busy', 503))).toBe(
      'The server is busy analysing other tracks.',
    )
  })

  it('joins the field messages of a 422', () => {
    const error = apiError('validation_error', 422, {
      fields: [
        { location: 'body', field: 'file', message: 'The file is empty.' },
        { location: 'body', field: 'stage', message: 'Invalid stage.' },
      ],
    })
    expect(describeUploadFailure(error)).toBe('The file is empty. Invalid stage.')
  })

  it('falls back to the server message for a 422 without fields', () => {
    expect(describeUploadFailure(apiError('validation_error', 422))).toBe('server text')
  })

  it('uses the shared copy for other codes and for network errors', () => {
    expect(describeUploadFailure(apiError('not_found', 404))).toBe(
      'We could not find that. It may have been deleted.',
    )
    expect(describeUploadFailure(apiError('network_error', 0))).toBe(
      'Could not reach the server. Check that the API is running and your connection.',
    )
    expect(describeUploadFailure(new Error('boom'))).toBe('Something unexpected happened.')
  })
})

describe('uploadRetryDelay', () => {
  it('returns Retry-After for the waiting codes only', () => {
    expect(uploadRetryDelay(apiError('rate_limited', 429, { retryAfter: 12 }))).toBe(12)
    expect(uploadRetryDelay(apiError('server_busy', 503, { retryAfter: 5 }))).toBe(5)
    expect(uploadRetryDelay(apiError('quota_exceeded', 409, { retryAfter: 5 }))).toBeUndefined()
    expect(uploadRetryDelay(apiError('rate_limited', 429))).toBeUndefined()
    expect(uploadRetryDelay(new Error('x'))).toBeUndefined()
  })
})

describe('isLabelOnlyValidation', () => {
  it('is true only when every field error is about the label', () => {
    const label = { location: 'body', field: 'label', message: 'Too long' }
    const file = { location: 'body', field: 'file', message: 'Empty' }
    expect(isLabelOnlyValidation(apiError('validation_error', 422, { fields: [label] }))).toBe(true)
    expect(
      isLabelOnlyValidation(apiError('validation_error', 422, { fields: [label, file] })),
    ).toBe(false)
    expect(isLabelOnlyValidation(apiError('validation_error', 422))).toBe(false)
    expect(isLabelOnlyValidation(apiError('not_found', 404))).toBe(false)
  })
})
