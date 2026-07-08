import { useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Select } from '@/components/ui/select'
import { useCycles } from '@/features/cycles/api'
import { useMemberNames } from '@/features/members/api'

import { DetailDrawer } from './DetailDrawer'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { usePatchWorkPackage, useWorkPackages } from './api'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

/* Backlog (Pass 52 PR-BR): open work without a cycle, with per-row sprint
   assignment. Assigning PATCHes cycle_id with the version token; success
   refetches (the row leaves the backlog). Completed cycles are not offered
   (v52.1 R1-②); archived projects surface the ordinary 409 as an error line. */
export function BacklogPage() {
  const { projectId } = useParams() as { projectId: string }
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {
    no_cycle: 'true',
    open_only: 'true',
  })
  const cycles = useCycles(projectId)
  const update = usePatchWorkPackage(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const assignable = (cycles.data?.items ?? []).filter((c) => c.status !== 'completed')

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-base font-semibold">백로그</h1>
      <p className="mb-4 text-xs text-of-muted">
        사이클에 배정되지 않은 미완료 작업입니다. 사이클을 고르면 바로 배정됩니다.
      </p>
      {update.isError ? (
        <p role="alert" className="mb-2 text-xs text-of-danger">
          배정하지 못했습니다 — 보관된 프로젝트이거나 다른 사용자가 먼저 수정했습니다.
        </p>
      ) : null}
      {data.items.length === 0 ? (
        <EmptyState title="백로그가 비어 있습니다" hint="모든 미완료 작업이 사이클에 배정되어 있습니다." />
      ) : (
        <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border">
          {data.items.map((wp) => (
            <li key={wp.id} className="flex items-center gap-2 px-3 py-2">
              <TypeChip type={wp.type} label={typeLabel(wp.type)} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{wp.subject}</span>
              <StatusChip status={wp.status} label={statusLabel(wp.status)} />
              <PriorityChip priority={wp.priority} />
              <span className="hidden w-24 shrink-0 truncate text-right text-[11px] text-of-muted sm:inline">
                {memberName(wp.assignee_id)}
              </span>
              <Select
                aria-label={`${wp.subject} 사이클 배정`}
                className="h-7 w-36 text-xs"
                value=""
                disabled={update.isPending || assignable.length === 0}
                onChange={(e) => {
                  if (!e.target.value) return
                  update.mutate({
                    wpId: wp.id,
                    patch: { expected_version: wp.version, cycle_id: e.target.value },
                  })
                }}
              >
                <option value="">사이클 배정…</option>
                {assignable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}
      <DetailDrawer projectId={projectId} />
    </div>
  )
}
