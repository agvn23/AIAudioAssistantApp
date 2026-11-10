import type { TrackListParams } from '../../api/tracks'

/** Everything starts with "tracks", so signing out (which clears the cache) covers all of it. */
export const trackKeys = {
  all: ['tracks'] as const,
  lists: () => [...trackKeys.all, 'list'] as const,
  list: (params: TrackListParams) => [...trackKeys.lists(), params] as const,
  details: () => [...trackKeys.all, 'detail'] as const,
  detail: (id: number) => [...trackKeys.details(), id] as const,
}

/**
 * Versions (analyses) also start with "tracks", for the same reason. They sit in
 * their own branch so that touching a track's detail or the lists never
 * refetches versions by accident.
 */
export const analysisKeys = {
  all: [...trackKeys.all, 'analyses'] as const,
  lists: () => [...analysisKeys.all, 'list'] as const,
  list: (trackId: number) => [...analysisKeys.lists(), trackId] as const,
  details: () => [...analysisKeys.all, 'detail'] as const,
  detail: (id: number) => [...analysisKeys.details(), id] as const,
}
