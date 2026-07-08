import { gantt } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

import './gantt-theme.css'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { useQueryClient } from '@tanstack/react-query'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useMe, useMembers } from '@/features/members/api'
import { useMilestones } from '@/features/milestones/api'
import { useProject } from '@/features/projects/api'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { DetailDrawer } from './DetailDrawer'
import { ganttDatesToPatch, nextDay } from './ganttDates'
import { usePatchWorkPackage, useProjectRelations, useWorkPackages } from './api'
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
  editable,
  onOpen,
  onReschedule,
}: {
  items: WorkPackage[]
  milestones: Array<{ id: string; name: string; due_date: string | null }>
  relations: ProjectRelation[]
  zoom: ZoomLevel
  editable: boolean
  onOpen: (id: string) => void
  onReschedule: (
    id: string,
    patch: { start_date: string; due_date: string },
    rollback: () => void,
  ) => Promise<void>
}) {
  const container = useRef<HTMLDivElement>(null)
  const openRef = useRef(onOpen)
  openRef.current = onOpen
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
    gantt.init(initedContainer)
    return () => {
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
  const me = useMe()
  const members = useMembers(projectId)
  const project = useProject(projectId)
  const patch = usePatchWorkPackage(projectId)
  const queryClient = useQueryClient()
  const [dragNotice, setDragNotice] = useState<string | null>(null)
  const [zoom, setZoom] = useState<ZoomLevel>(loadZoom)
  const changeZoom = (next: ZoomLevel) => {
    setZoom(next)
    saveZoom(next)
  }

  // Edit gate (v74.1 R1-②): my role + archive state from authoritative
  // queries; anything unknown/loading stays read-only (fail-closed).
  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const editable =
    (myRole === 'owner' || myRole === 'member') && project.data?.archived_at === null

  const reschedule = async (
    id: string,
    fields: { start_date: string; due_date: string },
    rollback: () => void,
  ) => {
    // Version token from the cache, never the drag-time snapshot (#97).
    const cached = queryClient.getQueryData<{ version: number }>(['work-package', id])
    const listItem = data?.items.find((w) => w.id === id)
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
          {dragNotice ? <span role="alert" className="text-of-danger">{dragNotice}</span> : null}
          {editable ? <span>막대를 드래그해 일정을 조정할 수 있습니다</span> : null}
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
          editable={Boolean(editable)}
          onOpen={openDrawer}
          onReschedule={reschedule}
        />
      </div>
      <DetailDrawer projectId={projectId} />
    </div>
  )
}
