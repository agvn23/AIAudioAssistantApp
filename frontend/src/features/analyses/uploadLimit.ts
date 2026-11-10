/** Same default as MAX_UPLOAD_MB in backend/app/config.py. */
export const DEFAULT_MAX_UPLOAD_MB = 100

/** Megabytes from a VITE_MAX_UPLOAD_MB value. Anything missing or not a positive number gives the default. */
export function parseMaxUploadMb(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_MAX_UPLOAD_MB
  const trimmed = raw.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return DEFAULT_MAX_UPLOAD_MB
  const value = Number(trimmed)
  return value > 0 ? value : DEFAULT_MAX_UPLOAD_MB
}

/** The limit in bytes, for validateAudioFile. The server enforces its own limit too. */
export function getMaxUploadBytes(
  raw: string | undefined = import.meta.env.VITE_MAX_UPLOAD_MB,
): number {
  return Math.round(parseMaxUploadMb(raw) * 1024 * 1024)
}
