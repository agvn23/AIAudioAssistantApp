import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/errors'
import { isActiveStatus, POLL_INTERVAL_MS, pollDelay } from './polling'

function apiError(status: number, code: string): ApiError {
  return new ApiError({ status, code, message: 'x' })
}

describe('isActiveStatus', () => {
  it.each([
    ['pending', true],
    ['running', true],
    ['done', false],
    ['failed', false],
  ] as const)('%s is %s', (status, expected) => {
    expect(isActiveStatus(status)).toBe(expected)
  })
})

describe('pollDelay', () => {
  it('polls every 2 seconds by default while active', () => {
    expect(POLL_INTERVAL_MS).toBe(2000)
    expect(pollDelay(true, null)).toBe(2000)
  })

  it('uses the given interval', () => {
    expect(pollDelay(true, null, 50)).toBe(50)
  })

  it('stops when nothing is active', () => {
    expect(pollDelay(false, null)).toBe(false)
  })

  it('stops on a 4xx even while active', () => {
    expect(pollDelay(true, apiError(404, 'not_found'))).toBe(false)
    expect(pollDelay(true, apiError(429, 'rate_limited'))).toBe(false)
  })

  it('keeps polling after a network error or a 5xx', () => {
    expect(pollDelay(true, apiError(0, 'network_error'))).toBe(2000)
    expect(pollDelay(true, apiError(503, 'server_busy'))).toBe(2000)
  })

  it('keeps polling after an error that is not an ApiError', () => {
    expect(pollDelay(true, new Error('boom'))).toBe(2000)
  })
})
