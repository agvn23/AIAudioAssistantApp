import { tokenStore } from '../../api/token'

/**
 * The audio files chosen for upload (or chosen again on the version page), kept
 * only in this tab's memory so the version page can draw a waveform. The server
 * never keeps the audio, so after a reload, or after signing out, the file is
 * gone and has to be chosen again.
 */
const files = new Map<number, File>()

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function rememberFile(analysisId: number, file: File): void {
  files.set(analysisId, file)
  notify()
}

export function getRememberedFile(analysisId: number): File | undefined {
  return files.get(analysisId)
}

export function forgetFile(analysisId: number): void {
  if (files.delete(analysisId)) notify()
}

export function clearRememberedFiles(): void {
  if (files.size === 0) return
  files.clear()
  notify()
}

/** For useSyncExternalStore. Returns the unsubscribe function. */
export function subscribeToFiles(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Signing out, and a 401 that clears the token, also drop every remembered file.
tokenStore.subscribe(() => {
  if (tokenStore.get() === null) clearRememberedFiles()
})
