import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowDown,
  ArrowUp,
  FileDown,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  RotateCcw,
  Settings2,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'
import { ReportingMetricCard } from '@/features/reports/ReportingSurface'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { PRIORITY_LABELS, WP_STATUSES } from '@/features/work-packages/types'
import type { WpPriority, WpStatus } from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'
import { useTypeLabels } from '@/features/work-packages/useTypeLabels'
import { ApiError, BASE_URL } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { useUnsavedChangesPrompt } from '@/lib/guards'
import { cn } from '@/lib/utils'

import { RecentActivity } from './RecentActivity'
import {
  useDashboard,
  useDashboardLayout,
  useDeleteSharedDashboardLayout,
  useResetDashboardLayout,
  useSaveDashboardLayout,
  useSaveSharedDashboardLayout,
  type Bucket,
} from './api'

const TYPE_COLOR: Record<string, string> = {
  task: 'bg-sky-400',
  bug: 'bg-red-400',
  feature: 'bg-emerald-400',
  milestone: 'bg-violet-400',
}

const STATUS_COLOR: Record<string, string> = {
  backlog: 'bg-gray-400',
  todo: 'bg-sky-500',
  in_progress: 'bg-amber-500',
  in_review: 'bg-violet-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-gray-300',
}

const PRIORITY_COLOR: Record<string, string> = {
  none: 'bg-gray-300',
  low: 'bg-sky-400',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
}

const WIDGET_LABELS: Record<string, string> = {
  summary: '작업 요약 타일',
  budget: '비용/예산 타일',
  progress: '예상 대비 소요',
  status_distribution: '상태별 분포',
  priority_distribution: '우선순위별 분포',
  type_distribution: '타입별 분포',
  recent_activity: '최근 활동',
}

type FailedAction =
  | 'save-personal'
  | 'reset-personal'
  | 'save-shared'
  | 'delete-shared'
  | null

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError && error.message ? error.message : fallback
}

function sameWidgets(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <ReportingMetricCard label={label} value={value} tone={accent ? 'danger' : 'neutral'} />
}

function Distribution({
  title,
  buckets,
  colors,
  labels,
}: {
  title: string
  buckets: Bucket[]
  colors: Record<string, string>
  labels: Record<string, string>
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <section className="min-w-0 rounded-of border border-of-border bg-of-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {total === 0 ? (
        <p className="text-xs text-of-muted">데이터가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {buckets.map((bucket) => (
            <li key={bucket.key} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 truncate text-of-muted">
                {labels[bucket.key] ?? bucket.key}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-of-surface-2">
                <div
                  className={cn('h-full rounded-full', colors[bucket.key] ?? 'bg-of-accent')}
                  style={{ width: `${(bucket.count / max) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-medium tabular-nums">
                {bucket.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function DashboardPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const dashboard = useDashboard(projectId)
  const layout = useDashboardLayout(projectId)
  const saveLayout = useSaveDashboardLayout(projectId)
  const resetLayout = useResetDashboardLayout(projectId)
  const saveSharedLayout = useSaveSharedDashboardLayout(projectId)
  const deleteSharedLayout = useDeleteSharedDashboardLayout(projectId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [discardPrompt, setDiscardPrompt] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [failedAction, setFailedAction] = useState<FailedAction>(null)
  const [notice, setNotice] = useState('')
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const data = dashboard.data
  const widgets = useMemo(
    () => layout.data?.widgets ?? Object.keys(WIDGET_LABELS),
    [layout.data?.widgets],
  )
  const dirty = editorOpen && !sameWidgets(draft, widgets)

  useUnsavedChangesPrompt(
    dirty,
    '저장하지 않은 대시보드 위젯 변경이 있습니다. 페이지를 이동할까요?',
  )

  if (dashboard.isPending || layout.isPending) return <ListSkeleton />
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => layout.refetch()} />
  if (!data || !layout.data) return null

  const source = layout.data.source ?? (layout.data.is_default ? 'builtin' : 'personal')
  const sharedLayout = layout.data.shared_layout ?? null
  const canManageShared = layout.data.can_manage_shared ?? false
  const sourceLabel =
    source === 'personal' ? '개인 레이아웃' : source === 'shared' ? '프로젝트 공유' : '기본 레이아웃'
  const sourceDescription =
    source === 'personal'
      ? '내 위젯 구성이 공유 설정보다 우선 적용됩니다.'
      : source === 'shared'
        ? '프로젝트 소유자가 게시한 위젯 구성을 사용 중입니다.'
        : 'OneFlow 기본 위젯 구성을 사용 중입니다.'
  const statusLabels = Object.fromEntries(
    WP_STATUSES.map((status) => [status, statusLabel(status)]),
  ) as Record<WpStatus, string>
  const typeLabels = Object.fromEntries(
    data.type_counts.map((bucket) => [bucket.key, typeLabel(bucket.key)]),
  ) as Record<string, string>
  const progress =
    data.total_estimated_hours > 0
      ? Math.round((data.total_spent_hours / data.total_estimated_hours) * 100)
      : null
  const anyLayoutMutationPending =
    saveLayout.isPending ||
    resetLayout.isPending ||
    saveSharedLayout.isPending ||
    deleteSharedLayout.isPending
  const failedMutation =
    failedAction === 'save-personal'
      ? saveLayout.error
      : failedAction === 'reset-personal'
        ? resetLayout.error
        : failedAction === 'save-shared'
          ? saveSharedLayout.error
          : failedAction === 'delete-shared'
            ? deleteSharedLayout.error
            : null
  const sharedConflict = failedMutation instanceof ApiError && failedMutation.status === 409
  const orderedEditorKeys = [
    ...draft,
    ...Object.keys(WIDGET_LABELS).filter((key) => !draft.includes(key)),
  ]

  const resetMutationState = () => {
    saveLayout.reset()
    resetLayout.reset()
    saveSharedLayout.reset()
    deleteSharedLayout.reset()
    setFailedAction(null)
  }

  const startEdit = () => {
    resetMutationState()
    setNotice('')
    setDraft(widgets)
    setDiscardPrompt(false)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    if (anyLayoutMutationPending) return
    if (dirty) {
      setDiscardPrompt(true)
      return
    }
    setEditorOpen(false)
    setDiscardPrompt(false)
    setFailedAction(null)
  }

  const discardDraft = () => {
    setDraft(widgets)
    setDiscardPrompt(false)
    setFailedAction(null)
    setEditorOpen(false)
  }

  const move = (key: string, direction: -1 | 1) => {
    setDraft((current) => {
      const index = current.indexOf(key)
      const destination = index + direction
      if (index < 0 || destination < 0 || destination >= current.length) return current
      const next = [...current]
      next.splice(index, 1)
      next.splice(destination, 0, key)
      return next
    })
  }

  const toggle = (key: string) => {
    setFailedAction(null)
    setDraft((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )
  }

  const savePersonal = async () => {
    if (draft.length === 0 || saveLayout.isPending) return
    resetMutationState()
    try {
      await saveLayout.mutateAsync(draft)
      setNotice('개인 대시보드 레이아웃을 저장했습니다.')
      setEditorOpen(false)
    } catch {
      setFailedAction('save-personal')
    }
  }

  const saveShared = async (refreshVersion = false) => {
    if (draft.length === 0 || saveSharedLayout.isPending) return
    resetMutationState()
    try {
      let expectedVersion = sharedLayout?.version ?? 0
      if (refreshVersion) {
        const refreshed = await layout.refetch()
        expectedVersion = refreshed.data?.shared_layout?.version ?? 0
      }
      await saveSharedLayout.mutateAsync({ widgets: draft, expectedVersion })
      setNotice(
        sharedLayout
          ? '프로젝트 공유 레이아웃을 업데이트했습니다.'
          : '프로젝트 공유 레이아웃을 게시했습니다.',
      )
      setEditorOpen(false)
    } catch {
      setFailedAction('save-shared')
    }
  }

  const resetPersonal = async () => {
    if (resetLayout.isPending) return
    resetMutationState()
    try {
      await resetLayout.mutateAsync()
      setNotice(
        sharedLayout
          ? '프로젝트 공유 레이아웃으로 돌아왔습니다.'
          : '기본 레이아웃으로 돌아왔습니다.',
      )
    } catch {
      setFailedAction('reset-personal')
    }
  }

  const deleteShared = async (refreshVersion = false) => {
    if (!sharedLayout || deleteSharedLayout.isPending) return
    resetMutationState()
    try {
      let version = sharedLayout.version
      if (refreshVersion) {
        const refreshed = await layout.refetch()
        const latest = refreshed.data?.shared_layout
        if (!latest) {
          setNotice('공유 레이아웃이 이미 삭제되었습니다.')
          setDeleteOpen(false)
          return
        }
        version = latest.version
      }
      await deleteSharedLayout.mutateAsync(version)
      setNotice('프로젝트 공유 레이아웃을 삭제했습니다.')
      setDeleteOpen(false)
    } catch {
      setFailedAction('delete-shared')
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">{data.name} 대시보드</h1>
      <FrameContextActions>
        <Button
          ref={editButtonRef}
          type="button"
          variant="outline"
          size="sm"
          disabled={anyLayoutMutationPending}
          onClick={startEdit}
        >
          <Settings2 size={13} aria-hidden="true" />
          위젯 편집
        </Button>
        <a
          href={`${BASE_URL}/api/v1/projects/${projectId}/dashboard/export.csv`}
          className="of-touch-target inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface"
        >
          <FileDown size={13} aria-hidden="true" />
          CSV 내보내기
        </a>
      </FrameContextActions>

      <section
        aria-label="대시보드 상태"
        className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-of-border-subtle bg-of-surface-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline">{data.key}</Badge>
          {data.health ? (
            <span
              className={cn(
                'inline-flex min-h-5 items-center rounded-full px-2 text-xs font-medium',
                HEALTH_STYLES[data.health],
              )}
            >
              {HEALTH_LABELS[data.health]}
            </span>
          ) : (
            <Badge variant="neutral">상태 미설정</Badge>
          )}
          {data.archived_at ? <Badge variant="neutral">보관됨</Badge> : null}
          <span className="hidden h-4 w-px bg-of-border sm:block" aria-hidden="true" />
          <Badge variant={source === 'personal' ? 'neutral' : 'outline'}>{sourceLabel}</Badge>
          <span className="min-w-0 truncate text-[11px] text-of-muted">
            {sourceDescription}
          </span>
          {sharedLayout ? (
            <span className="text-[11px] text-of-muted">
              v{sharedLayout.version} · {sharedLayout.updated_by_name} ·{' '}
              {formatDateTime(sharedLayout.updated_at)}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {source === 'personal' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={anyLayoutMutationPending}
              onClick={() => void resetPersonal()}
            >
              {resetLayout.isPending ? (
                <Loader2 className="animate-spin" size={13} aria-hidden="true" />
              ) : (
                <RotateCcw size={13} aria-hidden="true" />
              )}
              {failedAction === 'reset-personal'
                ? '돌아가기 다시 시도'
                : sharedLayout
                  ? '공유 레이아웃으로 돌아가기'
                  : '기본 레이아웃으로 돌아가기'}
            </Button>
          ) : null}
          {canManageShared && sharedLayout ? (
            <Button
              ref={deleteButtonRef}
              type="button"
              size="sm"
              variant="ghost"
              disabled={anyLayoutMutationPending}
              onClick={() => {
                resetMutationState()
                setDeleteOpen(true)
              }}
            >
              <Trash2 size={13} aria-hidden="true" />
              공유 레이아웃 삭제
            </Button>
          ) : null}
        </div>
      </section>

      {failedAction === 'reset-personal' ? (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"
        >
          <span>
            {errorMessage(resetLayout.error, '개인 레이아웃을 초기화하지 못했습니다.')}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={resetLayout.isPending}
            onClick={() => void resetPersonal()}
          >
            <RefreshCw size={13} aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      ) : null}

      <div
        data-testid="project-dashboard-scroll"
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5">
          {data.health_note ? (
            <p className="border-l-2 border-of-accent px-3 text-xs leading-5 text-of-muted">
              {data.health_note}
            </p>
          ) : null}

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            {widgets.map((key) => {
              if (key === 'summary')
                return (
                  <section
                    key={key}
                    aria-label="작업 요약"
                    className="grid grid-cols-2 gap-3 lg:col-span-3 sm:grid-cols-5"
                  >
                    <Tile label="전체 작업" value={String(data.total_work_packages)} />
                    <Tile label="진행 중" value={String(data.open_work_packages)} />
                    <Tile label="완료율" value={`${data.completion_percent}%`} />
                    <Tile
                      label="기한 초과"
                      value={String(data.overdue_count)}
                      accent={data.overdue_count > 0}
                    />
                    <Tile
                      label="시간(소요/예상)"
                      value={`${data.total_spent_hours} / ${data.total_estimated_hours}h`}
                    />
                  </section>
                )
              if (key === 'budget')
                return (
                  <section
                    key={key}
                    aria-label="예산 요약"
                    className="grid grid-cols-2 gap-3 lg:col-span-3 sm:grid-cols-4"
                  >
                    <Tile label="비용 합계" value={`₩${data.total_cost.toLocaleString('ko-KR')}`} />
                    <Tile
                      label="예산"
                      value={
                        data.budget !== null
                          ? `₩${data.budget.toLocaleString('ko-KR')}`
                          : '미설정'
                      }
                    />
                    <Tile
                      label="예산 잔액"
                      value={
                        data.budget !== null
                          ? `₩${(data.budget - data.total_cost).toLocaleString('ko-KR')}`
                          : '—'
                      }
                      accent={data.budget !== null && data.budget - data.total_cost < 0}
                    />
                    <Tile
                      label="예산 소진율"
                      value={
                        data.budget && data.budget > 0
                          ? `${Math.round((data.total_cost / data.budget) * 100)}%`
                          : '—'
                      }
                    />
                  </section>
                )
              if (key === 'progress')
                return progress !== null ? (
                  <section
                    key={key}
                    className="rounded-of border border-of-border bg-of-surface p-4 lg:col-span-3"
                  >
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <h2 className="font-medium">예상 대비 소요</h2>
                      <span className={cn('text-of-muted', progress > 100 && 'text-of-danger')}>
                        {progress}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="예상 대비 소요"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(progress, 100)}
                      aria-valuetext={`${progress}%`}
                      className="h-2.5 overflow-hidden rounded-full bg-of-surface-2"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full',
                          progress > 100 ? 'bg-of-danger' : 'bg-of-accent',
                        )}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </section>
                ) : null
              if (key === 'status_distribution')
                return (
                  <Distribution
                    key={key}
                    title="상태별"
                    buckets={data.status_counts}
                    colors={STATUS_COLOR}
                    labels={statusLabels}
                  />
                )
              if (key === 'priority_distribution')
                return (
                  <Distribution
                    key={key}
                    title="우선순위별"
                    buckets={data.priority_counts}
                    colors={PRIORITY_COLOR}
                    labels={PRIORITY_LABELS as Record<WpPriority, string>}
                  />
                )
              if (key === 'type_distribution')
                return (
                  <Distribution
                    key={key}
                    title="타입별"
                    buckets={data.type_counts}
                    colors={TYPE_COLOR}
                    labels={typeLabels}
                  />
                )
              if (key === 'recent_activity')
                return (
                  <div key={key} className="lg:col-span-3">
                    <RecentActivity projectId={projectId} />
                  </div>
                )
              return null
            })}
          </div>

          <section aria-label="최근 작업" className="min-w-0 border-t border-of-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">최근 작업</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/projects/${projectId}/work-packages`)}
              >
                전체 보기
              </Button>
            </div>
            {data.recent_work_packages.length === 0 ? (
              <p className="py-8 text-center text-xs text-of-muted">아직 작업이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-of-border border-y border-of-border">
                {data.recent_work_packages.map((workPackage) => (
                  <li key={workPackage.id}>
                    <button
                      type="button"
                      className="grid min-h-12 w-full min-w-0 gap-1 px-2 py-2 text-left hover:bg-of-surface-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      onClick={() =>
                        navigate(`/projects/${projectId}/work-packages?wp=${workPackage.id}`)
                      }
                    >
                      <span className="min-w-0 truncate text-[13px] font-medium">
                        {workPackage.subject}
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-of-muted">
                        <StatusChip status={workPackage.status} />
                        <PriorityChip priority={workPackage.priority} />
                        <span>{workPackage.assignee_name ?? '담당자 없음'}</span>
                        <span>{formatDateTime(workPackage.updated_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Dialog.Root open={editorOpen} onOpenChange={(open) => (open ? startEdit() : closeEditor())}>
        <Dialog.Portal>
          <ModalOverlay className="bg-black/40" />
          <ModalContent
            className="flex max-h-[min(42rem,calc(100dvh-1.5rem))] w-[min(34rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              editButtonRef.current?.focus()
            }}
          >
            <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
                <LayoutDashboard size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">대시보드 위젯 편집</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs leading-5 text-of-muted">
                  표시할 위젯과 순서를 정합니다. 개인 저장은 내 화면에만 적용됩니다.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="위젯 편집 창 닫기"
                  disabled={anyLayoutMutationPending}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>

            {discardPrompt ? (
              <div className="flex min-h-64 flex-col justify-center px-5 py-6 text-center">
                <h2 className="text-sm font-semibold">변경 내용을 버릴까요?</h2>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-of-muted">
                  아직 저장하지 않은 위젯 표시와 순서 변경이 있습니다.
                </p>
                <div className="mt-5 flex flex-col-reverse justify-center gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setDiscardPrompt(false)}>
                    계속 편집
                  </Button>
                  <Button type="button" variant="danger" onClick={discardDraft}>
                    변경 버리기
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="of-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                  <ul className="divide-y divide-of-border-subtle rounded-of border border-of-border">
                    {orderedEditorKeys.map((key) => {
                      const visible = draft.includes(key)
                      const index = draft.indexOf(key)
                      return (
                        <li key={key} className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs">
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => toggle(key)}
                            aria-label={`${WIDGET_LABELS[key]} 표시`}
                            className="h-3.5 w-3.5 accent-of-accent"
                          />
                          <span className={cn('min-w-0 flex-1', !visible && 'text-of-muted')}>
                            {WIDGET_LABELS[key]}
                          </span>
                          {visible ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`${WIDGET_LABELS[key]} 위로`}
                                disabled={index === 0}
                                onClick={() => move(key, -1)}
                              >
                                <ArrowUp size={13} aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`${WIDGET_LABELS[key]} 아래로`}
                                disabled={index === draft.length - 1}
                                onClick={() => move(key, 1)}
                              >
                                <ArrowDown size={13} aria-hidden="true" />
                              </Button>
                            </>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                  {draft.length === 0 ? (
                    <p role="alert" className="mt-3 text-xs text-of-danger">
                      위젯을 하나 이상 선택해 주세요.
                    </p>
                  ) : null}
                  {failedAction === 'save-personal' || failedAction === 'save-shared' ? (
                    <div
                      role="alert"
                      className="mt-3 rounded-of border border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs leading-5 text-of-danger"
                    >
                      {sharedConflict
                        ? '다른 변경이 먼저 저장되었습니다. 현재 초안을 유지한 채 최신 버전으로 다시 시도할 수 있습니다.'
                        : errorMessage(
                            failedMutation,
                            failedAction === 'save-shared'
                              ? '프로젝트 공유 레이아웃을 저장하지 못했습니다.'
                              : '개인 레이아웃을 저장하지 못했습니다.',
                          )}
                    </div>
                  ) : null}
                </div>

                <footer className="flex flex-col gap-2 border-t border-of-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[11px] text-of-muted">
                    {dirty ? '저장하지 않은 변경이 있습니다.' : '현재 구성과 같습니다.'}
                  </span>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={anyLayoutMutationPending}
                      onClick={closeEditor}
                    >
                      취소
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={anyLayoutMutationPending || draft.length === 0 || !dirty}
                      onClick={() => void savePersonal()}
                    >
                      {saveLayout.isPending ? (
                        <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                      ) : (
                        <Settings2 size={13} aria-hidden="true" />
                      )}
                      {failedAction === 'save-personal'
                        ? '개인 저장 다시 시도'
                        : '개인 레이아웃 저장'}
                    </Button>
                    {canManageShared ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          anyLayoutMutationPending ||
                          draft.length === 0 ||
                          (!dirty && source === 'shared')
                        }
                        onClick={() => void saveShared(sharedConflict)}
                      >
                        {saveSharedLayout.isPending ? (
                          <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                        ) : sharedConflict ? (
                          <RefreshCw size={13} aria-hidden="true" />
                        ) : (
                          <Share2 size={13} aria-hidden="true" />
                        )}
                        {sharedConflict
                          ? '최신 버전으로 다시 시도'
                          : sharedLayout
                            ? '프로젝트 공유 업데이트'
                            : '프로젝트 공유로 게시'}
                      </Button>
                    ) : null}
                  </div>
                </footer>
              </>
            )}
          </ModalContent>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleteSharedLayout.isPending) return
          setDeleteOpen(open)
          if (!open) setFailedAction(null)
        }}
      >
        <Dialog.Portal>
          <ModalOverlay className="bg-black/40" />
          <ModalContent
            className="w-[min(29rem,calc(100vw-1.5rem))] rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              deleteButtonRef.current?.focus()
            }}
          >
            <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-danger-soft text-of-danger">
                <Trash2 size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">
                  공유 레이아웃을 삭제할까요?
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                  개인 설정이 없는 구성원은 즉시 기본 대시보드 구성으로 전환됩니다.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="공유 레이아웃 삭제 창 닫기"
                  disabled={deleteSharedLayout.isPending}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>
            {failedAction === 'delete-shared' ? (
              <p
                role="alert"
                className="mx-4 mt-4 rounded-of border border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs leading-5 text-of-danger"
              >
                {sharedConflict
                  ? '공유 레이아웃이 먼저 변경되었습니다. 최신 버전으로 같은 삭제를 다시 시도할 수 있습니다.'
                  : errorMessage(
                      deleteSharedLayout.error,
                      '공유 레이아웃을 삭제하지 못했습니다.',
                    )}
              </p>
            ) : null}
            <footer className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deleteSharedLayout.isPending}
                >
                  취소
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={deleteSharedLayout.isPending}
                onClick={() => void deleteShared(sharedConflict)}
              >
                {deleteSharedLayout.isPending ? (
                  <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                ) : sharedConflict ? (
                  <RefreshCw size={13} aria-hidden="true" />
                ) : (
                  <Trash2 size={13} aria-hidden="true" />
                )}
                {sharedConflict ? '최신 버전으로 삭제 다시 시도' : '삭제 확인'}
              </Button>
            </footer>
          </ModalContent>
        </Dialog.Portal>
      </Dialog.Root>

      <span role="status" aria-live="polite" className="sr-only">
        {notice}
      </span>
    </div>
  )
}
