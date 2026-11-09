import type { TrackListParams } from '../../api/tracks'

/** Everything starts with "tracks", so signing out (which clears the cache) covers all of it. */
export const trackKeys = {
  all: ['tracks'] as const,
  lists: () => [...trackKeys.all, 'list'] as const,
  list: (params: TrackListParams) => [...trackKeys.lists(), params] as const,
  details: () => [...trackKeys.all, 'detail'] as const,
  detail: (id: number) => [...trackKeys.details(), id] as const,
}
