import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { sampleFeedback, sampleMetrics } from '../test/fixtures/analysis'
import { server } from '../test/server'
import { createFeedback } from './analyses'
import { API_BASE_URL } from './client'
import { ApiError } from './errors'

const analysisBody = {
  id: 7,
  track_id: 3,
  version_number: 1,
  label: 'Mix v1',
  stage: 'mix',
  original_filename: 'demo-track.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-10T11:00:00.000000Z',
  metrics: sampleMetrics,
  feedback: sampleFeedback,
}

function failWith(status: number, code: string, headers: Record<string, string> = {}) {
  server.use(
    http.post(`${API_BASE_URL}/analyses/:id/feedback`, () =>
      HttpResponse.json({ error: { code, message: 'Server message' } }, { status, headers }),
    ),
  )
}

describe('createFeedback', () => {
  it('posts to the feedback endpoint of that analysis and returns the updated analysis', async () => {
    let seenId: string | undefined
    server.use(
      http.post(`${API_BASE_URL}/analyses/:id/feedback`, ({ params }) => {
        seenId = String(params.id)
        return HttpResponse.json(analysisBody)
      }),
    )

    const result = await createFeedback(7)

    expect(seenId).toBe('7')
    expect(result).toEqual(analysisBody)
  })

  it.each<[number, string]>([
    [409, 'conflict'],
    [502, 'invalid_output'],
    [503, 'not_configured'],
    [504, 'timeout'],
  ])('turns a %i response into an ApiError with code %s', async (status, code) => {
    failWith(status, code)

    const error = await createFeedback(7).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, code })
  })

  it('keeps the Retry-After seconds of a rate limit', async () => {
    failWith(429, 'rate_limited', { 'Retry-After': '30' })

    const error = await createFeedback(7).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 30 })
  })
})
