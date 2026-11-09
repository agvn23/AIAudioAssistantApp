import { ApiError } from './errors'

/** A 2xx that should carry a body but did not. Shown as the generic "unknown" error. */
export function requireData<T>(data: T | undefined, status: number): T {
  if (data === undefined) {
    throw new ApiError({
      status,
      code: 'unknown',
      message: 'The server sent an empty response.',
    })
  }
  return data
}
