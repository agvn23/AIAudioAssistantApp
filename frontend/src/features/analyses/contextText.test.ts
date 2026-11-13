import { describe, expect, it } from 'vitest'
import {
  changedTrackFields,
  cleanContextText,
  CONTEXT_MAX_CHARS,
  describeTrackChange,
} from './contextText'

// Expected values come from running the server's _clean_text (Python 3.12).
describe('cleanContextText', () => {
  it('returns null for nothing, empty text and blank text', () => {
    expect(cleanContextText(null)).toBeNull()
    expect(cleanContextText(undefined)).toBeNull()
    expect(cleanContextText('')).toBeNull()
    expect(cleanContextText('   ')).toBeNull()
  })

  it('keeps plain text, and does not change its case', () => {
    expect(cleanContextText('house')).toBe('house')
    expect(cleanContextText('House')).toBe('House')
  })

  it('collapses spaces, tabs and new lines into single spaces', () => {
    expect(cleanContextText('  deep   house  ')).toBe('deep house')
    expect(cleanContextText('deep\t\nhouse')).toBe('deep house')
  })

  it('turns angle brackets and control characters into spaces', () => {
    expect(cleanContextText('a<b>c')).toBe('a b c')
    expect(cleanContextText('<script>')).toBe('script')
    expect(cleanContextText('a\u0000b')).toBe('a b')
    expect(cleanContextText('\u007f')).toBeNull()
  })

  it('treats the Unicode spaces Python treats as whitespace as spaces', () => {
    expect(cleanContextText('deep\u00a0house')).toBe('deep house')
    expect(cleanContextText('deep\u3000house')).toBe('deep house')
    expect(cleanContextText('deep\u0085house')).toBe('deep house')
  })

  it('does not treat a byte order mark or a zero-width space as whitespace', () => {
    expect(cleanContextText('a\ufeffb')).toBe('a\ufeffb')
    expect(cleanContextText('a\u200bb')).toBe('a\u200bb')
  })

  it('cuts the text to 100 characters', () => {
    expect(CONTEXT_MAX_CHARS).toBe(100)
    expect(cleanContextText('a'.repeat(120))).toBe('a'.repeat(100))
  })

  it('removes the space a cut can leave at the end', () => {
    expect(cleanContextText(`${'a'.repeat(99)} bbb`)).toBe('a'.repeat(99))
  })

  it('counts characters, not UTF-16 units, when cutting', () => {
    const result = cleanContextText('😀'.repeat(120))

    expect([...(result ?? '')].length).toBe(100)
  })
})

describe('changedTrackFields', () => {
  const used = { genre: 'house', target_platform: 'spotify' }

  it('finds nothing when the track is as it was', () => {
    expect(changedTrackFields({ genre: 'house', target_platform: 'spotify' }, used)).toEqual([])
  })

  it('finds a changed genre', () => {
    expect(changedTrackFields({ genre: 'techno', target_platform: 'spotify' }, used)).toEqual([
      'genre',
    ])
  })

  it('finds a changed platform', () => {
    expect(changedTrackFields({ genre: 'house', target_platform: 'tidal' }, used)).toEqual([
      'platform',
    ])
  })

  it('finds both', () => {
    expect(changedTrackFields({ genre: 'techno', target_platform: 'tidal' }, used)).toEqual([
      'genre',
      'platform',
    ])
  })

  it('ignores differences the server removes when it cleans the text', () => {
    expect(
      changedTrackFields(
        { genre: '  deep   house ', target_platform: 'spotify' },
        { genre: 'deep house', target_platform: 'spotify' },
      ),
    ).toEqual([])
  })

  it('ignores the part of a long genre that the server cuts off', () => {
    expect(
      changedTrackFields(
        { genre: 'a'.repeat(120), target_platform: 'spotify' },
        { genre: 'a'.repeat(100), target_platform: 'spotify' },
      ),
    ).toEqual([])
  })

  it('finds a genre that was added after the feedback was written', () => {
    expect(
      changedTrackFields(
        { genre: 'house', target_platform: 'spotify' },
        { genre: null, target_platform: 'spotify' },
      ),
    ).toEqual(['genre'])
  })

  it('finds a genre that was cleared after the feedback was written', () => {
    expect(changedTrackFields({ genre: null, target_platform: 'spotify' }, used)).toEqual(['genre'])
  })
})

describe('describeTrackChange', () => {
  it('names the genre', () => {
    expect(describeTrackChange(['genre'])).toBe(
      'The genre of this track was changed after this feedback was written. Regenerate it to match.',
    )
  })

  it('names the target platform', () => {
    expect(describeTrackChange(['platform'])).toBe(
      'The target platform of this track was changed after this feedback was written. Regenerate it to match.',
    )
  })

  it('names both, in the plural', () => {
    expect(describeTrackChange(['genre', 'platform'])).toBe(
      'The genre and target platform of this track were changed after this feedback was written. Regenerate it to match.',
    )
  })
})
