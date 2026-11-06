import { Navigate } from 'react-router'
import type { RouteObject } from 'react-router'
import { AccountPage } from '../features/account/AccountPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { Layout } from './Layout'
import { NotFoundPage } from './NotFoundPage'
import { PlaceholderPage } from './PlaceholderPage'

/** Separate from router.tsx so tests can run the real route table in a memory router. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/tracks" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'tracks', element: <PlaceholderPage title="Tracks" /> },
          { path: 'tracks/:id', element: <PlaceholderPage title="Track" /> },
          { path: 'analyses/:id', element: <PlaceholderPage title="Analysis" /> },
          { path: 'account', element: <AccountPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
