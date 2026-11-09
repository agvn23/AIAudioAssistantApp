import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH,
  PAGE_SIZE,
  pageCount,
  parseTracksSearch,
  toListQuery,
  toSearchParams,
  updateSearch,
} from './tracksSearch'

describe('parseTracksSearch', () => {
  it('returns the default for an empty URL', () => {
    expect(parseTracksSearch(new URLSearchParams())).toEqual(DEFAULT_SEARCH)
  })

  it('reads and cleans each parameter', () => {
    const params = new URLSearchParams('q=  warm pad &genre=house&tag=Deep%20%20HOUSE&page=3')
    expect(parseTracksSearch(params)).toEqual({
      q: 'warm pad',
      genre: 'house',
      tag: 'deep house',
      page: 3,
    })
  })

  it.each(['0', '-2', 'abc', '1.5', '', '99999999999999999999'])(
    'falls back to page 1 for %j',
    (raw) => {
      expect(parseTracksSearch(new URLSearchParams({ page: raw })).page).toBe(1)
    },
  )
})

describe('toSearchParams', () => {
  it('omits empty values and page 1', () => {
    expect(toSearchParams(DEFAULT_SEARCH).toString()).toBe('')
  })

  it('writes everything that is set', () => {
    const params = toSearchParams({ q: 'a b', genre: 'house', tag: 'demo', page: 2 })
    expect(params.get('q')).toBe('a b')
    expect(params.get('genre')).toBe('house')
    expect(params.get('tag')).toBe('demo')
    expect(params.get('page')).toBe('2')
  })

  it('round-trips through parseTracksSearch', () => {
    const search = { q: '100% & more_', genre: 'drum & bass', tag: 'club mix', page: 4 }
    const url = new URLSearchParams(toSearchParams(search).toString())
    expect(parseTracksSearch(url)).toEqual(search)
  })
})

describe('updateSearch', () => {
  const current = { q: 'x', genre: '', tag: '', page: 5 }

  it('goes back to page 1 when a filter changes', () => {
    expect(updateSearch(current, { genre: 'house' })).toEqual({
      q: 'x',
      genre: 'house',
      tag: '',
      page: 1,
    })
  })

  it('keeps an explicit page', () => {
    expect(updateSearch(current, { page: 6 }).page).toBe(6)
  })
})

describe('toListQuery', () => {
  it('sends only limit and offset when no filter is set', () => {
    expect(toListQuery(DEFAULT_SEARCH)).toEqual({ limit: PAGE_SIZE, offset: 0 })
  })

  it('turns the page into an offset and includes set filters', () => {
    expect(toListQuery({ q: 'a', genre: 'house', tag: 'demo', page: 3 })).toEqual({
      q: 'a',
      genre: 'house',
      tag: 'demo',
      limit: PAGE_SIZE,
      offset: 2 * PAGE_SIZE,
    })
  })
})

describe('pageCount', () => {
  it('is at least 1', () => {
    expect(pageCount(0)).toBe(1)
  })

  it('rounds up', () => {
    expect(pageCount(PAGE_SIZE)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
  })
})
