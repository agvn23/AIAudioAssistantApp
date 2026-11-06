import { describe, expect, it } from 'vitest'
import { PASSWORD_MAX, PASSWORD_MIN, validateEmail } from './rules'

describe('validateEmail', () => {
  it('accepts a normal address, ignoring surrounding spaces', () => {
    expect(validateEmail('a@example.com')).toBe(true)
    expect(validateEmail('  a@example.com ')).toBe(true)
  })

  it('asks for an address when empty', () => {
    expect(validateEmail('')).toBe('Enter your email address')
    expect(validateEmail('   ')).toBe('Enter your email address')
  })

  it.each(['plain', 'a@b', '@example.com', 'a b@example.com'])('rejects %s', (value) => {
    expect(validateEmail(value)).toBe('Enter an email address like name@example.com')
  })
})

describe('password limits', () => {
  it('mirror the documented API limits', () => {
    expect(PASSWORD_MIN).toBe(8)
    expect(PASSWORD_MAX).toBe(128)
  })
})
