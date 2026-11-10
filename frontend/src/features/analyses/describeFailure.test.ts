import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { describeFailureWithWait } from './describeFailure'

describe('describeFailureWithWait', () => {
  it('uses the shared copy for the code', () => {
    const error = new ApiError({ status: 404, code: 'not_found', message: 'x' })
    expect(describeFailureWithWait(error)).toBe('We could not find that. It may have been deleted.')
  })

  it('adds the wait to a rate limit', () => {
    const error = new ApiError({
      status: 429,
      code: 'rate_limited',
      message: 'x',
      retryAfter: 42,
    })
    expect(describeFailureWithWait(error)).toBe(
      'Too many requests. Please wait a moment and try again. Wait about 42 s.',
    )
  })

  it('leaves the wait out without Retry-After', () => {
    const error = new ApiError({ status: 429, code: 'rate_limited', message: 'x' })
    expect(describeFailureWithWait(error)).toBe(
      'Too many requests. Please wait a moment and try again.',
    )
  })

  it('handles an error that is not an ApiError', () => {
    expect(describeFailureWithWait(new Error('boom'))).toBe('Something unexpected happened.')
  })
})
