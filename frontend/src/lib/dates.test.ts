import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './dates'

const iso = '2026-11-10T09:30:00Z'

describe('formatDateTime', () => {
  it('shows a medium date and a short time', () => {
    const expected = new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    expect(formatDateTime(iso)).toBe(expected)
  })

  it('shows more than the date alone', () => {
    expect(formatDateTime(iso).length).toBeGreaterThan(formatDate(iso).length)
  })

  it('returns unreadable input as it was', () => {
    expect(formatDateTime('not a date')).toBe('not a date')
  })
})

describe('formatDate', () => {
  it('shows a medium date only', () => {
    const expected = new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })

    expect(formatDate(iso)).toBe(expected)
  })

  it('returns unreadable input as it was', () => {
    expect(formatDate('')).toBe('')
  })
})
