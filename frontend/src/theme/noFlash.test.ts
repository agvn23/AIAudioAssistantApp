/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { themeStore } from './themeStore'

// Tests run from frontend/ (see the pwd check in the commands).
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

function runScript() {
  new Function(script)()
}

describe('the no-flash script in index.html', () => {
  it('is in the page head, before the app script', () => {
    expect(script).not.toBe('')
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('type="module"'))
  })

  it('uses the same storage key as the theme store', () => {
    themeStore.set('dark')

    const key = /getItem\('([^']+)'\)/.exec(script)?.[1]

    expect(key).toBeDefined()
    expect(localStorage.getItem(key ?? '')).toBe('dark')
  })

  it('applies a saved dark or light choice', () => {
    localStorage.setItem('aaa.theme', 'dark')
    runScript()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    localStorage.setItem('aaa.theme', 'light')
    runScript()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('leaves the attribute off for system, nothing saved or an unknown value', () => {
    localStorage.setItem('aaa.theme', 'system')
    runScript()
    expect(document.documentElement).not.toHaveAttribute('data-theme')

    localStorage.removeItem('aaa.theme')
    runScript()
    expect(document.documentElement).not.toHaveAttribute('data-theme')

    localStorage.setItem('aaa.theme', 'purple')
    runScript()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('does not throw when storage is unavailable', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('storage unavailable')
    }
    try {
      expect(() => runScript()).not.toThrow()
    } finally {
      Storage.prototype.getItem = original
    }
  })

  it('has a real page title', () => {
    expect(html).toContain('<title>AI Audio Assistant</title>')
  })
})
