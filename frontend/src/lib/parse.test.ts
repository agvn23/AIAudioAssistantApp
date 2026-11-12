import { describe, expect, it } from 'vitest'
import { isRecord, readNumber } from './parse'

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })

  it('rejects null, arrays and primitives', () => {
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord('text')).toBe(false)
    expect(isRecord(1)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
  })
})

describe('readNumber', () => {
  it('returns finite numbers, zero and negatives included', () => {
    expect(readNumber(0)).toBe(0)
    expect(readNumber(-10.4)).toBe(-10.4)
    expect(readNumber(128)).toBe(128)
  })

  it('returns undefined for anything else', () => {
    expect(readNumber(Number.NaN)).toBeUndefined()
    expect(readNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(readNumber('1')).toBeUndefined()
    expect(readNumber(null)).toBeUndefined()
    expect(readNumber(undefined)).toBeUndefined()
  })
})
