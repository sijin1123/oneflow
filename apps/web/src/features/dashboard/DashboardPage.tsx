import { useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { cn } from '@/lib/utils'
import { PRIORITY_LABELS, WP_STATUSES } from '@/features/work-packages/types'
import type { WpPriority, WpStatus } from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'

import { RecentActivity } from './RecentActivity'
import { useDashboard, type Bucket } from './api'

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

export function DashboardPage() {
  const { projectId } = useParams() as { projectId: string }
  const { data, isPending, isError, error, refetch } = useDashboard(projectId)
  const statusLabel = useStatusLabels(projectId)
  const statusLabels = Object.fromEntries(WP_STATUSES.map((s) => [s, statusLabel(s)])) as Record<
    WpStatus,
    string
  >


  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const progress =
    data.total_estimated_hours > 0
      ? Math.round((data.total_spent_hours / data.total_estimated_hours) * 100)
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-base font-semibold">대시보드</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="전체 작업" value={String(data.total_work_packages)} />
        <Tile label="진행 중" value={String(data.open_work_packages)} />
        <Tile label="기한 초과" value={String(data.overdue_count)} accent={data.overdue_count > 0} />
        <Tile
          label="시간(소요/예상)"
          value={`${data.total_spent_hours} / ${data.total_estimated_hours}h`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {progress !== null ? (
        <div className="rounded-of border border-of-border bg-of-surface p-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium">예상 대비 소요</span>
            <span className={cn('text-of-muted', progress > 100 && 'text-of-danger')}>{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-of-surface-2">
            <div
              className={cn('h-full rounded-full', progress > 100 ? 'bg-of-danger' : 'bg-of-accent')}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Distribution
          title="상태별"
          buckets={data.status_counts}
          colors={STATUS_COLOR}
          labels={statusLabels}
        />
        <Distribution
          title="우선순위별"
          buckets={data.priority_counts}
          colors={PRIORITY_COLOR}
          labels={PRIORITY_LABELS as Record<WpPriority, string>}
        />
      </div>

      <RecentActivity projectId={projectId} />
    </div>
  )
}
