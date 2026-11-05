import { describe, expect, it } from 'vitest'
import { ApiError, buildApiError, describeError, parseRetryAfter } from './errors'

function headers(values: Record<string, string> = {}) {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]))
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null }
}

describe('buildApiError', () => {
  it('reads the error envelope', () => {
    const body = JSON.stringify({ error: { code: 'not_found', message: 'Track not found' } })
    const error = buildApiError(404, body, headers())
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.code).toBe('not_found')
    expect(error.message).toBe('Track not found')
    expect(error.fields).toEqual([])
  })

  it('keeps well-formed field errors and drops malformed ones', () => {
    const body = JSON.stringify({
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        fields: [
          { location: 'body', field: 'tags', message: 'Too many tags' },
          { location: 'body', field: 'title' },
          'nonsense',
        ],
      },
    })
    const error = buildApiError(422, body, headers())
    expect(error.fields).toEqual([{ location: 'body', field: 'tags', message: 'Too many tags' }])
  })

  it('prefers request_id from the body and falls back to X-Request-ID', () => {
    const withBody = JSON.stringify({
      error: { code: 'internal_error', message: 'Oops', request_id: 'from-body' },
    })
    expect(buildApiError(500, withBody, headers({ 'X-Request-ID': 'from-header' })).requestId).toBe(
      'from-body',
    )
    const withoutBody = JSON.stringify({ error: { code: 'internal_error', message: 'Oops' } })
    expect(
      buildApiError(500, withoutBody, headers({ 'X-Request-ID': 'from-header' })).requestId,
    ).toBe('from-header')
  })

  it('reads Retry-After in seconds', () => {
    const body = JSON.stringify({ error: { code: 'rate_limited', message: 'Slow down' } })
    expect(buildApiError(429, body, headers({ 'Retry-After': '30' })).retryAfter).toBe(30)
  })

  it('turns a non-JSON body into code "unknown"', () => {
    const error = buildApiError(502, '<html>Bad gateway</html>', headers())
    expect(error.code).toBe('unknown')
    expect(error.status).toBe(502)
    expect(error.message).not.toContain('<html>')
  })

  it('turns JSON without the envelope (FastAPI detail) into code "unknown"', () => {
    const error = buildApiError(400, JSON.stringify({ detail: 'nope' }), headers())
    expect(error.code).toBe('unknown')
  })
})

describe('parseRetryAfter', () => {
  it('accepts whole seconds only', () => {
    expect(parseRetryAfter('30')).toBe(30)
    expect(parseRetryAfter('0')).toBe(0)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('-5')).toBeUndefined()
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined()
  })
})

describe('describeError', () => {
  it('uses our copy for known codes, not the server message', () => {
    const error = new ApiError({ status: 429, code: 'rate_limited', message: 'server wording' })
    expect(describeError(error)).toMatch(/too many requests/i)
  })

  it('falls back to the server message for codes it does not know', () => {
    const error = new ApiError({
      status: 400,
      code: 'brand_new_code',
      message: 'Something specific',
    })
    expect(describeError(error)).toBe('Something specific')
  })

  it('has copy for network errors and for non-ApiError values', () => {
    const network = new ApiError({ status: 0, code: 'network_error', message: 'x' })
    expect(describeError(network)).toMatch(/could not reach the server/i)
    expect(describeError(new Error('boom'))).toBe('Something unexpected happened.')
  })
})
