import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'

// staleTime 30s: documented default for list/detail queries (PLAN §8).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry once on transient/5xx, never on a deterministic 4xx (404/403/422):
      // retrying a client error only delays showing the error state.
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
    },
  },
})
