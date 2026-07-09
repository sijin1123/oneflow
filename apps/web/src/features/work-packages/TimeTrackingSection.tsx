import { Clock3, Hourglass, TimerReset, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { useDeleteTimeEntry, useLogTime, useTimeEntries } from './api'
import type { WorkPackage } from './types'

function todayStr(): string {
  const d = new Date()
  // Local calendar date as YYYY-MM-DD (date-only field — no UTC conversion).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatHours(value: number | null): string {
  return value === null ? '-' : `${value}h`
}

function TimeMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' && 'bg-of-accent-soft text-of-accent',
          tone === 'danger' && 'bg-of-danger/10 text-of-danger',
          tone === 'neutral' && 'bg-of-surface-2 text-of-muted',
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  )
}

export function TimeTrackingSection({ wp, canWrite }: { wp: WorkPackage; canWrite: boolean }) {
  const entries = useTimeEntries(wp.id)
  const logTime = useLogTime(wp.id)
  const deleteEntry = useDeleteTimeEntry(wp.id)

  const [hours, setHours] = useState('')
  const [spentOn, setSpentOn] = useState(todayStr())
  const [comment, setComment] = useState('')

  const timeData = entries.data
  const spent = timeData?.total_hours ?? 0
  const estimate = wp.estimated_hours
  const remaining = estimate !== null ? Math.round((estimate - spent) * 100) / 100 : null
  const progress = estimate && estimate > 0 ? Math.min(100, Math.round((spent / estimate) * 100)) : null

  const submit = () => {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) return
    logTime.mutate(
      { hours: h, spent_on: spentOn, comment: comment.trim() || null },
      {
        onSuccess: () => {
          setHours('')
          setComment('')
        },
      },
    )
  }

  return (
    <section aria-label="시간 추적" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">시간 추적</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            예상 대비 소요 시간을 확인하고 작업 단위로 시간을 기록합니다.
          </p>
        </div>
        <Badge variant={canWrite ? 'accent' : 'outline'} className="self-start">
          {canWrite ? '기록 가능' : '읽기 전용'}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <TimeMetric icon={Hourglass} label="예상" value={formatHours(estimate)} />
        <TimeMetric icon={Clock3} label="소요" value={formatHours(spent)} tone="accent" />
        <TimeMetric
          icon={TimerReset}
          label={remaining !== null && remaining < 0 ? '초과' : '잔여'}
          value={formatHours(remaining)}
          tone={remaining !== null && remaining < 0 ? 'danger' : 'neutral'}
        />
      </div>

      {progress !== null ? (
        <div className="mt-3 rounded-of border border-of-border bg-of-surface-2/50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">예상 대비 진행</span>
            <span className="text-of-muted tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-of-surface">
            <div className="h-full rounded-full bg-of-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-of-muted">시간 ledger</p>
          {timeData ? (
            <span className="text-xs text-of-muted tabular-nums">{timeData.total}건</span>
          ) : null}
        </div>
        {timeData && timeData.total > 0 ? (
          <ul className="grid gap-2">
            {timeData.items.map((e) => (
              <li
                key={e.id}
                className="grid gap-2 rounded-of border border-of-border bg-of-surface-2/35 px-3 py-2 text-xs sm:grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="font-semibold tabular-nums">{e.hours}h</span>
                <span className="text-of-muted">{e.spent_on}</span>
                <span className="min-w-0 truncate">{e.comment || '메모 없음'}</span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label="시간 기록 삭제"
                    className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                    onClick={() => deleteEntry.mutate(e.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-of border border-dashed border-of-border bg-of-surface-2/35 px-3 py-4 text-xs text-of-muted">
            아직 기록된 시간이 없습니다.
          </div>
        )}
      </div>

      {canWrite ? (
        <div className="mt-4 grid gap-2 rounded-of border border-of-border bg-of-surface-2/35 p-3 sm:grid-cols-[7rem_9rem_minmax(0,1fr)_auto] sm:items-end">
          <Input
            type="number"
            step="0.25"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="시간"
            aria-label="기록할 시간"
          />
          <Input
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            aria-label="작업일"
          />
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="메모(선택)"
            aria-label="시간 메모"
          />
          <Button
            size="sm"
            onClick={submit}
            disabled={!hours || logTime.isPending}
            className="w-full sm:w-auto"
          >
            기록
          </Button>
        </div>
      ) : null}
    </section>
  )
}
