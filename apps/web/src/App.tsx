import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'

import { AppErrorBoundary } from '@/components/shell/ErrorBoundary'
import { queryClient } from '@/lib/query'
import { router } from '@/routes'

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
