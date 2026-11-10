import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteAnalysis, getAnalysis, listAnalyses, updateAnalysis } from '../../api/analyses'
import type { AnalysisUpdate } from '../../api/types'
import { uploadAnalysis, type UploadOptions } from '../../api/uploadAnalysis'
import { analysisKeys } from '../tracks/queryKeys'
import { isActiveStatus, POLL_INTERVAL_MS, pollDelay } from './polling'

interface PollOptions {
  /** For tests. The app uses the 2 s default. */
  intervalMs?: number
}

/** Versions of a track, oldest first. Re-read every 2 s while any of them is still being analysed. */
export function useTrackAnalyses(
  trackId: number,
  { intervalMs = POLL_INTERVAL_MS }: PollOptions = {},
) {
  return useQuery({
    queryKey: analysisKeys.list(trackId),
    queryFn: ({ signal }) => listAnalyses(trackId, signal),
    refetchInterval: (query) =>
      pollDelay(
        query.state.data?.some((version) => isActiveStatus(version.status)) ?? false,
        query.state.error,
        intervalMs,
      ),
  })
}

/**
 * One version. Polled every 2 s until it is done or failed. The interval stops
 * by itself when the component unmounts and on a 4xx such as a 404.
 */
export function useAnalysis(id: number, { intervalMs = POLL_INTERVAL_MS }: PollOptions = {}) {
  return useQuery({
    queryKey: analysisKeys.detail(id),
    queryFn: ({ signal }) => getAnalysis(id, signal),
    refetchInterval: (query) =>
      pollDelay(
        query.state.data !== undefined && isActiveStatus(query.state.data.status),
        query.state.error,
        intervalMs,
      ),
  })
}

export function useUpdateAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AnalysisUpdate }) => updateAnalysis(id, body),
    onSuccess: (analysis) => {
      queryClient.setQueryData(analysisKeys.detail(analysis.id), analysis)
      return queryClient.invalidateQueries({ queryKey: analysisKeys.list(analysis.track_id) })
    },
  })
}

export function useDeleteAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number; trackId: number }) => deleteAnalysis(id),
    onSuccess: (_data, { id, trackId }) => {
      // Marked stale but not refetched: a refetch of a deleted version would be a 404.
      void queryClient.invalidateQueries({ queryKey: analysisKeys.detail(id), refetchType: 'none' })
      return queryClient.invalidateQueries({ queryKey: analysisKeys.list(trackId) })
    },
  })
}

export type UploadVariables = UploadOptions & { trackId: number; file: File }

/** Progress and cancelling stay with the caller: pass onProgress and signal in the variables. */
export function useUploadAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ trackId, file, ...options }: UploadVariables) =>
      uploadAnalysis(trackId, file, options),
    onSuccess: (analysis) => {
      queryClient.setQueryData(analysisKeys.detail(analysis.id), analysis)
      return queryClient.invalidateQueries({ queryKey: analysisKeys.list(analysis.track_id) })
    },
  })
}
