import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { PageHeader } from '@/components/ui/surface'

import { WorkPackageDetailPanel } from './DetailDrawer'
import { useWorkPackage } from './api'

export function WorkPackageDetailPage() {
  const { projectId, wpId } = useParams() as { projectId: string; wpId: string }
  const { data: wp, isPending, isError, error, refetch } = useWorkPackage(wpId)

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <PageHeader
        eyebrow="작업 상세"
        title={wp?.subject ?? '작업 상세'}
        actions={
          <Link
            to={`/projects/${projectId}/work-packages`}
            className="of-touch-target inline-flex h-8 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2.5 text-xs font-medium text-of-secondary transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <ArrowLeft size={14} /> 목록
          </Link>
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
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
