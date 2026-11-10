import { describe, expect, it } from 'vitest'
import { tokenStore } from '../../api/token'
import { clearRememberedFiles, forgetFile, getRememberedFile, rememberFile } from './sessionFiles'

const wav = new File(['abc'], 'mix.wav', { type: 'audio/wav' })
const flac = new File(['def'], 'mix.flac', { type: 'audio/flac' })

describe('sessionFiles', () => {
  it('returns the file that was remembered for an analysis', () => {
    rememberFile(7, wav)

    expect(getRememberedFile(7)).toBe(wav)
  })

  it('returns nothing for an analysis it does not know', () => {
    expect(getRememberedFile(999)).toBeUndefined()
  })

  it('keeps files of different analyses apart', () => {
    rememberFile(1, wav)
    rememberFile(2, flac)

    expect(getRememberedFile(1)).toBe(wav)
    expect(getRememberedFile(2)).toBe(flac)
  })

  it('forgets one file', () => {
    rememberFile(1, wav)
    rememberFile(2, flac)

    forgetFile(1)

    expect(getRememberedFile(1)).toBeUndefined()
    expect(getRememberedFile(2)).toBe(flac)
  })

  it('forgets everything on request', () => {
    rememberFile(1, wav)
    rememberFile(2, flac)

    clearRememberedFiles()

    expect(getRememberedFile(1)).toBeUndefined()
    expect(getRememberedFile(2)).toBeUndefined()
  })

  it('forgets everything when the token is cleared', () => {
    tokenStore.set('tok-1')
    rememberFile(1, wav)

    tokenStore.clear()

    expect(getRememberedFile(1)).toBeUndefined()
  })

  it('keeps the files while a token is being set', () => {
    rememberFile(1, wav)

    tokenStore.set('tok-2')

    expect(getRememberedFile(1)).toBe(wav)
  })
})
