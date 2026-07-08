import { gantt } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

import './gantt-theme.css'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useMilestones } from '@/features/milestones/api'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { useProjectRelations, useWorkPackages } from './api'
import { type ProjectRelation, ZOOM_LABELS, ZOOM_LEVELS, type ZoomLevel } from './timeline'
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

/** date-only 'YYYY-MM-DD' + 1 day — DHTMLX end_date is EXCLUSIVE while the
    OneFlow due date is INCLUSIVE (v73.1 R1-③). String math only (§6.1). */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + 1))
  return date.toISOString().slice(0, 10)
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

function GanttChart({
  items,
  milestones,
  relations,
  zoom,
  onOpen,
}: {
  items: WorkPackage[]
  milestones: Array<{ id: string; name: string; due_date: string | null }>
  relations: ProjectRelation[]
  zoom: ZoomLevel
  onOpen: (id: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const openRef = useRef(onOpen)
  openRef.current = onOpen

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
    gantt.templates.task_text = (_s, _e, task) => esc(String(task.text ?? ''))
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
    const initedContainer = container.current
    gantt.init(initedContainer)
    return () => {
      gantt.detachEvent(clickId)
      gantt.detachEvent(dblId)
      gantt.clearAll()
    }
  }, [])

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
  }, [items, milestones, relations, zoom])

  return <div ref={container} data-testid="gantt-container" className="h-full w-full" />
}

/* Timeline on DHTMLX Gantt Community v10 (MIT — Pass 73; v9 and below were
   GPL, the exact-version pin plus the cleanroom license gate keep copyleft
   out). Read-only parity with the previous clean-room timeline: bars from
   start/due, dependency links, milestone rows, today marker, zoom presets.
   Drag editing is a follow-up (needs version-token PATCH wiring). */
export function TimelinePage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})
  const milestones = useMilestones(projectId)
  const relations = useProjectRelations(projectId)
  const [zoom, setZoom] = useState<ZoomLevel>(loadZoom)
  const changeZoom = (next: ZoomLevel) => {
    setZoom(next)
    saveZoom(next)
  }

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const dated = data.items.filter((w) => w.start_date || w.due_date)
  const undated = data.items.filter((w) => !w.start_date && !w.due_date)
  if (dated.length === 0) {
    return (
      <EmptyState
        title="일정이 있는 작업이 없습니다"
        hint="작업에 시작일/기한을 지정하면 타임라인에 표시됩니다."
      />
    )
  }

  const drawableIds = new Set(dated.map((w) => w.id))
  const { omitted } = toLinks(relations.data?.items ?? [], drawableIds)

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-of-border px-4 py-1.5 text-xs text-of-muted">
        <span>줌</span>
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            type="button"
            aria-pressed={zoom === z}
            className={cn(
              'rounded-of px-2 py-0.5',
              zoom === z ? 'bg-of-accent-soft font-medium text-of-accent' : 'hover:bg-of-surface-2',
            )}
            onClick={() => changeZoom(z)}
          >
            {ZOOM_LABELS[z]}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3">
          {omitted > 0 ? (
            <span>일정 미정으로 표시되지 않은 의존 {omitted}건 (연관(relates)은 의존이 아니라 표시하지 않음)</span>
          ) : null}
          {undated.length > 0 ? (
            <span>일정 미정 {undated.length}건</span>
          ) : null}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <GanttChart
          items={data.items}
          milestones={milestones.data?.items ?? []}
          relations={relations.data?.items ?? []}
          zoom={zoom}
          onOpen={openDrawer}
        />
      </div>
      <DetailDrawer projectId={projectId} />
    </div>
  )
}
