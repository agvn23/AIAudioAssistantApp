import { describe, expect, it } from 'vitest'
import { formatWait } from './formatWait'

describe('formatWait', () => {
  it('uses seconds up to 90', () => {
    expect(formatWait(1)).toBe('1 s')
    expect(formatWait(42)).toBe('42 s')
    expect(formatWait(90)).toBe('90 s')
  })

  it('uses whole minutes, rounded up, beyond that', () => {
    expect(formatWait(91)).toBe('2 min')
    expect(formatWait(600)).toBe('10 min')
    expect(formatWait(3599)).toBe('60 min')
    expect(formatWait(3600)).toBe('60 min')
  })
})
