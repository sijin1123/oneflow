import type { QueryClient } from '@tanstack/react-query'

export function clearIdentityBoundCache(queryClient: QueryClient) {
  queryClient.clear()
}
