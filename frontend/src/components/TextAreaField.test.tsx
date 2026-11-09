import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { TextAreaField } from './TextAreaField'

describe('TextAreaField', () => {
  it('labels the textarea and accepts typing', async () => {
    const user = userEvent.setup()
    render(<TextAreaField id="notes" label="Notes" />)

    const textarea = screen.getByRole('textbox', { name: 'Notes' })
    await user.type(textarea, 'first mix')

    expect(textarea).toHaveValue('first mix')
  })

  it('shows four rows unless told otherwise', () => {
    const { rerender } = render(<TextAreaField id="notes" label="Notes" />)
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('rows', '4')

    rerender(<TextAreaField id="notes" label="Notes" rows={8} />)
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('rows', '8')
  })

  it('passes other attributes such as maxLength through', () => {
    render(<TextAreaField id="notes" label="Notes" maxLength={5000} />)

    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('maxlength', '5000')
  })

  it('has no description or invalid state without a hint or error', () => {
    render(<TextAreaField id="notes" label="Notes" />)

    const textarea = screen.getByRole('textbox', { name: 'Notes' })
    expect(textarea).not.toHaveAttribute('aria-describedby')
    expect(textarea).not.toHaveAttribute('aria-invalid')
  })

  it('ties the hint and the error to the textarea and marks it invalid', () => {
    render(
      <TextAreaField id="notes" label="Notes" hint="Up to 5000 characters." error="Too long" />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Notes' })
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAttribute('aria-describedby', 'notes-hint notes-error')
    expect(textarea).toHaveAccessibleDescription(/Up to 5000 characters\./)
    expect(textarea).toHaveAccessibleDescription(/Error:\s*Too long/)
  })

  it('forwards a ref to the textarea', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<TextAreaField ref={ref} id="notes" label="Notes" />)

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Notes' }))
  })

  it('has no accessibility violations, with a hint and an error', async () => {
    const { container } = render(
      <TextAreaField id="notes" label="Notes" hint="Up to 5000 characters." error="Too long" />,
    )

    await expectNoA11yViolations(container)
  })
})
