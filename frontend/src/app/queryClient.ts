import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors'

/**
 * Retry only failures that can plausibly succeed next time: no connection, or a
 * 5xx. A 4xx (not found, validation, rate limit) would fail the same way again.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500
  return false
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
    },
  })
}
