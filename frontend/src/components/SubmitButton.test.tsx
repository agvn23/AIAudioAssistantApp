import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { SubmitButton } from './SubmitButton'

describe('SubmitButton', () => {
  it('is an enabled submit button by default', () => {
    render(<SubmitButton>Sign in</SubmitButton>)

    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button).toHaveAttribute('data-variant', 'primary')
  })

  it('is disabled and shows the pending label while pending', () => {
    render(
      <SubmitButton pending pendingLabel="Signing in…">
        Sign in
      </SubmitButton>,
    )

    const button = screen.getByRole('button', { name: 'Signing in…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('can be disabled for another reason', () => {
    render(<SubmitButton disabled>Create account</SubmitButton>)

    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  it('supports a danger variant', () => {
    render(<SubmitButton variant="danger">Delete</SubmitButton>)

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'danger')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<SubmitButton>Sign in</SubmitButton>)

    await expectNoA11yViolations(container)
  })
})
