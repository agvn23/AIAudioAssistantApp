import { describe, expect, it } from 'vitest'
import { addTag, MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, normaliseTag } from './tagRules'

describe('normaliseTag', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normaliseTag('  Deep   HOUSE ')).toBe('deep house')
  })

  it('returns an empty string for whitespace only', () => {
    expect(normaliseTag('   \t ')).toBe('')
  })
})

describe('limits', () => {
  it('matches docs/API.md', () => {
    expect(MAX_TAG_LENGTH).toBe(30)
    expect(MAX_TAGS_PER_TRACK).toBe(10)
  })
})

describe('addTag', () => {
  it('normalises the tag and appends it', () => {
    expect(addTag(['demo'], '  Deep   House ')).toEqual({
      ok: true,
      tags: ['demo', 'deep house'],
      tag: 'deep house',
    })
  })

  it('does not change the list it is given', () => {
    const tags = ['demo']
    addTag(tags, 'club')
    expect(tags).toEqual(['demo'])
  })

  it('rejects an empty tag', () => {
    expect(addTag([], '   ')).toEqual({ ok: false, error: 'empty' })
  })

  it('accepts exactly the maximum length and rejects one more', () => {
    expect(addTag([], 'a'.repeat(MAX_TAG_LENGTH)).ok).toBe(true)
    expect(addTag([], 'a'.repeat(MAX_TAG_LENGTH + 1))).toEqual({ ok: false, error: 'too_long' })
  })

  it('counts an emoji as one character', () => {
    expect(addTag([], '😀'.repeat(MAX_TAG_LENGTH)).ok).toBe(true)
  })

  it('rejects a duplicate regardless of case', () => {
    expect(addTag(['demo'], 'DEMO')).toEqual({ ok: false, error: 'duplicate' })
  })

  it('rejects an eleventh tag', () => {
    const full = Array.from({ length: MAX_TAGS_PER_TRACK }, (_, index) => `tag${index}`)
    expect(addTag(full, 'extra')).toEqual({ ok: false, error: 'too_many' })
  })

  it('reports a duplicate before the limit when the list is full', () => {
    const full = Array.from({ length: MAX_TAGS_PER_TRACK }, (_, index) => `tag${index}`)
    expect(addTag(full, 'tag3')).toEqual({ ok: false, error: 'duplicate' })
  })
})
