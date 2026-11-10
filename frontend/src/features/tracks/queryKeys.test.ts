import { describe, expect, it } from 'vitest'
import { analysisKeys, trackKeys } from './queryKeys'

describe('query keys', () => {
  it('start every track key with "tracks"', () => {
    expect(trackKeys.all).toEqual(['tracks'])
    expect(trackKeys.detail(5)).toEqual(['tracks', 'detail', 5])
  })

  it('start every analysis key with "tracks" too', () => {
    expect(analysisKeys.list(5)).toEqual(['tracks', 'analyses', 'list', 5])
    expect(analysisKeys.detail(9)).toEqual(['tracks', 'analyses', 'detail', 9])
  })

  it('keep analysis keys out of the track list and detail branches', () => {
    expect(analysisKeys.all.slice(0, 2)).not.toEqual(trackKeys.lists())
    expect(analysisKeys.all.slice(0, 2)).not.toEqual(trackKeys.details())
  })

  it('tell versions of different tracks apart', () => {
    expect(analysisKeys.list(1)).not.toEqual(analysisKeys.list(2))
  })
})
