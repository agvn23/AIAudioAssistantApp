import { createBrowserRouter } from 'react-router'
import { HealthPage } from '../features/health/HealthPage'
import { Layout } from './Layout'
import { NotFoundPage } from './NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HealthPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

