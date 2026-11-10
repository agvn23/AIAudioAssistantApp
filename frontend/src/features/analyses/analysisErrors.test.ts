import { describe, expect, it } from 'vitest'
import { describeAnalysisError } from './analysisErrors'

const KNOWN = [
  'silent',
  'empty_audio',
  'no_audio_stream',
  'ffprobe_failed',
  'ffmpeg_failed',
  'ffmpeg_timeout',
  'parse_failed',
  'ffmpeg_missing',
  'ffprobe_missing',
  'essentia_missing',
  'interrupted',
]

describe('describeAnalysisError', () => {
  it.each(KNOWN)('has its own copy for %s', (code) => {
    const text = describeAnalysisError(code)
    expect(text).not.toBe('The analysis failed.')
    expect(text).not.toContain(`(${code})`)
  })

  it('falls back to generic copy for a missing code', () => {
    expect(describeAnalysisError(null)).toBe('The analysis failed.')
    expect(describeAnalysisError(undefined)).toBe('The analysis failed.')
    expect(describeAnalysisError('')).toBe('The analysis failed.')
  })

  it('shows an unknown code so it can be reported', () => {
    expect(describeAnalysisError('brand_new_code')).toBe('The analysis failed (brand_new_code).')
  })

  it('does not treat object prototype names as known codes', () => {
    expect(describeAnalysisError('constructor')).toBe('The analysis failed (constructor).')
  })
})
