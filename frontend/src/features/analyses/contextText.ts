import type { Track } from '../../api/types'
import type { FeedbackContext } from '../results/feedback'

/**
 * The server cleans the genre and platform before the AI sees them and stores the
 * cleaned text in the feedback's context_used. To tell whether the track changed
 * since, the track's values have to be cleaned the same way before comparing.
 * This mirrors _clean_text in backend/app/services/feedback/prompt.py.
 */

/** MAX_CONTEXT_CHARS in prompt.py. */
export const CONTEXT_MAX_CHARS = 100

/** The code points Python's str.split() treats as whitespace (checked against Python 3.12). */
function isPythonSpace(code: number): boolean {
  return (
    (code >= 0x09 && code <= 0x0d) ||
    (code >= 0x1c && code <= 0x20) ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  )
}

/** The characters _UNSAFE_TEXT replaces with a space: angle brackets and control characters. */
function isUnsafe(char: string, code: number): boolean {
  return char === '<' || char === '>' || code <= 0x1f || code === 0x7f
}

/**
 * One line of text: unsafe characters become spaces, runs of whitespace become one
 * space, the result is cut to 100 characters (code points, not UTF-16 units) and
 * trimmed. Null when nothing is left. The case is not changed.
 */
export function cleanContextText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null

  const words: string[] = []
  let word = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (isUnsafe(char, code) || isPythonSpace(code)) {
      if (word !== '') {
        words.push(word)
        word = ''
      }
    } else {
      word += char
    }
  }
  if (word !== '') words.push(word)

  let text = [...words.join(' ')].slice(0, CONTEXT_MAX_CHARS).join('')
  // Cutting can leave one space at the end, and nothing else can need trimming.
  if (text.endsWith(' ')) text = text.slice(0, -1)
  return text === '' ? null : text
}

export type TrackContextField = 'genre' | 'platform'

/** Which of the track's genre and platform differ from what the feedback was written for. */
export function changedTrackFields(
  track: Pick<Track, 'genre' | 'target_platform'>,
  used: Pick<FeedbackContext, 'genre' | 'target_platform'>,
): TrackContextField[] {
  const changed: TrackContextField[] = []
  if (cleanContextText(track.genre) !== used.genre) changed.push('genre')
  if (cleanContextText(track.target_platform) !== used.target_platform) changed.push('platform')
  return changed
}

/** The hint for a person. Call it with at least one changed field. */
export function describeTrackChange(fields: readonly TrackContextField[]): string {
  const names = fields.map((field) => (field === 'genre' ? 'genre' : 'target platform'))
  const verb = names.length > 1 ? 'were' : 'was'
  return `The ${names.join(' and ')} of this track ${verb} changed after this feedback was written. Regenerate it to match.`
}
