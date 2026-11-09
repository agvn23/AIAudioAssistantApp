import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTrack,
  deleteTrack,
  getTrack,
  listTracks,
  updateTrack,
  type TrackListParams,
} from '../../api/tracks'
import type { TrackCreate, TrackUpdate } from '../../api/types'
import { trackKeys } from './queryKeys'

/** The previous page stays in `data` while the next one loads (`isPlaceholderData` is then true). */
export function useTracks(params: TrackListParams) {
  return useQuery({
    queryKey: trackKeys.list(params),
    queryFn: ({ signal }) => listTracks(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useTrack(id: number) {
  return useQuery({
    queryKey: trackKeys.detail(id),
    queryFn: ({ signal }) => getTrack(id, signal),
  })
}

export function useCreateTrack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TrackCreate) => createTrack(body),
    onSuccess: (track) => {
      queryClient.setQueryData(trackKeys.detail(track.id), track)
      return queryClient.invalidateQueries({ queryKey: trackKeys.lists() })
    },
  })
}

export function useUpdateTrack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TrackUpdate }) => updateTrack(id, body),
    onSuccess: (track) => {
      queryClient.setQueryData(trackKeys.detail(track.id), track)
      return queryClient.invalidateQueries({ queryKey: trackKeys.lists() })
    },
  })
}

export function useDeleteTrack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteTrack(id),
    onSuccess: (_data, id) => {
      // Marked stale but not refetched: a refetch of a deleted track would be a 404
      // while its page is still on screen.
      void queryClient.invalidateQueries({ queryKey: trackKeys.detail(id), refetchType: 'none' })
      return queryClient.invalidateQueries({ queryKey: trackKeys.lists() })
    },
  })
}
