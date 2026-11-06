import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from './useCountdown'

afterEach(() => {
  vi.useRealTimers()
})

describe('useCountdown', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCountdown())

    expect(result.current.secondsLeft).toBe(0)
  })

  it('counts down to zero and stops', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCountdown())

    act(() => result.current.start(3))
    expect(result.current.secondsLeft).toBe(3)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(2)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(0)
  })

  it('restarting replaces the previous countdown', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCountdown())

    act(() => result.current.start(10))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(8)

    act(() => result.current.start(3))
    expect(result.current.secondsLeft).toBe(3)
  })
})
