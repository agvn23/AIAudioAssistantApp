import { describe, expect, it } from 'vitest'
import { barFor, formatBandRange, niceScale, yFor, type Scale } from './spectrumLayout'

const plot = { left: 0, top: 0, width: 100, height: 100 }
const scale: Scale = { min: -10, max: 10, ticks: [-10, -5, 0, 5, 10] }

describe('niceScale', () => {
  it.each<[string, number[], number, number, number[]]>([
    ['mixed values', [6.1, 5.4, 2.2, -1.3, -3.1, -5.8, -8.6], -10, 10, [-10, -5, 0, 5, 10]],
    ['only positive values', [6.1, 2.2], 0, 10, [0, 5, 10]],
    ['only negative values', [-3, -8], -10, 0, [-10, -5, 0]],
    ['values exactly on a step', [10, -10], -10, 10, [-10, -5, 0, 5, 10]],
    ['a span over 30 dB', [25, -20], -20, 30, [-20, -10, 0, 10, 20, 30]],
    ['all zero', [0, 0, 0], 0, 5, [0, 5]],
    ['no values', [], 0, 5, [0, 5]],
  ])('handles %s', (_name, values, min, max, ticks) => {
    expect(niceScale(values)).toEqual({ min, max, ticks })
  })
})

describe('formatBandRange', () => {
  it.each<[number, number, string]>([
    [20, 60, '20–60 Hz'],
    [60, 250, '60–250 Hz'],
    [250, 500, '250–500 Hz'],
    [500, 2000, '500 Hz–2 kHz'],
    [2000, 6000, '2–6 kHz'],
    [6000, 12000, '6–12 kHz'],
    [12000, 20000, '12–20 kHz'],
    [20, 1000, '20 Hz–1 kHz'],
  ])('writes %i to %i as %s', (low, high, expected) => {
    expect(formatBandRange(low, high)).toBe(expected)
  })
})

describe('yFor', () => {
  it('puts the top of the scale at the top and the bottom at the bottom', () => {
    expect(yFor(10, scale, plot)).toBe(0)
    expect(yFor(0, scale, plot)).toBe(50)
    expect(yFor(-10, scale, plot)).toBe(100)
  })
})

describe('barFor', () => {
  it('grows a positive value upwards from the zero line', () => {
    expect(barFor(0, 2, 5, scale, plot)).toEqual({ x: 10, y: 25, width: 30, height: 25 })
  })

  it('grows a negative value downwards from the zero line', () => {
    expect(barFor(0, 2, -5, scale, plot)).toEqual({ x: 10, y: 50, width: 30, height: 25 })
  })

  it('moves the next band one slot to the right', () => {
    expect(barFor(1, 2, 5, scale, plot).x).toBe(60)
  })

  it('gives a value of 0 a bar of height 0', () => {
    expect(barFor(0, 2, 0, scale, plot).height).toBe(0)
  })
})
