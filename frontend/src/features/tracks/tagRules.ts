export const MAX_TAG_LENGTH = 30
export const MAX_TAGS_PER_TRACK = 10

/** Mirrors the server: trimmed, whitespace collapsed, lower-cased. */
export function normaliseTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

export type AddTagError = 'empty' | 'too_long' | 'duplicate' | 'too_many'

export type AddTagResult =
  { ok: true; tags: string[]; tag: string } | { ok: false; error: AddTagError }

export const TAG_ERROR_MESSAGES: Record<AddTagError, string> = {
  empty: 'Type a tag first.',
  too_long: `Tags can be at most ${MAX_TAG_LENGTH} characters.`,
  duplicate: 'That tag is already added.',
  too_many: `A track can have at most ${MAX_TAGS_PER_TRACK} tags.`,
}

/**
 * Checks a new tag against the API's rules and appends it. `tags` are already
 * normalised. Length counts characters, not UTF-16 units, like the server does.
 */
export function addTag(tags: readonly string[], raw: string): AddTagResult {
  const tag = normaliseTag(raw)
  if (tag === '') return { ok: false, error: 'empty' }
  if ([...tag].length > MAX_TAG_LENGTH) return { ok: false, error: 'too_long' }
  if (tags.includes(tag)) return { ok: false, error: 'duplicate' }
  if (tags.length >= MAX_TAGS_PER_TRACK) return { ok: false, error: 'too_many' }
  return { ok: true, tags: [...tags, tag], tag }
}
