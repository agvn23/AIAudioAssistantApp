/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest swaps plain CSS imports for an empty string, so read the file from
// disk. Tests run from frontend/ (see the pwd check in the commands).
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')

function declarations(block: string): string[] {
  return block
    .split(';')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part !== '')
    .sort()
}

const mediaBlock =
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme=['"]light['"]\]\)\s*\{([^}]*)\}/.exec(
    css,
  )
const attributeBlock = /:root\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/.exec(css)

describe('theme tokens', () => {
  it('reads the stylesheet', () => {
    expect(css).toContain('--color-bg')
  })

  it('has a dark token block for the OS setting and one for the data-theme override', () => {
    expect(mediaBlock).not.toBeNull()
    expect(attributeBlock).not.toBeNull()
    expect(declarations(mediaBlock?.[1] ?? '').length).toBeGreaterThan(5)
    expect(declarations(attributeBlock?.[1] ?? '').length).toBeGreaterThan(5)
  })

  it('keeps the two dark token blocks identical', () => {
    const fromMedia = declarations(mediaBlock?.[1] ?? '')
    const fromAttribute = declarations(attributeBlock?.[1] ?? '')

    expect(fromMedia.length).toBeGreaterThan(5)
    expect(fromAttribute).toEqual(fromMedia)
  })
})
