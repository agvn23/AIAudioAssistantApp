/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does not load CSS modules, so read the file from disk. Tests run from
// frontend/ (see the pwd check in the commands).
const css = readFileSync(join(process.cwd(), 'src/features/tracks/TracksPage.module.css'), 'utf8')

/** The lowest opacity at which muted text still reaches 4.5:1 in both themes (checked at 0.9). */
const MIN_OPACITY = 0.9

describe('the dimmed track list', () => {
  it('has a rule for the busy state', () => {
    expect(css).toContain(".list[aria-busy='true']")
  })

  it('does not dim below the level that keeps text readable', () => {
    const block = /\.list\[aria-busy=['"]true['"]\]\s*\{([^}]*)\}/.exec(css)
    const opacity = /opacity:\s*([0-9.]+)/.exec(block?.[1] ?? '')?.[1]

    expect(opacity).toBeDefined()
    expect(Number(opacity)).toBeGreaterThanOrEqual(MIN_OPACITY)
  })
})
