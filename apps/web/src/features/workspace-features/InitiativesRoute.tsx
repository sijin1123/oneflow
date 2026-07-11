import type { ReactNode } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'

import { useWorkspaceCapabilities } from './api'

export function InitiativesRoute({ children }: { children: ReactNode }) {
  const capabilities = useWorkspaceCapabilities()

  if (capabilities.isPending) return <ListSkeleton />
  if (capabilities.isError) {
    return <ErrorState error={capabilities.error} onRetry={() => capabilities.refetch()} />
  }
  if (!capabilities.data.initiatives.enabled) {
    return (
      <EmptyState
        title="이니셔티브가 비활성화되어 있습니다"
        hint="워크스페이스 관리자가 다시 활성화하면 기존 이니셔티브와 프로젝트 연결이 그대로 표시됩니다."
      />
    )
  }
  return children
}
