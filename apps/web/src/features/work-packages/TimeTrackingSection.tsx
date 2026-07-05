import { Trash2 } from 'lucide-react'
import { useState } from 'react'

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

export function TimeTrackingSection({ wp }: { wp: WorkPackage }) {
  const entries = useTimeEntries(wp.id)
  const logTime = useLogTime(wp.id)
  const deleteEntry = useDeleteTimeEntry(wp.id)

  const [hours, setHours] = useState('')
  const [spentOn, setSpentOn] = useState(todayStr())
  const [comment, setComment] = useState('')

  const spent = entries.data?.total_hours ?? 0
  const estimate = wp.estimated_hours
  const remaining = estimate !== null ? Math.round((estimate - spent) * 100) / 100 : null

  const submit = () => {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) return
    logTime.mutate(
      { hours: h, spent_on: spentOn, comment: comment.trim() || null },
      { onSuccess: () => {
          setHours('')
          setComment('')
        } },
    )
  }

  return (
    <section aria-label="시간 추적" className="space-y-2 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">시간 추적</h3>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-of border border-of-border py-1.5">
          <p className="text-[11px] text-of-muted">예상</p>
          <p className="text-sm font-medium">{estimate !== null ? `${estimate}h` : '—'}</p>
        </div>
        <div className="rounded-of border border-of-border py-1.5">
          <p className="text-[11px] text-of-muted">소요</p>
          <p className="text-sm font-medium">{spent}h</p>
        </div>
        <div className="rounded-of border border-of-border py-1.5">
          <p className="text-[11px] text-of-muted">잔여</p>
          <p
            className={cn(
              'text-sm font-medium',
              remaining !== null && remaining < 0 && 'text-of-danger',
            )}
          >
            {remaining !== null ? `${remaining}h` : '—'}
          </p>
        </div>
      </div>

      {entries.data && entries.data.total > 0 ? (
        <ul className="space-y-1">
          {entries.data.items.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
            >
              <span className="w-12 shrink-0 font-medium">{e.hours}h</span>
              <span className="w-24 shrink-0 text-of-muted">{e.spent_on}</span>
              <span className="min-w-0 flex-1 truncate">{e.comment ?? ''}</span>
              <button
                type="button"
                aria-label="시간 기록 삭제"
                className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                onClick={() => deleteEntry.mutate(e.id)}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          step="0.25"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="시간"
          aria-label="기록할 시간"
          className="w-16"
        />
        <Input
          type="date"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
          aria-label="작업일"
          className="w-36"
        />
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="메모(선택)"
          aria-label="시간 메모"
          className="flex-1"
        />
        <Button size="sm" onClick={submit} disabled={!hours || logTime.isPending}>
          기록
        </Button>
      </div>
    </section>
  )
}
