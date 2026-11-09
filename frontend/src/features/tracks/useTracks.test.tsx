import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../api/client'
import type { TrackListParams } from '../../api/tracks'
import { server } from '../../test/server'
import { trackKeys } from './queryKeys'
import { useCreateTrack, useDeleteTrack, useTrack, useTracks, useUpdateTrack } from './useTracks'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const track = {
  id: 7,
  title: 'Night Drive',
  genre: 'house',
  target_platform: 'spotify',
  notes: null,
  tags: ['demo'],
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
}
const otherTrack = { ...track, id: 8, title: 'Day Drive' }
const page1 = { items: [track], total: 41, limit: 20, offset: 0 }
const page2 = { items: [otherTrack], total: 41, limit: 20, offset: 20 }
const firstPage: TrackListParams = { limit: 20, offset: 0 }

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { queryClient, wrapper }
}

describe('useTracks', () => {
  it('requests the list with the given parameters', async () => {
    let seen: URL | undefined
    server.use(
      http.get(url('/tracks'), ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json(page1)
      }),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTracks({ q: 'night', limit: 20, offset: 0 }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.data).toEqual(page1))
    expect(Object.fromEntries(seen?.searchParams ?? [])).toEqual({
      q: 'night',
      limit: '20',
      offset: '0',
    })
  })

  it('keeps showing the previous page while the next one loads', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(url('/tracks'), async ({ request }) => {
        if (new URL(request.url).searchParams.get('offset') === '20') {
          await gate
          return HttpResponse.json(page2)
        }
        return HttpResponse.json(page1)
      }),
    )
    const { wrapper } = createWrapper()

    const { result, rerender } = renderHook(({ params }) => useTracks(params), {
      wrapper,
      initialProps: { params: firstPage },
    })
    await waitFor(() => expect(result.current.data).toEqual(page1))

    rerender({ params: { limit: 20, offset: 20 } })

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true))
    expect(result.current.data).toEqual(page1)

    release()
    await waitFor(() => expect(result.current.data).toEqual(page2))
    expect(result.current.isPlaceholderData).toBe(false)
  })

  it('exposes the ApiError of a failed request', async () => {
    server.use(
      http.get(url('/tracks'), () =>
        HttpResponse.json(errorBody('rate_limited', 'Slow down'), { status: 429 }),
      ),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTracks(firstPage), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 429, code: 'rate_limited' })
  })
})

describe('useTrack', () => {
  it('loads one track', async () => {
    server.use(http.get(url('/tracks/7'), () => HttpResponse.json(track)))
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTrack(7), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(track))
  })

  it('reports not_found for an unknown track', async () => {
    server.use(
      http.get(url('/tracks/99'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useTrack(99), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' })
  })
})

describe('useCreateTrack', () => {
  it('posts the track, caches it and marks the lists stale', async () => {
    let sent: unknown
    server.use(
      http.post(url('/tracks'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(track, { status: 201 })
      }),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(trackKeys.list(firstPage), page1)

    const { result } = renderHook(() => useCreateTrack(), { wrapper })
    act(() => result.current.mutate({ title: 'Night Drive', tags: [] }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sent).toEqual({ title: 'Night Drive', tags: [] })
    expect(queryClient.getQueryData(trackKeys.detail(7))).toEqual(track)
    expect(queryClient.getQueryState(trackKeys.list(firstPage))?.isInvalidated).toBe(true)
  })

  it('leaves the lists alone when the request fails', async () => {
    server.use(
      http.post(url('/tracks'), () =>
        HttpResponse.json(errorBody('quota_exceeded', 'Track limit reached'), { status: 409 }),
      ),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(trackKeys.list(firstPage), page1)

    const { result } = renderHook(() => useCreateTrack(), { wrapper })
    act(() => result.current.mutate({ title: 'One too many' }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 409, code: 'quota_exceeded' })
    expect(queryClient.getQueryState(trackKeys.list(firstPage))?.isInvalidated).toBe(false)
  })
})

describe('useUpdateTrack', () => {
  it('patches the track, replaces the cached detail and marks the lists stale', async () => {
    let sent: unknown
    const updated = { ...track, title: 'Renamed' }
    server.use(
      http.patch(url('/tracks/7'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(updated)
      }),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(trackKeys.detail(7), track)
    queryClient.setQueryData(trackKeys.list(firstPage), page1)

    const { result } = renderHook(() => useUpdateTrack(), { wrapper })
    act(() => result.current.mutate({ id: 7, body: { title: 'Renamed' } }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sent).toEqual({ title: 'Renamed' })
    expect(queryClient.getQueryData(trackKeys.detail(7))).toEqual(updated)
    expect(queryClient.getQueryState(trackKeys.list(firstPage))?.isInvalidated).toBe(true)
  })
})

describe('useDeleteTrack', () => {
  it('deletes the track and marks both the lists and its detail stale', async () => {
    let method = ''
    server.use(
      http.delete(url('/tracks/7'), ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { queryClient, wrapper } = createWrapper()
    queryClient.setQueryData(trackKeys.detail(7), track)
    queryClient.setQueryData(trackKeys.list(firstPage), page1)

    const { result } = renderHook(() => useDeleteTrack(), { wrapper })
    act(() => result.current.mutate(7))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(method).toBe('DELETE')
    expect(queryClient.getQueryState(trackKeys.list(firstPage))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(trackKeys.detail(7))?.isInvalidated).toBe(true)
  })

  it('reports not_found when the track is already gone', async () => {
    server.use(
      http.delete(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )
    const { wrapper } = createWrapper()

    const { result } = renderHook(() => useDeleteTrack(), { wrapper })
    act(() => result.current.mutate(7))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' })
  })
})
