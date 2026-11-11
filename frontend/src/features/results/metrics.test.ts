import { describe, expect, it } from 'vitest'
import { sampleMetrics } from '../../test/fixtures/analysis'
import { parseMetrics } from './metrics'

type Json = Record<string, unknown>

function section(copy: Json, name: string): Json {
  const value = copy[name]
  if (typeof value !== 'object' || value === null) throw new Error(`No section ${name}`)
  return value as Json
}

/** A deep copy of the sample that a test may change freely. */
function changed(change: (copy: Json) => void): unknown {
  const copy = structuredClone(sampleMetrics) as Json
  change(copy)
  return copy
}

describe('parseMetrics', () => {
  it('reads a complete result', () => {
    const metrics = parseMetrics(sampleMetrics)

    expect(metrics).not.toBeNull()
    expect(metrics?.schema_version).toBe('0.1')
    expect(metrics?.file).toEqual({
      name: 'demo-track.wav',
      format: 'wav',
      duration_sec: 301.2,
      sample_rate_hz: 44100,
      bit_depth: 24,
      channels: 2,
    })
    expect(metrics?.loudness.integrated_lufs).toBe(-12.8)
    expect(metrics?.loudness.true_peak_dbtp).toBe(-0.8)
    expect(metrics?.loudness.loudness_range_lu).toBe(6.2)
    expect(metrics?.loudness.clipped_samples).toBe(0)
    expect(metrics?.dynamics).toEqual({
      rms_dbfs: -15.3,
      crest_factor_db: 13.2,
      dynamic_range_db: 9.4,
    })
    expect(metrics?.tempo).toEqual({
      bpm: 124,
      confidence: 0.81,
      alternative_bpms: [62, 248],
    })
    expect(metrics?.key).toEqual({ tonic: 'A', mode: 'minor', confidence: 0.64, alternatives: [] })
    expect(metrics?.spectrum.bands).toHaveLength(7)
    expect(metrics?.spectrum.bands[0]).toEqual({
      name: 'sub',
      low_hz: 20,
      high_hz: 60,
      relative_db: 6.1,
    })
    expect(metrics?.spectrum.spectral_centroid_hz).toBe(1450.5)
    expect(metrics?.stereo.width).toBe(0.22)
    expect(metrics?.stereo.mono_compatible).toBe(true)
    expect(metrics?.context).toEqual({ genre: 'house', target_platform: 'spotify', stage: 'mix' })
    expect(metrics?.warnings).toEqual([
      { code: 'tempo_key_truncated', message: 'tempo and key use the first 240 s only' },
    ])
  })

  it.each([null, undefined, 'metrics', 42, [], true])('returns null for %s', (value) => {
    expect(parseMetrics(value)).toBeNull()
  })

  it.each(['file', 'loudness', 'dynamics', 'tempo', 'key', 'spectrum', 'stereo'])(
    'returns null when the %s section is missing',
    (name) => {
      const raw = changed((copy) => {
        delete copy[name]
      })
      expect(parseMetrics(raw)).toBeNull()
    },
  )

  it('returns null without a schema_version', () => {
    const raw = changed((copy) => {
      delete copy.schema_version
    })
    expect(parseMetrics(raw)).toBeNull()
  })

  it('still reads a schema_version it does not know, by its shape', () => {
    const raw = changed((copy) => {
      copy.schema_version = '9.9'
    })
    expect(parseMetrics(raw)?.schema_version).toBe('9.9')
  })

  it('returns null when a required number has the wrong type', () => {
    const raw = changed((copy) => {
      section(copy, 'loudness').integrated_lufs = '-12.8'
    })
    expect(parseMetrics(raw)).toBeNull()
  })

  it('returns null for a number that is not finite', () => {
    const raw = changed((copy) => {
      section(copy, 'dynamics').rms_dbfs = null
    })
    expect(parseMetrics(raw)).toBeNull()
  })

  it('accepts a missing tempo and a missing key', () => {
    const raw = changed((copy) => {
      section(copy, 'tempo').bpm = null
      section(copy, 'key').tonic = null
      section(copy, 'key').mode = null
    })
    const metrics = parseMetrics(raw)

    expect(metrics?.tempo.bpm).toBeNull()
    expect(metrics?.key.tonic).toBeNull()
    expect(metrics?.key.mode).toBeNull()
  })

  it('returns null when the tempo is neither a number nor null', () => {
    const raw = changed((copy) => {
      section(copy, 'tempo').bpm = 'fast'
    })
    expect(parseMetrics(raw)).toBeNull()
  })

  it('keeps a null bit depth and leaves out an optional field of the wrong type', () => {
    const raw = changed((copy) => {
      section(copy, 'file').bit_depth = null
      section(copy, 'dynamics').dynamic_range_db = 'wide'
      delete section(copy, 'loudness').clipped_samples
    })
    const metrics = parseMetrics(raw)

    expect(metrics?.file.bit_depth).toBeNull()
    expect(metrics?.dynamics.dynamic_range_db).toBeUndefined()
    expect(metrics?.loudness.clipped_samples).toBeUndefined()
    expect(metrics?.dynamics.rms_dbfs).toBe(-15.3)
  })

  it('skips an invalid band and keeps the valid ones', () => {
    const raw = changed((copy) => {
      const spectrum = section(copy, 'spectrum')
      spectrum.bands = [
        { name: 'sub', low_hz: 20, high_hz: 60, relative_db: 6.1 },
        { name: 'bass', low_hz: 60, high_hz: 250 },
        'not a band',
      ]
    })
    const metrics = parseMetrics(raw)

    expect(metrics?.spectrum.bands).toEqual([
      { name: 'sub', low_hz: 20, high_hz: 60, relative_db: 6.1 },
    ])
  })

  it('returns null when no band is valid or the bands are not a list', () => {
    const noValid = changed((copy) => {
      section(copy, 'spectrum').bands = [{ name: 'sub' }]
    })
    const notAList = changed((copy) => {
      section(copy, 'spectrum').bands = 'none'
    })

    expect(parseMetrics(noValid)).toBeNull()
    expect(parseMetrics(notAList)).toBeNull()
  })

  it('keeps only the numbers in alternative_bpms and defaults to an empty list', () => {
    const mixed = changed((copy) => {
      section(copy, 'tempo').alternative_bpms = [62, 'x', 248, null]
    })
    const absent = changed((copy) => {
      delete section(copy, 'tempo').alternative_bpms
    })

    expect(parseMetrics(mixed)?.tempo.alternative_bpms).toEqual([62, 248])
    expect(parseMetrics(absent)?.tempo.alternative_bpms).toEqual([])
  })

  it('keeps only the valid key alternatives', () => {
    const raw = changed((copy) => {
      section(copy, 'key').alternatives = [
        { tonic: 'C', mode: 'major', confidence: 0.3 },
        { tonic: 'D' },
        7,
      ]
    })

    expect(parseMetrics(raw)?.key.alternatives).toEqual([
      { tonic: 'C', mode: 'major', confidence: 0.3 },
    ])
  })

  it('keeps only the valid warnings and defaults to an empty list', () => {
    const mixed = changed((copy) => {
      copy.warnings = [{ code: 'short_file', message: 'Very short file' }, { code: 'x' }, 'text']
    })
    const absent = changed((copy) => {
      delete copy.warnings
    })

    expect(parseMetrics(mixed)?.warnings).toEqual([
      { code: 'short_file', message: 'Very short file' },
    ])
    expect(parseMetrics(absent)?.warnings).toEqual([])
  })

  it('leaves the context out when there is none', () => {
    const raw = changed((copy) => {
      delete copy.context
    })

    expect(parseMetrics(raw)?.context).toBeUndefined()
  })

  it('ignores fields it does not know', () => {
    const raw = changed((copy) => {
      copy.something_new = { a: 1 }
      section(copy, 'stereo').extra = true
    })

    expect(parseMetrics(raw)).not.toBeNull()
  })
})
