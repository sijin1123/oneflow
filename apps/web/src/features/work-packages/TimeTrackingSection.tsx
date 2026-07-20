import { Clock3, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { useDeleteTimeEntry, useLogTime, useTimeEntries } from './api'
import type { WorkPackage } from './types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatHours(value: number | null): string {
  return value === null ? '-' : `${value}h`
}

export function TimeTrackingSection({ wp, canWrite }: { wp: WorkPackage; canWrite: boolean }) {
  const entries = useTimeEntries(wp.id)
  const logTime = useLogTime(wp.id)
  const deleteEntry = useDeleteTimeEntry(wp.id)

  const [composerOpen, setComposerOpen] = useState(false)
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
          setComposerOpen(false)
        },
      },
    )
  }

  return (
    <section aria-label="시간 추적" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-of-fg">시간 추적</h3>
          {timeData ? (
            <span className="truncate text-[11px] text-of-muted">
              {timeData.total}건 · {formatHours(spent)}
            </span>
          ) : null}
        </div>
        {canWrite ? (
          <button
            type="button"
            aria-label={composerOpen ? '시간 기록 닫기' : '시간 기록 추가'}
            aria-expanded={composerOpen}
            className="flex size-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => setComposerOpen((open) => !open)}
          >
            {composerOpen ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      {entries.isError ? (
        <div className="flex items-center justify-between gap-3 border-t border-of-border-subtle px-3 py-3 text-xs">
          <p role="alert" className="text-of-danger">시간 기록을 불러오지 못했습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => { void entries.refetch() }}>
            <RotateCcw size={13} aria-hidden="true" /> 다시 시도
          </Button>
        </div>
      ) : entries.isPending || !timeData ? (
        <p role="status" className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          시간 기록을 불러오는 중...
        </p>
      ) : (
        <>
          {progress !== null ? (
            <div className="border-t border-of-border-subtle px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-of-muted">
                  예상 {formatHours(estimate)} · 소요 {formatHours(spent)} ·{' '}
                  <span className={remaining !== null && remaining < 0 ? 'text-of-danger' : ''}>
                    {remaining !== null && remaining < 0 ? '초과' : '잔여'} {formatHours(remaining)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{progress}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-of-surface-2">
                <div className="h-full rounded-full bg-of-accent" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}

          {timeData.total === 0 ? (
            <p className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
              아직 기록된 시간이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
              {timeData.items.map((entry) => (
                <li
                  key={entry.id}
                  className="grid min-h-10 gap-x-3 gap-y-1 px-3 py-2 text-xs transition-colors hover:bg-of-surface-hover/60 sm:grid-cols-[4rem_6.5rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="font-semibold tabular-nums">{entry.hours}h</span>
                  <span className="text-of-muted">{entry.spent_on}</span>
                  <span className="min-w-0 truncate text-of-secondary">{entry.comment || '메모 없음'}</span>
                  {canWrite ? (
                    <button
                      type="button"
                      aria-label={`${entry.spent_on} 시간 기록 삭제`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={() => deleteEntry.mutate(entry.id)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {canWrite && composerOpen ? (
        <div className="border-t border-of-border-subtle bg-of-surface-2/30 p-3">
          <div className="grid gap-2 sm:grid-cols-[7rem_9rem_minmax(0,1fr)_auto] sm:items-center">
            <Input
              autoFocus
              type="number"
              step="0.25"
              min="0"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="시간"
              aria-label="기록할 시간"
            />
            <Input
              type="date"
              value={spentOn}
              onChange={(event) => setSpentOn(event.target.value)}
              aria-label="작업일"
            />
            <Input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="메모(선택)"
              aria-label="시간 메모"
            />
            <Button size="sm" onClick={submit} disabled={!hours || logTime.isPending} className="w-full sm:w-auto">
              기록
            </Button>
          </div>
          {logTime.isError ? (
            <p role="alert" className="mt-2 text-xs text-of-danger">시간을 기록하지 못했습니다.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
