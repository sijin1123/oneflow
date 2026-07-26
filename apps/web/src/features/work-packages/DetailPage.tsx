import { useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'

import { WorkPackageDetailPanel } from './DetailDrawer'
import { useWorkPackage } from './api'

export function WorkPackageDetailPage() {
  const { projectId, wpId } = useParams() as { projectId: string; wpId: string }
  const { data: wp, isPending, isError, error, refetch } = useWorkPackage(wpId)

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-of-surface">
      {isPending ? (
        <main className="px-5 py-5 sm:px-8">
            <ListSkeleton rows={4} />
        </main>
      ) : isError ? (
        <main className="px-5 py-5 sm:px-8">
            <ErrorState error={error} onRetry={() => refetch()} />
        </main>
      ) : (
        <WorkPackageDetailPanel
          wp={wp}
          projectId={projectId}
          showFullPageLink={false}
          resizableProperties
          fullPage
        />
      )}
    </div>
  )
}
