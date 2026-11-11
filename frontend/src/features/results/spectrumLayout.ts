import { formatNumber } from './format'

/** The y-axis of the chart: whole-dB bounds that always include 0, and the tick values. */
export interface Scale {
  min: number
  max: number
  ticks: number[]
}

/** The drawing area inside the SVG, in viewBox units. */
export interface Plot {
  left: number
  top: number
  width: number
  height: number
}

export interface Bar {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Bounds and ticks for a set of dB values. 0 is always inside (it is the pink-noise
 * reference and the base of every bar). Steps are 5 dB, or 10 dB when the span is
 * more than 30 dB.
 */
export function niceScale(values: number[]): Scale {
  const lowest = Math.min(0, ...values)
  const highest = Math.max(0, ...values)
  const step = highest - lowest <= 30 ? 5 : 10
  const min = Math.floor(lowest / step) * step + 0
  let max = Math.ceil(highest / step) * step + 0
  if (max === min) max = min + step

  const ticks: number[] = []
  for (let tick = min; tick <= max; tick += step) ticks.push(tick)
  return { min, max, ticks }
}

/** The y coordinate of a dB value: max at the top of the plot, min at the bottom. */
export function yFor(value: number, scale: Scale, plot: Plot): number {
  return plot.top + ((scale.max - value) / (scale.max - scale.min)) * plot.height
}

/** The rectangle of one band's bar. It starts at the 0 dB line and goes up or down. */
export function barFor(index: number, count: number, value: number, scale: Scale, plot: Plot): Bar {
  const slot = plot.width / count
  const width = slot * 0.6
  const zeroY = yFor(0, scale, plot)
  const valueY = yFor(value, scale, plot)
  return {
    x: plot.left + slot * index + (slot - width) / 2,
    y: Math.min(zeroY, valueY),
    width,
    height: Math.abs(zeroY - valueY),
  }
}

/** "60–250 Hz", "500 Hz–2 kHz", "2–6 kHz". */
export function formatBandRange(lowHz: number, highHz: number): string {
  if (highHz < 1000) return `${formatNumber(lowHz)}–${formatNumber(highHz)} Hz`
  if (lowHz >= 1000) return `${formatNumber(lowHz / 1000)}–${formatNumber(highHz / 1000)} kHz`
  return `${formatNumber(lowHz)} Hz–${formatNumber(highHz / 1000)} kHz`
}
