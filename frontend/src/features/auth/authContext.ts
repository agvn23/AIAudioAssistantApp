import { createContext } from 'react'
import type { User } from '../../api/types'

/** Cache key of the signed-in user. Everything else in the cache is per-user data too. */
export const ME_QUERY_KEY = ['me'] as const

export type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  /** Set only while status is "signedIn". */
  user: User | undefined
  /** Set only while status is "error". */
  error: unknown
  /** Store a fresh token and start loading the user. Drops any cached data first. */
  signIn: (token: string) => void
  /** Client-side logout: forget the token and every cached query. */
  signOut: () => void
  /** Try loading the user again after status "error". */
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
