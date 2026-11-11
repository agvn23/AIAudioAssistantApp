import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../test/a11y'
import { ThemeSwitch } from './ThemeSwitch'
import { themeStore } from './themeStore'

describe('ThemeSwitch', () => {
  it('offers system, light and dark, with system chosen by default', () => {
    render(<ThemeSwitch />)

    const select = screen.getByRole('combobox', { name: 'Theme' })
    expect(select).toHaveValue('system')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'System',
      'Light',
      'Dark',
    ])
  })

  it('shows a choice that was saved before it rendered', () => {
    themeStore.set('dark')

    render(<ThemeSwitch />)

    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark')
  })

  it('applies and saves the chosen theme', async () => {
    const user = userEvent.setup()
    render(<ThemeSwitch />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'dark')

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem('aaa.theme')).toBe('dark')
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark')
  })

  it('follows a change made somewhere else', () => {
    render(<ThemeSwitch />)

    act(() => {
      themeStore.set('light')
    })

    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('light')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ThemeSwitch />)

    await expectNoA11yViolations(container)
  })
})
