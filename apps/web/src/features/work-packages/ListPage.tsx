import {
  AlertCircle,
  BarChart3,
  Bookmark,
  CalendarDays,
  ChartGantt,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table2,
  Upload,
  X,
} from 'lucide-react'
import { Fragment, type FormEvent, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState } from '@/components/shell/states'
import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataGrid, DataGridFrame, type GridDensity } from '@/components/ui/data-grid'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCustomFields } from '@/features/custom-fields/api'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'

import {
  MAX_CUSTOM_COLUMNS,
  parseCustomColumns,
  type ListColumn,
  parseColumns,
  serializeColumns,
} from './columns'
import { DetailDrawer } from './DetailDrawer'
import { DisplayMenu } from './DisplayMenu'
import {
  parseWorkPackageSort,
  serializeWorkPackageSort,
  type WorkPackageSort,
} from './displayOptions'
import {
  buildProjectWorkItemGroups,
  parseProjectWorkItemGroup,
  serializeProjectWorkItemGroup,
  type ProjectWorkItemGroup,
  type ProjectWorkItemGroupBy,
} from './projectWorkItemDisplay'
import { Filters } from './Filters'
import { ImportDialog } from './ImportDialog'
import { SavedFilters } from './SavedFilters'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { type BulkUpdateResult, useBulkUpdate, useWorkPackages } from './api'
import { useExportCsv } from './csv'
import { WorkPackageRowActions, type RowActionMessage } from './RowActions'
import { PRIORITY_LABELS, WP_PRIORITIES, WP_STATUSES, type WorkPackage } from './types'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

const VIEW_CONTROL_KEYS = [
  'status',
  'priority',
  'type',
  'assignee_id',
  'milestone_id',
  'customer_id',
  'cycle_id',
  'module_id',
  'q',
  'columns',
  'sort',
  'cf_field',
  'cf_op',
  'cf_value',
  'group_by',
  'density',
] as const

const RESULT_FILTER_KEYS = [
  'status',
  'priority',
  'type',
  'assignee_id',
  'milestone_id',
  'customer_id',
  'cycle_id',
  'module_id',
  'q',
  'cf_field',
  'cf_op',
  'cf_value',
] as const

const UNASSIGNED_BULK_VALUE = '__unassigned'

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
    milestone_id: searchParams.get('milestone_id') ?? undefined,
    customer_id: searchParams.get('customer_id') ?? undefined,
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
  const sort = parseWorkPackageSort(searchParams.get('sort'))
  const groupBy = parseProjectWorkItemGroup(searchParams.get('group_by'))
  const density: GridDensity =
    searchParams.get('density') === 'comfortable' ? 'comfortable' : 'compact'
  const query = searchParams.get('q') ?? ''
  const importOpen = searchParams.get('ops') === 'import'
  const [queryDraft, setQueryDraft] = useState(query)
  const [filtersOpen, setFiltersOpen] = useState(() =>
    RESULT_FILTER_KEYS.some((key) => searchParams.get(key)),
  )
  const [savedViewsOpen, setSavedViewsOpen] = useState(false)

  useEffect(() => {
    setQueryDraft(query)
  }, [query])

  useEffect(() => {
    const rawGroup = searchParams.get('group_by')
    const rawDensity = searchParams.get('density')
    const groupInvalid =
      rawGroup !== null && !['status', 'priority', 'none'].includes(rawGroup)
    const densityInvalid =
      rawDensity !== null && !['compact', 'comfortable'].includes(rawDensity)
    if (!groupInvalid && !densityInvalid) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (groupInvalid) next.delete('group_by')
        if (densityInvalid) next.delete('density')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  const setSort = (value: WorkPackageSort) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const serialized = serializeWorkPackageSort(value)
        if (serialized) next.set('sort', serialized)
        else next.delete('sort')
        return next
      },
      { replace: true },
    )
  }
  const setGroupBy = (value: ProjectWorkItemGroupBy) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const serialized = serializeProjectWorkItemGroup(value)
        if (serialized) next.set('group_by', serialized)
        else next.delete('group_by')
        return next
      },
      { replace: true },
    )
  }
  const setDensity = (value: GridDensity) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'comfortable') next.set('density', value)
        else next.delete('density')
        return next
      },
      { replace: true },
    )
  }
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const trimmed = queryDraft.trim()
        if (trimmed) next.set('q', trimmed)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }
  const clearSearch = () => {
    setQueryDraft('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      },
      { replace: true },
    )
  }
  const clearViewControls = () => {
    setQueryDraft('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        VIEW_CONTROL_KEYS.forEach((key) => next.delete(key))
        next.delete('ops')
        return next
      },
      { replace: true },
    )
  }
  const setImportOpen = (nextOpen: boolean) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (nextOpen) next.set('ops', 'import')
        else next.delete('ops')
        return next
      },
      { replace: true },
    )
  }
  const activeControlCount = VIEW_CONTROL_KEYS.filter((key) => searchParams.get(key)).length
  const hasResultFilters = RESULT_FILTER_KEYS.some((key) => searchParams.get(key))
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
  const [actionMessage, setActionMessage] = useState<RowActionMessage | null>(null)
  const [bulkNotice, setBulkNotice] = useState<BulkUpdateResult | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const visibleItems = data?.items ?? []
  const selectedVisibleItems = visibleItems.filter((wp) => selected.has(wp.id))
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleItems.length === visibleItems.length
  const selectedPreview = selectedVisibleItems
    .slice(0, 3)
    .map((wp) => wp.subject)
    .join(', ')

  useEffect(() => {
    if (!data) return
    const visibleIds = new Set(data.items.map((wp) => wp.id))
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [data])

  useEffect(() => {
    setCollapsedGroups(new Set())
  }, [groupBy])

  const toggleSelected = (id: string) => {
    setBulkNotice(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllVisible = () => {
    setBulkNotice(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleItems.forEach((wp) => next.delete(wp.id))
      } else {
        visibleItems.forEach((wp) => next.add(wp.id))
      }
      return next
    })
  }
  const clearBulkSelection = () => {
    setSelected(new Set())
    setBulkStatus('')
    setBulkPriority('')
    setBulkAssignee('')
    bulk.reset()
  }

  const applyBulk = () => {
    const patch: { status?: string; assignee_id?: string | null; priority?: string } = {}
    if (bulkStatus) patch.status = bulkStatus
    if (bulkPriority) patch.priority = bulkPriority
    if (bulkAssignee) patch.assignee_id = bulkAssignee === UNASSIGNED_BULK_VALUE ? null : bulkAssignee
    if (selected.size === 0 || Object.keys(patch).length === 0) return
    bulk.mutate(
      { ids: [...selected], patch },
      {
        onSuccess: (result) => {
          setBulkNotice(result)
          setSelected(new Set())
          setBulkStatus('')
          setBulkPriority('')
          setBulkAssignee('')
        },
      },
    )
  }

  const openDrawer = (id: string, options: { move?: boolean } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      if (options.move) next.set('move', '1')
      else next.delete('move')
      return next
    })
  }

  const openCreate = (prefill?: ProjectWorkItemGroup['prefill']) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('new', '1')
      if (prefill?.status) next.set('new_status', prefill.status)
      else next.delete('new_status')
      if (prefill?.priority) next.set('new_priority', prefill.priority)
      else next.delete('new_priority')
      return next
    })
  }

  const projectViews = [
    { label: '표', path: 'work-packages', icon: Table2, active: true },
    { label: '보드', path: 'board', icon: SquareKanban, active: false },
    { label: '캘린더', path: 'calendar', icon: CalendarDays, active: false },
    { label: '타임라인', path: 'timeline', icon: ChartGantt, active: false },
  ]
  const groups = data ? buildProjectWorkItemGroups(data.items, groupBy, statusLabel) : []
  const tableColumnCount = (canWrite ? 1 : 0) + 1 + columns.length + customColumns.length + 1
  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const renderWorkPackageRow = (wp: WorkPackage) => (
    <tr
      key={wp.id}
      className="group cursor-pointer border-b border-of-border hover:bg-of-surface-2 focus-within:bg-of-surface-2"
      onClick={() => openDrawer(wp.id)}
    >
      {canWrite ? (
        <td className="px-2 py-2">
          <input
            type="checkbox"
            aria-label={`${wp.subject} 선택`}
            checked={selected.has(wp.id)}
            onClick={(event) => event.stopPropagation()}
            onChange={() => toggleSelected(wp.id)}
            className="h-3.5 w-3.5 accent-of-accent"
          />
        </td>
      ) : null}
      <td className="px-4 py-2">
        <button
          type="button"
          className="w-full truncate text-left font-medium hover:text-of-accent"
          onClick={(event) => {
            event.stopPropagation()
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
        <td className="px-2 py-2 text-xs text-of-muted">{memberName(wp.assignee_id)}</td>
      ) : null}
      {show('start_date') ? (
        <td className="px-2 py-2 text-xs text-of-muted">{wp.start_date ?? '—'}</td>
      ) : null}
      {show('due_date') ? (
        <td className="px-2 py-2 text-xs text-of-muted">{wp.due_date ?? '—'}</td>
      ) : null}
      {show('created_at') ? (
        <td className="px-2 py-2 text-xs text-of-muted">{wp.created_at.slice(0, 10)}</td>
      ) : null}
      {customColumns.map((id) => (
        <td key={id} className="px-2 py-2 text-xs text-of-muted">
          {renderCustomCell(wp, id, fieldById.get(id)?.field_type)}
        </td>
      ))}
      <td className="sticky right-0 bg-of-surface px-2 py-2 text-right group-hover:bg-of-surface-2 group-focus-within:bg-of-surface-2">
        <WorkPackageRowActions
          projectId={projectId}
          wp={wp}
          canWrite={canWrite}
          onOpenDrawer={(id) => openDrawer(id)}
          onOpenMove={(id) => openDrawer(id, { move: true })}
          onMessage={setActionMessage}
        />
      </td>
    </tr>
  )

  return (
    <div className="flex h-full flex-col">
      {members.data && !canWrite ? <ReadOnlyNotice className="mx-4 mt-2" /> : null}
      <h1 className="sr-only">Work items</h1>
      <FrameContextActions>
        <section aria-label="작업 화면 제어" className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {data ? (
            <span
              data-testid="work-item-total"
              className="shrink-0 text-[11px] tabular-nums text-of-muted"
              aria-label={`전체 ${data.total}개 작업`}
            >
              {data.total}개
            </span>
          ) : null}
          <nav
            aria-label="프로젝트 작업 보기"
            className="flex h-7 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5"
          >
            {projectViews.map((view) => {
              const Icon = view.icon
              return (
                <Link
                  key={view.path}
                  to={`/projects/${projectId}/${view.path}`}
                  aria-label={`${view.label} 보기`}
                  aria-current={view.active ? 'page' : undefined}
                  title={`${view.label} 보기`}
                  className={`flex h-6 w-7 items-center justify-center rounded-[4px] text-of-muted hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus ${
                    view.active ? 'bg-of-surface-selected text-of-accent' : ''
                  }`}
                >
                  <Icon size={13} aria-hidden="true" />
                </Link>
              )
            })}
          </nav>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={filtersOpen}
            aria-controls="project-work-item-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={13} /> 필터
            {activeControlCount > 0 ? <span className="tabular-nums">{activeControlCount}</span> : null}
          </Button>
          <DisplayMenu
            sort={sort}
            groupBy={groupBy}
            columns={columns}
            customColumns={customColumns}
            customFields={customFields.data?.items ?? []}
            onSortChange={setSort}
            onGroupByChange={setGroupBy}
            onToggleColumn={toggleColumn}
            onToggleCustomColumn={toggleCustomColumn}
            density={density}
            onDensityChange={setDensity}
          />
          <Link
            to={`/projects/${projectId}/dashboard`}
            className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <BarChart3 size={13} aria-hidden="true" /> 분석
          </Link>
          {canWrite ? (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus size={13} /> 새 작업
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="작업 도구 더 보기">
                <MoreHorizontal size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                aria-label={savedViewsOpen ? '저장 뷰 닫기' : '저장 뷰 관리'}
                onSelect={() => setSavedViewsOpen((open) => !open)}
              >
                <Bookmark size={13} aria-hidden="true" />
                {savedViewsOpen ? '저장 뷰 닫기' : '저장 뷰 관리'}
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-label="내보내기"
                disabled={exportCsv.isPending}
                onSelect={() => exportCsv.mutate()}
              >
                <Download size={13} aria-hidden="true" /> 내보내기
              </DropdownMenuItem>
              <DropdownMenuItem aria-label="가져오기" onSelect={() => setImportOpen(true)}>
                <Upload size={13} aria-hidden="true" /> 가져오기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ImportDialog
            projectId={projectId}
            open={importOpen}
            onOpenChange={setImportOpen}
            trigger={false}
          />
        </section>
      </FrameContextActions>
      {filtersOpen || savedViewsOpen ? (
        <div className="animate-in border-b border-of-border bg-of-surface fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none">
          <div className="flex flex-col gap-2 px-4 py-2.5">
            {filtersOpen ? (
              <div
                id="project-work-item-filters"
                className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center"
              >
                <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 gap-2 sm:max-w-sm">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                    />
                    <Input
                      value={queryDraft}
                      onChange={(event) => setQueryDraft(event.target.value)}
                      placeholder="작업 검색"
                      aria-label="작업 목록 검색어"
                      className="h-7 pl-8 pr-7 text-xs"
                    />
                    {queryDraft ? (
                      <button
                        type="button"
                        aria-label="작업 검색어 지우기"
                        className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                        onClick={clearSearch}
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    <Search size={13} /> 검색
                  </Button>
                </form>
                <div className="min-w-0 flex-1">
                  <Filters projectId={projectId} />
                </div>
              </div>
            ) : null}

            {savedViewsOpen ? (
              <SavedFilters
                projectId={projectId}
                activeControlCount={activeControlCount}
                onClearCurrentView={clearViewControls}
                onClose={() => setSavedViewsOpen(false)}
                withTopBorder={filtersOpen}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {canWrite || searchParams.has('draft') ? (
        <NewWorkPackageInline projectId={projectId} canWrite={canWrite} />
      ) : null}

      {actionMessage ? (
        <div
          role={actionMessage.kind === 'error' ? 'alert' : 'status'}
          className={`border-b border-of-border px-4 py-2 text-xs ${
            actionMessage.kind === 'error'
              ? 'bg-of-danger/10 text-of-danger'
              : 'bg-of-surface-2/50 text-of-muted'
          }`}
        >
          {actionMessage.text}
        </div>
      ) : null}

      {bulkNotice ? (
        <div
          role="status"
          aria-label="일괄 작업 결과"
          className="flex flex-col gap-2 border-b border-of-border bg-of-accent-soft px-4 py-2 text-xs text-of-fg sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 size={14} className="text-of-accent" aria-hidden="true" />
            <span className="font-medium">일괄 변경 완료</span>
            <Badge variant="outline">변경 {bulkNotice.updated_ids.length}건</Badge>
            <Badge variant="outline">유지 {bulkNotice.unchanged_ids.length}건</Badge>
            {bulkNotice.skipped_ids.length > 0 ? (
              <Badge variant="outline">건너뜀 {bulkNotice.skipped_ids.length}건</Badge>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="일괄 작업 결과 닫기"
            className="w-fit text-of-muted hover:text-of-fg"
            onClick={() => setBulkNotice(null)}
          >
            닫기
          </button>
        </div>
      ) : null}

      {canWrite && selected.size > 0 ? (
        <section
          aria-label="일괄 작업"
          className="border-b border-of-border bg-of-surface-2/65 px-4 py-3 text-xs"
        >
          <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent">
                  <ClipboardList size={12} aria-hidden="true" />
                  {selected.size}건 선택
                </Badge>
                {selectedPreview ? (
                  <span className="min-w-0 truncate text-of-muted">
                    {selectedPreview}
                    {selected.size > selectedVisibleItems.length ? ` 외 ${selected.size - selectedVisibleItems.length}건` : ''}
                    {selectedVisibleItems.length > 3 ? ` 외 ${selectedVisibleItems.length - 3}건` : ''}
                  </span>
                ) : null}
              </div>
              {bulk.isError ? (
                <p role="alert" className="flex items-center gap-1 text-of-danger">
                  <AlertCircle size={13} aria-hidden="true" />
                  일괄 변경 실패
                </p>
              ) : bulk.isPending ? (
                <p role="status" className="text-of-muted">
                  적용 중…
                </p>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[9rem_9rem_10rem_auto_auto] lg:items-end">
              <Select
                aria-label="일괄 상태"
                className="h-8 text-xs"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
              >
                <option value="">상태 유지</option>
                {WP_STATUSES.map((key) => (
                  <option key={key} value={key}>
                    {statusLabel(key)}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="일괄 우선순위"
                className="h-8 text-xs"
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value)}
              >
                <option value="">우선순위 유지</option>
                {WP_PRIORITIES.map((key) => (
                  <option key={key} value={key}>
                    {PRIORITY_LABELS[key]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="일괄 담당자"
                className="h-8 text-xs"
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
              >
                <option value="">담당자 유지</option>
                <option value={UNASSIGNED_BULK_VALUE}>미배정으로 변경</option>
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
                <CheckCircle2 size={14} /> 적용
              </Button>
              <Button size="sm" variant="ghost" onClick={clearBulkSelection}>
                <RotateCcw size={14} /> 선택 해제
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-label="프로젝트 작업 결과"
        aria-busy={isPending}
        data-testid="project-work-items-results"
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-of-surface"
      >
        {isPending ? (
          <ProjectWorkItemsSkeleton density={density} />
        ) : isError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : data.total === 0 && hasResultFilters ? (
          <EmptyState
            title="조건에 맞는 작업이 없습니다"
            hint="검색이나 필터를 조정해 다른 작업을 찾아보세요."
          >
            <Button size="sm" variant="outline" aria-label="현재 보기 초기화" onClick={clearViewControls}>
              <RotateCcw size={13} /> 현재 보기 초기화
            </Button>
          </EmptyState>
        ) : data.total === 0 ? (
          <EmptyState
            title="아직 작업이 없습니다"
            hint={
              canWrite
                ? '첫 작업을 만들어 프로젝트 실행을 시작하세요.'
                : '프로젝트 멤버가 작업을 추가하면 이곳에 표시됩니다.'
            }
          >
            {canWrite ? (
              <Button size="sm" onClick={() => openCreate()}>
                <Plus size={13} /> 첫 작업 만들기
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <DataGridFrame
            density={density}
            className="h-full"
            aria-label="프로젝트 작업 표 스크롤 영역"
          >
            <DataGrid className="min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-of-border text-left text-xs text-of-muted">
                  {canWrite ? (
                    <th className="w-8 px-2 py-2" aria-label="선택 열">
                      <input
                        type="checkbox"
                        aria-label="현재 페이지 작업 선택"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="h-3.5 w-3.5 accent-of-accent"
                      />
                    </th>
                  ) : null}
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
                  <th className="sticky right-0 w-12 bg-of-surface px-2 py-2 text-right font-medium">
                    <span className="sr-only">행 작업</span>
                  </th>
                </tr>
              </thead>
              {groups.map((group) => {
                const collapsed = collapsedGroups.has(group.key)
                const sectionId = `project-work-item-group-items-${group.key}`
                return (
                  <Fragment key={group.key}>
                    {groupBy !== 'none' ? (
                      <tbody data-testid={`work-item-group-${group.key}`}>
                        <tr className="border-b border-of-border bg-of-surface-2/70">
                          <td colSpan={tableColumnCount} className="px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                aria-expanded={!collapsed}
                                aria-controls={sectionId}
                                aria-label={`${group.label} 그룹 ${collapsed ? '펼치기' : '접기'}`}
                                className="flex min-w-0 items-center gap-1.5 rounded-of px-1.5 py-1 text-xs font-medium text-of-text hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                                onClick={() => toggleGroup(group.key)}
                              >
                                {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                <span className="truncate">{group.label}</span>
                                <Badge variant="outline">{group.items.length}</Badge>
                              </button>
                              {canWrite ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  aria-label={`${group.label} 그룹에 새 작업`}
                                  title={`${group.label} 그룹에 새 작업`}
                                  onClick={() => openCreate(group.prefill)}
                                >
                                  <Plus size={13} />
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    ) : null}
                    <tbody id={sectionId}>
                      {collapsed ? null : group.items.map(renderWorkPackageRow)}
                    </tbody>
                  </Fragment>
                )
              })}
            </DataGrid>
          </DataGridFrame>
        )}
      </section>

      <DetailDrawer projectId={projectId} />
    </div>
  )
}

function ProjectWorkItemsSkeleton({ density }: { density: GridDensity }) {
  return (
    <DataGridFrame
      density={density}
      className="h-full"
      role="status"
      aria-label="불러오는 중"
      data-testid="project-work-items-skeleton"
    >
      <div className="min-w-[760px]">
        <div className="grid h-9 grid-cols-[2rem_minmax(18rem,1fr)_6rem_7rem_6rem_7rem_7rem_3rem] items-center gap-2 border-b border-of-border px-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className={index === 1 ? 'h-3 w-24' : 'h-3 w-12'} />
          ))}
        </div>
        {Array.from({ length: 4 }, (_, groupIndex) => (
          <Fragment key={groupIndex}>
            <div className="flex h-9 items-center gap-2 border-b border-of-border bg-of-surface-2/70 px-3">
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-6" />
            </div>
            {Array.from({ length: groupIndex === 0 ? 2 : 1 }, (_, rowIndex) => (
              <div
                key={rowIndex}
                className="grid h-10 grid-cols-[2rem_minmax(18rem,1fr)_6rem_7rem_6rem_7rem_7rem_3rem] items-center gap-2 border-b border-of-border px-2"
              >
                {Array.from({ length: 8 }, (_, cellIndex) => (
                  <Skeleton
                    key={cellIndex}
                    className={cellIndex === 1 ? 'h-3 w-40' : 'h-3 w-12'}
                  />
                ))}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </DataGridFrame>
  )
}
