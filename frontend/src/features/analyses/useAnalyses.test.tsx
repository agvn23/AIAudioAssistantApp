import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import type { Analysis, AnalysisSummary } from '../../api/types'
import { server } from '../../test/server'
import { analysisKeys } from '../tracks/queryKeys'
import {
  useAnalysis,
  useDeleteAnalysis,
  useTrackAnalyses,
  useUpdateAnalysis,
  useUploadAnalysis,
} from './useAnalyses'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const pending: Analysis = {
  id: 7,
  track_id: 3,
  version_number: 1,
  label: 'first mix',
  stage: 'mix',
  original_filename: 'mix1.wav',
  status: 'pending',
  error_code: null,
  created_at: '2026-11-10T00:00:00Z',
  metrics: null,
  feedback: null,
}
const done: Analysis = { ...pending, status: 'done', metrics: { schema_version: '0.1' } }

function summaryOf(analysis: Analysis): AnalysisSummary {
  return {
    id: analysis.id,
    track_id: analysis.track_id,
    version_number: analysis.version_number,
    label: analysis.label,
    stage: analysis.stage,
    original_filename: analysis.original_filename,
    status: analysis.status,
    error_code: analysis.error_code,
    created_at: analysis.created_at,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { queryClient, wrapper }
}

describe('useAnalysis', () => {
  it('loads one version', async () => {
    server.use(http.get(url('/analyses/7'), () => HttpResponse.json(done)))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useAnalysis(7), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(done))
  })

  it('polls while the analysis is active and stops once it is done', async () => {
    let calls = 0
    server.use(
      http.get(url('/analyses/7'), () => {
        calls += 1
        return HttpResponse.json(calls < 3 ? pending : done)
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useAnalysis(7, { intervalMs: 20 }), { wrapper })

    await waitFor(() => expect(result.current.data?.status).toBe('done'))
    expect(calls).toBe(3)
    await sleep(150)
    expect(calls).toBe(3)
  })

  it('stops polling when the analysis failed', async () => {
    let calls = 0
    server.use(
      http.get(url('/analyses/7'), () => {
        calls += 1
        return HttpResponse.json({ ...pending, status: 'failed', error_code: 'silent' })
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useAnalysis(7, { intervalMs: 20 }), { wrapper })

    await waitFor(() => expect(result.current.data?.status).toBe('failed'))
    await sleep(150)
    expect(calls).toBe(1)
  })

  it('stops polling when the component unmounts', async () => {
    let calls = 0
    server.use(
      http.get(url('/analyses/7'), () => {
        calls += 1
        return HttpResponse.json(pending)
      }),
    )
    const { wrapper } = createWrapper()

    const { result, unmount } = renderHook(() => useAnalysis(7, { intervalMs: 20 }), { wrapper })
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2))
    expect(result.current.data?.status).toBe('pending')

    unmount()
    const callsAtUnmount = calls
    await sleep(150)

    expect(calls).toBe(callsAtUnmount)
  })

  it('stops polling on a 404, for example when the version was deleted', async () => {
    let calls = 0
    server.use(
      http.get(url('/analyses/7'), () => {
        calls += 1
        if (calls === 1) return HttpResponse.json(pending)
        return HttpResponse.json(errorBody('not_found', 'Analysis not found'), { status: 404 })
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useAnalysis(7, { intervalMs: 20 }), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' })
    await sleep(150)
    expect(calls).toBe(2)
  })

  it('keeps polling after a server error', async () => {
    let calls = 0
    server.use(
      http.get(url('/analyses/7'), () => {
        calls += 1
        if (calls === 1) return HttpResponse.json(pending)
        if (calls === 2) {
          return HttpResponse.json(errorBody('internal_error', 'boom'), { status: 500 })
        }
        return HttpResponse.json(done)
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useAnalysis(7, { intervalMs: 20 }), { wrapper })

    await waitFor(() => expect(result.current.data?.status).toBe('done'))
    expect(calls).toBe(3)
  })
})

describe('useTrackAnalyses', () => {
  it('loads the versions of a track', async () => {
    server.use(http.get(url('/tracks/3/analyses'), () => HttpResponse.json([summaryOf(done)])))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTrackAnalyses(3), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual([summaryOf(done)]))
  })

  it('polls while a version is active and stops when all are finished', async () => {
    let calls = 0
    server.use(
      http.get(url('/tracks/3/analyses'), () => {
        calls += 1
        return HttpResponse.json([summaryOf(calls < 3 ? pending : done)])
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTrackAnalyses(3, { intervalMs: 20 }), { wrapper })

    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('done'))
    expect(calls).toBe(3)
    await sleep(150)
    expect(calls).toBe(3)
  })

  it('does not poll a list of finished versions', async () => {
    let calls = 0
    server.use(
      http.get(url('/tracks/3/analyses'), () => {
        calls += 1
        return HttpResponse.json([summaryOf(done)])
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTrackAnalyses(3, { intervalMs: 20 }), { wrapper })

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    await sleep(150)
    expect(calls).toBe(1)
  })

  it('exposes the ApiError of a failed request', async () => {
    server.use(
      http.get(url('/tracks/3/analyses'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTrackAnalyses(3), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' })
  })
})

describe('useUpdateAnalysis', () => {
  it('patches the version, replaces the cached detail and marks the track list stale', async () => {
    let sent: unknown
    const updated: Analysis = { ...done, stage: 'master' }
    server.use(
      http.patch(url('/analyses/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(updated)
      }),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(analysisKeys.detail(7), done)
    queryClient.setQueryData(analysisKeys.list(3), [summaryOf(done)])

    const { result } = renderHook(() => useUpdateAnalysis(), { wrapper })
    act(() => result.current.mutate({ id: 7, body: { stage: 'master' } }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sent).toEqual({ stage: 'master' })
    expect(queryClient.getQueryData(analysisKeys.detail(7))).toEqual(updated)
    expect(queryClient.getQueryState(analysisKeys.list(3))?.isInvalidated).toBe(true)
  })

  it('leaves the cache alone when the request fails', async () => {
    server.use(
      http.patch(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Analysis not found'), { status: 404 }),
      ),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(analysisKeys.list(3), [summaryOf(done)])

    const { result } = renderHook(() => useUpdateAnalysis(), { wrapper })
    act(() => result.current.mutate({ id: 7, body: { label: null } }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' })
    expect(queryClient.getQueryState(analysisKeys.list(3))?.isInvalidated).toBe(false)
  })
})

describe('useDeleteAnalysis', () => {
  it('deletes the version and marks its detail and the track list stale', async () => {
    let method = ''
    server.use(
      http.delete(url('/analyses/7'), ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(analysisKeys.detail(7), done)
    queryClient.setQueryData(analysisKeys.list(3), [summaryOf(done)])

    const { result } = renderHook(() => useDeleteAnalysis(), { wrapper })
    act(() => result.current.mutate({ id: 7, trackId: 3 }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(method).toBe('DELETE')
    expect(queryClient.getQueryState(analysisKeys.list(3))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(analysisKeys.detail(7))?.isInvalidated).toBe(true)
  })

  it('reports not_found when the version is already gone', async () => {
    server.use(
      http.delete(url('/analyses/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Analysis not found'), { status: 404 }),
      ),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useDeleteAnalysis(), { wrapper })
    act(() => result.current.mutate({ id: 7, trackId: 3 }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' })
  })
})

describe('useUploadAnalysis', () => {
  it('uploads the file, caches the new version and marks the track list stale', async () => {
    server.use(
      http.post(url('/tracks/3/analyses'), () => HttpResponse.json(pending, { status: 202 })),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(analysisKeys.list(3), [])

    const { result } = renderHook(() => useUploadAnalysis(), { wrapper })
    act(() =>
      result.current.mutate({
        trackId: 3,
        file: new File(['abc'], 'mix1.wav', { type: 'audio/wav' }),
        stage: 'mix',
        label: 'first mix',
      }),
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(analysisKeys.detail(7))).toEqual(pending)
    expect(queryClient.getQueryState(analysisKeys.list(3))?.isInvalidated).toBe(true)
  })

  it('exposes the ApiError, with Retry-After, of a refused upload', async () => {
    server.use(
      http.post(url('/tracks/3/analyses'), () =>
        HttpResponse.json(errorBody('too_many_active_analyses', 'busy'), {
          status: 429,
          headers: { 'Retry-After': '30' },
        }),
      ),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(analysisKeys.list(3), [])

    const { result } = renderHook(() => useUploadAnalysis(), { wrapper })
    act(() => result.current.mutate({ trackId: 3, file: new File(['abc'], 'mix1.wav') }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({
      status: 429,
      code: 'too_many_active_analyses',
      retryAfter: 30,
    })
    expect(queryClient.getQueryState(analysisKeys.list(3))?.isInvalidated).toBe(false)
  })
})
