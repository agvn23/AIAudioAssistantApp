/** Extensions the API accepts (docs/API.md). The server checks the extension too. */
export const ALLOWED_EXTENSIONS = [
  '.wav',
  '.mp3',
  '.flac',
  '.aif',
  '.aiff',
  '.m4a',
  '.ogg',
] as const

/** Value for the file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.join(',')

export type FileProblemCode = 'unsupported_type' | 'empty' | 'too_large'

export interface FileProblem {
  code: FileProblemCode
  message: string
}

const MB = 1024 * 1024

/** Lower-case extension with its dot, or '' when there is none. A leading dot is not an extension. */
export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot).toLowerCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(1).replace(/\.0$/, '')} MB`
}

function isAllowedExtension(extension: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension)
}

/**
 * Checks a chosen file before anything is sent. Returns null when the file may
 * be uploaded. The server checks again; this only saves a pointless upload.
 */
export function validateAudioFile(
  file: Pick<File, 'name' | 'size'>,
  maxBytes: number,
): FileProblem | null {
  if (!isAllowedExtension(getExtension(file.name))) {
    return {
      code: 'unsupported_type',
      message: 'That file type is not supported. Use WAV, MP3, FLAC, AIFF, M4A or OGG.',
    }
  }
  if (file.size === 0) {
    return { code: 'empty', message: 'That file is empty.' }
  }
  if (file.size > maxBytes) {
    return {
      code: 'too_large',
      message: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`,
    }
  }
  return null
}
