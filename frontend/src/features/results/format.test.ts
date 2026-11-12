import { describe, expect, it } from 'vitest'
import {
  formatIdentifier,
  formatBpm,
  formatChannels,
  formatDb,
  formatDbfs,
  formatDbtp,
  formatDuration,
  formatHz,
  formatKey,
  formatLu,
  formatLufs,
  formatNumber,
  formatPercent,
} from './format'

describe('formatNumber', () => {
  it('keeps up to two decimals and drops trailing zeros', () => {
    expect(formatNumber(-19.1)).toBe('-19.1')
    expect(formatNumber(10.68)).toBe('10.68')
    expect(formatNumber(5)).toBe('5')
    expect(formatNumber(5.0)).toBe('5')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
  })

  it('rounds beyond two decimals', () => {
    expect(formatNumber(1.4567)).toBe('1.46')
  })

  it('does not show a minus sign for a value that rounds to zero', () => {
    expect(formatNumber(-0.004)).toBe('0')
  })
})

describe('units', () => {
  it('adds the unit of each measurement', () => {
    expect(formatLufs(-19.1)).toBe('-19.1 LUFS')
    expect(formatLu(5.7)).toBe('5.7 LU')
    expect(formatDb(10.68)).toBe('10.68 dB')
    expect(formatDbfs(-20.1)).toBe('-20.1 dBFS')
    expect(formatDbtp(-1.6)).toBe('-1.6 dBTP')
  })
})

describe('formatHz', () => {
  it('uses Hz below 1000 and kHz from 1000', () => {
    expect(formatHz(20)).toBe('20 Hz')
    expect(formatHz(250)).toBe('250 Hz')
    expect(formatHz(227.19)).toBe('227.19 Hz')
    expect(formatHz(2000)).toBe('2 kHz')
    expect(formatHz(12000)).toBe('12 kHz')
    expect(formatHz(44100)).toBe('44.1 kHz')
    expect(formatHz(1450.5)).toBe('1.45 kHz')
  })
})

describe('formatPercent', () => {
  it('shows a whole percentage', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(0.42)).toBe('42%')
    expect(formatPercent(0.89)).toBe('89%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('formatDuration', () => {
  it('shows minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(268.93)).toBe('4:29')
    expect(formatDuration(301.2)).toBe('5:01')
  })

  it('carries a rounded-up minute', () => {
    expect(formatDuration(59.6)).toBe('1:00')
  })

  it('shows hours only when needed', () => {
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('treats a negative duration as zero', () => {
    expect(formatDuration(-5)).toBe('0:00')
  })
})

describe('formatBpm', () => {
  it('shows the tempo or says it was not detected', () => {
    expect(formatBpm(111.9)).toBe('111.9 BPM')
    expect(formatBpm(124)).toBe('124 BPM')
    expect(formatBpm(null)).toBe('Not detected')
  })
})

describe('formatKey', () => {
  it('shows tonic and mode, or says it was not detected', () => {
    expect(formatKey('E', 'major')).toBe('E major')
    expect(formatKey('C#', 'minor')).toBe('C# minor')
    expect(formatKey(null, null)).toBe('Not detected')
    expect(formatKey('A', null)).toBe('A')
  })
})

describe('formatIdentifier', () => {
  it('capitalises the first letter and replaces underscores', () => {
    expect(formatIdentifier('sub')).toBe('Sub')
    expect(formatIdentifier('low_mid')).toBe('Low mid')
    expect(formatIdentifier('high_mid')).toBe('High mid')
  })

  it('returns an empty name unchanged', () => {
    expect(formatIdentifier('')).toBe('')
  })
})

describe('formatChannels', () => {
  it('names mono and stereo', () => {
    expect(formatChannels(1)).toBe('Mono')
    expect(formatChannels(2)).toBe('Stereo')
    expect(formatChannels(6)).toBe('6 channels')
  })
})
