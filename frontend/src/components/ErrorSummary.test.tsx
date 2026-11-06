import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { ErrorSummary } from './ErrorSummary'

const TWO_ERRORS = [
  { id: 'email', message: 'Enter an email address' },
  { id: 'password', message: 'Use at least 8 characters' },
]

describe('ErrorSummary', () => {
  it('renders nothing without errors', () => {
    const { container } = render(<ErrorSummary errors={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lists the errors under a heading', () => {
    render(<ErrorSummary errors={TWO_ERRORS} />)

    expect(screen.getByRole('region', { name: 'There is a problem' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enter an email address' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Use at least 8 characters' })).toBeInTheDocument()
  })

  it('shows an error that belongs to no field as plain text', () => {
    render(<ErrorSummary errors={[{ message: 'Incorrect email or password' }]} />)

    expect(screen.getByText('Incorrect email or password')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('moves focus to the field when its link is clicked', async () => {
    render(
      <>
        <ErrorSummary errors={TWO_ERRORS} />
        <input id="email" aria-label="email field" />
        <input id="password" aria-label="password field" />
      </>,
    )

    await userEvent.click(screen.getByRole('link', { name: 'Use at least 8 characters' }))

    expect(screen.getByLabelText('password field')).toHaveFocus()
  })

  it('does not take focus on first render', () => {
    render(<ErrorSummary errors={TWO_ERRORS} />)

    expect(screen.getByRole('region')).not.toHaveFocus()
  })

  it('takes focus each time focusToken increases', () => {
    const { rerender } = render(<ErrorSummary errors={TWO_ERRORS} focusToken={0} />)

    rerender(<ErrorSummary errors={TWO_ERRORS} focusToken={1} />)
    expect(screen.getByRole('region')).toHaveFocus()

    screen.getByRole('link', { name: 'Enter an email address' }).focus()
    rerender(<ErrorSummary errors={TWO_ERRORS} focusToken={2} />)
    expect(screen.getByRole('region')).toHaveFocus()
  })

  it('does not steal focus when the list changes without a new token', () => {
    const { rerender } = render(
      <>
        <ErrorSummary errors={TWO_ERRORS} focusToken={1} />
        <input aria-label="email field" />
      </>,
    )
    const input = screen.getByLabelText('email field')
    input.focus()

    rerender(
      <>
        <ErrorSummary errors={TWO_ERRORS.slice(1)} focusToken={1} />
        <input aria-label="email field" />
      </>,
    )

    expect(input).toHaveFocus()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <main>
        <h1>Sign in</h1>
        <ErrorSummary errors={[...TWO_ERRORS, { message: 'Something else' }]} />
      </main>,
    )

    await expectNoA11yViolations(container)
  })
})
