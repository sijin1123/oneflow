import type { ReactNode } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'

import { useWorkspaceCapabilities } from './api'

export function CustomersRoute({ children }: { children: ReactNode }) {
  const capabilities = useWorkspaceCapabilities()

  if (capabilities.isPending) return <ListSkeleton />
  if (capabilities.isError) {
    return <ErrorState error={capabilities.error} onRetry={() => capabilities.refetch()} />
  }
  if (!capabilities.data.customers.enabled) {
    return (
      <EmptyState
        title="고객 기능이 비활성화되어 있습니다"
        hint="워크스페이스 관리자가 다시 활성화하면 기존 고객과 연결된 작업 항목이 그대로 표시됩니다."
      />
    )
  }
  return children
}
