import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { API_BASE_URL, setUnauthorizedHandler } from './client'
import { ApiError } from './errors'
import { tokenStore } from './token'
import { createTrack, deleteTrack, getTrack, listTracks, updateTrack } from './tracks'

const url = (path: string) => `${API_BASE_URL}${path}`

function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
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

afterEach(() => {
  setUnauthorizedHandler(undefined)
})

describe('listTracks', () => {
  it('sends the filters as query parameters and returns the page', async () => {
    tokenStore.set('tok-abc')
    let seen: URL | undefined
    let authorization: string | null = null
    const page = { items: [track], total: 41, limit: 20, offset: 20 }
    server.use(
      http.get(url('/tracks'), ({ request }) => {
        seen = new URL(request.url)
        authorization = request.headers.get('authorization')
        return HttpResponse.json(page)
      }),
    )

    await expect(
      listTracks({ q: '100%', genre: 'house', tag: 'demo', limit: 20, offset: 20 }),
    ).resolves.toEqual(page)

    expect(Object.fromEntries(seen?.searchParams ?? [])).toEqual({
      q: '100%',
      genre: 'house',
      tag: 'demo',
      limit: '20',
      offset: '20',
    })
    expect(authorization).toBe('Bearer tok-abc')
  })

  it('leaves out parameters that are undefined', async () => {
    let seen: URL | undefined
    server.use(
      http.get(url('/tracks'), ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 })
      }),
    )

    await listTracks({ limit: 20, offset: 0 })

    expect(Object.fromEntries(seen?.searchParams ?? [])).toEqual({ limit: '20', offset: '0' })
  })

  it('rejects with the code of a 422 and keeps the field errors', async () => {
    const fields = [{ location: 'query', field: 'limit', message: 'Too large' }]
    server.use(
      http.get(url('/tracks'), () =>
        HttpResponse.json(errorBody('validation_error', 'Invalid input', { fields }), {
          status: 422,
        }),
      ),
    )

    const error = await listTracks({ limit: 500, offset: 0 }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, code: 'validation_error' })
    expect((error as ApiError).fields).toEqual(fields)
  })

  it('clears the token and calls the unauthorized handler on a 401', async () => {
    tokenStore.set('expired')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    server.use(
      http.get(url('/tracks'), () =>
        HttpResponse.json(errorBody('unauthorized', 'Not authenticated'), { status: 401 }),
      ),
    )

    await expect(listTracks({ limit: 20, offset: 0 })).rejects.toMatchObject({
      code: 'unauthorized',
    })

    expect(tokenStore.get()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})

describe('getTrack', () => {
  it('requests the track by id', async () => {
    let pathname = ''
    server.use(
      http.get(url('/tracks/7'), ({ request }) => {
        pathname = new URL(request.url).pathname
        return HttpResponse.json(track)
      }),
    )

    await expect(getTrack(7)).resolves.toEqual(track)
    expect(pathname).toBe('/tracks/7')
  })

  it('rejects with code "not_found" on a 404', async () => {
    server.use(
      http.get(url('/tracks/99'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )

    await expect(getTrack(99)).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })
})

describe('createTrack', () => {
  it('posts the body as JSON and returns the new track', async () => {
    let sent: unknown
    server.use(
      http.post(url('/tracks'), async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(track, { status: 201 })
      }),
    )

    const body = { title: 'Night Drive', genre: 'house', tags: ['demo'] }
    await expect(createTrack(body)).resolves.toEqual(track)
    expect(sent).toEqual(body)
  })

  it('rejects with code "quota_exceeded" on a 409', async () => {
    server.use(
      http.post(url('/tracks'), () =>
        HttpResponse.json(errorBody('quota_exceeded', 'Track limit reached'), { status: 409 }),
      ),
    )

    await expect(createTrack({ title: 'One too many' })).rejects.toMatchObject({
      status: 409,
      code: 'quota_exceeded',
    })
  })
})

describe('updateTrack', () => {
  it('patches only the fields it is given, including an explicit null', async () => {
    let sent: unknown
    let method = ''
    server.use(
      http.patch(url('/tracks/7'), async ({ request }) => {
        method = request.method
        sent = await request.json()
        return HttpResponse.json({ ...track, genre: null })
      }),
    )

    await expect(updateTrack(7, { genre: null })).resolves.toMatchObject({ genre: null })
    expect(method).toBe('PATCH')
    expect(sent).toEqual({ genre: null })
  })
})

describe('deleteTrack', () => {
  it('resolves on 204', async () => {
    let method = ''
    server.use(
      http.delete(url('/tracks/7'), ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteTrack(7)).resolves.toBeUndefined()
    expect(method).toBe('DELETE')
  })

  it('rejects with code "not_found" when the track is already gone', async () => {
    server.use(
      http.delete(url('/tracks/7'), () =>
        HttpResponse.json(errorBody('not_found', 'Track not found'), { status: 404 }),
      ),
    )

    await expect(deleteTrack(7)).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })
})
