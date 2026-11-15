import { describe, expect, it } from 'vitest'
import { STAGE_LABEL, STAGE_OPTIONS, STATUS_LABEL, toStage } from './labels'

describe('labels', () => {
  it('has a label for every analysis status', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(['done', 'failed', 'pending', 'running'])
  })

  it('offers "Not set" and then every stage, in the same words as the stage labels', () => {
    expect(STAGE_OPTIONS.map((option) => option.label)).toEqual([
      'Not set',
      ...Object.values(STAGE_LABEL),
    ])
    expect(STAGE_OPTIONS.map((option) => option.value)).toEqual(['', 'demo', 'mix', 'master'])
  })

  it('turns a select value into a stage', () => {
    expect(toStage('demo')).toBe('demo')
    expect(toStage('mix')).toBe('mix')
    expect(toStage('master')).toBe('master')
  })

  it('turns "Not set" and unknown values into null', () => {
    expect(toStage('')).toBeNull()
    expect(toStage('mastering')).toBeNull()
  })
})
