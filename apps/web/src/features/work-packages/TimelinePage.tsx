import { gantt } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

import './gantt-theme.css'
import {
  BarChart3,
  CalendarDays,
  ChartGantt,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Table2,
  X,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useQueryClient } from '@tanstack/react-query'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useMilestones } from '@/features/milestones/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { Filters } from './Filters'
import { NewWorkPackageInline } from './NewWorkPackageInline'
import { TimelineItemActions } from './TimelineItemActions'
import { ganttDatesToPatch, nextDay } from './ganttDates'
import { usePatchWorkPackage, useProjectRelations, useWorkPackages } from './api'
import {
  parseTimelineFocus,
  parseZoomLevel,
  shiftTimelineFocus,
  type ProjectRelation,
  ZOOM_LABELS,
  ZOOM_LEVELS,
  type ZoomLevel,
} from './timeline'
import type { WorkPackage } from './types'

const ZOOM_STORAGE_KEY = 'oneflow.timeline.zoom.v1'

function loadZoom(): ZoomLevel {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY)
    return ZOOM_LEVELS.includes(raw as ZoomLevel) ? (raw as ZoomLevel) : 'fit'
  } catch {
    return 'fit'
  }
}

function saveZoom(zoom: ZoomLevel) {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, zoom)
  } catch {
    /* private mode / quota — in-memory only */
  }
}

/** Every DHTMLX text template renders as HTML — user text must be escaped
    here (v73.1 R1-⓪; the server sanitizes rich text, but subjects/names are
    plain strings that may contain markup characters). */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}


// Existing connector semantics (Pass 20, verified in v73.1 R1-①):
// blocks/precedes draw source→target, follows draws REVERSED, relates is
// not a dependency and draws nothing.
function toLinks(relations: ProjectRelation[], drawable: Set<string>) {
  // type '0' = finish-to-start — the one semantic the old connectors drew.
  const links: Array<{ id: string; source: string; target: string; type: string; css: string }> =
    []
  let omitted = 0
  for (const r of relations) {
    if (r.relation_type === 'relates') continue
    const [source, target] =
      r.relation_type === 'follows' ? [r.target_id, r.source_id] : [r.source_id, r.target_id]
    if (!drawable.has(source) || !drawable.has(target)) {
      omitted += 1
      continue
    }
    links.push({
      id: r.id,
      source,
      target,
      type: '0',
      css: r.relation_type === 'blocks' ? 'of-link-blocks' : 'of-link-normal',
    })
  }
  return { links, omitted }
}

type Scale = { unit: string; step: number; format: string }
const SCALES: Record<ZoomLevel, [Scale, ...Scale[]]> = {
  fit: [
    { unit: 'month', step: 1, format: '%Y.%m' },
    { unit: 'week', step: 1, format: '%d' },
  ],
  month: [
    { unit: 'month', step: 1, format: '%Y.%m' },
    { unit: 'week', step: 1, format: '%d일' },
  ],
  week: [
    { unit: 'month', step: 1, format: '%Y.%m' },
    { unit: 'day', step: 1, format: '%d' },
  ],
  day: [
    { unit: 'day', step: 1, format: '%Y.%m.%d' },
    { unit: 'hour', step: 6, format: '%H시' },
  ],
}

const MIN_COLUMN: Record<ZoomLevel, number> = { fit: 18, month: 28, week: 34, day: 40 }

const TIMELINE_FILTER_KEYS = [
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

const PROJECT_VIEWS = [
  { label: '표', path: 'work-packages', icon: Table2 },
  { label: '보드', path: 'board', icon: SquareKanban },
  { label: '캘린더', path: 'calendar', icon: CalendarDays },
  { label: '타임라인', path: 'timeline', icon: ChartGantt },
] as const

const TRANSIENT_VIEW_KEYS = [
  'scale',
  'focus',
  'wp',
  'move',
  'new',
  'draft',
  'new_status',
  'new_priority',
  'new_due',
] as const

function GanttChart({
  items,
  milestones,
  relations,
  zoom,
  focusDate,
  editable,
  onOpen,
  onAction,
  onReschedule,
}: {
  items: WorkPackage[]
  milestones: Array<{ id: string; name: string; due_date: string | null }>
  relations: ProjectRelation[]
  zoom: ZoomLevel
  focusDate: string
  editable: boolean
  onOpen: (id: string) => void
  onAction: (id: string, trigger: HTMLButtonElement) => void
  onReschedule: (
    id: string,
    patch: { start_date: string; due_date: string },
    rollback: () => void,
  ) => Promise<void>
}) {
  const container = useRef<HTMLDivElement>(null)
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const actionRef = useRef(onAction)
  actionRef.current = onAction
  const rescheduleRef = useRef(onReschedule)
  rescheduleRef.current = onReschedule
  const editableRef = useRef(editable)
  const pendingRef = useRef(false)
  const snapshotRef = useRef<{ id: string; start: Date | undefined; end: Date | undefined } | null>(null)

  // Lifecycle contract (v73.1 R1-②): the dhtmlx singleton is initialized once
  // per mount; cleanup detaches every event and clears data so a remount
  // (route revisit, StrictMode double-mount) starts clean.
  useEffect(() => {
    if (!container.current) return
    gantt.config.readonly = true
    gantt.config.drag_move = false
    gantt.config.drag_resize = false
    gantt.config.drag_progress = false
    gantt.config.drag_links = false
    gantt.config.details_on_dblclick = false
    gantt.config.date_format = '%Y-%m-%d'
    gantt.config.row_height = 32
    gantt.config.bar_height = 18
    gantt.config.columns = [{ name: 'text', label: '작업', tree: false, width: 220 }]
    gantt.templates.task_text = (_s, _e, task) => {
      const text = esc(String(task.text ?? ''))
      if (task.of_kind !== 'wp') return text
      const id = esc(String(task.id))
      return `<span class="of-gantt-task-inner"><span class="of-gantt-task-title">${text}</span><button type="button" class="of-gantt-action" data-of-gantt-action-id="${id}" aria-label="${text} 타임라인 항목 작업" aria-haspopup="menu" aria-expanded="false">...</button></span>`
    }
    gantt.templates.grid_row_class = () => 'of-gantt-row'
    gantt.templates.tooltip_text = () => '' // no HTML tooltip surface
    gantt.templates.link_class = (link) => String((link as { css?: string }).css ?? '')
    // Today indicator: the marker extension is not in the Community bundle —
    // a timeline cell class is the CSS fallback (v73.1 plan note).
    const todayIso = todayISO()
    gantt.templates.timeline_cell_class = (_task, date) => {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate(),
      ).padStart(2, '0')}`
      return iso === todayIso ? 'of-today-cell' : ''
    }
    const clickId = gantt.attachEvent('onTaskClick', (id: string) => {
      const task = gantt.getTask(id)
      if (task?.of_kind === 'wp') openRef.current(String(id))
      return false // never open any built-in editor (read-only)
    })
    const dblId = gantt.attachEvent('onTaskDblClick', () => false)
    // Drag editing (Pass 74): WP bars only, one in-flight edit at a time,
    // fail-closed on anything unknown (v74.1 R1-④/⑤).
    const beforeDragId = gantt.attachEvent('onBeforeTaskDrag', (id: string) => {
      if (!editableRef.current || pendingRef.current) return false
      const task = gantt.getTask(id)
      if (task?.of_kind !== 'wp') return false
      snapshotRef.current = {
        id: String(id),
        start: task.start_date ? new Date(task.start_date as Date) : undefined,
        end: task.end_date ? new Date(task.end_date as Date) : undefined,
      }
      return true
    })
    const afterDragId = gantt.attachEvent('onAfterTaskDrag', (id: string) => {
      const task = gantt.getTask(id)
      const snap = snapshotRef.current
      snapshotRef.current = null
      if (!task || !snap || snap.id !== String(id)) return
      const rollback = () => {
        const t = gantt.isTaskExists(id) ? gantt.getTask(id) : null
        if (t) {
          t.start_date = snap.start
          t.end_date = snap.end
          gantt.updateTask(String(id))
        }
      }
      pendingRef.current = true
      void rescheduleRef
        .current(String(id), ganttDatesToPatch(task.start_date as Date, task.end_date as Date), rollback)
        .finally(() => {
          pendingRef.current = false
        })
    })
    const initedContainer = container.current
    const findActionButton = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      return target?.closest<HTMLButtonElement>('[data-of-gantt-action-id]') ?? null
    }
    const suppressActionDrag = (event: Event) => {
      if (!findActionButton(event)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const openAction = (event: MouseEvent | KeyboardEvent) => {
      const button = findActionButton(event)
      if (!button) return
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
      const id = button.dataset.ofGanttActionId
      if (id) actionRef.current(id, button)
    }
    initedContainer.addEventListener('pointerdown', suppressActionDrag, true)
    initedContainer.addEventListener('click', openAction, true)
    initedContainer.addEventListener('keydown', openAction, true)
    gantt.init(initedContainer)
    return () => {
      initedContainer.removeEventListener('pointerdown', suppressActionDrag, true)
      initedContainer.removeEventListener('click', openAction, true)
      initedContainer.removeEventListener('keydown', openAction, true)
      gantt.detachEvent(clickId)
      gantt.detachEvent(dblId)
      gantt.detachEvent(beforeDragId)
      gantt.detachEvent(afterDragId)
      gantt.clearAll()
    }
  }, [])

  useEffect(() => {
    editableRef.current = editable
    gantt.config.readonly = !editable
    gantt.config.drag_move = editable
    gantt.config.drag_resize = editable
    gantt.render()
  }, [editable])

  // Data + zoom: no re-init — clearAll + parse only (R1-②).
  useEffect(() => {
    gantt.config.scales = SCALES[zoom]
    gantt.config.min_column_width = MIN_COLUMN[zoom]
    const tasks = [
      ...items
        .filter((w) => w.start_date || w.due_date)
        .map((w) => {
          const start = w.start_date ?? w.due_date!
          const due = w.due_date ?? w.start_date!
          return {
            id: w.id,
            text: w.subject,
            start_date: start,
            end_date: nextDay(due), // inclusive due → exclusive end (R1-③)
            of_kind: 'wp',
            css: `of-bar-${w.status}`,
          }
        }),
      ...milestones
        .filter((m): m is typeof m & { due_date: string } => m.due_date !== null)
        .map((m) => ({
          id: `ms-${m.id}`,
          text: m.name,
          start_date: m.due_date,
          type: 'milestone',
          duration: 0,
          of_kind: 'milestone',
        })),
    ]
    const drawable = new Set(tasks.map((t) => String(t.id)))
    const { links } = toLinks(relations, drawable)
    gantt.clearAll()
    gantt.parse({ data: tasks, links })
    gantt.render()
    const focusFrame = requestAnimationFrame(() =>
      gantt.showDate(new Date(`${focusDate}T12:00:00`)),
    )
    return () => cancelAnimationFrame(focusFrame)
  }, [focusDate, items, milestones, relations, zoom])

  return <div ref={container} data-testid="gantt-container" className="h-full w-full" />
}

/* Timeline on DHTMLX Gantt Community v10 (MIT — Pass 73; v9 and below were
   GPL, the exact-version pin plus the cleanroom license gate keep copyleft
   out). Bars, dependency links, milestone rows, today marker and zoom presets
   share the same chart lifecycle; authorized drag edits use versioned PATCH. */
export function TimelinePage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [queryDraft, setQueryDraft] = useState(query)
  const [filtersOpen, setFiltersOpen] = useState(() =>
    TIMELINE_FILTER_KEYS.some((key) => searchParams.has(key)),
  )
  const storedZoom = loadZoom()
  const rawScale = searchParams.get('scale')
  const rawFocus = searchParams.get('focus')
  const today = todayISO()
  const zoom = parseZoomLevel(rawScale, storedZoom)
  const focusDate = parseTimelineFocus(rawFocus, today)
  const filters = {
    status: searchParams.get('status') ?? undefined,
    priority: searchParams.get('priority') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    assignee_id: searchParams.get('assignee_id') ?? undefined,
    milestone_id: searchParams.get('milestone_id') ?? undefined,
    customer_id: searchParams.get('customer_id') ?? undefined,
    cycle_id: searchParams.get('cycle_id') ?? undefined,
    module_id: searchParams.get('module_id') ?? undefined,
    q: query || undefined,
    cf_field: searchParams.get('cf_field') ?? undefined,
    cf_op: searchParams.get('cf_op') ?? undefined,
    cf_value: searchParams.get('cf_value') ?? undefined,
  }
  const workPackages = useWorkPackages(projectId, filters)
  const capabilities = useWorkspaceCapabilities()
  const releasesEnabled = capabilities.data?.releases.enabled === true
  const milestones = useMilestones(projectId, releasesEnabled)
  const relations = useProjectRelations(projectId)
  const editable = useCanWrite(projectId)
  const patch = usePatchWorkPackage(projectId)
  const queryClient = useQueryClient()
  const [dragNotice, setDragNotice] = useState<string | null>(null)
  const [itemActionMessage, setItemActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)
  const [activeAction, setActiveAction] = useState<{
    wpId: string
    top: number
    left: number
    trigger: HTMLButtonElement
  } | null>(null)

  useEffect(() => {
    setQueryDraft(query)
  }, [query])

  useEffect(() => {
    const scaleIsCanonical = rawScale === null || ZOOM_LEVELS.includes(rawScale as ZoomLevel)
    const focusIsCanonical = rawFocus === null || (rawFocus === focusDate && rawFocus !== today)
    if (scaleIsCanonical && focusIsCanonical) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (!scaleIsCanonical) next.delete('scale')
      if (!focusIsCanonical) next.delete('focus')
      return next
    }, { replace: true })
  }, [focusDate, rawFocus, rawScale, setSearchParams, today])

  useEffect(() => {
    if (!activeAction) return
    const { trigger, wpId } = activeAction
    trigger.setAttribute('aria-expanded', 'true')
    trigger.setAttribute('aria-controls', `timeline-actions-${wpId}`)
    return () => {
      trigger.setAttribute('aria-expanded', 'false')
      trigger.removeAttribute('aria-controls')
    }
  }, [activeAction])

  const changeZoom = (next: ZoomLevel) => {
    saveZoom(next)
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      if (next === 'fit') params.delete('scale')
      else params.set('scale', next)
      return params
    }, { replace: true })
  }

  const changeFocus = (next: string) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      if (next === today) params.delete('focus')
      else params.set('focus', next)
      return params
    }, { replace: true })
  }

  const viewHref = (path: string) => {
    const next = new URLSearchParams(searchParams)
    TRANSIENT_VIEW_KEYS.forEach((key) => next.delete(key))
    const suffix = next.toString()
    return `/projects/${projectId}/${path}${suffix ? `?${suffix}` : ''}`
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      const value = queryDraft.trim()
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  }

  const clearSearch = () => {
    setQueryDraft('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('q')
      return next
    }, { replace: true })
  }

  const clearFilters = () => {
    setQueryDraft('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      TIMELINE_FILTER_KEYS.forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }

  const openDrawer = (id: string, opts: { move?: boolean } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      if (opts.move) next.set('move', '1')
      else next.delete('move')
      return next
    })
  }

  const openCreate = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('new', '1')
      next.delete('new_status')
      next.delete('new_priority')
      next.delete('new_due')
      return next
    })
  }

  const reschedule = async (
    id: string,
    fields: { start_date: string; due_date: string },
    rollback: () => void,
  ) => {
    // Version token from the cache, never the drag-time snapshot (#97).
    const cached = queryClient.getQueryData<{ version: number }>(['work-package', id])
    const listItem = workPackages.data?.items.find((w) => w.id === id)
    const version = cached?.version ?? listItem?.version ?? 0
    try {
      await patch.mutateAsync({ wpId: id, patch: { expected_version: version, ...fields } })
      setDragNotice(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setDragNotice('다른 곳에서 먼저 수정되어 최신 일정으로 새로고침했습니다.')
        void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      } else {
        rollback()
        setDragNotice('일정을 저장하지 못해 원래대로 되돌렸습니다.')
        void queryClient.invalidateQueries({ queryKey: ['members', projectId] })
        void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      }
    }
  }

  const items = workPackages.data?.items ?? []
  const dated = items.filter((w) => w.start_date || w.due_date)
  const undated = items.filter((w) => !w.start_date && !w.due_date)
  const drawableIds = new Set(dated.map((w) => w.id))
  const { omitted } = toLinks(relations.data?.items ?? [], drawableIds)
  const activeFilterCount = TIMELINE_FILTER_KEYS.filter((key) => searchParams.has(key)).length
  const hasFilters = activeFilterCount > 0

  const openActionMenu = (id: string, trigger: HTMLButtonElement) => {
    if (activeAction?.wpId === id) {
      setActiveAction(null)
      return
    }
    const rect = trigger.getBoundingClientRect()
    const width = 224
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 216)
    setActiveAction({ wpId: id, top: Math.max(8, top), left, trigger })
  }

  const activeWp = activeAction ? items.find((w) => w.id === activeAction.wpId) : null

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <FrameContextActions>
        <section
          aria-label="프로젝트 타임라인 제어"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5"
        >
          {workPackages.data ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-of-muted"
              aria-label={`일정 있음 ${dated.length}개, 전체 ${workPackages.data.total}개 작업`}
            >
              {dated.length} / {workPackages.data.total}
            </span>
          ) : null}
          <nav
            aria-label="프로젝트 작업 보기"
            className="flex h-7 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5"
          >
            {PROJECT_VIEWS.map((view) => {
              const Icon = view.icon
              const active = view.path === 'timeline'
              return (
                <Link
                  key={view.path}
                  to={viewHref(view.path)}
                  aria-label={`${view.label} 보기`}
                  aria-current={active ? 'page' : undefined}
                  title={`${view.label} 보기`}
                  className={`flex h-6 w-7 items-center justify-center rounded-[4px] text-of-muted hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus ${
                    active ? 'bg-of-surface-selected text-of-accent' : ''
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
            aria-controls="project-timeline-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={13} /> 필터
            {activeFilterCount > 0 ? (
              <span className="tabular-nums">{activeFilterCount}</span>
            ) : null}
          </Button>
          <Link
            to={`/projects/${projectId}/dashboard`}
            className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <BarChart3 size={13} aria-hidden="true" /> 분석
          </Link>
          {editable ? (
            <Button size="sm" onClick={openCreate}>
              <Plus size={13} /> 새 작업
            </Button>
          ) : null}
        </section>
      </FrameContextActions>

      {filtersOpen ? (
        <div
          id="project-timeline-filters"
          className="animate-in border-b border-of-border bg-of-surface px-4 py-2.5 fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        >
          <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
            <form onSubmit={submitSearch} className="flex min-w-[220px] flex-1 gap-2 sm:max-w-sm">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                  aria-hidden="true"
                />
                <Input
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="작업 검색"
                  aria-label="프로젝트 타임라인 검색어"
                  className="h-7 pl-8 pr-7 text-xs"
                />
                {queryDraft ? (
                  <button
                    type="button"
                    aria-label="타임라인 검색어 지우기"
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
            {hasFilters ? (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw size={13} /> 초기화
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {editable || searchParams.has('draft') ? (
        <NewWorkPackageInline projectId={projectId} canWrite={editable} />
      ) : null}

      {!editable ? <ReadOnlyNotice className="mx-4 mt-2" /> : null}
      {itemActionMessage || dragNotice ? (
        <div
          role={itemActionMessage?.tone === 'error' || dragNotice ? 'alert' : 'status'}
          aria-live="polite"
          className={`border-b border-of-border px-4 py-2 text-xs ${
            itemActionMessage?.tone === 'error' || dragNotice
              ? 'bg-of-danger/10 text-of-danger'
              : 'bg-of-surface-2/60 text-of-muted'
          }`}
        >
          {dragNotice ?? itemActionMessage?.text}
        </div>
      ) : null}

      <section
        aria-label="프로젝트 작업 타임라인"
        aria-busy={workPackages.isPending}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-of-text">타임라인</h1>
            <span className="block truncate text-[11px] text-of-muted">
              {workPackages.isError
                ? '프로젝트 일정을 불러오지 못했습니다'
                : workPackages.data
                  ? `${focusDate.replaceAll('-', '.')} 기준 · 일정 있음 ${dated.length}건 · 일정 미정 ${undated.length}건${
                      releasesEnabled
                        ? ` · 마일스톤 ${milestones.data?.items.length ?? 0}건`
                        : ''
                    }`
                  : '프로젝트 일정을 불러오는 중'}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
            <div
              className="flex h-7 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5"
              aria-label="타임라인 배율"
            >
              {ZOOM_LEVELS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={zoom === value}
                  className={cn(
                    'flex h-6 min-w-7 items-center justify-center rounded-[4px] px-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                    zoom === value
                      ? 'bg-of-surface-selected font-medium text-of-accent'
                      : 'text-of-muted hover:text-of-text',
                  )}
                  onClick={() => changeZoom(value)}
                >
                  {ZOOM_LABELS[value]}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="이전 기간"
              onClick={() => changeFocus(shiftTimelineFocus(focusDate, zoom, -1))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="오늘을 타임라인 기준일로"
              onClick={() => changeFocus(today)}
            >
              <LocateFixed size={13} /> 오늘
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="다음 기간"
              onClick={() => changeFocus(shiftTimelineFocus(focusDate, zoom, 1))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </header>

        <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 border-b border-of-border bg-of-surface-2/45 px-3 py-1 text-[11px] text-of-muted sm:px-4">
          <span>{editable ? '막대를 드래그해 일정을 조정할 수 있습니다' : '일정 보기 전용'}</span>
          {omitted > 0 ? (
            <span>
              일정 미정으로 표시되지 않은 의존 {omitted}건 (연관은 의존에서 제외)
            </span>
          ) : null}
          {relations.isError ? <span className="text-of-danger">의존관계를 불러오지 못했습니다</span> : null}
        </div>

        {workPackages.isPending ? (
          <TimelineSkeleton />
        ) : workPackages.isError ? (
          <TimelineStateFrame>
            <ErrorState
              error={workPackages.error}
              onRetry={() => workPackages.refetch()}
              className="min-h-0"
            />
          </TimelineStateFrame>
        ) : workPackages.data.total === 0 && hasFilters ? (
          <TimelineStateFrame>
            <EmptyState
              title="조건에 맞는 작업이 없습니다"
              hint="검색이나 필터를 조정해 다른 일정을 찾아보세요."
              className="min-h-0"
            >
              <Button size="sm" variant="outline" onClick={clearFilters}>
                <RotateCcw size={13} /> 현재 보기 초기화
              </Button>
            </EmptyState>
          </TimelineStateFrame>
        ) : workPackages.data.total === 0 ? (
          <TimelineStateFrame>
            <EmptyState
              title="아직 작업이 없습니다"
              hint={
                editable
                  ? '첫 작업을 만들고 시작일이나 기한을 지정해 보세요.'
                  : '프로젝트 멤버가 일정을 추가하면 타임라인에 표시됩니다.'
              }
              className="min-h-0"
            >
              {editable ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus size={13} /> 첫 작업 만들기
                </Button>
              ) : null}
            </EmptyState>
          </TimelineStateFrame>
        ) : dated.length === 0 ? (
          <TimelineStateFrame>
            <EmptyState
              title="일정이 있는 작업이 없습니다"
              hint="작업에 시작일이나 기한을 지정하면 타임라인에 표시됩니다."
              className="min-h-0"
            >
              {editable ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus size={13} /> 일정 작업 만들기
                </Button>
              ) : null}
            </EmptyState>
          </TimelineStateFrame>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden bg-of-surface">
            <GanttChart
              items={items}
              milestones={releasesEnabled ? (milestones.data?.items ?? []) : []}
              relations={relations.data?.items ?? []}
              zoom={zoom}
              focusDate={focusDate}
              editable={editable}
              onOpen={openDrawer}
              onAction={openActionMenu}
              onReschedule={reschedule}
            />
          </div>
        )}
      </section>

      {activeWp && activeAction ? (
        <TimelineItemActions
          wp={activeWp}
          projectId={projectId}
          canWrite={editable}
          trigger={activeAction.trigger}
          top={activeAction.top}
          left={activeAction.left}
          onOpen={openDrawer}
          onOpenMove={(id) => openDrawer(id, { move: true })}
          onMessage={(text, tone = 'info') => setItemActionMessage({ text, tone })}
          onClose={() => setActiveAction(null)}
        />
      ) : null}
      <DetailDrawer projectId={projectId} />
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div
      role="status"
      aria-label="프로젝트 타임라인 불러오는 중"
      data-testid="project-timeline-skeleton"
      className="min-h-0 flex-1 overflow-hidden bg-of-surface"
    >
      <TimelineScaffold>
        <div className="space-y-4 p-4">
          {[42, 66, 54, 78, 38].map((width, index) => (
            <div key={width} className="flex h-8 items-center">
              <Skeleton
                className="h-4"
                style={{ width: `${width}%`, marginLeft: `${(index * 9) % 22}%` }}
              />
            </div>
          ))}
        </div>
      </TimelineScaffold>
    </div>
  )
}

function TimelineStateFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden bg-of-surface"
      data-testid="project-timeline-state-frame"
    >
      <div className="h-full opacity-55" aria-hidden="true">
        <TimelineScaffold>
          <div className="space-y-4 p-4">
            {[58, 36, 72, 49].map((width, index) => (
              <div
                key={width}
                className="h-4 bg-of-border/70"
                style={{ width: `${width}%`, marginLeft: `${index * 7}%` }}
              />
            ))}
          </div>
        </TimelineScaffold>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-of-surface/75 p-4">
        {children}
      </div>
    </div>
  )
}

function TimelineScaffold({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full min-h-[420px] min-w-[720px] grid-cols-[220px_1fr]">
      <div className="border-r border-of-border">
        <div className="flex h-12 items-center border-b border-of-border px-3">
          <Skeleton className="h-3 w-16" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex h-8 items-center border-b border-of-border px-3">
            <Skeleton className="h-3" style={{ width: `${48 + (row % 3) * 14}%` }} />
          </div>
        ))}
      </div>
      <div
        className="min-w-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--color-of-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-of-border) 1px, transparent 1px)',
          backgroundSize: '64px 100%, 100% 32px',
        }}
      >
        {children}
      </div>
    </div>
  )
}
