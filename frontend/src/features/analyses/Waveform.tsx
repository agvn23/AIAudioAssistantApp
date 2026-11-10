import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Button } from '../../components/Button'
import styles from './Waveform.module.css'

type Phase = 'loading' | 'ready' | 'error'

/** wavesurfer needs real colour values, so read the tokens once, with fallbacks. */
function readColor(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

export interface WaveformProps {
  file: File
}

/**
 * Draws the waveform of a file from this computer and plays it. The file never
 * leaves the browser. Key it by the analysis id: it creates one player for one
 * file and destroys it on unmount.
 */
export function Waveform({ file }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<WaveSurfer | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    const player = WaveSurfer.create({
      container,
      height: 96,
      waveColor: readColor(container, '--color-muted', '#595959'),
      progressColor: readColor(container, '--color-accent', '#0b57d0'),
      cursorColor: readColor(container, '--color-text', '#1a1a1a'),
    })
    playerRef.current = player

    player.on('ready', () => setPhase('ready'))
    player.on('error', () => setPhase('error'))
    player.on('play', () => setPlaying(true))
    player.on('pause', () => setPlaying(false))
    player.on('finish', () => setPlaying(false))
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

  function togglePlay() {
    playerRef.current?.playPause().catch(() => setPlaying(false))
  }

  let message = ''
  if (phase === 'loading') message = 'Drawing the waveform…'
  if (phase === 'error') {
    message = 'The browser could not draw a waveform for this file. The analysis is not affected.'
  }

  return (
    <div className={styles.waveform}>
      <div ref={containerRef} role="img" aria-label={`Waveform of ${file.name}`} />
      <div className={styles.controls}>
        <Button onClick={togglePlay} disabled={phase !== 'ready'}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <div role="status" className={styles.note}>
          {message}
        </div>
      </div>
    </div>
  )
}
