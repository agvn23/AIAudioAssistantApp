import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { SelectField } from './SelectField'

const options = [
  { value: '', label: 'Not set' },
  { value: 'spotify', label: 'Spotify' },
  { value: 'club', label: 'Club' },
]

describe('SelectField', () => {
  it('labels the select and lists the options in order', () => {
    render(<SelectField id="platform" label="Platform" options={options} />)

    const select = screen.getByRole('combobox', { name: 'Platform' })
    expect(select).toHaveAttribute('id', 'platform')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Not set',
      'Spotify',
      'Club',
    ])
  })

  it('starts on the default value and lets the person choose another', async () => {
    const user = userEvent.setup()
    render(<SelectField id="platform" label="Platform" options={options} defaultValue="spotify" />)

    const select = screen.getByRole('combobox', { name: 'Platform' })
    expect(select).toHaveValue('spotify')

    await user.selectOptions(select, 'club')

    expect(select).toHaveValue('club')
  })

  it('has no description or invalid state without a hint or error', () => {
    render(<SelectField id="platform" label="Platform" options={options} />)

    const select = screen.getByRole('combobox', { name: 'Platform' })
    expect(select).not.toHaveAttribute('aria-describedby')
    expect(select).not.toHaveAttribute('aria-invalid')
  })

  it('ties the hint and the error to the select and marks it invalid', () => {
    render(
      <SelectField
        id="platform"
        label="Platform"
        options={options}
        hint="Where it will be released."
        error="Pick a platform"
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Platform' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAttribute('aria-describedby', 'platform-hint platform-error')
    expect(select).toHaveAccessibleDescription(/Where it will be released\./)
    expect(select).toHaveAccessibleDescription(/Error:\s*Pick a platform/)
  })

  it('forwards a ref to the select', () => {
    const ref = createRef<HTMLSelectElement>()
    render(<SelectField ref={ref} id="platform" label="Platform" options={options} />)

    expect(ref.current).toBe(screen.getByRole('combobox', { name: 'Platform' }))
  })

  it('has no accessibility violations, with a hint and an error', async () => {
    const { container } = render(
      <SelectField
        id="platform"
        label="Platform"
        options={options}
        hint="Where it will be released."
        error="Pick a platform"
      />,
    )

    await expectNoA11yViolations(container)
  })
})
