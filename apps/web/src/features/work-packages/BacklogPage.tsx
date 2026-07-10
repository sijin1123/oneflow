import { useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Select } from '@/components/ui/select'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useCycles } from '@/features/cycles/api'
import { useMemberNames } from '@/features/members/api'
import { PlanningSurface } from '@/features/planning/PlanningSurface'

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
  const canWrite = useCanWrite(projectId)
  const description =
    '사이클에 배정되지 않은 미완료 작업을 정리하고, 다음 반복 계획으로 바로 끌어올립니다.'

  if (isPending) {
    return (
      <PlanningSurface projectId={projectId} active="backlog" title="백로그" description={description}>
        <ListSkeleton />
      </PlanningSurface>
    )
  }
  if (isError) {
    return (
      <PlanningSurface projectId={projectId} active="backlog" title="백로그" description={description}>
        <ErrorState error={error} onRetry={() => refetch()} />
      </PlanningSurface>
    )
  }

  const assignable = (cycles.data?.items ?? []).filter((c) => c.status !== 'completed')
  const assignedOwnerCount = data.items.filter((wp) => wp.assignee_id !== null).length
  const urgentCount = data.items.filter((wp) => wp.priority === 'urgent' || wp.priority === 'high').length

  return (
    <PlanningSurface
      projectId={projectId}
      active="backlog"
      title="백로그"
      description={description}
      metrics={[
        { label: '미배정 작업', value: data.total, hint: '열린 작업 기준' },
        { label: '배정 가능 사이클', value: assignable.length, hint: '완료 사이클 제외' },
        { label: '담당자 지정', value: assignedOwnerCount, hint: `${data.total}건 중` },
        { label: '우선 검토', value: urgentCount, hint: 'High 또는 Urgent' },
      ]}
    >
      <div className="space-y-3">
        {!canWrite ? <ReadOnlyNotice /> : null}
        {update.isError ? (
          <p
            role="alert"
            className="rounded-of border border-of-danger/30 bg-of-surface px-3 py-2 text-xs text-of-danger"
          >
            배정하지 못했습니다 — 보관된 프로젝트이거나 다른 사용자가 먼저 수정했습니다.
          </p>
        ) : null}
        {data.items.length === 0 ? (
          <EmptyState
            title="백로그가 비어 있습니다"
            hint="모든 미완료 작업이 사이클에 배정되어 있습니다."
            className="rounded-of border border-of-border bg-of-surface"
          />
        ) : (
          <ul
            aria-label="백로그 작업 목록"
            className="min-w-0 divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface"
          >
            {data.items.map((wp) => (
              <li key={wp.id} className="min-w-0 px-3 py-3 hover:bg-of-surface-2/60">
                <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center">
                  <TypeChip type={wp.type} label={typeLabel(wp.type)} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{wp.subject}</p>
                    <p className="mt-0.5 truncate text-[11px] text-of-muted">
                      {memberName(wp.assignee_id)}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusChip status={wp.status} label={statusLabel(wp.status)} />
                    <PriorityChip priority={wp.priority} />
                  </div>
                  {canWrite ? (
                    <Select
                      aria-label={`${wp.subject} 사이클 배정`}
                      className="h-7 w-full text-xs sm:w-36"
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
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DetailDrawer projectId={projectId} />
    </PlanningSurface>
  )
}
