import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { tokenStore } from '../api/token'
import { themeStore } from '../theme/themeStore'
import { server } from './server'

// jsdom has the <dialog> element but, as far as I know, not showModal() or close().
// This stand-in only toggles the open attribute and fires the close event; real
// browsers do the modal behaviour (focus trap, Esc, backdrop) themselves.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
}

// A request without a matching handler fails the test instead of reaching the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  tokenStore.clear()
  themeStore.clear()
})

afterAll(() => server.close())
