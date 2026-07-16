import { ArrowRight, ChevronDown, History, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import {
  type IntakeDecisionHistoryItem,
  type IntakeStatus,
  useIntakeDecisionHistory,
} from './api'

const STATUS_LABELS: Record<IntakeStatus, string> = {
  pending: '대기',
  snoozed: '보류',
  accepted: '수락됨',
  declined: '거절됨',
  duplicate: '중복',
}

function StatusBadge({ status }: { status: IntakeStatus }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-5 items-center rounded-full border px-2 text-[11px] font-medium',
        status === 'accepted' && 'border-of-accent/20 bg-of-accent-soft text-of-accent',
        status === 'declined' && 'border-of-danger/20 text-of-danger',
        (status === 'pending' || status === 'snoozed' || status === 'duplicate') &&
          'border-of-border bg-of-surface-2 text-of-muted',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function TimelineRows({ items }: { items: IntakeDecisionHistoryItem[] }) {
  return (
    <ol className="divide-y divide-of-border" aria-label="판정 이력 목록">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <StatusBadge status={item.previous_status} />
              <ArrowRight size={13} className="shrink-0 text-of-muted" aria-hidden="true" />
              <StatusBadge status={item.status} />
              {item.status === 'snoozed' && item.snooze_until ? (
                <span className="text-[11px] text-of-muted">{item.snooze_until}까지</span>
              ) : null}
            </div>
            <p
              className={cn(
                'mt-2 break-words whitespace-pre-wrap text-xs leading-5',
                item.note ? 'text-of-text' : 'text-of-muted',
              )}
            >
              {item.note || '사유 없이 판정했습니다.'}
            </p>
          </div>
          <p className="min-w-0 text-[11px] leading-5 text-of-muted sm:text-right">
            <span className="block break-words font-medium text-of-text">
              {item.decided_by_name || '이전 구성원'}
            </span>
            <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
          </p>
        </li>
      ))}
    </ol>
  )
}

export function IntakeDecisionTimeline({
  projectId,
  itemId,
  itemTitle,
  hasDecision,
}: {
  projectId: string
  itemId: string
  itemTitle: string
  hasDecision: boolean
}) {
  const [open, setOpen] = useState(false)
  const history = useIntakeDecisionHistory(projectId, itemId, open)
  const panelId = `intake-history-${itemId}`

  if (!hasDecision) return null

  return (
    <div className="min-w-0 border-t border-of-border pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${itemTitle} 판정 이력 ${open ? '접기' : '펼치기'}`}
        className="flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-of px-1 text-left text-[11px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus/30"
        onClick={() => setOpen((value) => !value)}
      >
        <History size={13} className="shrink-0" aria-hidden="true" />
        <span>판정 이력</span>
        {history.data && !history.isError ? (
          <span className="tabular-nums">{history.data.total}건</span>
        ) : null}
        <ChevronDown
          size={13}
          className={cn('ml-auto shrink-0 transition-transform duration-150', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={panelId} className="min-w-0 animate-in fade-in slide-in-from-top-1 duration-150">
          {history.isPending ? (
            <div
              role="status"
              aria-label="판정 이력 불러오는 중"
              className="space-y-2 py-3"
            >
              <span className="block h-3 w-44 max-w-full animate-pulse rounded bg-of-surface-hover" />
              <span className="block h-3 w-64 max-w-full animate-pulse rounded bg-of-surface-hover" />
            </div>
          ) : null}

          {history.isError ? (
            <div role="alert" className="flex min-h-20 flex-col items-center justify-center gap-2 py-3">
              <p className="text-xs text-of-danger">판정 이력을 불러오지 못했습니다.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void history.refetch()}>
                <RotateCcw size={13} /> 재시도
              </Button>
            </div>
          ) : null}

          {!history.isError && history.data?.items.length === 0 ? (
            <p className="py-4 text-center text-xs text-of-muted">
              이력 기능 도입 전 판정은 현재 판정 정보만 표시됩니다.
            </p>
          ) : null}

          {!history.isError && history.data?.items.length ? (
            <TimelineRows items={history.data.items} />
          ) : null}

          {!history.isError && history.data && history.data.total > history.data.items.length ? (
            <p className="py-2 text-right text-[11px] text-of-muted">
              최신 {history.data.items.length}개를 표시합니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
