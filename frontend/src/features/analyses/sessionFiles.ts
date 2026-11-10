import { tokenStore } from '../../api/token'

/**
 * The audio files chosen for upload, kept only in this tab's memory so the
 * version page can draw a waveform. The server never keeps the audio, so after
 * a reload, or after signing out, the file is gone and so is the waveform.
 */
const files = new Map<number, File>()

export function rememberFile(analysisId: number, file: File): void {
  files.set(analysisId, file)
}

export function getRememberedFile(analysisId: number): File | undefined {
  return files.get(analysisId)
}

export function forgetFile(analysisId: number): void {
  files.delete(analysisId)
}

export function clearRememberedFiles(): void {
  files.clear()
}

// Signing out, and a 401 that clears the token, also drop every remembered file.
tokenStore.subscribe(() => {
  if (tokenStore.get() === null) clearRememberedFiles()
})
