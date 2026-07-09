import { Columns3, Download } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select } from '@/components/ui/select'
import { useCustomFields } from '@/features/custom-fields/api'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'

import {
  COLUMN_LABELS,
  LIST_COLUMNS,
  MAX_CUSTOM_COLUMNS,
  parseCustomColumns,
  type ListColumn,
  parseColumns,
  serializeColumns,
} from './columns'
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


/* Custom-column cell (Pass 67): the requested field list is the source of
   truth — a missing value renders as an empty cell (v67.1 R1-⑥). */
function renderCustomCell(
  wp: { custom_values?: Array<{ field_id: string; value: unknown; member_display_name: string | null }> | null },
  fieldId: string,
  fieldType: string | undefined,
): string {
  const hit = (wp.custom_values ?? []).find((v) => v.field_id.toLowerCase() === fieldId)
  if (!hit) return '—'
  if (fieldType === 'member') return hit.member_display_name ?? '—'
  if (fieldType === 'boolean') return hit.value === true || hit.value === 'true' ? '✓' : '─'
  return String(hit.value ?? '—')
}

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
    cf_field: searchParams.get('cf_field') ?? undefined,
    cf_op: searchParams.get('cf_op') ?? undefined,
    cf_value: searchParams.get('cf_value') ?? undefined,
  }
  // placed after columns parsing below (custom_fields follows the visible columns)
  const customFields = useCustomFields(projectId)
  const knownFieldIds = new Set((customFields.data?.items ?? []).map((f) => f.id.toLowerCase()))
  const columns = parseColumns(searchParams.get('columns'))
  // Definitions are the render-time source of truth: columns whose field is
  // gone drop out on the next canonicalize (v67.1 R1-⑥).
  const customColumns = parseCustomColumns(
    searchParams.get('columns'),
    customFields.data ? knownFieldIds : undefined,
  )
  const fieldById = new Map((customFields.data?.items ?? []).map((f) => [f.id.toLowerCase(), f]))
  const show = (key: ListColumn) => columns.includes(key)
  const writeColumns = (nextBuiltin: ListColumn[], nextCustom: string[]) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        const value = serializeColumns(nextBuiltin, nextCustom)
        if (value) p.set('columns', value)
        else p.delete('columns')
        return p
      },
      { replace: true },
    )
  }
  const toggleColumn = (key: ListColumn) => {
    const next = show(key) ? columns.filter((k) => k !== key) : [...columns, key]
    if (next.length === 0) return // at least one configurable column (v32.1 R1-①)
    writeColumns(next, customColumns)
  }
  const toggleCustomColumn = (id: string) => {
    const lower = id.toLowerCase()
    const next = customColumns.includes(lower)
      ? customColumns.filter((k) => k !== lower)
      : [...customColumns, lower]
    if (next.length > MAX_CUSTOM_COLUMNS) return // deterministic cap (v67.1 R1-①)
    writeColumns(columns, next)
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
  const listFilters =
    customColumns.length > 0 ? { ...filters, custom_fields: customColumns.join(',') } : filters
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, listFilters)
  const exportCsv = useExportCsv(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const canWrite = useCanWrite(projectId)
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
      {members.data && !canWrite ? <ReadOnlyNotice className="mx-4 mt-2" /> : null}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 size={14} /> 표시 열
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {LIST_COLUMNS.map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={show(key)}
                  // The last remaining column cannot be turned off (R1-①).
                  disabled={show(key) && columns.length === 1}
                  onCheckedChange={() => toggleColumn(key)}
                  aria-label={`${COLUMN_LABELS[key]} 열 표시`}
                >
                  {COLUMN_LABELS[key]}
                </DropdownMenuCheckboxItem>
              ))}
              {(customFields.data?.items ?? [])
                .filter((f) => f.is_active)
                .map((f) => {
                  const lower = f.id.toLowerCase()
                  const on = customColumns.includes(lower)
                  return (
                    <DropdownMenuCheckboxItem
                      key={f.id}
                      checked={on}
                      // Cap: five custom columns per view (v67.1 R1-①).
                      disabled={!on && customColumns.length >= MAX_CUSTOM_COLUMNS}
                      onCheckedChange={() => toggleCustomColumn(f.id)}
                      aria-label={`${f.name} 열 표시`}
                    >
                      {f.name} <span className="text-of-muted">(커스텀)</span>
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
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

      {canWrite ? <NewWorkPackageInline projectId={projectId} /> : null}

      {canWrite && selected.size > 0 ? (
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
                {canWrite ? <th className="w-8 px-2 py-2" aria-label="선택 열" /> : null}
                <th className="px-4 py-2 font-medium">제목</th>
                {show('type') ? <th className="w-24 px-2 py-2 font-medium">타입</th> : null}
                {show('status') ? <th className="w-28 px-2 py-2 font-medium">상태</th> : null}
                {show('priority') ? <th className="w-24 px-2 py-2 font-medium">우선순위</th> : null}
                {show('assignee') ? <th className="w-28 px-2 py-2 font-medium">담당자</th> : null}
                {show('start_date') ? <th className="w-28 px-2 py-2 font-medium">시작일</th> : null}
                {show('due_date') ? <th className="w-28 px-2 py-2 font-medium">기한</th> : null}
                {show('created_at') ? <th className="w-28 px-2 py-2 font-medium">생성일</th> : null}
                {customColumns.map((id) => (
                  <th key={id} className="w-28 px-2 py-2 font-medium">
                    {fieldById.get(id)?.name ?? '커스텀'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((wp) => (
                <tr
                  key={wp.id}
                  className="cursor-pointer border-b border-of-border hover:bg-of-surface-2"
                  onClick={() => openDrawer(wp.id)}
                >
                  {canWrite ? (
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
                  ) : null}
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
                  {show('type') ? (
                    <td className="px-2 py-2">
                      <TypeChip type={wp.type} label={typeLabel(wp.type)} />
                    </td>
                  ) : null}
                  {show('status') ? (
                    <td className="px-2 py-2">
                      <StatusChip status={wp.status} label={statusLabel(wp.status)} />
                    </td>
                  ) : null}
                  {show('priority') ? (
                    <td className="px-2 py-2">
                      <PriorityChip priority={wp.priority} />
                    </td>
                  ) : null}
                  {show('assignee') ? (
                    <td className="px-2 py-2 text-xs text-of-muted">
                      {memberName(wp.assignee_id)}
                    </td>
                  ) : null}
                  {show('start_date') ? (
                    <td className="px-2 py-2 text-xs text-of-muted">{wp.start_date ?? '—'}</td>
                  ) : null}
                  {show('due_date') ? (
                    <td className="px-2 py-2 text-xs text-of-muted">{wp.due_date ?? '—'}</td>
                  ) : null}
                  {show('created_at') ? (
                    // UTC date part of the ISO timestamp — timezone-independent
                    // date-only display, matching due_date (v32.1 R1-⑤).
                    <td className="px-2 py-2 text-xs text-of-muted">
                      {wp.created_at.slice(0, 10)}
                    </td>
                  ) : null}
                  {customColumns.map((id) => (
                    <td key={id} className="px-2 py-2 text-xs text-of-muted">
                      {renderCustomCell(wp, id, fieldById.get(id)?.field_type)}
                    </td>
                  ))}
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
