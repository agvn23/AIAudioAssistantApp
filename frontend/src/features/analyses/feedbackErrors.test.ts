import { describe, expect, it } from 'vitest'
import { ApiError, describeError } from '../../api/errors'
import { describeFeedbackError, feedbackRetryDelay } from './feedbackErrors'

function apiError(status: number, code: string, retryAfter?: number): ApiError {
  return new ApiError({ status, code, message: 'Server message', retryAfter })
}

describe('describeFeedbackError', () => {
  it('explains that the analysis must finish first on a conflict', () => {
    expect(describeFeedbackError(apiError(409, 'conflict'))).toMatch(/finished/)
  })

  it('shows the wait in seconds for a rate limit', () => {
    expect(describeFeedbackError(apiError(429, 'rate_limited', 30))).toBe(
      'You have used up your AI feedback requests for now. Try again in 30 s.',
    )
  })

  it('shows the wait in minutes for a long rate limit', () => {
    expect(describeFeedbackError(apiError(429, 'rate_limited', 150))).toContain('3 min')
  })

  it('uses the shared copy for a rate limit without Retry-After', () => {
    const error = apiError(429, 'rate_limited')

    expect(describeFeedbackError(error)).toBe(describeError(error))
  })

  it('says a provider failure is often temporary and that nothing was changed', () => {
    const text = describeFeedbackError(apiError(502, 'provider_error'))

    expect(text).toMatch(/often temporary/)
    expect(text).toMatch(/unchanged/)
    expect(text).toMatch(/try again/)
  })

  it.each<[number, string]>([
    [504, 'timeout'],
    [502, 'invalid_output'],
    [503, 'not_configured'],
  ])('uses the shared copy for %i %s', (status, code) => {
    const error = apiError(status, code)

    expect(describeFeedbackError(error)).toBe(describeError(error))
  })

  it('uses the generic copy for something that is not an ApiError', () => {
    const error = new Error('boom')

    expect(describeFeedbackError(error)).toBe(describeError(error))
  })
})

describe('feedbackRetryDelay', () => {
  it('returns the wait for a rate limit', () => {
    expect(feedbackRetryDelay(apiError(429, 'rate_limited', 30))).toBe(30)
  })

  it('returns undefined for a rate limit without Retry-After', () => {
    expect(feedbackRetryDelay(apiError(429, 'rate_limited'))).toBeUndefined()
  })

  it('returns undefined for other codes, even with a Retry-After', () => {
    expect(feedbackRetryDelay(apiError(503, 'server_busy', 5))).toBeUndefined()
    expect(feedbackRetryDelay(apiError(504, 'timeout'))).toBeUndefined()
  })

  it('returns undefined for something that is not an ApiError', () => {
    expect(feedbackRetryDelay(new Error('boom'))).toBeUndefined()
  })
})
