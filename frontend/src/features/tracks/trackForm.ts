import type { Track, TrackCreate, TrackUpdate } from '../../api/types'
import { normaliseTag } from './tagRules'

/** From schema/openapi.json (maxLength). docs/API.md does not list them. */
export const TRACK_LIMITS = {
  title: 200,
  genre: 100,
  targetPlatform: 100,
  notes: 5000,
} as const

export const PLATFORMS = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'apple_music', label: 'Apple Music' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'club', label: 'Club' },
  { value: 'other', label: 'Other' },
] as const

export interface PlatformOption {
  value: string
  label: string
}

/**
 * Options for the platform select. target_platform is a free string in the API,
 * so a track can hold a value this UI does not know. It is added as an extra
 * option, so opening and saving the form never loses it.
 */
export function platformOptions(current: string): PlatformOption[] {
  const known: PlatformOption[] = PLATFORMS.map((platform) => ({ ...platform }))
  if (current === '' || known.some((option) => option.value === current)) return known
  return [...known, { value: current, label: `${current} (existing value)` }]
}

export interface TrackFormValues {
  title: string
  genre: string
  /** Empty string means not set. */
  targetPlatform: string
  notes: string
  tags: string[]
}

export function emptyFormValues(): TrackFormValues {
  return { title: '', genre: '', targetPlatform: '', notes: '', tags: [] }
}

export function valuesFromTrack(track: Track): TrackFormValues {
  return {
    title: track.title,
    genre: track.genre ?? '',
    targetPlatform: track.target_platform ?? '',
    notes: track.notes ?? '',
    tags: [...track.tags],
  }
}

function orNull(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/** Normalised, without empty entries or duplicates, in the order first seen. */
export function normaliseTags(tags: readonly string[]): string[] {
  const result: string[] = []
  for (const raw of tags) {
    const tag = normaliseTag(raw)
    if (tag !== '' && !result.includes(tag)) result.push(tag)
  }
  return result
}

/** Empty optional fields are left out of the body. */
export function toCreateBody(values: TrackFormValues): TrackCreate {
  const body: TrackCreate = {
    title: values.title.trim(),
    tags: normaliseTags(values.tags),
  }
  const genre = orNull(values.genre)
  if (genre !== null) body.genre = genre
  const targetPlatform = orNull(values.targetPlatform)
  if (targetPlatform !== null) body.target_platform = targetPlatform
  const notes = orNull(values.notes)
  if (notes !== null) body.notes = notes
  return body
}

/**
 * Only the fields that differ from the original. A cleared field becomes null.
 * Values are compared after trimming, so stray whitespace is not a change, and
 * tags are compared as a set, so reordering is not a change. The caller has
 * already checked that the title is not empty.
 */
export function toUpdateBody(original: Track, values: TrackFormValues): TrackUpdate {
  const before = valuesFromTrack(original)
  const body: TrackUpdate = {}

  const title = values.title.trim()
  if (title !== before.title.trim()) body.title = title

  const genre = orNull(values.genre)
  if (genre !== orNull(before.genre)) body.genre = genre

  const targetPlatform = orNull(values.targetPlatform)
  if (targetPlatform !== orNull(before.targetPlatform)) body.target_platform = targetPlatform

  const notes = orNull(values.notes)
  if (notes !== orNull(before.notes)) body.notes = notes

  const tags = normaliseTags(values.tags)
  const tagsBefore = normaliseTags(before.tags)
  const sameTags = tags.length === tagsBefore.length && tags.every((t) => tagsBefore.includes(t))
  if (!sameTags) body.tags = tags

  return body
}

export function hasChanges(body: TrackUpdate): boolean {
  return Object.keys(body).length > 0
}
