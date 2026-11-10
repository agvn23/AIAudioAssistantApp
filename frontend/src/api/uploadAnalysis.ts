import { API_BASE_URL, notifyUnauthorized } from './client'
import { ApiError, buildApiError } from './errors'
import { tokenStore } from './token'
import type { Analysis, Stage } from './types'

/**
 * Uploads a new version of a track. This uses XMLHttpRequest because it is the
 * only way to get upload progress; the typed fetch client has none. Failures
 * are turned into ApiError exactly as client.ts does, so callers branch on
 * error.code. There is deliberately no timeout: a large file on a slow
 * connection may take minutes, and the caller can cancel with a signal.
 */

export interface UploadProgress {
  loaded: number
  total: number
  /** 0 to 1. Reaching 1 means the file was sent, not that the analysis is done. */
  fraction: number
}

export interface UploadOptions {
  stage?: Stage | null
  label?: string | null
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

function abortError(): DOMException {
  return new DOMException('The upload was cancelled.', 'AbortError')
}

function isAnalysis(value: unknown): value is Analysis {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    'status' in value &&
    typeof value.status === 'string'
  )
}

export function uploadAnalysis(
  trackId: number,
  file: File,
  options: UploadOptions = {},
): Promise<Analysis> {
  const { stage, label, onProgress, signal } = options

  return new Promise<Analysis>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const form = new FormData()
    form.append('file', file)
    if (stage) form.append('stage', stage)
    const trimmedLabel = label?.trim() ?? ''
    if (trimmedLabel !== '') form.append('label', trimmedLabel)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/tracks/${trackId}/analyses`)
    xhr.setRequestHeader('Accept', 'application/json')
    const token = tokenStore.get()
    if (token !== null) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    const onSignalAbort = () => xhr.abort()
    signal?.addEventListener('abort', onSignalAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onSignalAbort)

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total === 0) return
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        fraction: Math.min(1, event.loaded / event.total),
      })
    })

    xhr.addEventListener('load', () => {
      cleanup()
      const status = xhr.status

      if (status >= 200 && status < 300) {
        let parsed: unknown
        try {
          parsed = JSON.parse(xhr.responseText)
        } catch {
          parsed = undefined
        }
        if (isAnalysis(parsed)) {
          resolve(parsed)
        } else {
          reject(
            new ApiError({
              status,
              code: 'unknown',
              message: 'The server sent an unexpected response.',
            }),
          )
        }
        return
      }

      const error = buildApiError(status, xhr.responseText, {
        get: (name) => xhr.getResponseHeader(name),
      })
      if (status === 401) notifyUnauthorized()
      reject(error)
    })

    xhr.addEventListener('error', () => {
      cleanup()
      reject(
        new ApiError({
          status: 0,
          code: 'network_error',
          message: 'Could not reach the server.',
        }),
      )
    })

    xhr.addEventListener('abort', () => {
      cleanup()
      reject(abortError())
    })

    xhr.send(form)
  })
}
