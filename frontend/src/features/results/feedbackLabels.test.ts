import { describe, expect, it } from 'vitest'
import { describeArea, describeContext, describePriority } from './feedbackLabels'

describe('describeArea', () => {
  it.each<[string, string]>([
    ['loudness', 'Loudness'],
    ['dynamics', 'Dynamics'],
    ['tempo', 'Tempo'],
    ['key', 'Key'],
    ['spectrum', 'Spectrum'],
    ['stereo', 'Stereo'],
    ['overall', 'Overall'],
    ['groove', 'Groove'],
    ['low_end', 'Low end'],
    ['constructor', 'Constructor'],
  ])('writes %s as %s', (area, expected) => {
    expect(describeArea(area)).toBe(expected)
  })
})

describe('describePriority', () => {
  it.each<[string, string]>([
    ['high', 'High priority'],
    ['medium', 'Medium priority'],
    ['low', 'Low priority'],
    ['urgent', 'Urgent priority'],
  ])('writes %s as %s', (priority, expected) => {
    expect(describePriority(priority)).toBe(expected)
  })
})

describe('describeContext', () => {
  it('lists genre, platform and stage', () => {
    expect(describeContext({ genre: 'house', target_platform: 'spotify', stage: 'mix' })).toBe(
      'genre house, platform spotify, stage Mix',
    )
  })

  it('leaves out what is not set', () => {
    expect(describeContext({ genre: null, target_platform: 'spotify', stage: null })).toBe(
      'platform spotify',
    )
  })

  it('says so when nothing is set', () => {
    expect(describeContext({ genre: null, target_platform: null, stage: null })).toBe(
      'no genre, platform or stage',
    )
  })
})
