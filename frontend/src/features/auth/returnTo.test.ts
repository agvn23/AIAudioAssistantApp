import { describe, expect, it } from 'vitest'
import { buildLoginUrl, DEFAULT_RETURN_TO, isAuthPath, safeReturnTo } from './returnTo'

describe('safeReturnTo', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeReturnTo('/tracks')).toBe('/tracks')
    expect(safeReturnTo('/tracks/3?tag=house&limit=20#top')).toBe(
      '/tracks/3?tag=house&limit=20#top',
    )
    expect(safeReturnTo('/analyses/7')).toBe('/analyses/7')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['relative', 'tracks'],
    ['absolute URL', 'https://evil.example/tracks'],
    ['protocol-relative', '//evil.example'],
    ['backslash host', '/\\evil.example'],
    ['tab inside slashes', '/\t/evil.example'],
    ['javascript URL', 'javascript:alert(1)'],
  ])('falls back for %s', (_label, value) => {
    expect(safeReturnTo(value)).toBe(DEFAULT_RETURN_TO)
  })

  it('falls back for the login and register pages so it cannot loop', () => {
    expect(safeReturnTo('/login')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('/login/')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('/login?returnTo=%2Ftracks')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('/register')).toBe(DEFAULT_RETURN_TO)
  })

  it('uses a custom fallback when given', () => {
    expect(safeReturnTo('//evil.example', '/account')).toBe('/account')
  })
})

describe('isAuthPath', () => {
  it('matches login and register only', () => {
    expect(isAuthPath('/login')).toBe(true)
    expect(isAuthPath('/register/')).toBe(true)
    expect(isAuthPath('/tracks')).toBe(false)
    expect(isAuthPath('/login-help')).toBe(false)
  })
})

describe('buildLoginUrl', () => {
  function parse(url: string) {
    const parsed = new URL(url, 'http://app.test')
    return { pathname: parsed.pathname, params: parsed.searchParams }
  }

  it('is plain /login when there is nothing to return to', () => {
    expect(buildLoginUrl('/tracks')).toBe('/login')
    expect(buildLoginUrl(null)).toBe('/login')
  })

  it('carries the return path, query and hash intact', () => {
    const { pathname, params } = parse(buildLoginUrl('/tracks/5?tag=house#x'))
    expect(pathname).toBe('/login')
    expect(params.get('returnTo')).toBe('/tracks/5?tag=house#x')
    expect(params.has('reason')).toBe(false)
  })

  it('adds reason=expired', () => {
    expect(buildLoginUrl('/tracks', { expired: true })).toBe('/login?reason=expired')
    const { params } = parse(buildLoginUrl('/account', { expired: true }))
    expect(params.get('returnTo')).toBe('/account')
    expect(params.get('reason')).toBe('expired')
  })

  it('drops an unsafe return path', () => {
    expect(buildLoginUrl('//evil.example')).toBe('/login')
  })
})
