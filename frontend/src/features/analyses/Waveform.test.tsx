import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../../test/a11y'
import { Waveform } from './Waveform'

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  handlers: new Map<string, Array<() => void>>(),
  on: vi.fn(),
  loadBlob: vi.fn(),
  playPause: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('wavesurfer.js', () => ({ default: { create: mock.create } }))

function emit(event: string) {
  act(() => {
    for (const handler of mock.handlers.get(event) ?? []) handler()
  })
}

const file = new File(['abc'], 'mix2.wav', { type: 'audio/wav' })

beforeEach(() => {
  mock.handlers.clear()
  mock.on.mockReset()
  mock.on.mockImplementation((event: string, handler: () => void) => {
    mock.handlers.set(event, [...(mock.handlers.get(event) ?? []), handler])
    return () => {}
  })
  mock.loadBlob.mockReset()
  mock.loadBlob.mockResolvedValue(undefined)
  mock.playPause.mockReset()
  mock.playPause.mockResolvedValue(undefined)
  mock.destroy.mockReset()
  mock.create.mockReset()
  mock.create.mockReturnValue({
    on: mock.on,
    loadBlob: mock.loadBlob,
    playPause: mock.playPause,
    destroy: mock.destroy,
  })
})

describe('Waveform', () => {
  it('creates a player in its container and loads the file', () => {
    render(<Waveform file={file} />)

    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        container: screen.getByRole('img', { name: 'Waveform of mix2.wav' }),
      }),
    )
    expect(mock.loadBlob).toHaveBeenCalledWith(file)
  })

  it('says it is drawing and keeps Play disabled until the waveform is ready', () => {
    render(<Waveform file={file} />)

    expect(screen.getByRole('status')).toHaveTextContent('Drawing the waveform…')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()

    emit('ready')

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
  })

  it('toggles between Play and Pause with the player events', async () => {
    const user = userEvent.setup()
    render(<Waveform file={file} />)
    emit('ready')

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(mock.playPause).toHaveBeenCalledTimes(1)

    emit('play')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    emit('pause')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    emit('play')
    emit('finish')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('says so when the player reports an error', () => {
    render(<Waveform file={file} />)

    emit('error')

    expect(screen.getByRole('status')).toHaveTextContent(
      'The browser could not draw a waveform for this file. The analysis is not affected.',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('says so when loading the file fails', async () => {
    mock.loadBlob.mockRejectedValue(new Error('cannot decode'))
    render(<Waveform file={file} />)

    expect(
      await screen.findByText(
        'The browser could not draw a waveform for this file. The analysis is not affected.',
      ),
    ).toBeInTheDocument()
  })

  it('destroys the player when it unmounts', () => {
    const { unmount } = render(<Waveform file={file} />)

    unmount()

    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Waveform file={file} />)
    emit('ready')

    await expectNoA11yViolations(container)
  })
})
