import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import { createQueryClient } from '../../app/queryClient'
import { sampleFeedback, sampleMetrics } from '../../test/fixtures/analysis'
import { server } from '../../test/server'
import { analysisKeys } from '../tracks/queryKeys'
import { useCreateFeedback } from './useCreateFeedback'

const withoutFeedback = {
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
  feedback: null,
}

const withFeedback = { ...withoutFeedback, feedback: sampleFeedback }

function setup() {
  const queryClient = createQueryClient()
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  const hook = renderHook(() => useCreateFeedback(), { wrapper })
  return { queryClient, ...hook }
}

describe('useCreateFeedback', () => {
  it('writes the returned analysis into the detail cache', async () => {
    server.use(
      http.post(`${API_BASE_URL}/analyses/:id/feedback`, () => HttpResponse.json(withFeedback)),
    )
    const { queryClient, result } = setup()
    queryClient.setQueryData(analysisKeys.detail(7), withoutFeedback)

    act(() => {
      result.current.mutate({ id: 7 })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(analysisKeys.detail(7))).toEqual(withFeedback)
  })

  it('keeps the cached analysis and exposes the error code when the call fails', async () => {
    server.use(
      http.post(`${API_BASE_URL}/analyses/:id/feedback`, () =>
        HttpResponse.json({ error: { code: 'timeout', message: 'Slow' } }, { status: 504 }),
      ),
    )
    const { queryClient, result } = setup()
    queryClient.setQueryData(analysisKeys.detail(7), withFeedback)

    act(() => {
      result.current.mutate({ id: 7 })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 504, code: 'timeout' })
    expect(queryClient.getQueryData(analysisKeys.detail(7))).toEqual(withFeedback)
  })

  it('does not retry a 502', async () => {
    let calls = 0
    server.use(
      http.post(`${API_BASE_URL}/analyses/:id/feedback`, () => {
        calls += 1
        return HttpResponse.json(
          { error: { code: 'provider_error', message: 'Failed' } },
          { status: 502 },
        )
      }),
    )
    const { result } = setup()

    act(() => {
      result.current.mutate({ id: 7 })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(calls).toBe(1)
  })
})
