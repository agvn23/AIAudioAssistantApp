import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFeedback } from '../../api/analyses'
import { analysisKeys } from '../tracks/queryKeys'

/**
 * Generates or regenerates the AI feedback of a finished version. The returned
 * analysis goes into the detail cache. The version list holds summaries without
 * feedback, so it is left alone. A failure changes nothing, which matches the
 * server: the previous feedback stays. No retry, because every attempt costs
 * feedback budget (10 per hour per user) and model quota.
 */
export function useCreateFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number }) => createFeedback(id),
    retry: false,
    onSuccess: (analysis) => {
      queryClient.setQueryData(analysisKeys.detail(analysis.id), analysis)
    },
  })
}
