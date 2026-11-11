import { api } from './client'
import { requireData } from './requireData'
import type { Analysis, AnalysisSummary, AnalysisUpdate } from './types'

/**
 * Thin, typed wrappers over the analysis endpoints (a version of a track is
 * one analysis). They return plain data and throw ApiError on any failure, so
 * callers branch on error.code. The signal lets TanStack Query cancel a
 * request that is no longer needed. The upload is not here: it needs
 * XMLHttpRequest for progress and lives in its own module.
 */

/** Versions of a track, oldest first. Summaries carry no metrics or feedback. */
export async function listAnalyses(
  trackId: number,
  signal?: AbortSignal,
): Promise<AnalysisSummary[]> {
  const { data, response } = await api.GET('/tracks/{track_id}/analyses', {
    params: { path: { track_id: trackId } },
    signal,
  })
  return requireData(data, response.status)
}

/** One version with status, metrics and feedback. This is what polling reads. */
export async function getAnalysis(id: number, signal?: AbortSignal): Promise<Analysis> {
  const { data, response } = await api.GET('/analyses/{analysis_id}', {
    params: { path: { analysis_id: id } },
    signal,
  })
  return requireData(data, response.status)
}

/** Only label and stage can change. A field that is present is changed; null clears it. */
export async function updateAnalysis(id: number, body: AnalysisUpdate): Promise<Analysis> {
  const { data, response } = await api.PATCH('/analyses/{analysis_id}', {
    params: { path: { analysis_id: id } },
    body,
  })
  return requireData(data, response.status)
}

/** 204 on success. */
export async function deleteAnalysis(id: number): Promise<void> {
  await api.DELETE('/analyses/{analysis_id}', { params: { path: { analysis_id: id } } })
}

/**
 * Generates AI feedback for a finished version, or regenerates it. The server does
 * this synchronously (it calls the model and verifies the output), so the request can
 * take a while. Returns the whole updated analysis. A failed call leaves the stored
 * feedback untouched. Throws ApiError with one of: conflict (not finished yet),
 * rate_limited (see retryAfter), not_configured, timeout, provider_error,
 * invalid_output. It takes no signal because TanStack Query does not give one to
 * mutations.
 */
export async function createFeedback(id: number): Promise<Analysis> {
  const { data, response } = await api.POST('/analyses/{analysis_id}/feedback', {
    params: { path: { analysis_id: id } },
  })
  return requireData(data, response.status)
}
