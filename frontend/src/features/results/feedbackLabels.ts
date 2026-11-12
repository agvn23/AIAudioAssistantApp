import type { FeedbackContext } from './feedback'
import { formatIdentifier } from './format'

// Areas and priorities the backend produces today (schemas.py). They are plain
// strings in the parsed feedback, so a value added later falls back to its own
// text, capitalised, instead of hiding the item.
const AREA_LABEL: Record<string, string> = {
  loudness: 'Loudness',
  dynamics: 'Dynamics',
  tempo: 'Tempo',
  key: 'Key',
  spectrum: 'Spectrum',
  stereo: 'Stereo',
  overall: 'Overall',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
}

export function describeArea(area: string): string {
  if (Object.hasOwn(AREA_LABEL, area)) return AREA_LABEL[area] ?? formatIdentifier(area)
  return formatIdentifier(area)
}

export function describePriority(priority: string): string {
  if (Object.hasOwn(PRIORITY_LABEL, priority)) {
    return PRIORITY_LABEL[priority] ?? `${formatIdentifier(priority)} priority`
  }
  return `${formatIdentifier(priority)} priority`
}

/** What the feedback was written for, for example "genre house, platform spotify, stage Mix". */
export function describeContext(context: FeedbackContext): string {
  const parts: string[] = []
  if (context.genre !== null) parts.push(`genre ${context.genre}`)
  if (context.target_platform !== null) parts.push(`platform ${context.target_platform}`)
  if (context.stage !== null) parts.push(`stage ${formatIdentifier(context.stage)}`)
  return parts.length === 0 ? 'no genre, platform or stage' : parts.join(', ')
}
