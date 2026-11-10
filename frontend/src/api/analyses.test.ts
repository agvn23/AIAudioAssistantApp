import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server'
import { deleteAnalysis, getAnalysis, listAnalyses, updateAnalysis } from './analyses'
import { API_BASE_URL } from './client'
import { ApiError } from './errors'
import { tokenStore } from './token'
import type { Analysis, AnalysisSummary } from './types'

const summary: AnalysisSummary = {
  id: 7,
  track_id: 3,
  version_number: 1,
  label: 'first mix',
  stage: 'mix',
  original_filename: 'mix1.wav',
  status: 'done',
  error_code: null,
  created_at: '2026-11-05T00:08:21Z',
}

const full: Analysis = { ...summary, metrics: { schema_version: '0.1' }, feedback: null }

const notFound = { error: { code: 'not_found', message: 'Analysis not found' } }

describe('listAnalyses', () => {
  it('reads the versions of a track', async () => {
    server.use(http.get(`${API_BASE_URL}/tracks/3/analyses`, () => HttpResponse.json([summary])))

    await expect(listAnalyses(3)).resolves.toEqual([summary])
  })

  it('sends the bearer token', async () => {
    tokenStore.set('tok-9')
    let auth: string | null = null
    server.use(
      http.get(`${API_BASE_URL}/tracks/3/analyses`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return HttpResponse.json([])
      }),
    )

    await listAnalyses(3)

    expect(auth).toBe('Bearer tok-9')
  })

  it('throws an ApiError with the server code', async () => {
    server.use(
      http.get(`${API_BASE_URL}/tracks/3/analyses`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Track not found' } },
          { status: 404 },
        ),
      ),
    )

    const failure = await listAnalyses(3).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 404, code: 'not_found' })
  })
})

describe('getAnalysis', () => {
  it('reads one version with its metrics', async () => {
    server.use(http.get(`${API_BASE_URL}/analyses/7`, () => HttpResponse.json(full)))

    await expect(getAnalysis(7)).resolves.toEqual(full)
  })

  it('throws an ApiError on a 404', async () => {
    server.use(
      http.get(`${API_BASE_URL}/analyses/7`, () => HttpResponse.json(notFound, { status: 404 })),
    )

    await expect(getAnalysis(7)).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('can be cancelled with a signal', async () => {
    server.use(http.get(`${API_BASE_URL}/analyses/7`, () => HttpResponse.json(full)))
    const controller = new AbortController()
    controller.abort()

    await expect(getAnalysis(7, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('updateAnalysis', () => {
  it('sends only the fields it is given and returns the updated version', async () => {
    let body: unknown
    server.use(
      http.patch(`${API_BASE_URL}/analyses/7`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...full, stage: 'master' })
      }),
    )

    const updated = await updateAnalysis(7, { stage: 'master' })

    expect(body).toEqual({ stage: 'master' })
    expect(updated.stage).toBe('master')
  })

  it('sends null to clear the label', async () => {
    let body: unknown
    server.use(
      http.patch(`${API_BASE_URL}/analyses/7`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...full, label: null })
      }),
    )

    await updateAnalysis(7, { label: null })

    expect(body).toEqual({ label: null })
  })

  it('carries the field errors of a 422', async () => {
    server.use(
      http.patch(`${API_BASE_URL}/analyses/7`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Invalid input',
              fields: [{ location: 'body', field: 'label', message: 'Too long' }],
            },
          },
          { status: 422 },
        ),
      ),
    )

    const failure = await updateAnalysis(7, { label: 'x' }).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      status: 422,
      code: 'validation_error',
      fields: [{ location: 'body', field: 'label', message: 'Too long' }],
    })
  })
})

describe('deleteAnalysis', () => {
  it('resolves on a 204', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/analyses/7`, () => new HttpResponse(null, { status: 204 })),
    )

    await expect(deleteAnalysis(7)).resolves.toBeUndefined()
  })

  it('throws an ApiError on a 404', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/analyses/7`, () => HttpResponse.json(notFound, { status: 404 })),
    )

    await expect(deleteAnalysis(7)).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })
})
