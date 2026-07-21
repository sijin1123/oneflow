import { ArrowRight, History, RotateCcw } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { profileImageSrc } from '@/features/members/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { useProjectHealthHistory } from './api'
import {
  HEALTH_LABELS,
  HEALTH_STYLES,
  type ProjectHealth,
} from './types'

function HealthBadge({ health }: { health: ProjectHealth | null }) {
  if (!health) {
    return (
      <span className="inline-flex min-h-5 items-center rounded-full bg-of-surface-hover px-2 text-[11px] font-medium text-of-muted">
        미설정
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex min-h-5 items-center rounded-full px-2 text-[11px] font-medium',
        HEALTH_STYLES[health],
      )}
    >
      {HEALTH_LABELS[health]}
    </span>
  )
}

function TimelineSkeleton() {
  return (
    <div role="status" aria-label="상태 이력 불러오는 중" className="border-y border-of-border">
      {[0, 1].map((row) => (
        <div key={row} className="flex min-h-20 animate-pulse items-center gap-4 border-b border-of-border px-2 py-3 last:border-b-0">
          <span className="h-7 w-7 shrink-0 rounded-full bg-of-surface-hover" />
          <div className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-40 max-w-full rounded bg-of-surface-hover" />
            <span className="block h-3 w-64 max-w-full rounded bg-of-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProjectHealthHistoryTimeline({ projectId }: { projectId: string }) {
  const history = useProjectHealthHistory(projectId)

  return (
    <section aria-label="프로젝트 상태 보고 이력" className="min-w-0">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <History size={14} className="shrink-0" /> 상태 보고 이력
        </h3>
        {history.data && !history.isError ? (
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">{history.data.total}건</span>
        ) : null}
      </div>

      {history.isPending ? <TimelineSkeleton /> : null}

      {history.isError ? (
        <div role="alert" className="flex min-h-24 flex-col items-center justify-center gap-2 border-y border-of-border px-4 py-5 text-center">
          <p className="text-xs text-of-danger">상태 보고 이력을 불러오지 못했습니다.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void history.refetch()}>
            <RotateCcw size={13} /> 재시도
          </Button>
        </div>
      ) : null}

      {!history.isError && history.data?.items.length === 0 ? (
        <p className="border-y border-of-border py-9 text-center text-xs text-of-muted">
          아직 기록된 상태 보고가 없습니다.
        </p>
      ) : null}

      {!history.isError && history.data?.items.length ? (
        <ol className="divide-y divide-of-border border-y border-of-border">
          {history.data.items.map((item) => (
            <li
              key={item.id}
              className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-2.5 px-2 py-3"
            >
              <Avatar
                name={item.changed_by_name || '이전 구성원'}
                src={profileImageSrc(item)}
                size="sm"
              />
              <div className="min-w-0">
                <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11px] leading-5 text-of-muted">
                  <span className="break-words font-medium text-of-text">
                    {item.changed_by_name || '이전 구성원'}
                  </span>
                  <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <HealthBadge health={item.previous_health} />
                  <ArrowRight size={13} className="shrink-0 text-of-muted" aria-hidden="true" />
                  <HealthBadge health={item.health} />
                </div>
                <p className={cn('mt-2 break-words text-xs leading-5', item.note ? 'text-of-text' : 'text-of-muted')}>
                  {item.note || '메모 없이 상태만 변경했습니다.'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {!history.isError && history.data && history.data.total > history.data.items.length ? (
        <p className="mt-2 text-right text-[11px] text-of-muted">
          최신 {history.data.items.length}개를 표시합니다.
        </p>
      ) : null}
    </section>
  )
}
