import { describe, expect, it } from 'vitest'
import { getMaxUploadBytes, parseMaxUploadMb } from './uploadLimit'

describe('parseMaxUploadMb', () => {
  it('reads a whole number', () => {
    expect(parseMaxUploadMb('50')).toBe(50)
  })

  it('reads a decimal and ignores surrounding spaces', () => {
    expect(parseMaxUploadMb(' 2.5 ')).toBe(2.5)
  })

  it.each([undefined, '', 'abc', '-5', '0', '1e3', '10MB'])('falls back to 100 for %s', (raw) => {
    expect(parseMaxUploadMb(raw)).toBe(100)
  })
})

describe('getMaxUploadBytes', () => {
  it('converts megabytes to bytes', () => {
    expect(getMaxUploadBytes('10')).toBe(10 * 1024 * 1024)
  })

  it('falls back to 100 MB for a bad value', () => {
    expect(getMaxUploadBytes('nope')).toBe(100 * 1024 * 1024)
  })
})
