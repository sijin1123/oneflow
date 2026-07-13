import { Bell, BellOff, CheckCircle2, ChevronDown, ExternalLink, Eye, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Input } from '@/components/ui/input'
import { AiSummarySection } from '@/features/ai/AiSummarySection'
import { Button } from '@/components/ui/button'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import { useCycles } from '@/features/cycles/api'
import { useCustomers } from '@/features/customers/api'
import { useMilestones } from '@/features/milestones/api'
import { useModules } from '@/features/modules/api'
import { useProjectTypes } from '@/features/project-types/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'

import { CustomFieldsSection } from './CustomFieldsSection'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { decideOnPatchError } from '@/lib/conflict'

// Tiptap is heavy — load it only when a drawer actually renders (code-split).
const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
)

import { CostSection } from './CostSection'
import { HistorySection } from './HistorySection'
import { AttachmentsSection } from './AttachmentsSection'
import { PagesSection } from './PagesSection'
import { RelationsSection } from './RelationsSection'
import { TimeTrackingSection } from './TimeTrackingSection'
import { PriorityChip, StatusChip } from './chips'
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
    <SheetContent title={wp ? wp.subject : '작업 상세'} className="max-w-4xl">
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
  const projectTypes = useProjectTypes(projectId)
  const members = useMembers(projectId)
  const statusLabel = useStatusLabels(projectId)
  const duplicate = useDuplicateWorkPackage(projectId)
  const canWrite = useCanWrite(projectId)
  const [moveOpen, setMoveOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview')
  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const propertiesRef = useRef<HTMLElement>(null)
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
    ? 'space-y-1.5 lg:grid lg:grid-cols-[var(--detail-property-label-width)_minmax(0,1fr)] lg:items-center lg:gap-2 lg:space-y-0'
    : 'space-y-1.5'
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
  const focusProperty = (id: string) => {
    setActiveTab('overview')
    setPropertiesOpen(true)
    window.requestAnimationFrame(() => {
      propertiesRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus()
    })
  }
  const fullPageLink = showFullPageLink ? (
    <Link
      to={`/projects/${projectId}/work-packages/${wp.id}`}
      className="inline-flex items-center gap-1.5 rounded-of border border-of-border px-2 py-1 text-xs font-medium text-of-muted hover:bg-of-surface-2 hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
    >
      <ExternalLink size={13} /> 전체 페이지
    </Link>
  ) : null

  return (
    <div className="space-y-4">
      {saveError ? (
        <p role="alert" className="rounded-of bg-of-danger/10 px-3 py-2 text-xs text-of-danger">
          저장하지 못했습니다: {saveError}
        </p>
      ) : null}
      <header className="space-y-3 border-b border-of-border pb-4">
        <div className="space-y-1.5">
          <label htmlFor="wp-subject" className="text-xs font-medium text-of-muted">
            제목
          </label>
          <Input
            id="wp-subject"
            readOnly={!canWrite}
            value={subject}
            disabled={!canWrite || patch.isPending}
            className="h-9 text-base font-semibold"
            onChange={(e) => setSubject(e.target.value)}
            onBlur={() => {
              const trimmed = subject.trim()
              if (trimmed && trimmed !== wp.subject) send({ subject: trimmed })
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-of-muted">
          {canWrite ? (
            <button
              type="button"
              aria-label="상태 속성 편집"
              className="rounded-of focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => focusProperty('wp-status')}
            >
              <StatusChip status={wp.status} label={statusLabel(wp.status)} />
            </button>
          ) : (
            <StatusChip status={wp.status} label={statusLabel(wp.status)} />
          )}
          {canWrite ? (
            <button
              type="button"
              aria-label="우선순위 속성 편집"
              className="rounded-of focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => focusProperty('wp-priority')}
            >
              <PriorityChip priority={wp.priority} />
            </button>
          ) : (
            <PriorityChip priority={wp.priority} />
          )}
          {createdByName ? <span>만든 사람: {createdByName}</span> : null}
          <span>v{wp.version}</span>
        </div>

        <div className="space-y-2">
          <WatchRow wpId={wp.id} canWrite={canWrite} />
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate(wp.id)}
              >
                복제
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoveOpen((v) => !v)}
              >
                이동
              </Button>
              {fullPageLink}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <ReadOnlyNotice className="min-w-[220px] flex-1" />
              {fullPageLink}
            </div>
          )}
        </div>
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
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-of-muted">설명</span>
              <Suspense
                fallback={
                  <div className="h-24 rounded-of border border-of-border bg-of-surface-2/40" />
                }
              >
                <RichTextEditor
                  editable={canWrite}
                  value={wp.description ?? ''}
                  ariaLabel="설명"
                  onSave={(html) => {
                    const next = html === '' ? null : html
                    if (next !== (wp.description ?? null)) send({ description: next })
                  }}
                />
              </Suspense>
            </div>

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
            ref={propertiesRef}
            aria-label="작업 속성"
            className="of-surface order-first space-y-3 bg-of-surface-raised p-3 lg:order-none lg:sticky lg:top-0 lg:self-start"
          >
            <button
              type="button"
              aria-expanded={propertiesOpen}
              className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-of-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => setPropertiesOpen((open) => !open)}
            >
              속성
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`transition-transform ${propertiesOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {propertiesOpen ? <div
              ref={propertiesFieldsRef}
              style={propertyFieldsStyle}
              className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 [&>*]:min-w-0"
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
              <div className={propertyRowClass}>
                <label htmlFor="wp-status" className="text-xs font-medium text-of-muted">
                  상태
                </label>
                <Select
                  id="wp-status"
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
                <label htmlFor="wp-priority" className="text-xs font-medium text-of-muted">
                  우선순위
                </label>
                <Select
                  id="wp-priority"
                  value={wp.priority}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => send({ priority: e.target.value as WpPriority })}
                >
                  {WP_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={propertyRowClass}>
                <label htmlFor="wp-start" className="text-xs font-medium text-of-muted">
                  시작일
                </label>
                {/* date-only string round-trip — never through JS Date (§6.1) */}
                <Input
                  id="wp-start"
                  readOnly={!canWrite}
                  type="date"
                  value={startDate}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => setStartDate(e.target.value)}
                  onBlur={() => {
                    const v = startDate || null
                    if (v !== wp.start_date) send({ start_date: v })
                  }}
                />
              </div>
              <div className={propertyRowClass}>
                <label htmlFor="wp-due" className="text-xs font-medium text-of-muted">
                  기한
                </label>
                <Input
                  id="wp-due"
                  readOnly={!canWrite}
                  type="date"
                  value={dueDate}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => setDueDate(e.target.value)}
                  onBlur={() => {
                    const v = dueDate || null
                    if (v !== wp.due_date) send({ due_date: v })
                  }}
                />
              </div>
              <div className={propertyRowClass}>
                <label htmlFor="wp-estimate" className="text-xs font-medium text-of-muted">
                  예상 시간(h)
                </label>
                <Input
                  id="wp-estimate"
                  readOnly={!canWrite}
                  type="number"
                  step="0.5"
                  min="0"
                  value={estimate}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => setEstimate(e.target.value)}
                  onBlur={() => {
                    const v = estimate.trim() === '' ? null : Number(estimate)
                    if (v !== (wp.estimated_hours ?? null)) send({ estimated_hours: v })
                  }}
                />
              </div>
              <div className={propertyRowClass}>
                <label htmlFor="wp-type" className="text-xs font-medium text-of-muted">
                  타입
                </label>
                <Select
                  id="wp-type"
                  value={wp.type}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => send({ type: e.target.value })}
                >
                  {(projectTypes.data?.items ?? [])
                    .sort((a, b) => a.position - b.position)
                    .filter((t) => t.is_active || t.key === wp.type)
                    .map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                        {t.is_active ? '' : ' (비활성)'}
                      </option>
                    ))}
                  {projectTypes.data && projectTypes.data.total > 0 ? null : (
                    <option value={wp.type}>{wp.type}</option>
                  )}
                </Select>
              </div>
              {releasesEnabled ? <div className={propertyRowClass}>
                <label htmlFor="wp-milestone" className="text-xs font-medium text-of-muted">
                  마일스톤
                </label>
                <Select
                  id="wp-milestone"
                  value={wp.milestone_id ?? ''}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => send({ milestone_id: e.target.value || null })}
                >
                  <option value="">없음</option>
                  {milestones.data?.items.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div> : null}
              {customersEnabled ? (
                <div className={propertyRowClass}>
                  <label htmlFor="wp-customer" className="text-xs font-medium text-of-muted">
                    고객
                  </label>
                  <Select
                    id="wp-customer"
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
              <div className={propertyRowClass}>
                <label htmlFor="wp-cycle" className="text-xs font-medium text-of-muted">
                  사이클
                </label>
                <Select
                  id="wp-cycle"
                  value={wp.cycle_id ?? ''}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => send({ cycle_id: e.target.value || null })}
                >
                  <option value="">없음</option>
                  {cycles.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={propertyRowClass}>
                <label htmlFor="wp-module" className="text-xs font-medium text-of-muted">
                  모듈
                </label>
                <Select
                  id="wp-module"
                  value={wp.module_id ?? ''}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => send({ module_id: e.target.value || null })}
                >
                  <option value="">없음</option>
                  {modules.data?.items.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className={propertyRowClass}>
                <label htmlFor="wp-assignee" className="text-xs font-medium text-of-muted">
                  담당자
                </label>
                <Select
                  id="wp-assignee"
                  value={wp.assignee_id ?? ''}
                  disabled={!canWrite || patch.isPending}
                  onChange={(e) => send({ assignee_id: e.target.value || null })}
                >
                  <option value="">미배정</option>
                  {members.data?.items.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </Select>
              </div>
            </div> : (
              <p className="text-xs text-of-muted">상태, 담당자, 일정 등 작업 속성이 접혀 있습니다.</p>
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

function WatchRow({ wpId, canWrite }: { wpId: string; canWrite: boolean }) {
  const watchers = useWatchers(wpId)
  const setWatching = useSetWatching(wpId)
  const watching = watchers.data?.me_watching ?? false
  const total = watchers.data?.total ?? 0
  const visibleWatchers = watchers.data?.items.slice(0, 3) ?? []
  const overflow = Math.max(0, total - visibleWatchers.length)
  const notificationCues = ['상태 변경', '댓글', '담당자']
  return (
    <section
      aria-label="워처 구독"
      className="rounded-of border border-of-border bg-of-surface px-3 py-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-of-surface-2 text-of-accent">
              <Users size={15} />
            </span>
            <h3 className="text-xs font-semibold text-of-fg">워처 구독</h3>
            <span className="rounded-full bg-of-surface-2 px-2 py-0.5 text-[11px] font-medium text-of-muted">
              {watchers.isPending ? '불러오는 중' : `${total}명`}
            </span>
            <span className="rounded-full bg-of-surface-2 px-2 py-0.5 text-[11px] font-medium text-of-muted">
              {watching ? '내가 구독 중' : '구독 안 함'}
            </span>
          </div>
          <p className="text-xs leading-5 text-of-muted">
            상태, 댓글, 담당자 변경을 이 작업 맥락에서 받아볼 사람을 한눈에 확인합니다.
          </p>
        </div>

        {canWrite ? (
          <button
            type="button"
            aria-pressed={watching}
            disabled={setWatching.isPending || watchers.isPending}
            className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border px-3 py-1.5 text-xs font-medium text-of-fg transition hover:bg-of-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setWatching.mutate(!watching)}
          >
            {watching ? <BellOff size={13} /> : <Bell size={13} />}
            {watching ? '워치 해제' : '워치'}
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-of border border-of-border px-3 py-1.5 text-xs font-medium text-of-muted">
            <Eye size={13} />
            읽기 전용
          </span>
        )}
      </div>

      <div className="mt-3 grid overflow-hidden rounded-of border border-of-border/70 bg-of-surface-2/35 sm:grid-cols-3">
        {notificationCues.map((cue) => (
          <div
            key={cue}
            className="flex items-center gap-2 border-b border-of-border/70 px-3 py-2 text-xs text-of-muted last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <CheckCircle2 size={13} className="text-of-accent" />
            <span>{cue}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {visibleWatchers.length > 0 ? (
          visibleWatchers.map((watcher) => (
            <span
              key={watcher.user_id}
              className="flex max-w-full items-center gap-2 rounded-full border border-of-border bg-of-surface-2 px-2 py-1 text-xs text-of-fg"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-of-accent text-[10px] font-semibold text-white">
                {watcherInitial(watcher.display_name)}
              </span>
              <span className="truncate">{watcher.display_name}</span>
            </span>
          ))
        ) : (
          <span className="text-xs text-of-muted">아직 워처가 없습니다.</span>
        )}
        {overflow > 0 ? (
          <span className="rounded-full bg-of-surface-2 px-2 py-1 text-xs text-of-muted">
            +{overflow}
          </span>
        ) : null}
      </div>

      {watchers.isError ? (
        <p role="alert" className="mt-2 text-xs text-of-danger">
          워처 정보를 불러오지 못했습니다.
        </p>
      ) : null}
    </section>
  )
}

function watcherInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}
