import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../../test/a11y'
import { ReattachFile } from './ReattachFile'
import { clearRememberedFiles, getRememberedFile } from './sessionFiles'

afterEach(() => {
  clearRememberedFiles()
})

describe('ReattachFile', () => {
  it('offers a labelled file input that accepts the supported audio types', () => {
    render(<ReattachFile analysisId={7} />)

    const input = screen.getByLabelText('Choose the audio file again')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', expect.stringContaining('.wav'))
  })

  it('remembers a valid file for this version', async () => {
    const user = userEvent.setup()
    const file = new File(['abc'], 'mix2.wav', { type: 'audio/wav' })
    render(<ReattachFile analysisId={7} />)

    await user.upload(screen.getByLabelText('Choose the audio file again'), file)

    expect(getRememberedFile(7)).toBe(file)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refuses an unsupported file type and remembers nothing', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<ReattachFile analysisId={7} />)

    await user.upload(
      screen.getByLabelText('Choose the audio file again'),
      new File(['abc'], 'notes.txt', { type: 'text/plain' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('That file type is not supported.')
    expect(getRememberedFile(7)).toBeUndefined()
  })

  it('refuses an empty file and remembers nothing', async () => {
    const user = userEvent.setup()
    render(<ReattachFile analysisId={7} />)

    await user.upload(
      screen.getByLabelText('Choose the audio file again'),
      new File([], 'empty.wav', { type: 'audio/wav' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('That file is empty.')
    expect(getRememberedFile(7)).toBeUndefined()
  })

  it('clears the message once a valid file is chosen', async () => {
    const user = userEvent.setup()
    render(<ReattachFile analysisId={7} />)
    const input = screen.getByLabelText('Choose the audio file again')

    await user.upload(input, new File([], 'empty.wav', { type: 'audio/wav' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.upload(input, new File(['abc'], 'mix2.wav', { type: 'audio/wav' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getRememberedFile(7)).toBeDefined()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ReattachFile analysisId={7} />)

    await expectNoA11yViolations(container)
  })
})
