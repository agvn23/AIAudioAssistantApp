import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { Button } from './Button'

describe('Button', () => {
  it('is a plain button, not a submit button', () => {
    render(<Button>Cancel</Button>)

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
  })

  it('calls onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Cancel</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('can be disabled', () => {
    render(<Button disabled>Cancel</Button>)

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Button>Cancel</Button>)

    await expectNoA11yViolations(container)
  })
})
