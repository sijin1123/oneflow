import type { QueryClient } from '@tanstack/react-query'

const identityResetListeners = new Set<() => void>()

export function registerIdentityReset(listener: () => void) {
  identityResetListeners.add(listener)
  return () => {
    identityResetListeners.delete(listener)
  }
}

export function clearIdentityBoundCache(queryClient: QueryClient) {
  for (const listener of identityResetListeners) listener()
  queryClient.clear()
}
