import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'

import { WorkPackageDetailPanel } from './DetailDrawer'
import { useWorkPackage } from './api'

export function WorkPackageDetailPage() {
  const { projectId, wpId } = useParams() as { projectId: string; wpId: string }
  const { data: wp, isPending, isError, error, refetch } = useWorkPackage(wpId)

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <header className="flex min-w-0 flex-wrap items-center gap-3 border-b border-of-border px-4 py-3">
        <Link
          to={`/projects/${projectId}/work-packages`}
          className="inline-flex h-8 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2.5 text-xs font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        >
          <ArrowLeft size={14} /> 목록
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-of-muted">작업 상세</p>
          <h1 className="truncate text-base font-semibold">{wp?.subject ?? '작업 상세'}</h1>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-4">
          {isPending ? (
            <ListSkeleton rows={4} />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : (
            <WorkPackageDetailPanel wp={wp} projectId={projectId} showFullPageLink={false} />
          )}
        </div>
      </main>
    </div>
  )
}
