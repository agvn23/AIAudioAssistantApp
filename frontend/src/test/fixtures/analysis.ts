/**
 * Made-up but realistic results for tests. They follow schema/metrics.schema.json
 * and the shape of the stored feedback. They are not measurements of a real
 * track: those stay in the git-ignored private folder.
 */
export const sampleMetrics = {
  schema_version: '0.1',
  file: {
    name: 'demo-track.wav',
    format: 'wav',
    duration_sec: 301.2,
    sample_rate_hz: 44100,
    bit_depth: 24,
    channels: 2,
  },
  loudness: {
    integrated_lufs: -12.8,
    loudness_range_lu: 6.2,
    true_peak_dbtp: -0.8,
    short_term_max_lufs: -10.4,
    momentary_max_lufs: -8.9,
    sample_peak_dbfs: -0.9,
    clipped_samples: 0,
  },
  dynamics: {
    rms_dbfs: -15.3,
    crest_factor_db: 13.2,
    dynamic_range_db: 9.4,
  },
  spectrum: {
    bands: [
      { name: 'sub', low_hz: 20, high_hz: 60, relative_db: 6.1 },
      { name: 'bass', low_hz: 60, high_hz: 250, relative_db: 5.4 },
      { name: 'low_mid', low_hz: 250, high_hz: 500, relative_db: 2.2 },
      { name: 'mid', low_hz: 500, high_hz: 2000, relative_db: -1.3 },
      { name: 'high_mid', low_hz: 2000, high_hz: 6000, relative_db: -3.1 },
      { name: 'high', low_hz: 6000, high_hz: 12000, relative_db: -5.8 },
      { name: 'air', low_hz: 12000, high_hz: 20000, relative_db: -8.6 },
    ],
    spectral_centroid_hz: 1450.5,
    tilt_db_per_octave: -4.2,
  },
  stereo: {
    phase_correlation: 0.71,
    width: 0.22,
    mono_compatible: true,
    is_mono: false,
    side_to_mid_db: -7.4,
  },
  context: {
    genre: 'house',
    target_platform: 'spotify',
    stage: 'mix',
  },
  tempo: {
    bpm: 124,
    confidence: 0.81,
    alternative_bpms: [62, 248],
  },
  key: {
    tonic: 'A',
    mode: 'minor',
    confidence: 0.64,
  },
  warnings: [{ code: 'tempo_key_truncated', message: 'tempo and key use the first 240 s only' }],
}

export const sampleFeedback = {
  summary:
    'A balanced mix with a slightly strong low end. Loudness is a little above the Spotify target and the true peak sits just over the usual ceiling.',
  items: [
    {
      area: 'loudness',
      priority: 'medium',
      observation:
        'Integrated loudness is -12.8 LUFS, which is 1.2 LU louder than the Spotify target of -14.0 LUFS.',
      suggestion:
        'Spotify turns louder tracks down, so the extra level gains nothing there. Consider leaving a little more headroom for the master.',
      evidence: [
        { metric: 'loudness.integrated_lufs', value: -12.8 },
        { metric: 'reference.integrated_lufs_difference', value: 1.2 },
      ],
    },
    {
      area: 'loudness',
      priority: 'medium',
      observation: 'The true peak is -0.8 dBTP, 0.2 dB above the -1.0 dBTP ceiling.',
      suggestion: 'Lower the output ceiling slightly to avoid inter-sample peaks after encoding.',
      evidence: [
        { metric: 'loudness.true_peak_dbtp', value: -0.8 },
        { metric: 'reference.true_peak_over_ceiling_db', value: 0.2 },
      ],
    },
    {
      area: 'spectrum',
      priority: 'low',
      observation:
        'The sub band sits at 6.1 dB relative to the average and the air band at -8.6 dB.',
      suggestion: 'If the top end feels dull next to your references, try a gentle high shelf.',
      evidence: [
        { metric: 'spectrum.bands.sub.relative_db', value: 6.1 },
        { metric: 'spectrum.bands.air.relative_db', value: -8.6 },
      ],
    },
  ],
  caveats: ['Tempo and key analysis used only the first 240 seconds of the audio file.'],
  meta: {
    model: 'gemini-3.5-flash',
    generated_at: '2026-11-10T12:00:00.000000Z',
    context_used: { genre: 'house', target_platform: 'spotify', stage: 'mix' },
    feedback_schema_version: 1,
  },
}
