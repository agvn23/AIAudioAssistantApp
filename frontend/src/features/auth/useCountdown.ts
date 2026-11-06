import { useCallback, useEffect, useState } from 'react'

/**
 * Whole seconds left until a deadline, for "try again in N s" after a 429.
 * It works from timestamps, not by counting ticks, so a throttled background
 * tab still shows the right number when it wakes up.
 */
export function useCountdown(): { secondsLeft: number; start: (seconds: number) => void } {
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) setDeadline(null)
    }, 250)
    return () => clearInterval(id)
  }, [deadline])

  const start = useCallback((seconds: number) => {
    const current = Date.now()
    setNow(current)
    setDeadline(current + seconds * 1000)
  }, [])

  const secondsLeft = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
  return { secondsLeft, start }
}
