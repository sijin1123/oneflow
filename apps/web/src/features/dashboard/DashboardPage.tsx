import { FileDown, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PRIORITY_LABELS, WP_STATUSES } from '@/features/work-packages/types'
import type { WpPriority, WpStatus } from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'

import { RecentActivity } from './RecentActivity'
import { useDashboard, useDashboardLayout, useSaveDashboardLayout, type Bucket } from './api'

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
    <div className="rounded-of border border-of-border bg-of-surface px-4 py-3">
      <p className="text-xs text-of-muted">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold', accent && 'text-of-danger')}>{value}</p>
    </div>
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
    <div className="rounded-of border border-of-border bg-of-surface p-4">
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
  recent_activity: '최근 활동',
}

export function DashboardPage() {
  const { projectId } = useParams() as { projectId: string }
  const { data, isPending, isError, error, refetch } = useDashboard(projectId)
  const layout = useDashboardLayout(projectId)
  const saveLayout = useSaveDashboardLayout(projectId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const statusLabel = useStatusLabels(projectId)
  const statusLabels = Object.fromEntries(WP_STATUSES.map((s) => [s, statusLabel(s)])) as Record<
    WpStatus,
    string
  >

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const widgets = layout.data?.widgets ?? Object.keys(WIDGET_LABELS)

  const startEdit = () => {
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

  const progress =
    data.total_estimated_hours > 0
      ? Math.round((data.total_spent_hours / data.total_estimated_hours) * 100)
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">대시보드</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={editing ? save : startEdit}
            disabled={saveLayout.isPending || (editing && draft.length === 0)}
            className="flex items-center gap-1.5 rounded-of border border-of-border px-2.5 py-1.5 text-xs font-medium hover:bg-of-surface-2"
          >
            <Settings2 size={13} /> {editing ? '레이아웃 저장' : '위젯 편집'}
          </button>
          <a
            href={`${BASE_URL}/api/v1/projects/${projectId}/dashboard/export.csv`}
            className="flex items-center gap-1.5 rounded-of border border-of-border px-2.5 py-1.5 text-xs font-medium hover:bg-of-surface-2"
          >
            <FileDown size={13} /> CSV 내보내기
          </a>
        </div>
      </div>

      {editing ? (
        <div className="space-y-1.5 rounded-of border border-of-border bg-of-surface p-3">
          <p className="text-xs font-medium">표시할 위젯과 순서 (최소 1개)</p>
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
                          className="rounded-of border border-of-border px-1.5 text-of-muted hover:bg-of-surface-2"
                          onClick={() => move(key, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`${WIDGET_LABELS[key]} 아래로`}
                          className="rounded-of border border-of-border px-1.5 text-of-muted hover:bg-of-surface-2"
                          onClick={() => move(key, 1)}
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                  </li>
                )
              },
            )}
          </ul>
          {saveLayout.isError ? (
            <p role="alert" className="text-xs text-of-danger">저장하지 못했습니다.</p>
          ) : null}
        </div>
      ) : null}

      {widgets.map((key) => {
        if (key === 'summary')
          return (
            <div key={key} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="전체 작업" value={String(data.total_work_packages)} />
              <Tile label="진행 중" value={String(data.open_work_packages)} />
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
        if (key === 'recent_activity') return <RecentActivity key={key} projectId={projectId} />
        return null
      })}
    </div>
  )
}
