import { Download } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useMemberNames } from '@/features/members/api'

import { DetailDrawer } from './DetailDrawer'
import { Filters } from './Filters'
import { ImportDialog } from './ImportDialog'
import { SavedFilters } from './SavedFilters'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { useWorkPackages } from './api'
import { useExportCsv } from './csv'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

export function ListPage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = {
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    assignee_id: searchParams.get('assignee_id') ?? undefined,
    cycle_id: searchParams.get('cycle_id') ?? undefined,
    module_id: searchParams.get('module_id') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  }
  const sort = searchParams.get('sort') ?? 'created'
  const setSort = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value && value !== 'created') next.set('sort', value)
        else next.delete('sort')
        return next
      },
      { replace: true },
    )
  }
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, filters)
  const exportCsv = useExportCsv(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-of-border px-4 py-2">
        <Filters projectId={projectId} />
        <div className="flex items-center gap-2">
          {data ? (
            <span className="text-xs text-of-muted">
              {data.items.length < data.total
                ? `${data.total}건 중 ${data.items.length}건 표시 (검색·필터로 좁혀 주세요)`
                : `${data.total}건`}
            </span>
          ) : null}
          <Select
            aria-label="정렬"
            className="h-7 w-28 text-xs"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="created">생성순</option>
            <option value="subject">제목순 (가나다)</option>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={exportCsv.isPending}
            onClick={() => exportCsv.mutate()}
          >
            <Download size={14} /> 내보내기
          </Button>
          <ImportDialog projectId={projectId} />
        </div>
      </div>

      <SavedFilters projectId={projectId} />

      <NewWorkPackageInline projectId={projectId} />

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState title="조건에 맞는 작업이 없습니다" hint="필터를 조정하거나 새 작업을 만들어 보세요." />
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-of-border text-left text-xs text-of-muted">
                <th className="px-4 py-2 font-medium">제목</th>
                <th className="w-24 px-2 py-2 font-medium">타입</th>
                <th className="w-28 px-2 py-2 font-medium">상태</th>
                <th className="w-24 px-2 py-2 font-medium">우선순위</th>
                <th className="w-28 px-2 py-2 font-medium">담당자</th>
                <th className="w-28 px-2 py-2 font-medium">기한</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((wp) => (
                <tr
                  key={wp.id}
                  className="cursor-pointer border-b border-of-border hover:bg-of-surface-2"
                  onClick={() => openDrawer(wp.id)}
                >
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="w-full truncate text-left font-medium hover:text-of-accent"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDrawer(wp.id)
                      }}
                    >
                      {wp.subject}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <TypeChip type={wp.type} label={typeLabel(wp.type)} />
                  </td>
                  <td className="px-2 py-2">
                    <StatusChip status={wp.status} label={statusLabel(wp.status)} />
                  </td>
                  <td className="px-2 py-2">
                    <PriorityChip priority={wp.priority} />
                  </td>
                  <td className="px-2 py-2 text-xs text-of-muted">
                    {memberName(wp.assignee_id)}
                  </td>
                  <td className="px-2 py-2 text-xs text-of-muted">{wp.due_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer projectId={projectId} />
    </div>
  )
}
