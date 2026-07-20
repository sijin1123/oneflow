import {
  Bell,
  BellOff,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Copy,
  ExternalLink,
  Flag,
  Layers3,
  ListTree,
  MoveRight,
  Signal,
  SlidersHorizontal,
  Tag,
  Timer,
  UserRound,
  Users,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Input } from '@/components/ui/input'
import { AiSummarySection } from '@/features/ai/AiSummarySection'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { isAssignableMember } from '@/features/members/assignment'
import { useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import { useCycles } from '@/features/cycles/api'
import { useCustomers } from '@/features/customers/api'
import { useMilestones } from '@/features/milestones/api'
import { useModules } from '@/features/modules/api'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'

import { CustomFieldsSection } from './CustomFieldsSection'
import { DetailInlineAssigneeMenu } from './DetailInlineAssigneeMenu'
import { DetailInlineDateMenu } from './DetailInlineDateMenu'
import { DetailInlinePropertyMenu } from './DetailInlinePropertyMenu'
import { validateScheduleDates } from './scheduleDates'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { decideOnPatchError } from '@/lib/conflict'
import { formatDateTime } from '@/lib/datetime'

import { CostSection } from './CostSection'
import { HistorySection } from './HistorySection'
import { AttachmentsSection } from './AttachmentsSection'
import { PagesSection } from './PagesSection'
import { RelationsSection } from './RelationsSection'
import { TimeTrackingSection } from './TimeTrackingSection'
import { WorkItemDescriptionSection } from './WorkItemDescriptionSection'
import {
  useDuplicateWorkPackage,
  useMoveWorkPackage,
  usePatchWorkPackage,
  useSetWatching,
  useWatchers,
  useWorkPackage,
} from './api'
import { useStatusLabels } from './useStatusLabels'
import {
  DEFAULT_DETAIL_LAYOUT,
  DETAIL_LAYOUT_MAX,
  DETAIL_LAYOUT_MIN,
  DETAIL_LAYOUT_STORAGE_KEY,
  clampDetailLayoutValue,
  parseDetailLayout,
  serializeDetailLayout,
  type DetailLayoutPreferences,
} from './detailLayout'
import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WorkPackage,
  type WpPriority,
  type WpStatus,
} from './types'

export function DetailDrawer({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const wpId = searchParams.get('wp')

  const close = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('wp')
      next.delete('move')
      return next
    })
  }

  return (
    <Sheet open={wpId !== null} onOpenChange={(open) => !open && close()}>
      {wpId ? (
        <DrawerBody
          key={wpId}
          wpId={wpId}
          projectId={projectId}
          initialMoveOpen={searchParams.get('move') === '1'}
        />
      ) : null}
    </Sheet>
  )
}

function DrawerBody({
  wpId,
  projectId,
  initialMoveOpen,
}: {
  wpId: string
  projectId: string
  initialMoveOpen: boolean
}) {
  const { data: wp, isPending, isError, error, refetch } = useWorkPackage(wpId)

  return (
    <SheetContent title={wp ? wp.subject : '작업 상세'} displayTitle="작업 상세" className="max-w-4xl">
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <WorkPackageDetailPanel wp={wp} projectId={projectId} initialMoveOpen={initialMoveOpen} />
      )}
    </SheetContent>
  )
}


/* Cross-project move (Pass 66): pick a target, ALWAYS preview what gets
   detached/deleted (dry_run), then confirm. The server is the authority on
   target permissions (owner-of-source is checked there too). */
function MoveSection({ wp, projectId }: { wp: WorkPackage; projectId: string }) {
  const projects = useProjects()
  const move = useMoveWorkPackage(projectId)
  const [target, setTarget] = useState('')
  const preview = move.data?.dry_run ? move.data.cleared : null

  const pick = (pid: string) => {
    setTarget(pid)
    if (pid) move.mutate({ wpId: wp.id, target_project_id: pid, expected_version: wp.version, dry_run: true })
  }
  const summaryLine = (label: string, s2: { count: number; names: string[]; overflow: number }) =>
    s2.count > 0 ? `${label} ${s2.count}건(${s2.names.join(', ')}${s2.overflow ? ` 외 ${s2.overflow}` : ''})` : null

  const lines = preview
    ? [
        preview.parent ? '상위 작업 연결 해제' : null,
        summaryLine('하위 작업 분리', preview.children),
        preview.milestone ? '마일스톤 해제' : null,
        preview.cycle ? '사이클 해제' : null,
        preview.module ? '모듈 해제' : null,
        summaryLine('관계 삭제', preview.relations),
        summaryLine('커스텀 값 삭제', preview.custom_values),
        summaryLine('문서 연결 삭제', preview.document_links),
        summaryLine('워처 제거', preview.watchers_removed),
        preview.assignee_cleared ? '담당자 해제(대상 프로젝트 자격 없음)' : null,
      ].filter(Boolean)
    : []

  const candidates = (projects.data?.items ?? []).filter((p) => p.id !== projectId)

  return (
    <div className="rounded-of border border-of-border bg-of-surface-2/40 p-3 text-xs">
      <p className="mb-1.5 font-medium">다른 프로젝트로 이동</p>
      <select
        aria-label="이동 대상 프로젝트"
        className="h-7 w-full rounded-of border border-of-border bg-of-surface px-2 text-xs"
        value={target}
        onChange={(e) => pick(e.target.value)}
      >
        <option value="">프로젝트 선택…</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.key} · {p.name}
          </option>
        ))}
      </select>
      {preview && target ? (
        <div className="mt-2 space-y-1">
          {lines.length === 0 ? (
            <p className="text-of-muted">해제되는 참조 없음 — 코멘트·시간·이력은 함께 이동합니다.</p>
          ) : (
            <ul className="list-inside list-disc text-of-muted">
              {lines.map((l) => (
                <li key={l as string}>{l}</li>
              ))}
            </ul>
          )}
          <Button
            size="sm"
            disabled={move.isPending}
            onClick={() =>
              move.mutate({ wpId: wp.id, target_project_id: target, expected_version: wp.version })
            }
          >
            이동 실행
          </Button>
        </div>
      ) : null}
      {move.isError ? (
        <p role="alert" className="mt-1 text-of-danger">
          이동할 수 없습니다 — 출발 프로젝트 소유자만, 대상은 쓰기 가능한 프로젝트만 가능합니다.
        </p>
      ) : null}
      {move.data && !move.data.dry_run ? (
        <p role="status" className="mt-1 text-of-muted">이동되었습니다.</p>
      ) : null}
    </div>
  )
}

export function WorkPackageDetailPanel({
  wp,
  projectId,
  showFullPageLink = true,
  initialMoveOpen = false,
  resizableProperties = false,
}: {
  wp: WorkPackage
  projectId: string
  showFullPageLink?: boolean
  initialMoveOpen?: boolean
  resizableProperties?: boolean
}) {
  const patch = usePatchWorkPackage(projectId)
  const queryClient = useQueryClient()
  const capabilities = useWorkspaceCapabilities()
  const releasesEnabled = capabilities.data?.releases.enabled === true
  const customersEnabled = capabilities.data?.customers.enabled === true
  const milestones = useMilestones(projectId, releasesEnabled)
  const customers = useCustomers({ includeArchived: true, enabled: customersEnabled })
  const cycles = useCycles(projectId)
  const modules = useModules(projectId)
  const projectTypes = useProjectTypeOptions(projectId, { currentKey: wp.type })
  const members = useMembers(projectId)
  const statusLabel = useStatusLabels(projectId)
  const duplicate = useDuplicateWorkPackage(projectId)
  const canWrite = useCanWrite(projectId)
  const [moveOpen, setMoveOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview')
  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const detailGridRef = useRef<HTMLDivElement>(null)
  const propertiesFieldsRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{
    kind: 'panel' | 'label'
    startX: number
    startValue: number
    containerWidth: number
    userSelect: string
  } | null>(null)
  const [detailLayout, setDetailLayout] = useState<DetailLayoutPreferences>(() => {
    if (typeof window === 'undefined') return DEFAULT_DETAIL_LAYOUT
    return parseDetailLayout(window.localStorage.getItem(DETAIL_LAYOUT_STORAGE_KEY))
  })

  useEffect(() => {
    if (!resizableProperties) return
    window.localStorage.setItem(DETAIL_LAYOUT_STORAGE_KEY, serializeDetailLayout(detailLayout))
  }, [detailLayout, resizableProperties])

  useEffect(() => {
    if (!resizableProperties) return
    const sync = (event: StorageEvent) => {
      if (event.key === DETAIL_LAYOUT_STORAGE_KEY) setDetailLayout(parseDetailLayout(event.newValue))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [resizableProperties])

  useEffect(() => {
    if (!resizableProperties) return
    const move = (event: PointerEvent) => {
      const current = resizeRef.current
      if (!current) return
      const delta = ((event.clientX - current.startX) / current.containerWidth) * 100
      const value = current.kind === 'panel'
        ? current.startValue - delta
        : current.startValue + delta
      setDetailLayout((previous) => ({
        ...previous,
        [current.kind === 'panel' ? 'panelWidth' : 'labelWidth']:
          clampDetailLayoutValue(value, current.startValue),
      }))
    }
    const stop = () => {
      const current = resizeRef.current
      if (!current) return
      document.body.style.userSelect = current.userSelect
      resizeRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      stop()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [resizableProperties])

  const beginResize = (
    kind: 'panel' | 'label',
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const container = kind === 'panel' ? detailGridRef.current : propertiesFieldsRef.current
    if (!container) return
    event.preventDefault()
    event.currentTarget.focus()
    resizeRef.current = {
      kind,
      startX: event.clientX,
      startValue: kind === 'panel' ? detailLayout.panelWidth : detailLayout.labelWidth,
      containerWidth: Math.max(container.getBoundingClientRect().width, 1),
      userSelect: document.body.style.userSelect,
    }
    document.body.style.userSelect = 'none'
  }

  const resizeWithKeyboard = (
    kind: 'panel' | 'label',
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const field = kind === 'panel' ? 'panelWidth' : 'labelWidth'
    let value: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value = detailLayout[field] - 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value = detailLayout[field] + 1
    if (event.key === 'Home') value = DETAIL_LAYOUT_MIN
    if (event.key === 'End') value = DETAIL_LAYOUT_MAX
    if (value === null) return
    event.preventDefault()
    setDetailLayout((previous) => ({
      ...previous,
      [field]: clampDetailLayoutValue(value, previous[field]),
    }))
  }

  const propertyRowClass = resizableProperties
    ? 'group/property grid min-h-9 grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.2fr)] items-center gap-2 px-3 py-1 transition-colors hover:bg-of-surface-hover/70 lg:grid-cols-[var(--detail-property-label-width)_minmax(0,1fr)]'
    : 'group/property grid min-h-9 grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.2fr)] items-center gap-2 px-3 py-1 transition-colors hover:bg-of-surface-hover/70'
  const propertyLabelClass = 'flex min-w-0 items-center gap-2 text-[11px] font-medium text-of-muted'
  const propertyIconClass = 'size-3.5 shrink-0 text-of-faint transition-colors group-hover/property:text-of-muted'
  const propertyControlClass = 'h-7 min-w-0 !rounded-[4px] !border-transparent !bg-transparent px-2 text-xs !shadow-none hover:!border-of-border-subtle hover:!bg-of-surface focus-visible:!border-of-focus focus-visible:!bg-of-surface disabled:!bg-transparent'
  const detailGridStyle = resizableProperties
    ? ({ '--detail-properties-width': `${detailLayout.panelWidth}%` } as CSSProperties)
    : undefined
  const propertyFieldsStyle = resizableProperties
    ? ({ '--detail-property-label-width': `${detailLayout.labelWidth}%` } as CSSProperties)
    : undefined

  useEffect(() => {
    if (initialMoveOpen) setMoveOpen(true)
  }, [initialMoveOpen, wp.id])

  // All editable fields are controlled and resynced from server data, so a 409
  // invalidate+refetch really does reload every field (review finding #2).
  const [subject, setSubject] = useState(wp.subject)
  const [startDate, setStartDate] = useState(wp.start_date ?? '')
  const [dueDate, setDueDate] = useState(wp.due_date ?? '')
  const [estimate, setEstimate] = useState(wp.estimated_hours?.toString() ?? '')
  useEffect(() => {
    setSubject(wp.subject)
    setStartDate(wp.start_date ?? '')
    setDueDate(wp.due_date ?? '')
    setEstimate(wp.estimated_hours?.toString() ?? '')
  }, [wp.subject, wp.start_date, wp.due_date, wp.estimated_hours])
  const scheduleError = validateScheduleDates(startDate || null, dueDate || null)

  const send = (fields: Partial<Record<string, unknown>>) => {
    // Token from the query cache, not the render snapshot: two quick edits in a
    // row must carry the bumped version, not a stale one that would trigger a
    // false self-conflict 409 (review finding #3).
    const cached = queryClient.getQueryData<WorkPackage>(['work-package', wp.id])
    patch.mutate({
      wpId: wp.id,
      patch: { expected_version: cached?.version ?? wp.version, ...fields },
    })
  }

  const sendAsync = (fields: Partial<Record<string, unknown>>) => {
    const cached = queryClient.getQueryData<WorkPackage>(['work-package', wp.id])
    return patch.mutateAsync({
      wpId: wp.id,
      patch: { expected_version: cached?.version ?? wp.version, ...fields },
    })
  }

  const saveScheduleDates = () => {
    if (scheduleError) return
    const nextStart = startDate || null
    const nextDue = dueDate || null
    const fields: Partial<Record<'start_date' | 'due_date', string | null>> = {}
    if (nextStart !== wp.start_date) fields.start_date = nextStart
    if (nextDue !== wp.due_date) fields.due_date = nextDue
    if (Object.keys(fields).length > 0) send(fields)
  }

  // A failed save must never be silent: 409 reloads the latest server values and
  // says so; any other error (422/403/5xx/network) shows its message while the
  // typed value stays on screen so nothing is lost.
  const saveError =
    patch.isError && patch.error instanceof ApiError
      ? patch.error.status === 409
        ? decideOnPatchError(409).message
        : patch.error.message
      : null
  const createdByName = wp.created_by
    ? members.data?.items.find((m) => m.user_id === wp.created_by)?.display_name ?? '알 수 없음'
    : null
  const memberItems = members.data?.items ?? []
  const assignableMembers = memberItems.filter(isAssignableMember)
  const currentAssignee = wp.assignee_id
    ? memberItems.find((member) => member.user_id === wp.assignee_id)
    : null
  const legacyCurrentAssignee = wp.assignee_id
    && !assignableMembers.some((member) => member.user_id === wp.assignee_id)
  const fullPageLink = showFullPageLink ? (
    <Link
      to={`/projects/${projectId}/work-packages/${wp.id}`}
      aria-label="전체 페이지"
      title="전체 페이지"
      className="of-touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-transparent text-of-muted transition-colors hover:border-of-border-subtle hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface"
    >
      <ExternalLink size={15} aria-hidden="true" />
    </Link>
  ) : null
  const currentTypeLabel = projectTypes.options.find((type) => type.key === wp.type)?.label ?? wp.type

  return (
    <div className="space-y-4">
      {saveError ? (
        <p role="alert" className="rounded-of bg-of-danger/10 px-3 py-2 text-xs text-of-danger">
          저장하지 못했습니다: {saveError}
        </p>
      ) : null}
      <header className="space-y-2.5 border-b border-of-border pb-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="px-1 text-[11px] font-medium text-of-muted">
              {currentTypeLabel} · v{wp.version}
              {createdByName ? ` · ${createdByName} 생성` : ''}
            </p>
            <label htmlFor="wp-subject" className="sr-only">
              제목
            </label>
            <Input
              id="wp-subject"
              readOnly={!canWrite}
              value={subject}
              disabled={!canWrite || patch.isPending}
              className="h-10 rounded-none !border-0 !border-b !border-b-transparent !bg-transparent px-1 text-xl font-semibold !shadow-none hover:!border-b-of-border focus-visible:!border-b-of-focus focus-visible:!ring-0 disabled:!bg-transparent read-only:!bg-transparent"
              onChange={(e) => setSubject(e.target.value)}
              onBlur={() => {
                const trimmed = subject.trim()
                if (trimmed && trimmed !== wp.subject) send({ subject: trimmed })
              }}
            />
          </div>

          <div
            role="toolbar"
            aria-label="작업 명령"
            className="flex min-w-0 shrink-0 items-center gap-1 self-end sm:self-start"
          >
            <WatchControl wpId={wp.id} canWrite={canWrite} />
            {canWrite ? (
              <>
                <IconButton
                  label="복제"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate(wp.id)}
                >
                  <Copy aria-hidden="true" />
                </IconButton>
                <IconButton label="이동" onClick={() => setMoveOpen((value) => !value)}>
                  <MoveRight aria-hidden="true" />
                </IconButton>
              </>
            ) : null}
            {fullPageLink}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-of-muted">
          <DetailInlinePropertyMenu
            property="status"
            value={wp.status}
            canWrite={canWrite}
            pending={patch.isPending}
            statusLabel={statusLabel}
            onValueChange={(value) => send({ status: value as WpStatus })}
          />
          <DetailInlinePropertyMenu
            property="priority"
            value={wp.priority}
            canWrite={canWrite}
            pending={patch.isPending}
            statusLabel={statusLabel}
            onValueChange={(value) => send({ priority: value as WpPriority })}
          />
          <DetailInlineAssigneeMenu
            assigneeId={wp.assignee_id}
            members={memberItems}
            canWrite={canWrite}
            pending={patch.isPending}
            rosterPending={members.isPending}
            rosterError={members.isError}
            onRetryRoster={() => { void members.refetch() }}
            onValueChange={(assigneeId) => send({ assignee_id: assigneeId })}
          />
          <DetailInlineDateMenu
            property="start_date"
            value={wp.start_date}
            otherDate={wp.due_date}
            canWrite={canWrite}
            pending={patch.isPending}
            onValueChange={(value) => send({ start_date: value })}
          />
          <DetailInlineDateMenu
            property="due_date"
            value={wp.due_date}
            otherDate={wp.start_date}
            canWrite={canWrite}
            pending={patch.isPending}
            onValueChange={(value) => send({ due_date: value })}
          />
        </div>

        {!canWrite ? <ReadOnlyNotice /> : null}
        {canWrite && moveOpen ? <MoveSection wp={wp} projectId={projectId} /> : null}
        {duplicate.isSuccess ? (
          <p role="status" className="text-xs text-of-muted">
            '{duplicate.data.work_package.subject}' 생성됨
            {duplicate.data.skipped_custom_values > 0
              ? ` · 복사되지 않은 커스텀 값 ${duplicate.data.skipped_custom_values}건`
              : ''}
          </p>
        ) : null}
        {duplicate.isError ? (
          <p role="alert" className="text-xs text-of-danger">복제하지 못했습니다.</p>
        ) : null}
      </header>

      <div role="tablist" aria-label="작업 상세 탭" className="flex gap-1 border-b border-of-border-subtle">
        {[
          ['overview', '개요'],
          ['activity', '활동'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === key
                ? 'border-of-accent text-of-accent'
                : 'border-transparent text-of-muted hover:text-of-fg'
            }`}
            onClick={() => setActiveTab(key as 'overview' | 'activity')}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div
          ref={detailGridRef}
          style={detailGridStyle}
          className={resizableProperties
            ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_0.5rem_var(--detail-properties-width)] lg:gap-0'
            : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]'}
        >
          <div className={`space-y-4 ${resizableProperties ? 'lg:pr-4' : ''}`}>
            <WorkItemDescriptionSection
              value={wp.description}
              canWrite={canWrite}
              saving={patch.isPending}
              onSave={async (description) => {
                await sendAsync({ description })
              }}
            />

            <AiSummarySection wpId={wp.id} />

            <TimeTrackingSection wp={wp} canWrite={canWrite} />

            <CostSection wpId={wp.id} canWrite={canWrite} />

            <CustomFieldsSection
              wpId={wp.id}
              projectId={projectId}
              wpType={wp.type}
              canWrite={canWrite}
            />

            <RelationsSection wpId={wp.id} projectId={projectId} canWrite={canWrite} />

            <PagesSection wpId={wp.id} projectId={projectId} />

            <AttachmentsSection wpId={wp.id} projectId={projectId} />
          </div>

          {resizableProperties ? (
            <button
              type="button"
              role="slider"
              aria-label="속성 패널 너비 조절"
              aria-orientation="horizontal"
              aria-valuemin={DETAIL_LAYOUT_MIN}
              aria-valuemax={DETAIL_LAYOUT_MAX}
              aria-valuenow={detailLayout.panelWidth}
              aria-valuetext={`${detailLayout.panelWidth}%`}
              title="드래그하거나 화살표 키로 속성 패널 너비 조절 · 더블클릭으로 초기화"
              className="group hidden min-h-full cursor-col-resize items-stretch justify-center rounded-of focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus lg:flex"
              onPointerDown={(event) => beginResize('panel', event)}
              onKeyDown={(event) => resizeWithKeyboard('panel', event)}
              onDoubleClick={() => setDetailLayout((previous) => ({
                ...previous,
                panelWidth: DEFAULT_DETAIL_LAYOUT.panelWidth,
              }))}
            >
              <span className="w-px bg-of-border transition-colors group-hover:bg-of-accent group-focus-visible:bg-of-accent" />
            </button>
          ) : null}

          <aside
            aria-label="작업 속성"
            className="order-first overflow-hidden rounded-of border border-of-border-subtle bg-of-surface lg:order-none lg:sticky lg:top-0 lg:self-start lg:rounded-none lg:border-y-0 lg:border-r-0"
          >
            <button
              type="button"
              aria-expanded={propertiesOpen}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-xs font-semibold text-of-fg transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus"
              onClick={() => setPropertiesOpen((open) => !open)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-of-muted" aria-hidden="true" />
                속성
              </span>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`transition-transform ${propertiesOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {propertiesOpen ? <div
              ref={propertiesFieldsRef}
              style={propertyFieldsStyle}
              className="relative border-t border-of-border-subtle"
            >
              {resizableProperties ? (
                <button
                  type="button"
                  role="slider"
                  aria-label="속성 라벨 열 너비 조절"
                  aria-orientation="horizontal"
                  aria-valuemin={DETAIL_LAYOUT_MIN}
                  aria-valuemax={DETAIL_LAYOUT_MAX}
                  aria-valuenow={detailLayout.labelWidth}
                  aria-valuetext={`${detailLayout.labelWidth}%`}
                  title="드래그하거나 화살표 키로 속성 라벨 너비 조절 · 더블클릭으로 초기화"
                  style={{ left: `${detailLayout.labelWidth}%` }}
                  className="group absolute inset-y-0 z-10 hidden w-2 -translate-x-1/2 cursor-col-resize items-stretch justify-center rounded-of focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus lg:flex"
                  onPointerDown={(event) => beginResize('label', event)}
                  onKeyDown={(event) => resizeWithKeyboard('label', event)}
                  onDoubleClick={() => setDetailLayout((previous) => ({
                    ...previous,
                    labelWidth: DEFAULT_DETAIL_LAYOUT.labelWidth,
                  }))}
                >
                  <span className="w-px bg-transparent transition-colors group-hover:bg-of-accent group-focus-visible:bg-of-accent" />
                </button>
              ) : null}
              <section aria-labelledby="work-item-properties-details-heading" className="py-1.5">
                <h3
                  id="work-item-properties-details-heading"
                  className="px-3 pb-1 pt-1 text-[11px] font-semibold text-of-secondary"
                >
                  상세
                </h3>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-status" className={propertyLabelClass}>
                    <CircleDot className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">상태</span>
                  </label>
                  <Select
                    id="wp-status"
                    className={propertyControlClass}
                    value={wp.status}
                    disabled={!canWrite || patch.isPending}
                    onChange={(e) => send({ status: e.target.value as WpStatus })}
                  >
                    {WP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-priority" className={propertyLabelClass}>
                    <Signal className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">우선순위</span>
                  </label>
                  <Select
                    id="wp-priority"
                    className={propertyControlClass}
                    value={wp.priority}
                    disabled={!canWrite || patch.isPending}
                    onChange={(e) => send({ priority: e.target.value as WpPriority })}
                  >
                    {WP_PRIORITIES.map((p) => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </Select>
                </div>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-assignee" className={propertyLabelClass}>
                    <UserRound className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">담당자</span>
                  </label>
                  <Select
                    id="wp-assignee"
                    className={propertyControlClass}
                    value={wp.assignee_id ?? ''}
                    disabled={!canWrite || patch.isPending || members.isPending || members.isError}
                    onChange={(e) => send({ assignee_id: e.target.value || null })}
                  >
                    <option value="">미배정</option>
                    {legacyCurrentAssignee ? (
                      <option value={wp.assignee_id ?? ''} disabled>
                        {currentAssignee?.display_name ?? '알 수 없는 담당자'}
                      </option>
                    ) : null}
                    {assignableMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
                    ))}
                  </Select>
                </div>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-type" className={propertyLabelClass}>
                    <Tag className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">타입</span>
                  </label>
                  <Select
                    id="wp-type"
                    className={propertyControlClass}
                    value={wp.type}
                    disabled={!canWrite || patch.isPending}
                    onChange={(e) => send({ type: e.target.value })}
                  >
                    {projectTypes.options.map((type) => (
                      <option key={type.key} value={type.key}>
                        {type.label}{type.isActive ? '' : ' (비활성)'}
                      </option>
                    ))}
                  </Select>
                </div>
              </section>

              <section
                aria-labelledby="work-item-properties-schedule-heading"
                className="border-t border-of-border-subtle py-1.5"
              >
                <h3
                  id="work-item-properties-schedule-heading"
                  className="px-3 pb-1 pt-1 text-[11px] font-semibold text-of-secondary"
                >
                  일정
                </h3>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-start" className={propertyLabelClass}>
                    <CalendarDays className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">시작일</span>
                  </label>
                  {/* date-only string round-trip — never through JS Date (§6.1) */}
                  <Input
                    id="wp-start"
                    className={propertyControlClass}
                    readOnly={!canWrite}
                    type="date"
                    value={startDate}
                    disabled={!canWrite || patch.isPending}
                    max={dueDate || undefined}
                    aria-invalid={Boolean(scheduleError)}
                    onChange={(e) => setStartDate(e.target.value)}
                    onBlur={saveScheduleDates}
                  />
                </div>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-due" className={propertyLabelClass}>
                    <CalendarDays className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">기한</span>
                  </label>
                  <Input
                    id="wp-due"
                    className={propertyControlClass}
                    readOnly={!canWrite}
                    type="date"
                    value={dueDate}
                    disabled={!canWrite || patch.isPending}
                    min={startDate || undefined}
                    aria-invalid={Boolean(scheduleError)}
                    onChange={(e) => setDueDate(e.target.value)}
                    onBlur={saveScheduleDates}
                  />
                </div>
                {scheduleError ? (
                  <p role="alert" className="px-3 pb-1 text-[11px] leading-4 text-of-danger">{scheduleError}</p>
                ) : null}
                <div className={propertyRowClass}>
                  <label htmlFor="wp-estimate" className={propertyLabelClass}>
                    <Timer className={propertyIconClass} aria-hidden="true" />
                    <span title="예상 시간">예상</span>
                  </label>
                  <Input
                    id="wp-estimate"
                    className={propertyControlClass}
                    readOnly={!canWrite}
                    type="number"
                    step="0.5"
                    min="0"
                    value={estimate}
                    disabled={!canWrite || patch.isPending}
                    aria-label="예상 시간(h)"
                    onChange={(e) => setEstimate(e.target.value)}
                    onBlur={() => {
                      const v = estimate.trim() === '' ? null : Number(estimate)
                      if (v !== (wp.estimated_hours ?? null)) send({ estimated_hours: v })
                    }}
                  />
                </div>
              </section>

              <section
                aria-labelledby="work-item-properties-structure-heading"
                className="border-t border-of-border-subtle py-1.5"
              >
                <h3
                  id="work-item-properties-structure-heading"
                  className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-[11px] font-semibold text-of-secondary"
                >
                  <ListTree size={12} className="text-of-faint" aria-hidden="true" />
                  프로젝트 구조
                </h3>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-cycle" className={propertyLabelClass}>
                    <Layers3 className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">사이클</span>
                  </label>
                  <Select
                    id="wp-cycle"
                    className={propertyControlClass}
                    value={wp.cycle_id ?? ''}
                    disabled={!canWrite || patch.isPending}
                    onChange={(e) => send({ cycle_id: e.target.value || null })}
                  >
                    <option value="">없음</option>
                    {cycles.data?.items.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div className={propertyRowClass}>
                  <label htmlFor="wp-module" className={propertyLabelClass}>
                    <Boxes className={propertyIconClass} aria-hidden="true" />
                    <span className="truncate">모듈</span>
                  </label>
                  <Select
                    id="wp-module"
                    className={propertyControlClass}
                    value={wp.module_id ?? ''}
                    disabled={!canWrite || patch.isPending}
                    onChange={(e) => send({ module_id: e.target.value || null })}
                  >
                    <option value="">없음</option>
                    {modules.data?.items.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                </div>
                {releasesEnabled ? (
                  <div className={propertyRowClass}>
                    <label htmlFor="wp-milestone" className={propertyLabelClass}>
                      <Flag className={propertyIconClass} aria-hidden="true" />
                      <span className="truncate">마일스톤</span>
                    </label>
                    <Select
                      id="wp-milestone"
                      className={propertyControlClass}
                      value={wp.milestone_id ?? ''}
                      disabled={!canWrite || patch.isPending}
                      onChange={(e) => send({ milestone_id: e.target.value || null })}
                    >
                      <option value="">없음</option>
                      {milestones.data?.items.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {customersEnabled ? (
                  <div className={propertyRowClass}>
                    <label htmlFor="wp-customer" className={propertyLabelClass}>
                      <Building2 className={propertyIconClass} aria-hidden="true" />
                      <span className="truncate">고객</span>
                    </label>
                    <Select
                      id="wp-customer"
                      className={propertyControlClass}
                      value={wp.customer_id ?? ''}
                      disabled={!canWrite || patch.isPending}
                      onChange={(e) => send({ customer_id: e.target.value || null })}
                    >
                      <option value="">없음</option>
                      {customers.data?.items.map((customer) => (
                        <option
                          key={customer.id}
                          value={customer.id}
                          disabled={customer.archived_at !== null && customer.id !== wp.customer_id}
                        >
                          {customer.name}{customer.archived_at ? ' (보관)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </section>

              <section
                aria-labelledby="work-item-properties-record-heading"
                className="border-t border-of-border-subtle px-3 py-3"
              >
                <h3 id="work-item-properties-record-heading" className="text-[11px] font-semibold text-of-secondary">
                  기록
                </h3>
                <dl className="mt-2 space-y-1.5 text-[11px] text-of-muted">
                  <div className="flex items-center justify-between gap-3">
                    <dt>생성자</dt>
                    <dd className="min-w-0 truncate text-right text-of-secondary">{createdByName ?? '알 수 없음'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>최근 업데이트</dt>
                    <dd className="min-w-0 truncate text-right text-of-secondary">{formatDateTime(wp.updated_at)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>버전</dt>
                    <dd className="text-of-secondary">v{wp.version}</dd>
                  </div>
                </dl>
              </section>
            </div> : (
              <p className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
                상태, 담당자, 일정 등 작업 속성이 접혀 있습니다.
              </p>
            )}
          </aside>
        </div>
      ) : (
        <HistorySection wpId={wp.id} projectId={projectId} />
      )}

      {patch.isPending ? (
        <p role="status" aria-live="polite" className="text-xs text-of-muted">
          저장 중…
        </p>
      ) : null}
    </div>
  )
}

function WatchControl({ wpId, canWrite }: { wpId: string; canWrite: boolean }) {
  const watchers = useWatchers(wpId)
  const setWatching = useSetWatching(wpId)
  const watching = watchers.data?.me_watching ?? false
  const total = watchers.data?.total ?? 0
  const visibleWatchers = watchers.data?.items.slice(0, 3) ?? []
  const summaryWatchers = visibleWatchers.slice(0, 2)
  const overflow = Math.max(0, total - visibleWatchers.length)
  const notificationCues = ['상태 변경', '댓글', '담당자']
  return (
    <section aria-label="워처 구독" className="flex min-w-0 items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={watchers.isPending ? '워처 불러오는 중' : `워처 ${total}명 보기`}
            className="of-touch-target flex h-8 max-w-28 items-center gap-1.5 rounded-of border border-transparent px-1.5 text-xs text-of-muted transition-colors hover:border-of-border-subtle hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            {summaryWatchers.length > 0 ? (
              <span className="flex -space-x-1.5" aria-hidden="true">
                {summaryWatchers.map((watcher) => (
                  <span
                    key={watcher.user_id}
                    className="flex size-5 items-center justify-center rounded-full border border-of-surface bg-of-accent text-[9px] font-semibold text-white"
                  >
                    {watcherInitial(watcher.display_name)}
                  </span>
                ))}
              </span>
            ) : (
              <Users size={14} aria-hidden="true" />
            )}
            <span className="truncate">{watchers.isPending ? '…' : total}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 max-w-[calc(100vw-1rem)] p-3 outline-none">
          <section aria-label="워처 상세" className="space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-of-fg">워처</h3>
                <span className="text-[11px] text-of-muted">
                  {watchers.isPending ? '불러오는 중' : `${total}명`}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-of-muted">
                상태, 댓글, 담당자 변경 알림을 받는 참여자입니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {notificationCues.map((cue) => (
                <span
                  key={cue}
                  className="inline-flex items-center gap-1 rounded-full bg-of-surface-2 px-2 py-1 text-[11px] text-of-muted"
                >
                  <CheckCircle2 size={11} className="text-of-accent" aria-hidden="true" />
                  {cue}
                </span>
              ))}
            </div>

            <div className="space-y-1">
              {watchers.isPending ? (
                <p role="status" className="py-2 text-xs text-of-muted">워처를 불러오는 중입니다.</p>
              ) : visibleWatchers.length > 0 ? (
                visibleWatchers.map((watcher) => (
                  <div
                    key={watcher.user_id}
                    className="flex items-center gap-2 rounded-of px-1 py-1.5 text-xs text-of-fg"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-of-accent text-[10px] font-semibold text-white">
                      {watcherInitial(watcher.display_name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{watcher.display_name}</span>
                  </div>
                ))
              ) : watchers.isError ? null : (
                <p className="py-2 text-xs text-of-muted">아직 워처가 없습니다.</p>
              )}
              {overflow > 0 ? (
                <p className="px-1 text-[11px] text-of-muted">외 {overflow}명</p>
              ) : null}
            </div>

            {watchers.isError ? (
              <div className="space-y-2">
                <p role="alert" className="text-xs text-of-danger">
                  워처 정보를 불러오지 못했습니다.
                </p>
                <Button variant="outline" size="sm" onClick={() => { void watchers.refetch() }}>
                  다시 시도
                </Button>
              </div>
            ) : null}
            {setWatching.isError ? (
              <p role="alert" className="text-xs text-of-danger">워치 상태를 저장하지 못했습니다.</p>
            ) : null}
          </section>
        </PopoverContent>
      </Popover>

      {canWrite ? (
        <button
          type="button"
          aria-pressed={watching}
          disabled={setWatching.isPending || watchers.isPending || watchers.isError}
          className="of-touch-target flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border px-2 text-xs font-medium text-of-fg transition-colors hover:bg-of-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => setWatching.mutate(!watching)}
        >
          {watching ? <BellOff size={13} aria-hidden="true" /> : <Bell size={13} aria-hidden="true" />}
          {watching ? '워치 해제' : '워치'}
        </button>
      ) : null}
    </section>
  )
}

function watcherInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}
