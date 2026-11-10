import { describe, expect, it } from 'vitest'
import { ACCEPT_ATTRIBUTE, formatBytes, getExtension, validateAudioFile } from './uploadRules'

const MB = 1024 * 1024

describe('getExtension', () => {
  it('lower-cases the extension and keeps the dot', () => {
    expect(getExtension('Take 3.WAV')).toBe('.wav')
  })

  it('uses the last dot', () => {
    expect(getExtension('mix.v2.final.flac')).toBe('.flac')
  })

  it('returns an empty string when there is no extension', () => {
    expect(getExtension('mix')).toBe('')
    expect(getExtension('mix.')).toBe('')
    expect(getExtension('.wav')).toBe('')
  })
})

describe('formatBytes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1536)).toBe('2 KB')
    expect(formatBytes(MB)).toBe('1 MB')
    expect(formatBytes(5.5 * MB)).toBe('5.5 MB')
  })
})

describe('ACCEPT_ATTRIBUTE', () => {
  it('lists every allowed extension', () => {
    expect(ACCEPT_ATTRIBUTE).toBe('.wav,.mp3,.flac,.aif,.aiff,.m4a,.ogg')
  })
})

describe('validateAudioFile', () => {
  const max = 10 * MB

  it.each(['a.wav', 'a.MP3', 'a.flac', 'a.aif', 'a.aiff', 'a.m4a', 'a.ogg'])(
    'accepts %s',
    (name) => {
      expect(validateAudioFile({ name, size: 1000 }, max)).toBeNull()
    },
  )

  it('accepts a file exactly at the limit', () => {
    expect(validateAudioFile({ name: 'a.wav', size: max }, max)).toBeNull()
  })

  it('rejects an unsupported extension', () => {
    expect(validateAudioFile({ name: 'a.txt', size: 1000 }, max)?.code).toBe('unsupported_type')
  })

  it('rejects a file without an extension', () => {
    expect(validateAudioFile({ name: 'audio', size: 1000 }, max)?.code).toBe('unsupported_type')
  })

  it('rejects an empty file', () => {
    expect(validateAudioFile({ name: 'a.wav', size: 0 }, max)?.code).toBe('empty')
  })

  it('rejects a file over the limit and says both sizes', () => {
    const problem = validateAudioFile({ name: 'a.wav', size: 12.5 * MB }, max)
    expect(problem?.code).toBe('too_large')
    expect(problem?.message).toBe('That file is 12.5 MB. The limit is 10 MB.')
  })

  it('reports the type before the size', () => {
    expect(validateAudioFile({ name: 'a.txt', size: 0 }, max)?.code).toBe('unsupported_type')
  })
})
