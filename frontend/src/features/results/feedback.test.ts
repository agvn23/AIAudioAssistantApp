import { describe, expect, it } from 'vitest'
import { sampleFeedback } from '../../test/fixtures/analysis'
import { parseFeedback } from './feedback'

const baseItem = {
  area: 'loudness',
  priority: 'medium',
  observation: 'Integrated loudness is -12.8 LUFS.',
  suggestion: 'Leave a little more headroom.',
  evidence: [{ metric: 'loudness.integrated_lufs', value: -12.8 }],
}

function withItem(overrides: Record<string, unknown>): unknown {
  return { ...sampleFeedback, items: [{ ...baseItem, ...overrides }] }
}

const baseMeta = {
  model: 'gemini-3.5-flash',
  generated_at: '2026-11-10T12:00:00.000000Z',
  context_used: { genre: 'house', target_platform: 'spotify', stage: 'mix' },
  feedback_schema_version: 1,
}

describe('parseFeedback', () => {
  it('reads the sample feedback unchanged', () => {
    expect(parseFeedback(sampleFeedback)).toEqual(sampleFeedback)
  })

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'text'],
    ['a number', 42],
    ['an array', []],
  ])('returns null for %s', (_name, raw) => {
    expect(parseFeedback(raw)).toBeNull()
  })

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['not a string', 5],
  ])('returns null when the summary is %s', (_name, summary) => {
    expect(parseFeedback({ ...sampleFeedback, summary })).toBeNull()
  })

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['not an array', 'x'],
    ['empty', []],
  ])('returns null when the items are %s', (_name, items) => {
    expect(parseFeedback({ ...sampleFeedback, items })).toBeNull()
  })

  it.each<[string, Record<string, unknown>]>([
    ['area missing', { area: undefined }],
    ['priority not a string', { priority: 3 }],
    ['observation empty', { observation: '' }],
    ['suggestion missing', { suggestion: undefined }],
    ['evidence missing', { evidence: undefined }],
    ['evidence empty', { evidence: [] }],
    ['evidence value a string', { evidence: [{ metric: 'a.b', value: '1.2' }] }],
    ['evidence metric empty', { evidence: [{ metric: '', value: 1 }] }],
  ])('returns null when an item has %s', (_name, overrides) => {
    expect(parseFeedback(withItem(overrides))).toBeNull()
  })

  it('returns null when an item is not an object', () => {
    expect(parseFeedback({ ...sampleFeedback, items: ['text'] })).toBeNull()
  })

  it('returns null when one item is bad, even if the others are fine', () => {
    const raw = { ...sampleFeedback, items: [baseItem, { ...baseItem, suggestion: '' }] }

    expect(parseFeedback(raw)).toBeNull()
  })

  it('keeps an area and a priority it does not know', () => {
    const result = parseFeedback(withItem({ area: 'groove', priority: 'urgent' }))

    expect(result?.items[0]).toMatchObject({ area: 'groove', priority: 'urgent' })
  })

  it('keeps reference paths and values exactly as stored', () => {
    const evidence = [
      { metric: 'reference.integrated_lufs_difference', value: -5.1 },
      { metric: 'loudness.integrated_lufs', value: -19.123456 },
    ]

    const result = parseFeedback(withItem({ evidence }))

    expect(result?.items[0]?.evidence).toEqual(evidence)
  })

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['not an array', 'x'],
  ])('uses an empty list when the caveats are %s', (_name, caveats) => {
    expect(parseFeedback({ ...sampleFeedback, caveats })?.caveats).toEqual([])
  })

  it('drops caveats that are not text', () => {
    const caveats = ['Keep this one.', 7, '', null, 'And this one.']

    expect(parseFeedback({ ...sampleFeedback, caveats })?.caveats).toEqual([
      'Keep this one.',
      'And this one.',
    ])
  })

  it('leaves the meta out when it is missing', () => {
    const result = parseFeedback({ ...sampleFeedback, meta: undefined })

    expect(result).not.toBeNull()
    expect(result?.meta).toBeUndefined()
  })

  it('leaves the meta out when a field of it is wrong', () => {
    const result = parseFeedback({ ...sampleFeedback, meta: { ...baseMeta, model: 12 } })

    expect(result).not.toBeNull()
    expect(result?.meta).toBeUndefined()
  })

  it('keeps null context fields as null', () => {
    const context_used = { genre: null, target_platform: null, stage: null }

    const result = parseFeedback({ ...sampleFeedback, meta: { ...baseMeta, context_used } })

    expect(result?.meta?.context_used).toEqual(context_used)
  })

  it('turns a context field of the wrong type into null', () => {
    const context_used = { genre: 5, target_platform: 'spotify', stage: 'mix' }

    const result = parseFeedback({ ...sampleFeedback, meta: { ...baseMeta, context_used } })

    expect(result?.meta?.context_used).toEqual({
      genre: null,
      target_platform: 'spotify',
      stage: 'mix',
    })
  })
})
