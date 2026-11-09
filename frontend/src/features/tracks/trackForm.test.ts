import { describe, expect, it } from 'vitest'
import type { Track } from '../../api/types'
import {
  emptyFormValues,
  hasChanges,
  normaliseTags,
  platformOptions,
  toCreateBody,
  toUpdateBody,
  valuesFromTrack,
} from './trackForm'

const track: Track = {
  id: 7,
  title: 'Night Drive',
  genre: 'house',
  target_platform: 'spotify',
  notes: 'first mix',
  tags: ['demo', 'club'],
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
}

describe('platformOptions', () => {
  it('lists the six known platforms in order', () => {
    expect(platformOptions('').map((o) => o.value)).toEqual([
      'spotify',
      'apple_music',
      'youtube',
      'broadcast',
      'club',
      'other',
    ])
  })

  it('adds nothing when the current value is known', () => {
    expect(platformOptions('youtube')).toHaveLength(6)
  })

  it('keeps an unknown existing value as an extra option', () => {
    const options = platformOptions('tidal')
    expect(options).toHaveLength(7)
    expect(options[6]).toEqual({ value: 'tidal', label: 'tidal (existing value)' })
  })
})

describe('valuesFromTrack', () => {
  it('turns null into empty strings', () => {
    const values = valuesFromTrack({ ...track, genre: null, target_platform: null, notes: null })
    expect(values).toMatchObject({ genre: '', targetPlatform: '', notes: '' })
  })

  it('copies the tags instead of sharing the array', () => {
    const values = valuesFromTrack(track)
    expect(values.tags).toEqual(track.tags)
    expect(values.tags).not.toBe(track.tags)
  })
})

describe('normaliseTags', () => {
  it('normalises, drops empty entries and de-duplicates in order', () => {
    expect(normaliseTags([' Demo ', 'CLUB', 'demo', '   ', 'Club'])).toEqual(['demo', 'club'])
  })
})

describe('toCreateBody', () => {
  it('trims the title and leaves out empty optional fields', () => {
    expect(toCreateBody({ ...emptyFormValues(), title: '  Night Drive ' })).toEqual({
      title: 'Night Drive',
      tags: [],
    })
  })

  it('includes the optional fields that are set and normalised tags', () => {
    expect(
      toCreateBody({
        title: 'Night Drive',
        genre: ' house ',
        targetPlatform: 'spotify',
        notes: 'first mix',
        tags: ['Demo', 'demo'],
      }),
    ).toEqual({
      title: 'Night Drive',
      genre: 'house',
      target_platform: 'spotify',
      notes: 'first mix',
      tags: ['demo'],
    })
  })

  it('leaves out a whitespace-only note', () => {
    expect(toCreateBody({ ...emptyFormValues(), title: 'x', notes: '  \n ' })).toEqual({
      title: 'x',
      tags: [],
    })
  })
})

describe('toUpdateBody', () => {
  it('is empty when nothing changed', () => {
    const body = toUpdateBody(track, valuesFromTrack(track))
    expect(body).toEqual({})
    expect(hasChanges(body)).toBe(false)
  })

  it('sends only the changed field', () => {
    const body = toUpdateBody(track, { ...valuesFromTrack(track), title: 'Night Drive 2' })
    expect(body).toEqual({ title: 'Night Drive 2' })
    expect(hasChanges(body)).toBe(true)
  })

  it('sends null when a field is cleared', () => {
    const body = toUpdateBody(track, {
      ...valuesFromTrack(track),
      genre: '',
      targetPlatform: '',
      notes: '   ',
    })
    expect(body).toEqual({ genre: null, target_platform: null, notes: null })
  })

  it('sends a value for a field that was null before', () => {
    const original = { ...track, genre: null }
    const body = toUpdateBody(original, { ...valuesFromTrack(original), genre: ' techno ' })
    expect(body).toEqual({ genre: 'techno' })
  })

  it('does not treat stray whitespace as a change', () => {
    const original = { ...track, notes: 'first mix\n' }
    const body = toUpdateBody(original, { ...valuesFromTrack(original), title: ' Night Drive ' })
    expect(body).toEqual({})
  })

  it('leaves an unknown existing platform alone when it is not touched', () => {
    const original = { ...track, target_platform: 'tidal' }
    const body = toUpdateBody(original, { ...valuesFromTrack(original), title: 'New' })
    expect(body).toEqual({ title: 'New' })
  })

  it('replaces an unknown platform when the user picks a known one', () => {
    const original = { ...track, target_platform: 'tidal' }
    const body = toUpdateBody(original, { ...valuesFromTrack(original), targetPlatform: 'club' })
    expect(body).toEqual({ target_platform: 'club' })
  })

  it('does not treat reordered or re-cased tags as a change', () => {
    const body = toUpdateBody(track, { ...valuesFromTrack(track), tags: ['CLUB', 'demo'] })
    expect(body).toEqual({})
  })

  it('sends the whole normalised tag list when tags change', () => {
    const body = toUpdateBody(track, { ...valuesFromTrack(track), tags: ['demo', 'Dark ', 'dark'] })
    expect(body).toEqual({ tags: ['demo', 'dark'] })
  })

  it('sends an empty list when all tags are removed', () => {
    const body = toUpdateBody(track, { ...valuesFromTrack(track), tags: [] })
    expect(body).toEqual({ tags: [] })
  })
})
