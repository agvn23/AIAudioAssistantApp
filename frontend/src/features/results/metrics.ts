/**
 * The measurements of one analysis. The generated API types describe `metrics`
 * as a free-form object, so this module gives it a shape (mirroring
 * schema/metrics.schema.json, with the same snake_case names so that a path
 * cited by the AI feedback, such as "loudness.integrated_lufs", can be looked up
 * directly) and checks it at runtime.
 *
 * A required field that is missing or of the wrong type makes parseMetrics
 * return null. An optional field that is wrong is left out. Nothing is guessed
 * or filled in, and an unknown schema_version is still read by its shape.
 */

export interface FileInfo {
  name: string
  format?: string
  duration_sec: number
  sample_rate_hz: number
  bit_depth?: number | null
  channels: number
}

export interface Loudness {
  integrated_lufs: number
  true_peak_dbtp: number
  loudness_range_lu: number
  short_term_max_lufs?: number
  momentary_max_lufs?: number
  sample_peak_dbfs?: number
  clipped_samples?: number
}

export interface Dynamics {
  rms_dbfs: number
  crest_factor_db: number
  dynamic_range_db?: number
}

export interface Tempo {
  bpm: number | null
  confidence: number
  alternative_bpms: number[]
  variable_tempo?: boolean
}

export interface KeyAlternative {
  tonic: string
  mode: string
  confidence: number
}

export interface MusicalKey {
  tonic: string | null
  mode: string | null
  confidence: number
  alternatives: KeyAlternative[]
}

export interface SpectrumBand {
  name: string
  low_hz: number
  high_hz: number
  relative_db: number
}

export interface Spectrum {
  bands: SpectrumBand[]
  spectral_centroid_hz?: number
  tilt_db_per_octave?: number
}

export interface Stereo {
  phase_correlation: number
  width: number
  side_to_mid_db?: number
  mono_compatible?: boolean
  is_mono?: boolean
}

export interface MetricsContext {
  genre?: string
  target_platform?: string
  stage?: string
}

export interface MetricsWarning {
  code: string
  message: string
}

export interface Metrics {
  schema_version: string
  file: FileInfo
  loudness: Loudness
  dynamics: Dynamics
  tempo: Tempo
  key: MusicalKey
  spectrum: Spectrum
  stereo: Stereo
  context?: MetricsContext
  warnings: MetricsWarning[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const items: unknown[] = value
  return items.filter((item): item is number => readNumber(item) !== undefined)
}

function readFile(raw: unknown): FileInfo | undefined {
  if (!isRecord(raw)) return undefined
  const name = readString(raw.name)
  const duration = readNumber(raw.duration_sec)
  const sampleRate = readNumber(raw.sample_rate_hz)
  const channels = readNumber(raw.channels)
  if (
    name === undefined ||
    duration === undefined ||
    sampleRate === undefined ||
    channels === undefined
  ) {
    return undefined
  }
  return {
    name,
    format: readString(raw.format),
    duration_sec: duration,
    sample_rate_hz: sampleRate,
    bit_depth: raw.bit_depth === null ? null : readNumber(raw.bit_depth),
    channels,
  }
}

function readLoudness(raw: unknown): Loudness | undefined {
  if (!isRecord(raw)) return undefined
  const integrated = readNumber(raw.integrated_lufs)
  const truePeak = readNumber(raw.true_peak_dbtp)
  const range = readNumber(raw.loudness_range_lu)
  if (integrated === undefined || truePeak === undefined || range === undefined) return undefined
  return {
    integrated_lufs: integrated,
    true_peak_dbtp: truePeak,
    loudness_range_lu: range,
    short_term_max_lufs: readNumber(raw.short_term_max_lufs),
    momentary_max_lufs: readNumber(raw.momentary_max_lufs),
    sample_peak_dbfs: readNumber(raw.sample_peak_dbfs),
    clipped_samples: readNumber(raw.clipped_samples),
  }
}

function readDynamics(raw: unknown): Dynamics | undefined {
  if (!isRecord(raw)) return undefined
  const rms = readNumber(raw.rms_dbfs)
  const crest = readNumber(raw.crest_factor_db)
  if (rms === undefined || crest === undefined) return undefined
  return {
    rms_dbfs: rms,
    crest_factor_db: crest,
    dynamic_range_db: readNumber(raw.dynamic_range_db),
  }
}

function readTempo(raw: unknown): Tempo | undefined {
  if (!isRecord(raw)) return undefined
  const bpm = raw.bpm === null ? null : readNumber(raw.bpm)
  const confidence = readNumber(raw.confidence)
  if (bpm === undefined || confidence === undefined) return undefined
  return {
    bpm,
    confidence,
    alternative_bpms: readNumberList(raw.alternative_bpms),
    variable_tempo: readBoolean(raw.variable_tempo),
  }
}

function readKeyAlternatives(value: unknown): KeyAlternative[] {
  if (!Array.isArray(value)) return []
  const items: unknown[] = value
  const result: KeyAlternative[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const tonic = readString(item.tonic)
    const mode = readString(item.mode)
    const confidence = readNumber(item.confidence)
    if (tonic !== undefined && mode !== undefined && confidence !== undefined) {
      result.push({ tonic, mode, confidence })
    }
  }
  return result
}

function readKey(raw: unknown): MusicalKey | undefined {
  if (!isRecord(raw)) return undefined
  const tonic = raw.tonic === null ? null : readString(raw.tonic)
  const mode = raw.mode === null ? null : readString(raw.mode)
  const confidence = readNumber(raw.confidence)
  if (tonic === undefined || mode === undefined || confidence === undefined) return undefined
  return { tonic, mode, confidence, alternatives: readKeyAlternatives(raw.alternatives) }
}

function readSpectrum(raw: unknown): Spectrum | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.bands)) return undefined
  const items: unknown[] = raw.bands
  const bands: SpectrumBand[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const name = readString(item.name)
    const low = readNumber(item.low_hz)
    const high = readNumber(item.high_hz)
    const relative = readNumber(item.relative_db)
    if (name !== undefined && low !== undefined && high !== undefined && relative !== undefined) {
      bands.push({ name, low_hz: low, high_hz: high, relative_db: relative })
    }
  }
  if (bands.length === 0) return undefined
  return {
    bands,
    spectral_centroid_hz: readNumber(raw.spectral_centroid_hz),
    tilt_db_per_octave: readNumber(raw.tilt_db_per_octave),
  }
}

function readStereo(raw: unknown): Stereo | undefined {
  if (!isRecord(raw)) return undefined
  const correlation = readNumber(raw.phase_correlation)
  const width = readNumber(raw.width)
  if (correlation === undefined || width === undefined) return undefined
  return {
    phase_correlation: correlation,
    width,
    side_to_mid_db: readNumber(raw.side_to_mid_db),
    mono_compatible: readBoolean(raw.mono_compatible),
    is_mono: readBoolean(raw.is_mono),
  }
}

function readContext(raw: unknown): MetricsContext | undefined {
  if (!isRecord(raw)) return undefined
  return {
    genre: readString(raw.genre),
    target_platform: readString(raw.target_platform),
    stage: readString(raw.stage),
  }
}

function readWarnings(value: unknown): MetricsWarning[] {
  if (!Array.isArray(value)) return []
  const items: unknown[] = value
  const warnings: MetricsWarning[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const code = readString(item.code)
    const message = readString(item.message)
    if (code !== undefined && message !== undefined) warnings.push({ code, message })
  }
  return warnings
}

/** The checked measurements, or null when a required part is missing or malformed. */
export function parseMetrics(raw: unknown): Metrics | null {
  if (!isRecord(raw)) return null
  const schemaVersion = readString(raw.schema_version)
  const file = readFile(raw.file)
  const loudness = readLoudness(raw.loudness)
  const dynamics = readDynamics(raw.dynamics)
  const tempo = readTempo(raw.tempo)
  const key = readKey(raw.key)
  const spectrum = readSpectrum(raw.spectrum)
  const stereo = readStereo(raw.stereo)
  if (
    schemaVersion === undefined ||
    file === undefined ||
    loudness === undefined ||
    dynamics === undefined ||
    tempo === undefined ||
    key === undefined ||
    spectrum === undefined ||
    stereo === undefined
  ) {
    return null
  }
  return {
    schema_version: schemaVersion,
    file,
    loudness,
    dynamics,
    tempo,
    key,
    spectrum,
    stereo,
    context: readContext(raw.context),
    warnings: readWarnings(raw.warnings),
  }
}
