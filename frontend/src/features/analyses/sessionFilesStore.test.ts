import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearRememberedFiles, forgetFile, rememberFile, subscribeToFiles } from './sessionFiles'

const file = new File(['abc'], 'mix2.wav', { type: 'audio/wav' })

afterEach(() => {
  clearRememberedFiles()
})

describe('the remembered files store', () => {
  it('notifies subscribers when a file is remembered', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToFiles(listener)

    rememberFile(7, file)

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('notifies when a file is forgotten, but not when there was none', () => {
    rememberFile(7, file)
    const listener = vi.fn()
    const unsubscribe = subscribeToFiles(listener)

    forgetFile(8)
    expect(listener).not.toHaveBeenCalled()

    forgetFile(7)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('notifies when all files are cleared, but not when the store is already empty', () => {
    rememberFile(7, file)
    const listener = vi.fn()
    const unsubscribe = subscribeToFiles(listener)

    clearRememberedFiles()
    expect(listener).toHaveBeenCalledTimes(1)

    clearRememberedFiles()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToFiles(listener)
    unsubscribe()

    rememberFile(7, file)

    expect(listener).not.toHaveBeenCalled()
  })
})
