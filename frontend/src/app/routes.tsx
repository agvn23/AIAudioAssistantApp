import { Navigate } from 'react-router'
import type { RouteObject } from 'react-router'
import { AccountPage } from '../features/account/AccountPage'
import { AnalysisPage } from '../features/analyses/AnalysisPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { TrackDetailPage } from '../features/tracks/TrackDetailPage'
import { TracksPage } from '../features/tracks/TracksPage'
import { Layout } from './Layout'
import { NotFoundPage } from './NotFoundPage'

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
          { path: 'tracks', element: <TracksPage /> },
          { path: 'tracks/:id', element: <TrackDetailPage /> },
          { path: 'analyses/:id', element: <AnalysisPage /> },
          { path: 'account', element: <AccountPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
