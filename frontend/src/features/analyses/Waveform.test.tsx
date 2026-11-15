import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '../../test/a11y'
import { themeStore } from '../../theme/themeStore'
import { Waveform } from './Waveform'

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  handlers: new Map<string, Array<(...args: number[]) => void>>(),
  on: vi.fn(),
  loadBlob: vi.fn(),
  playPause: vi.fn(),
  setOptions: vi.fn(),
  setTime: vi.fn(),
  getDuration: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('wavesurfer.js', () => ({ default: { create: mock.create } }))

function emit(event: string, ...args: number[]) {
  act(() => {
    for (const handler of mock.handlers.get(event) ?? []) handler(...args)
  })
}

const file = new File(['abc'], 'mix2.wav', { type: 'audio/wav' })

beforeEach(() => {
  mock.handlers.clear()
  mock.on.mockReset()
  mock.on.mockImplementation((event: string, handler: (...args: number[]) => void) => {
    mock.handlers.set(event, [...(mock.handlers.get(event) ?? []), handler])
    return () => {}
  })
  mock.loadBlob.mockReset()
  mock.loadBlob.mockResolvedValue(undefined)
  mock.playPause.mockReset()
  mock.playPause.mockResolvedValue(undefined)
  mock.setOptions.mockReset()
  mock.setTime.mockReset()
  mock.getDuration.mockReset()
  mock.getDuration.mockReturnValue(125.4)
  mock.destroy.mockReset()
  mock.create.mockReset()
  mock.create.mockReturnValue({
    on: mock.on,
    loadBlob: mock.loadBlob,
    playPause: mock.playPause,
    setOptions: mock.setOptions,
    setTime: mock.setTime,
    getDuration: mock.getDuration,
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

  it('does not repaint when it first appears', () => {
    render(<Waveform file={file} />)

    expect(mock.setOptions).not.toHaveBeenCalled()
  })

  it('repaints the same player when the shown theme changes', () => {
    render(<Waveform file={file} />)

    act(() => {
      themeStore.set('dark')
    })

    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(mock.destroy).not.toHaveBeenCalled()
    expect(mock.setOptions).toHaveBeenCalledTimes(1)
    expect(mock.setOptions).toHaveBeenCalledWith({
      waveColor: expect.any(String),
      progressColor: expect.any(String),
      cursorColor: expect.any(String),
    })
  })

  it('does not repaint when the choice changes but the shown theme does not', () => {
    render(<Waveform file={file} />)

    act(() => {
      themeStore.set('light')
    })

    expect(themeStore.resolved()).toBe('light')
    expect(mock.setOptions).not.toHaveBeenCalled()
  })

  it('stops repainting after it unmounts', () => {
    const { unmount } = render(<Waveform file={file} />)
    unmount()

    act(() => {
      themeStore.set('dark')
    })

    expect(mock.setOptions).not.toHaveBeenCalled()
  })

  it('has a position slider that stays disabled until the waveform is ready', () => {
    render(<Waveform file={file} />)

    expect(screen.getByRole('slider', { name: 'Position' })).toBeDisabled()

    emit('ready')

    expect(screen.getByRole('slider', { name: 'Position' })).toBeEnabled()
  })

  it('sets the slider range from the length of the audio', () => {
    render(<Waveform file={file} />)

    emit('ready')

    const slider = screen.getByRole('slider', { name: 'Position' })
    expect(slider).toHaveAttribute('max', '125')
    expect(slider).toHaveAttribute('aria-valuetext', '0:00 of 2:05')
  })

  it('follows the playback position in whole seconds', () => {
    render(<Waveform file={file} />)
    emit('ready')

    emit('timeupdate', 61.7)

    const slider = screen.getByRole<HTMLInputElement>('slider', { name: 'Position' })
    expect(slider.value).toBe('61')
    expect(slider).toHaveAttribute('aria-valuetext', '1:01 of 2:05')
  })

  it('follows a seek made by clicking the waveform', () => {
    render(<Waveform file={file} />)
    emit('ready')

    emit('seeking', 30.2)

    expect(screen.getByRole<HTMLInputElement>('slider', { name: 'Position' }).value).toBe('30')
  })

  it('seeks the player when the slider changes', () => {
    render(<Waveform file={file} />)
    emit('ready')
    const slider = screen.getByRole<HTMLInputElement>('slider', { name: 'Position' })

    fireEvent.change(slider, { target: { value: '40' } })

    expect(mock.setTime).toHaveBeenCalledWith(40)
    expect(slider.value).toBe('40')
  })

  it('jumps 10 seconds with Page Up and Page Down', async () => {
    const user = userEvent.setup()
    render(<Waveform file={file} />)
    emit('ready')
    act(() => screen.getByRole('slider', { name: 'Position' }).focus())

    await user.keyboard('{PageUp}')
    expect(mock.setTime).toHaveBeenLastCalledWith(10)

    await user.keyboard('{PageUp}')
    expect(mock.setTime).toHaveBeenLastCalledWith(20)

    await user.keyboard('{PageDown}')
    expect(mock.setTime).toHaveBeenLastCalledWith(10)
  })

  it('does not move past the start or the end', async () => {
    const user = userEvent.setup()
    render(<Waveform file={file} />)
    emit('ready')
    act(() => screen.getByRole('slider', { name: 'Position' }).focus())

    await user.keyboard('{PageDown}')
    expect(mock.setTime).toHaveBeenLastCalledWith(0)

    emit('timeupdate', 120)
    await user.keyboard('{PageUp}')
    expect(mock.setTime).toHaveBeenLastCalledWith(125)
  })

  it('keeps the slider disabled when the player reports an error', () => {
    render(<Waveform file={file} />)

    emit('error')

    expect(screen.getByRole('slider', { name: 'Position' })).toBeDisabled()
  })
})
