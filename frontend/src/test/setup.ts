import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { tokenStore } from '../api/token'
import { server } from './server'

// A request without a matching handler fails the test instead of reaching the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  tokenStore.clear()
})

afterAll(() => server.close())
