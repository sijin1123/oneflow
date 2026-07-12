import { Outlet } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useMe } from '@/features/members/api'

export function WorkspaceSettingsShell() {
  const me = useMe()

  if (me.isPending) return <ListSkeleton />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />
  if (!me.data.is_admin) {
    return (
      <EmptyState
        title="접근 권한이 없습니다"
        hint="워크스페이스 설정은 관리자만 열 수 있습니다."
      />
    )
  }

  return (
    <section className="min-h-full min-w-0 bg-of-bg" aria-label="설정 내용">
      <Outlet />
    </section>
  )
}
