import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/errors'
import type { Analysis } from '../../api/types'
import { uploadAnalysis, type UploadOptions } from '../../api/uploadAnalysis'
import { expectNoA11yViolations } from '../../test/a11y'
import { UploadVersionDialog } from './UploadVersionDialog'

vi.mock('../../api/uploadAnalysis', () => ({ uploadAnalysis: vi.fn() }))
const uploadMock = vi.mocked(uploadAnalysis)

const created: Analysis = {
  id: 11,
  track_id: 3,
  version_number: 2,
  label: 'vocals up',
  stage: 'mix',
  original_filename: 'mix2.wav',
  status: 'pending',
  error_code: null,
  created_at: '2026-11-10T00:00:00Z',
  metrics: null,
  feedback: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function wav(name = 'mix2.wav'): File {
  return new File(['abc'], name, { type: 'audio/wav' })
}

function renderDialog() {
  const onClose = vi.fn()
  const onUploaded = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <UploadVersionDialog trackId={3} onClose={onClose} onUploaded={onUploaded} />
    </QueryClientProvider>,
  )
  return {
    onClose,
    onUploaded,
    container: view.container,
    // The file input's accept attribute would otherwise make user.upload drop a .txt silently.
    user: userEvent.setup({ applyAccept: false }),
  }
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>('Audio file')
const uploadButton = () => screen.getByRole('button', { name: 'Upload version' })

function refuseWith(error: ApiError) {
  uploadMock.mockRejectedValue(error)
}

beforeEach(() => {
  uploadMock.mockReset()
})

describe('opening', () => {
  it('opens as a modal dialog with the file input focused', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Upload a new version' })).toBeInTheDocument()
    expect(fileInput()).toHaveFocus()
  })

  it('offers "Not set" and the three stages', () => {
    renderDialog()

    const stage = screen.getByRole('combobox', { name: 'Stage' })
    expect(
      within(stage)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Not set', 'Demo', 'Mix', 'Master'])
    expect(stage).toHaveValue('')
  })

  it('says the audio is deleted after analysis', () => {
    renderDialog()

    expect(screen.getByText(/analysed and then deleted from the server/)).toBeInTheDocument()
  })
})

describe('choosing a file', () => {
  it('rejects an unsupported type before anything is sent', async () => {
    const { user } = renderDialog()

    await user.upload(fileInput(), new File(['abc'], 'notes.txt', { type: 'text/plain' }))

    expect(
      await screen.findByText(
        'That file type is not supported. Use WAV, MP3, FLAC, AIFF, M4A or OGG.',
      ),
    ).toBeInTheDocument()
    expect(fileInput()).toHaveAttribute('aria-invalid', 'true')
    await user.click(uploadButton())
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('rejects a file over the limit and names both sizes', async () => {
    const { user } = renderDialog()
    const big = wav('huge.wav')
    Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 })

    await user.upload(fileInput(), big)

    expect(await screen.findByText('That file is 150 MB. The limit is 100 MB.')).toBeInTheDocument()
  })

  it('asks for a file when none was chosen and moves focus to the summary', async () => {
    const { user } = renderDialog()

    await user.click(uploadButton())

    expect(await screen.findByRole('link', { name: 'Choose an audio file.' })).toHaveAttribute(
      'href',
      '#upload-file',
    )
    expect(
      screen.getByRole('heading', { name: 'There is a problem' }).closest('section'),
    ).toHaveFocus()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('clears the error when a good file replaces a bad one', async () => {
    const { user } = renderDialog()
    await user.upload(fileInput(), new File(['abc'], 'notes.txt'))
    await screen.findByText(/That file type is not supported/)

    await user.upload(fileInput(), wav())

    expect(screen.queryByText(/That file type is not supported/)).not.toBeInTheDocument()
    expect(fileInput()).not.toHaveAttribute('aria-invalid')
  })
})

describe('uploading', () => {
  it('sends the file, the stage and the label, then reports and closes', async () => {
    uploadMock.mockResolvedValue(created)
    const { onClose, onUploaded, user } = renderDialog()
    const file = wav()

    await user.upload(fileInput(), file)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stage' }), 'mix')
    await user.type(screen.getByRole('textbox', { name: 'Label' }), '  vocals up ')
    await user.click(uploadButton())

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(created, file))
    expect(uploadMock).toHaveBeenCalledWith(
      3,
      file,
      expect.objectContaining({ stage: 'mix', label: 'vocals up' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sends null for an empty stage and a blank label', async () => {
    uploadMock.mockResolvedValue(created)
    const { onUploaded, user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.type(screen.getByRole('textbox', { name: 'Label' }), '   ')
    await user.click(uploadButton())

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(uploadMock).toHaveBeenCalledWith(
      3,
      expect.any(File),
      expect.objectContaining({ stage: null, label: null }),
    )
  })

  it('shows progress, then waits for the server once everything is sent', async () => {
    const pending = deferred<Analysis>()
    let options: UploadOptions | undefined
    uploadMock.mockImplementation((_id, _file, opts) => {
      options = opts
      return pending.promise
    })
    const { onUploaded, user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())

    expect(await screen.findByRole('status')).toHaveTextContent('Uploading…')
    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeEnabled()

    act(() => options?.onProgress?.({ loaded: 250, total: 1000, fraction: 0.25 }))
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute(
      'value',
      '25',
    )
    expect(screen.getByText('25%')).toBeInTheDocument()

    act(() => options?.onProgress?.({ loaded: 1000, total: 1000, fraction: 1 }))
    expect(screen.getByRole('status')).toHaveTextContent('Upload sent. Waiting for the server…')
    expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeDisabled()

    await act(async () => pending.resolve(created))
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalled())
  })

  it('cancels the upload and closes without reporting', async () => {
    let signal: AbortSignal | undefined
    uploadMock.mockImplementation((_id, _file, opts) => {
      signal = opts?.signal
      return new Promise<Analysis>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () =>
          reject(new DOMException('cancelled', 'AbortError')),
        )
      })
    })
    const { onClose, onUploaded, user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())
    await user.click(await screen.findByRole('button', { name: 'Cancel upload' }))

    expect(signal?.aborted).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onUploaded).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes with Cancel before anything was sent', async () => {
    const { onClose, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(uploadMock).not.toHaveBeenCalled()
  })
})

describe('refused uploads', () => {
  it.each([
    [
      413,
      'payload_too_large',
      'That file is larger than the server accepts. Try a smaller export.',
    ],
    [
      415,
      'unsupported_media_type',
      'That file type is not supported. Use WAV, MP3, FLAC, AIFF, M4A or OGG.',
    ],
    [
      409,
      'quota_exceeded',
      'This track has reached its limit of versions. Delete an old version to make room.',
    ],
    [503, 'server_busy', 'The server is busy analysing other tracks.'],
    [404, 'not_found', 'We could not find that. It may have been deleted.'],
    [
      0,
      'network_error',
      'Could not reach the server. Check that the API is running and your connection.',
    ],
  ])('shows an alert for %i %s and stays open', async (status, code, text) => {
    refuseWith(new ApiError({ status, code, message: 'server words' }))
    const { onClose, user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(uploadButton()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('counts down a Retry-After and blocks the button meanwhile', async () => {
    refuseWith(new ApiError({ status: 429, code: 'rate_limited', message: 'x', retryAfter: 30 }))
    const { user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have uploaded too many files recently. You can try again in about 30 s.',
    )
    expect(screen.getByRole('button', { name: 'Try again in 30 s' })).toBeDisabled()
  })

  it('does not block the button for a 429 without Retry-After', async () => {
    refuseWith(new ApiError({ status: 429, code: 'too_many_active_analyses', message: 'x' }))
    const { user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You already have analyses running. Wait for them to finish.',
    )
    expect(uploadButton()).toBeEnabled()
  })

  it('puts a label-only 422 on the label field', async () => {
    refuseWith(
      new ApiError({
        status: 422,
        code: 'validation_error',
        message: 'Invalid input',
        fields: [{ location: 'body', field: 'label', message: 'Label too long' }],
      }),
    )
    const { onClose, user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())

    expect(await screen.findByRole('link', { name: 'Label: Label too long' })).toHaveAttribute(
      'href',
      '#upload-label',
    )
    expect(screen.getByRole('textbox', { name: 'Label' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows another 422, such as an empty upload, as an alert', async () => {
    refuseWith(
      new ApiError({
        status: 422,
        code: 'validation_error',
        message: 'Invalid input',
        fields: [{ location: 'body', field: 'file', message: 'The file is empty.' }],
      }),
    )
    const { user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('The file is empty.')
  })

  it('lets the person try again after a failure', async () => {
    uploadMock.mockRejectedValueOnce(
      new ApiError({ status: 503, code: 'server_busy', message: 'x' }),
    )
    uploadMock.mockResolvedValueOnce(created)
    const { onUploaded, user } = renderDialog()

    await user.upload(fileInput(), wav())
    await user.click(uploadButton())
    await screen.findByRole('alert')
    await user.click(uploadButton())

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(created, expect.any(File)))
    expect(uploadMock).toHaveBeenCalledTimes(2)
  })
})

describe('accessibility', () => {
  it('has no violations, with a file error showing', async () => {
    const { container, user } = renderDialog()
    await user.upload(fileInput(), new File(['abc'], 'notes.txt'))
    await screen.findByText(/That file type is not supported/)

    await expectNoA11yViolations(container)
  })

  it('has no violations while uploading', async () => {
    uploadMock.mockReturnValue(new Promise<Analysis>(() => {}))
    const { container, user } = renderDialog()
    await user.upload(fileInput(), wav())
    await user.click(uploadButton())
    await screen.findByRole('progressbar')

    await expectNoA11yViolations(container)
  })
})
