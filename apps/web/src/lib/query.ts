import { QueryClient } from '@tanstack/react-query'

// staleTime 30s: documented default for list/detail queries (PLAN §8).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
