import { Download } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useMemberNames, useMembers } from '@/features/members/api'

import { DetailDrawer } from './DetailDrawer'
import { Filters } from './Filters'
import { ImportDialog } from './ImportDialog'
import { SavedFilters } from './SavedFilters'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { useBulkUpdate, useWorkPackages } from './api'
import { useExportCsv } from './csv'
import { PRIORITY_LABELS, STATUS_LABELS } from './types'
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
  const members = useMembers(projectId)
  const bulk = useBulkUpdate(projectId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkPriority, setBulkPriority] = useState('')
  const [bulkAssignee, setBulkAssignee] = useState('')

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyBulk = () => {
    const patch: { status?: string; assignee_id?: string; priority?: string } = {}
    if (bulkStatus) patch.status = bulkStatus
    if (bulkPriority) patch.priority = bulkPriority
    if (bulkAssignee) patch.assignee_id = bulkAssignee
    if (selected.size === 0 || Object.keys(patch).length === 0) return
    bulk.mutate(
      { ids: [...selected], patch },
      {
        onSuccess: () => {
          setSelected(new Set())
          setBulkStatus('')
          setBulkPriority('')
          setBulkAssignee('')
        },
      },
    )
  }

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

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-of-border bg-of-surface-2/40 px-4 py-2 text-xs">
          <span className="font-medium">{selected.size}건 선택</span>
          <Select
            aria-label="일괄 상태"
            className="h-7 w-28 text-xs"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
          >
            <option value="">상태 유지</option>
            {Object.entries(STATUS_LABELS).map(([key]) => (
              <option key={key} value={key}>
                {statusLabel(key)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="일괄 우선순위"
            className="h-7 w-28 text-xs"
            value={bulkPriority}
            onChange={(e) => setBulkPriority(e.target.value)}
          >
            <option value="">우선순위 유지</option>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="일괄 담당자"
            className="h-7 w-32 text-xs"
            value={bulkAssignee}
            onChange={(e) => setBulkAssignee(e.target.value)}
          >
            <option value="">담당자 유지</option>
            {(members.data?.items ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={bulk.isPending || (!bulkStatus && !bulkPriority && !bulkAssignee)}
            onClick={applyBulk}
          >
            적용
          </Button>
          <button
            type="button"
            className="text-of-muted hover:text-of-fg"
            onClick={() => setSelected(new Set())}
          >
            선택 해제
          </button>
          {bulk.isError ? <span className="text-of-danger">일괄 변경 실패</span> : null}
          {bulk.isSuccess && bulk.data.skipped_ids.length > 0 ? (
            <span className="text-of-muted">건너뜀 {bulk.data.skipped_ids.length}건</span>
          ) : null}
        </div>
      ) : null}

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
                <th className="w-8 px-2 py-2" aria-label="선택 열" />
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
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${wp.subject} 선택`}
                      checked={selected.has(wp.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelected(wp.id)}
                      className="h-3.5 w-3.5 accent-of-accent"
                    />
                  </td>
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
