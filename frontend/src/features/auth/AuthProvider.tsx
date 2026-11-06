import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getMe } from '../../api/auth'
import { tokenStore } from '../../api/token'
import { AuthContext, ME_QUERY_KEY } from './authContext'
import type { AuthContextValue, AuthStatus } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // Anyone may clear the token (logout, the API client after a 401), so read it
  // from the store instead of keeping a copy in React state.
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get)

  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => getMe(),
    enabled: token !== null,
  })
  const { refetch } = me

  const signIn = useCallback(
    (newToken: string) => {
      queryClient.clear()
      tokenStore.set(newToken)
    },
    [queryClient],
  )

  const signOut = useCallback(() => {
    tokenStore.clear()
    queryClient.clear()
  }, [queryClient])

  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  let status: AuthStatus
  if (token === null) status = 'signedOut'
  else if (me.data !== undefined) status = 'signedIn'
  else if (me.isError) status = 'error'
  else status = 'loading'

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: status === 'signedIn' ? me.data : undefined,
      error: status === 'error' ? me.error : undefined,
      signIn,
      signOut,
      retry,
    }),
    [status, me.data, me.error, signIn, signOut, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
