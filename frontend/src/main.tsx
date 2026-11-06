import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { registerSessionExpiry } from './features/auth/sessionExpiry'
import { queryClient } from './app/appQueryClient'
import { Providers } from './app/providers'
import { router } from './app/router'
import './index.css'

registerSessionExpiry({
  clearCache: () => queryClient.clear(),
  getLocation: () => router.state.location,
  navigate: (to) => {
    void router.navigate(to, { replace: true })
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
