import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test toolchain', () => {
  it('renders React into jsdom with jest-dom matchers available', () => {
    render(<p>hello</p>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
