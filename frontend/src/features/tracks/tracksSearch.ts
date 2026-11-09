import { normaliseTag } from './tagRules'

export const PAGE_SIZE = 20

/** The list's whole state. It lives in the URL, so links are shareable. */
export interface TracksSearch {
  q: string
  genre: string
  tag: string
  /** 1-based. */
  page: number
}

export const DEFAULT_SEARCH: TracksSearch = { q: '', genre: '', tag: '', page: 1 }

function parsePage(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw.trim())) return 1
  const page = Number(raw.trim())
  return Number.isSafeInteger(page) && page >= 1 ? page : 1
}

/** Reads the list state from the URL. Anything invalid falls back to the default. */
export function parseTracksSearch(params: URLSearchParams): TracksSearch {
  return {
    q: (params.get('q') ?? '').trim(),
    genre: (params.get('genre') ?? '').trim(),
    tag: normaliseTag(params.get('tag') ?? ''),
    page: parsePage(params.get('page')),
  }
}

/** Writes the list state to the URL. Empty values and page 1 are left out, so the URL stays short. */
export function toSearchParams(search: TracksSearch): URLSearchParams {
  const params = new URLSearchParams()
  if (search.q !== '') params.set('q', search.q)
  if (search.genre !== '') params.set('genre', search.genre)
  if (search.tag !== '') params.set('tag', search.tag)
  if (search.page > 1) params.set('page', String(search.page))
  return params
}

/** Applies a change. Changing a filter goes back to page 1 unless a page is given too. */
export function updateSearch(current: TracksSearch, changes: Partial<TracksSearch>): TracksSearch {
  const next = { ...current, ...changes }
  if (changes.page === undefined) next.page = 1
  return next
}

export interface TracksListQuery {
  q?: string
  genre?: string
  tag?: string
  limit: number
  offset: number
}

/** The query for GET /tracks. Empty filters are omitted, not sent as empty strings. */
export function toListQuery(search: TracksSearch): TracksListQuery {
  const query: TracksListQuery = { limit: PAGE_SIZE, offset: (search.page - 1) * PAGE_SIZE }
  if (search.q !== '') query.q = search.q
  if (search.genre !== '') query.genre = search.genre
  if (search.tag !== '') query.tag = search.tag
  return query
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}
