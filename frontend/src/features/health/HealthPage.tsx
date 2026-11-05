import { useQuery } from '@tanstack/react-query'
import { api, API_BASE_URL } from '../../api/client'
import { ApiError, describeError } from '../../api/errors'

export function HealthPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.GET('/health')
      return data ?? {}
    },
  })

  return (
    <section aria-labelledby="health-heading">
      <h1 id="health-heading">API connection check</h1>
      <p>
        Calling <code>{API_BASE_URL}/health</code>
      </p>

      {health.isPending && <p role="status">Checking…</p>}

      {health.isSuccess && (
        <p role="status">Connected. The server says: {JSON.stringify(health.data)}</p>
      )}

      {health.isError && (
        <div role="alert">
          <p>{describeError(health.error)}</p>
          {health.error instanceof ApiError && (
            <p>
              Code: <code>{health.error.code}</code>
              {health.error.requestId !== undefined && (
                <>
                  {' '}
                  · Request ID: <code>{health.error.requestId}</code>
                </>
              )}
            </p>
          )}
          <button type="button" onClick={() => void health.refetch()}>
            Try again
          </button>
        </div>
      )}
    </section>
  )
}
