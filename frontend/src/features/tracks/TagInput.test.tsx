import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type FormEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../../test/a11y'
import { TagInput } from './TagInput'

function Harness({
  initial = [],
  onChange,
}: {
  initial?: string[]
  onChange?: (tags: string[]) => void
}) {
  const [tags, setTags] = useState(initial)
  return (
    <TagInput
      id="tags"
      label="Tags"
      tags={tags}
      onChange={(next) => {
        setTags(next)
        onChange?.(next)
      }}
    />
  )
}

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Tags' })
const addedTags = () => within(screen.getByRole('list', { name: 'Added tags' }))

describe('adding', () => {
  it('adds a normalised tag on Enter and clears the field', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.type(field(), '  Deep   House {Enter}')

    expect(onChange).toHaveBeenCalledWith(['deep house'])
    expect(addedTags().getByText('deep house')).toBeInTheDocument()
    expect(field()).toHaveValue('')
  })

  it('adds with the button and keeps focus in the field', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(field(), 'club')
    await user.click(screen.getByRole('button', { name: 'Add tag' }))

    expect(addedTags().getByText('club')).toBeInTheDocument()
    expect(field()).toHaveFocus()
  })

  it('does not submit the surrounding form on Enter', async () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault())
    const user = userEvent.setup()
    render(
      <form onSubmit={onSubmit}>
        <Harness />
        <button type="submit">Save</button>
      </form>,
    )

    await user.type(field(), 'club{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(addedTags().getByText('club')).toBeInTheDocument()
  })

  it('ignores Enter in an empty field', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(field())
    await user.keyboard('{Enter}')

    expect(screen.queryByText('Type a tag first.')).not.toBeInTheDocument()
  })
})

describe('rejected tags', () => {
  it('explains an empty tag when the button is used', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Add tag' }))

    expect(screen.getByText('Type a tag first.')).toBeInTheDocument()
    expect(field()).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a duplicate', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['demo']} />)

    await user.type(field(), 'DEMO{Enter}')

    expect(screen.getByText('That tag is already added.')).toBeInTheDocument()
    expect(addedTags().getAllByRole('listitem')).toHaveLength(1)
  })

  it('rejects a tag over 30 characters and keeps what was typed', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(field(), `${'a'.repeat(31)}{Enter}`)

    expect(screen.getByText('Tags can be at most 30 characters.')).toBeInTheDocument()
    expect(field()).toHaveValue('a'.repeat(31))
  })

  it('rejects an eleventh tag', async () => {
    const full = Array.from({ length: 10 }, (_, index) => `tag${index}`)
    const user = userEvent.setup()
    render(<Harness initial={full} />)

    await user.type(field(), 'extra{Enter}')

    expect(screen.getByText('A track can have at most 10 tags.')).toBeInTheDocument()
    expect(addedTags().getAllByRole('listitem')).toHaveLength(10)
  })

  it('clears the error when the person types again', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['demo']} />)
    await user.type(field(), 'demo{Enter}')
    expect(screen.getByText('That tag is already added.')).toBeInTheDocument()

    await user.type(field(), 'x')

    expect(screen.queryByText('That tag is already added.')).not.toBeInTheDocument()
  })
})

describe('removing', () => {
  it('removes a tag and puts focus back in the field', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={['demo', 'club']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove tag demo' }))

    expect(onChange).toHaveBeenCalledWith(['club'])
    expect(addedTags().queryByText('demo')).not.toBeInTheDocument()
    expect(field()).toHaveFocus()
  })

  it('removes the last tag and the list with it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['demo']} />)

    await user.click(screen.getByRole('button', { name: 'Remove tag demo' }))

    expect(screen.queryByRole('list', { name: 'Added tags' })).not.toBeInTheDocument()
  })
})

describe('announcements and accessibility', () => {
  it('announces additions and removals in a status line', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(field(), 'club{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('Added tag club')

    await user.click(screen.getByRole('button', { name: 'Remove tag club' }))
    expect(screen.getByRole('status')).toHaveTextContent('Removed tag club')
  })

  it('has no accessibility violations, with tags and an error showing', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness initial={['demo', 'club']} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))

    await expectNoA11yViolations(container)
  })
})
