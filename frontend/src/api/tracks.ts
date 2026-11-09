import { api } from './client'
import { requireData } from './requireData'
import type { paths } from './schema'
import type { Track, TrackCreate, TrackPage, TrackUpdate } from './types'

/** Query parameters of GET /tracks, taken from the generated types. */
export type TrackListParams = NonNullable<paths['/tracks']['get']['parameters']['query']>

/**
 * Thin, typed wrappers over the track endpoints. They return plain data and
 * throw ApiError on any failure, so callers branch on error.code.
 * The signal lets TanStack Query cancel a request that is no longer needed.
 */

export async function listTracks(
  params: TrackListParams,
  signal?: AbortSignal,
): Promise<TrackPage> {
  const { data, response } = await api.GET('/tracks', { params: { query: params }, signal })
  return requireData(data, response.status)
}

export async function getTrack(id: number, signal?: AbortSignal): Promise<Track> {
  const { data, response } = await api.GET('/tracks/{track_id}', {
    params: { path: { track_id: id } },
    signal,
  })
  return requireData(data, response.status)
}

export async function createTrack(body: TrackCreate): Promise<Track> {
  const { data, response } = await api.POST('/tracks', { body })
  return requireData(data, response.status)
}

/** Only the fields present in body are changed; null clears genre, platform and notes. */
export async function updateTrack(id: number, body: TrackUpdate): Promise<Track> {
  const { data, response } = await api.PATCH('/tracks/{track_id}', {
    params: { path: { track_id: id } },
    body,
  })
  return requireData(data, response.status)
}

/** 204 on success. The track's analyses are deleted with it. */
export async function deleteTrack(id: number): Promise<void> {
  await api.DELETE('/tracks/{track_id}', { params: { path: { track_id: id } } })
}
