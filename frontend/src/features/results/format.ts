/**
 * Text for measurements. Values are shown as the server stored them (rounded to
 * at most two decimals, no trailing zeros), so a card never disagrees with the
 * number the AI feedback quotes.
 */

export function formatNumber(value: number): string {
  // Number() drops trailing zeros and turns "-0.00" into 0.
  return String(Number(value.toFixed(2)))
}

export function formatLufs(value: number): string {
  return `${formatNumber(value)} LUFS`
}

export function formatLu(value: number): string {
  return `${formatNumber(value)} LU`
}

export function formatDb(value: number): string {
  return `${formatNumber(value)} dB`
}

export function formatDbfs(value: number): string {
  return `${formatNumber(value)} dBFS`
}

export function formatDbtp(value: number): string {
  return `${formatNumber(value)} dBTP`
}

/** 227.19 becomes "227.19 Hz", 12000 becomes "12 kHz", 44100 becomes "44.1 kHz". */
export function formatHz(value: number): string {
  if (value >= 1000) return `${formatNumber(value / 1000)} kHz`
  return `${formatNumber(value)} Hz`
}

/** A confidence between 0 and 1 as a whole percentage. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/** Minutes and seconds, with hours only when needed: "4:29", "1:02:05". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
  return `${minutes}:${secs}`
}

export function formatBpm(bpm: number | null): string {
  return bpm === null ? 'Not detected' : `${formatNumber(bpm)} BPM`
}

export function formatKey(tonic: string | null, mode: string | null): string {
  const parts = [tonic, mode].filter((part): part is string => part !== null && part !== '')
  return parts.length === 0 ? 'Not detected' : parts.join(' ')
}

/** "low_mid" becomes "Low mid". */
export function formatBandName(name: string): string {
  const spaced = name.replace(/_/g, ' ').trim()
  if (spaced === '') return name
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function formatChannels(channels: number): string {
  if (channels === 1) return 'Mono'
  if (channels === 2) return 'Stereo'
  return `${channels} channels`
}
