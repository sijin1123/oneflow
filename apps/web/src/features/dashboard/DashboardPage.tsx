import {
  ArrowDown,
  ArrowUp,
  FileDown,
  Loader2,
  RotateCcw,
  Settings2,
  Share2,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { ApiError, BASE_URL } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import { PRIORITY_LABELS, WP_STATUSES } from '@/features/work-packages/types'
import type { WpPriority, WpStatus } from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'
import { useTypeLabels } from '@/features/work-packages/useTypeLabels'
import { ReportingMetricCard, ReportingSurface } from '@/features/reports/ReportingSurface'

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

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <ReportingMetricCard label={label} value={value} tone={accent ? 'danger' : 'neutral'} />
  )
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
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const total = buckets.reduce((s, b) => s + b.count, 0)
  return (
    <div className="min-w-0 rounded-of border border-of-border bg-of-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {total === 0 ? (
        <p className="text-xs text-of-muted">데이터가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {buckets.map((b) => (
            <li key={b.key} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 text-of-muted">{labels[b.key] ?? b.key}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-of-surface-2">
                <div
                  className={cn('h-full rounded-full', colors[b.key] ?? 'bg-of-accent')}
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-medium tabular-nums">{b.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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

export function DashboardPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useDashboard(projectId)
  const layout = useDashboardLayout(projectId)
  const saveLayout = useSaveDashboardLayout(projectId)
  const resetLayout = useResetDashboardLayout(projectId)
  const saveSharedLayout = useSaveSharedDashboardLayout(projectId)
  const deleteSharedLayout = useDeleteSharedDashboardLayout(projectId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [confirmSharedDelete, setConfirmSharedDelete] = useState(false)
  const statusLabel = useStatusLabels(projectId)
  const statusLabels = Object.fromEntries(WP_STATUSES.map((s) => [s, statusLabel(s)])) as Record<
    WpStatus,
    string
  >
  const typeLabel = useTypeLabels(projectId)
  const typeLabels = Object.fromEntries(
    (data?.type_counts ?? []).map((bucket) => [bucket.key, typeLabel(bucket.key)]),
  ) as Record<string, string>

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (layout.isPending) return <ListSkeleton />
  if (layout.isError)
    return <ErrorState error={layout.error} onRetry={() => layout.refetch()} />

  const widgets = layout.data.widgets ?? Object.keys(WIDGET_LABELS)
  const source =
    layout.data.source ?? (layout.data.is_default ? 'builtin' : 'personal')
  const sharedLayout = layout.data.shared_layout ?? null
  const canManageShared = layout.data.can_manage_shared ?? false
  const sourceLabel =
    source === 'personal' ? '개인 레이아웃' : source === 'shared' ? '프로젝트 공유' : '기본 레이아웃'
  const sourceDescription =
    source === 'personal'
      ? '내 위젯 구성이 이 프로젝트의 공유 설정보다 우선 적용됩니다.'
      : source === 'shared'
        ? '프로젝트 소유자가 게시한 위젯 구성을 사용하고 있습니다.'
        : 'OneFlow의 기본 위젯 구성을 사용하고 있습니다.'

  const startEdit = () => {
    saveLayout.reset()
    saveSharedLayout.reset()
    deleteSharedLayout.reset()
    setDraft(widgets)
    setEditing(true)
  }
  const move = (key: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const i = prev.indexOf(key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      next.splice(i, 1)
      next.splice(j, 0, key)
      return next
    })
  }
  const toggle = (key: string) => {
    setDraft((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }
  const save = () => {
    if (draft.length === 0) return
    saveLayout.mutate(draft, { onSuccess: () => setEditing(false) })
  }
  const publishShared = () => {
    if (draft.length === 0) return
    deleteSharedLayout.reset()
    saveSharedLayout.mutate(
      { widgets: draft, expectedVersion: sharedLayout?.version ?? 0 },
      { onSuccess: () => setEditing(false) },
    )
  }
  const resetPersonal = () => {
    saveSharedLayout.reset()
    deleteSharedLayout.reset()
    resetLayout.mutate(undefined, { onSuccess: () => setConfirmSharedDelete(false) })
  }
  const deleteShared = () => {
    if (!sharedLayout) return
    saveSharedLayout.reset()
    deleteSharedLayout.mutate(sharedLayout.version, {
      onSuccess: () => setConfirmSharedDelete(false),
    })
  }
  const sharedMutationError = saveSharedLayout.error ?? deleteSharedLayout.error
  const sharedConflict =
    sharedMutationError instanceof ApiError && sharedMutationError.status === 409
  const anyLayoutMutationPending =
    saveLayout.isPending ||
    resetLayout.isPending ||
    saveSharedLayout.isPending ||
    deleteSharedLayout.isPending

  const progress =
    data.total_estimated_hours > 0
      ? Math.round((data.total_spent_hours / data.total_estimated_hours) * 100)
      : null

  return (
    <ReportingSurface
      title={data.name}
      description={data.description || '프로젝트의 작업, 비용, 시간, 활동 신호를 한 화면에서 점검합니다.'}
      context={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data.key}</Badge>
          {data.health ? (
            <span className={cn('inline-flex min-h-5 items-center rounded-full px-2 text-xs font-medium', HEALTH_STYLES[data.health])}>
              {HEALTH_LABELS[data.health]}
            </span>
          ) : (
            <Badge variant="neutral">상태 미설정</Badge>
          )}
          {data.archived_at ? <Badge variant="neutral">보관됨</Badge> : null}
        </div>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={editing ? save : startEdit}
            disabled={anyLayoutMutationPending || (editing && draft.length === 0)}
          >
            {saveLayout.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Settings2 size={13} />
            )}{' '}
            {editing ? '개인 레이아웃 저장' : '위젯 편집'}
          </Button>
          <a
            href={`${BASE_URL}/api/v1/projects/${projectId}/dashboard/export.csv`}
            className="inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface"
          >
            <FileDown size={13} /> CSV 내보내기
          </a>
        </>
      }
    >
      {data.health_note ? (
        <p className="border-l-2 border-of-accent px-3 text-xs leading-5 text-of-muted">
          {data.health_note}
        </p>
      ) : null}

      <section
        aria-label="대시보드 레이아웃 적용 상태"
        className="flex min-w-0 flex-col gap-3 border-y border-of-border py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={source === 'personal' ? 'neutral' : 'outline'}>{sourceLabel}</Badge>
            {sharedLayout ? (
              <span className="text-[11px] text-of-muted">
                공유 v{sharedLayout.version} · {sharedLayout.updated_by_name} ·{' '}
                {formatDateTime(sharedLayout.updated_at)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">{sourceDescription}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {source === 'personal' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={anyLayoutMutationPending}
              onClick={resetPersonal}
            >
              {resetLayout.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RotateCcw size={13} />
              )}
              {sharedLayout ? '공유 레이아웃으로 돌아가기' : '기본 레이아웃으로 돌아가기'}
            </Button>
          ) : null}
          {canManageShared && sharedLayout && !confirmSharedDelete ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={anyLayoutMutationPending}
              onClick={() => setConfirmSharedDelete(true)}
            >
              <Trash2 size={13} /> 공유 레이아웃 삭제
            </Button>
          ) : null}
          {canManageShared && sharedLayout && confirmSharedDelete ? (
            <div
              role="group"
              aria-label="공유 레이아웃 삭제 확인"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-xs text-of-muted">모든 상속 사용자가 기본 구성으로 전환됩니다.</span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={anyLayoutMutationPending}
                onClick={deleteShared}
              >
                {deleteSharedLayout.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                삭제 확인
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={anyLayoutMutationPending}
                onClick={() => setConfirmSharedDelete(false)}
              >
                취소
              </Button>
            </div>
          ) : null}
        </div>
      </section>
      {sharedMutationError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-of-border pb-3 text-xs text-of-danger"
        >
          <span>
            {sharedConflict
              ? '다른 변경이 먼저 저장되었습니다. 편집 초안은 유지됩니다.'
              : '프로젝트 공유 레이아웃을 변경하지 못했습니다.'}
          </span>
          {sharedConflict ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                saveSharedLayout.reset()
                deleteSharedLayout.reset()
                void layout.refetch()
              }}
            >
              최신 공유 버전 불러오기
            </Button>
          ) : null}
        </div>
      ) : null}
      {resetLayout.isError ? (
        <p role="alert" className="border-b border-of-border pb-3 text-xs text-of-danger">
          개인 레이아웃을 초기화하지 못했습니다.
        </p>
      ) : null}

      {editing ? (
        <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium">표시할 위젯과 순서 (최소 1개)</p>
              <p className="mt-1 text-[11px] leading-4 text-of-muted">
                개인 저장은 내 화면에만 적용됩니다. 프로젝트 공유는 개인 설정이 없는 구성원에게
                적용됩니다.
              </p>
            </div>
            {canManageShared ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={anyLayoutMutationPending || draft.length === 0}
                onClick={publishShared}
              >
                {saveSharedLayout.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Share2 size={13} />
                )}
                {sharedLayout ? '프로젝트 공유 업데이트' : '프로젝트 공유로 게시'}
              </Button>
            ) : null}
          </div>
          <ul className="space-y-1">
            {[...draft, ...Object.keys(WIDGET_LABELS).filter((k) => !draft.includes(k))].map(
              (key) => {
                const on = draft.includes(key)
                return (
                  <li key={key} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(key)}
                      aria-label={`${WIDGET_LABELS[key]} 표시`}
                      className="h-3.5 w-3.5 accent-of-accent"
                    />
                    <span className={`min-w-0 flex-1 ${on ? '' : 'text-of-muted'}`}>
                      {WIDGET_LABELS[key]}
                    </span>
                    {on ? (
                      <>
                        <button
                          type="button"
                          aria-label={`${WIDGET_LABELS[key]} 위로`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-hover"
                          onClick={() => move(key, -1)}
                        >
                          <ArrowUp size={12} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${WIDGET_LABELS[key]} 아래로`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-hover"
                          onClick={() => move(key, 1)}
                        >
                          <ArrowDown size={12} aria-hidden="true" />
                        </button>
                      </>
                    ) : null}
                  </li>
                )
              },
            )}
          </ul>
          {saveLayout.isError ? (
            <p role="alert" className="text-xs text-of-danger">
              개인 레이아웃을 저장하지 못했습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        {widgets.map((key) => {
        if (key === 'summary')
          return (
            <div key={key} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
            </div>
          )
        if (key === 'budget')
          return (
            <div key={key} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="비용 합계" value={`₩${data.total_cost.toLocaleString('ko-KR')}`} />
              <Tile
                label="예산"
                value={data.budget !== null ? `₩${data.budget.toLocaleString('ko-KR')}` : '미설정'}
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
            </div>
          )
        if (key === 'progress')
          return progress !== null ? (
            <div key={key} className="rounded-of border border-of-border bg-of-surface p-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium">예상 대비 소요</span>
                <span className={cn('text-of-muted', progress > 100 && 'text-of-danger')}>
                  {progress}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-of-surface-2">
                <div
                  className={cn(
                    'h-full rounded-full',
                    progress > 100 ? 'bg-of-danger' : 'bg-of-accent',
                  )}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
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
        if (key === 'recent_activity') return <RecentActivity key={key} projectId={projectId} />
        return null
        })}
      </div>

      <section aria-label="최근 작업" className="min-w-0 border-t border-of-border pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">최근 작업</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/work-packages`)}>
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
                  onClick={() => navigate(`/projects/${projectId}/work-packages?wp=${workPackage.id}`)}
                >
                  <span className="min-w-0 truncate text-[13px] font-medium">{workPackage.subject}</span>
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
    </ReportingSurface>
  )
}
