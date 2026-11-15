import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Button } from '../../components/Button'
import { themeStore, type ResolvedTheme } from '../../theme/themeStore'
import { formatDuration } from '../results/format'
import styles from './Waveform.module.css'

type Phase = 'loading' | 'ready' | 'error'

/** What Page Up and Page Down move. The arrow keys move 1 second, the slider's step. */
const PAGE_SECONDS = 10

/** wavesurfer needs real colour values, so read the tokens, with fallbacks. */
function readColor(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

function readColors(element: HTMLElement) {
  return {
    waveColor: readColor(element, '--color-muted', '#595959'),
    progressColor: readColor(element, '--color-accent', '#0b57d0'),
    cursorColor: readColor(element, '--color-text', '#1a1a1a'),
  }
}

export interface WaveformProps {
  file: File
}

/**
 * Draws the waveform of a file from this computer and plays it. The file never
 * leaves the browser. Key it by the analysis id: it creates one player for one
 * file and destroys it on unmount. A theme change repaints the same player. A
 * position slider lets the keyboard seek, in whole seconds.
 */
export function Waveform({ file }: WaveformProps) {
  const sliderId = useId()
  const hintId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<WaveSurfer | null>(null)
  const paintedThemeRef = useRef<ResolvedTheme | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.resolved)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    const player = WaveSurfer.create({
      container,
      height: 96,
      ...readColors(container),
    })
    playerRef.current = player
    paintedThemeRef.current = themeStore.resolved()

    player.on('ready', () => {
      setDuration(player.getDuration())
      setPhase('ready')
    })
    player.on('error', () => setPhase('error'))
    player.on('play', () => setPlaying(true))
    player.on('pause', () => setPlaying(false))
    player.on('finish', () => setPlaying(false))
    // Whole seconds only: React skips the render when the value did not change.
    player.on('timeupdate', (time) => setPosition(Math.floor(time)))
    player.on('seeking', (time) => setPosition(Math.floor(time)))
    player.loadBlob(file).catch(() => {
      // A player destroyed during cleanup rejects its load: not an error for the person.
      if (!cancelled) setPhase('error')
    })

    return () => {
      cancelled = true
      playerRef.current = null
      player.destroy()
    }
  }, [file])

  useEffect(() => {
    const player = playerRef.current
    const container = containerRef.current
    if (!player || !container) return
    if (paintedThemeRef.current === theme) return
    paintedThemeRef.current = theme
    player.setOptions(readColors(container))
  }, [theme])

  const maxSeconds = Math.floor(duration)

  function togglePlay() {
    playerRef.current?.playPause().catch(() => setPlaying(false))
  }

  function seekTo(seconds: number) {
    const next = Math.min(Math.max(0, Math.round(seconds)), maxSeconds)
    setPosition(next)
    playerRef.current?.setTime(next)
  }

  function onSliderChange(event: ChangeEvent<HTMLInputElement>) {
    seekTo(Number(event.target.value))
  }

  function onSliderKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'PageUp' && event.key !== 'PageDown') return
    // Handled here so the jump is the same in every browser.
    event.preventDefault()
    seekTo(position + (event.key === 'PageUp' ? PAGE_SECONDS : -PAGE_SECONDS))
  }

  let message = ''
  if (phase === 'loading') message = 'Drawing the waveform…'
  if (phase === 'error') {
    message = 'The browser could not draw a waveform for this file. The analysis is not affected.'
  }

  const shown = Math.min(position, maxSeconds)
  const total = formatDuration(maxSeconds)

  return (
    <div className={styles.waveform}>
      <div ref={containerRef} role="img" aria-label={`Waveform of ${file.name}`} />
      <div className={styles.controls}>
        <Button onClick={togglePlay} disabled={phase !== 'ready'}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <div className={styles.position}>
          <label htmlFor={sliderId} className={styles.positionLabel}>
            Position
          </label>
          <input
            id={sliderId}
            type="range"
            className={styles.slider}
            min={0}
            max={maxSeconds}
            step={1}
            value={shown}
            disabled={phase !== 'ready'}
            aria-valuetext={`${formatDuration(shown)} of ${total}`}
            aria-describedby={hintId}
            onChange={onSliderChange}
            onKeyDown={onSliderKeyDown}
          />
          <span aria-hidden="true" className={styles.time}>
            {`${formatDuration(shown)} / ${total}`}
          </span>
        </div>
        <div role="status" className={styles.note}>
          {message}
        </div>
      </div>
      <p id={hintId} className={styles.hint}>
        Arrow keys move 1 second. Page Up and Page Down move 10 seconds.
      </p>
    </div>
  )
}
