import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { API_BASE_URL, setUnauthorizedHandler } from './client'
import { ApiError } from './errors'
import { tokenStore } from './token'
import type { Analysis } from './types'
import { uploadAnalysis, type UploadProgress } from './uploadAnalysis'

const pending: Analysis = {
  id: 11,
  track_id: 3,
  version_number: 2,
  label: null,
  stage: null,
  original_filename: 'mix.wav',
  status: 'pending',
  error_code: null,
  created_at: '2026-11-10T00:00:00Z',
  metrics: null,
  feedback: null,
}

function envelope(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } }
}

function wavFile(): File {
  return new File(['abc'], 'mix.wav', { type: 'audio/wav' })
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const result = await promise.then(
    () => null,
    (error: unknown) => error,
  )
  expect(result).toBeInstanceOf(ApiError)
  return result as ApiError
}

class FakeXhr extends EventTarget {
  static instances: FakeXhr[] = []

  readonly upload = new EventTarget()
  readonly requestHeaders = new Map<string, string>()
  method = ''
  url = ''
  status = 0
  responseText = ''
  body: unknown = undefined
  aborted = false
  private responseHeaders = new Map<string, string>()

  constructor() {
    super()
    FakeXhr.instances.push(this)
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders.set(name.toLowerCase(), value)
  }

  send(body: unknown): void {
    this.body = body
  }

  abort(): void {
    this.aborted = true
    this.dispatchEvent(new Event('abort'))
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders.get(name.toLowerCase()) ?? null
  }

  respond(status: number, body: unknown, headers: Record<string, string> = {}): void {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.responseHeaders = new Map(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    )
    this.dispatchEvent(new Event('load'))
  }

  progress(loaded: number, total: number): void {
    this.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded, total }),
    )
  }

  fail(): void {
    this.dispatchEvent(new Event('error'))
  }
}

function lastRequest(): FakeXhr {
  const request = FakeXhr.instances.at(-1)
  if (!request) throw new Error('No request was made.')
  return request
}

describe('uploadAnalysis (fake XMLHttpRequest)', () => {
  beforeEach(() => {
    FakeXhr.instances = []
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setUnauthorizedHandler(undefined)
  })

  it('posts to the track and sends the bearer token without setting Content-Type', async () => {
    tokenStore.set('tok-1')
    const promise = uploadAnalysis(3, wavFile())
    const request = lastRequest()
    request.respond(202, pending)
    await promise

    expect(request.method).toBe('POST')
    expect(request.url).toBe(`${API_BASE_URL}/tracks/3/analyses`)
    expect(request.requestHeaders.get('authorization')).toBe('Bearer tok-1')
    expect(request.requestHeaders.has('content-type')).toBe(false)
  })

  it('sends no Authorization header without a token', async () => {
    const promise = uploadAnalysis(3, wavFile())
    const request = lastRequest()
    request.respond(202, pending)
    await promise

    expect(request.requestHeaders.has('authorization')).toBe(false)
  })

  it('sends the file, the stage and a trimmed label', async () => {
    const promise = uploadAnalysis(3, wavFile(), { stage: 'mix', label: '  vocals up  ' })
    const request = lastRequest()
    request.respond(202, pending)
    await promise

    const form = request.body as FormData
    expect((form.get('file') as File).name).toBe('mix.wav')
    expect(form.get('stage')).toBe('mix')
    expect(form.get('label')).toBe('vocals up')
  })

  it('leaves out an empty stage and a blank label', async () => {
    const promise = uploadAnalysis(3, wavFile(), { stage: null, label: '   ' })
    const request = lastRequest()
    request.respond(202, pending)
    await promise

    const form = request.body as FormData
    expect(form.has('stage')).toBe(false)
    expect(form.has('label')).toBe(false)
  })

  it('resolves with the new analysis on a 202', async () => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(202, pending)

    await expect(promise).resolves.toEqual(pending)
  })

  it('reports upload progress as a fraction', async () => {
    const seen: UploadProgress[] = []
    const promise = uploadAnalysis(3, wavFile(), { onProgress: (p) => seen.push(p) })
    const request = lastRequest()

    request.progress(250, 1000)
    request.progress(1000, 1000)
    request.respond(202, pending)
    await promise

    expect(seen).toEqual([
      { loaded: 250, total: 1000, fraction: 0.25 },
      { loaded: 1000, total: 1000, fraction: 1 },
    ])
  })

  it('ignores progress events without a known length', async () => {
    const onProgress = vi.fn()
    const promise = uploadAnalysis(3, wavFile(), { onProgress })
    const request = lastRequest()

    request.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: false, loaded: 10, total: 0 }),
    )
    request.respond(202, pending)
    await promise

    expect(onProgress).not.toHaveBeenCalled()
  })

  it.each([
    [413, 'payload_too_large'],
    [415, 'unsupported_media_type'],
    [409, 'quota_exceeded'],
    [503, 'server_busy'],
  ])('turns a %i into an ApiError with code %s', async (status, code) => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(status, envelope(code, 'nope'), { 'X-Request-ID': 'req-7' })

    const error = await failure(promise)

    expect(error.status).toBe(status)
    expect(error.code).toBe(code)
    expect(error.requestId).toBe('req-7')
  })

  it('exposes Retry-After on a 429', async () => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(429, envelope('too_many_active_analyses', 'busy'), {
      'Retry-After': '30',
    })

    const error = await failure(promise)

    expect(error.code).toBe('too_many_active_analyses')
    expect(error.retryAfter).toBe(30)
  })

  it('exposes the field errors of a 422', async () => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(
      422,
      envelope('validation_error', 'Invalid input', {
        fields: [{ location: 'body', field: 'label', message: 'Too long' }],
      }),
    )

    const error = await failure(promise)

    expect(error.code).toBe('validation_error')
    expect(error.fields).toEqual([{ location: 'body', field: 'label', message: 'Too long' }])
  })

  it('maps a non-envelope error to code "unknown"', async () => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(502, '<html>Bad gateway</html>')

    const error = await failure(promise)

    expect(error.code).toBe('unknown')
    expect(error.status).toBe(502)
  })

  it('maps a successful status with a broken body to code "unknown"', async () => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(202, 'not json')

    const error = await failure(promise)

    expect(error.code).toBe('unknown')
    expect(error.status).toBe(202)
  })

  it('maps a failed connection to code "network_error"', async () => {
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().fail()

    const error = await failure(promise)

    expect(error.code).toBe('network_error')
    expect(error.status).toBe(0)
  })

  it('clears the token and calls the handler on a 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    tokenStore.set('expired')
    const promise = uploadAnalysis(3, wavFile())
    lastRequest().respond(401, envelope('unauthorized', 'Not authenticated'))

    const error = await failure(promise)

    expect(error.code).toBe('unauthorized')
    expect(tokenStore.get()).toBeNull()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('aborts the request when the signal fires', async () => {
    const controller = new AbortController()
    const promise = uploadAnalysis(3, wavFile(), { signal: controller.signal })
    const request = lastRequest()

    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(request.aborted).toBe(true)
  })

  it('does not send anything when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(uploadAnalysis(3, wavFile(), { signal: controller.signal })).rejects.toMatchObject(
      { name: 'AbortError' },
    )
    expect(FakeXhr.instances).toHaveLength(0)
  })

  it('does not abort a finished request when the signal fires later', async () => {
    const controller = new AbortController()
    const promise = uploadAnalysis(3, wavFile(), { signal: controller.signal })
    const request = lastRequest()
    request.respond(202, pending)
    await promise

    controller.abort()

    expect(request.aborted).toBe(false)
  })
})

describe('uploadAnalysis (through MSW with the real XMLHttpRequest)', () => {
  it('uploads multipart with the bearer token and returns the analysis', async () => {
    tokenStore.set('tok-2')
    let auth: string | null = null
    let contentType: string | null = null
    server.use(
      http.post(`${API_BASE_URL}/tracks/3/analyses`, ({ request }) => {
        auth = request.headers.get('authorization')
        contentType = request.headers.get('content-type')
        return HttpResponse.json(pending, { status: 202 })
      }),
    )

    await expect(uploadAnalysis(3, wavFile(), { stage: 'demo' })).resolves.toEqual(pending)

    expect(auth).toBe('Bearer tok-2')
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
  })

  it('reads the error code and Retry-After from a real response', async () => {
    server.use(
      http.post(`${API_BASE_URL}/tracks/3/analyses`, () =>
        HttpResponse.json(envelope('rate_limited', 'Too many requests'), {
          status: 429,
          headers: { 'Retry-After': '12' },
        }),
      ),
    )

    const error = await failure(uploadAnalysis(3, wavFile()))

    expect(error.code).toBe('rate_limited')
    expect(error.retryAfter).toBe(12)
  })
})
