import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { TextField } from './TextField'

describe('TextField', () => {
  it('labels the input and passes input attributes through', () => {
    render(<TextField id="email" label="Email" type="email" autoComplete="email" />)

    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('describes the input with its hint and error, and marks it invalid', () => {
    render(<TextField id="pw" label="Password" hint="8 to 128 characters" error="Too short" />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/8 to 128 characters/)
    expect(input).toHaveAccessibleDescription(/Too short/)
  })

  it('shows only the hint when there is no error', () => {
    render(<TextField id="pw" label="Password" hint="8 to 128 characters" />)

    const input = screen.getByLabelText('Password')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('8 to 128 characters')
  })

  it('accepts a ref as a prop', () => {
    const ref = vi.fn()
    render(<TextField id="x" label="X" ref={ref} />)

    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement))
  })

  it('reports typing through onChange', async () => {
    const onChange = vi.fn()
    render(<TextField id="x" label="X" onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('X'), 'ab')

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations, with and without an error', async () => {
    const { container } = render(
      <>
        <TextField id="a" label="Plain" />
        <TextField id="b" label="With help" hint="A hint" error="An error" />
      </>,
    )

    await expectNoA11yViolations(container)
  })
})
