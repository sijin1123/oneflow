import { Banknote, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

import { useDeleteCostEntry, useCostEntries, useLogCost } from './api'
import type { CostEntry } from './types'

const KIND_LABELS: Record<CostEntry['kind'], string> = { labor: '인건비', material: '자재', other: '기타' }

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function won(value: number): string {
  return `₩${value.toLocaleString('ko-KR')}`
}

function kindSummary(items: CostEntry[]) {
  return items.reduce<Record<CostEntry['kind'], number>>(
    (acc, item) => {
      acc[item.kind] += item.amount
      return acc
    },
    { labor: 0, material: 0, other: 0 },
  )
}

export function CostSection({ wpId, canWrite }: { wpId: string; canWrite: boolean }) {
  const entries = useCostEntries(wpId)
  const logCost = useLogCost(wpId)
  const deleteEntry = useDeleteCostEntry(wpId)

  const [composerOpen, setComposerOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('labor')
  const [spentOn, setSpentOn] = useState(todayStr())
  const costData = entries.data
  const byKind = costData ? kindSummary(costData.items) : null

  const submit = () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return
    logCost.mutate(
      { amount: value, kind, spent_on: spentOn, comment: null },
      {
        onSuccess: () => {
          setAmount('')
          setComposerOpen(false)
        },
      },
    )
  }

  return (
    <section aria-label="비용" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Banknote size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-of-fg">비용</h3>
          {costData ? (
            <span className="truncate text-[11px] text-of-muted">
              {costData.total}건 · {won(costData.total_amount)}
            </span>
          ) : null}
        </div>
        {canWrite ? (
          <button
            type="button"
            aria-label={composerOpen ? '비용 기록 닫기' : '비용 기록 추가'}
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
          <p role="alert" className="text-of-danger">비용 기록을 불러오지 못했습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => { void entries.refetch() }}>
            <RotateCcw size={13} aria-hidden="true" /> 다시 시도
          </Button>
        </div>
      ) : entries.isPending || !costData ? (
        <p role="status" className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          비용 기록을 불러오는 중...
        </p>
      ) : (
        <>
          {byKind ? (
            <div className="flex flex-wrap gap-1.5 border-t border-of-border-subtle px-3 py-2">
              {(['labor', 'material', 'other'] as const).map((entryKind) => (
                <Badge key={entryKind} variant="outline">
                  {KIND_LABELS[entryKind]} {won(byKind[entryKind])}
                </Badge>
              ))}
            </div>
          ) : null}

          {costData.total === 0 ? (
            <p className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
              아직 기록된 비용이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
              {costData.items.map((entry) => (
                <li
                  key={entry.id}
                  className="grid min-h-10 gap-x-3 gap-y-1 px-3 py-2 text-xs transition-colors hover:bg-of-surface-hover/60 sm:grid-cols-[7rem_5rem_6.5rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="font-semibold tabular-nums">{won(entry.amount)}</span>
                  <span className="text-of-muted">{KIND_LABELS[entry.kind]}</span>
                  <span className="text-of-muted">{entry.spent_on}</span>
                  <span className="min-w-0 truncate text-of-secondary">{entry.comment || '메모 없음'}</span>
                  {canWrite ? (
                    <button
                      type="button"
                      aria-label={`${entry.spent_on} 비용 삭제`}
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
          <div className="grid gap-2 sm:grid-cols-[8rem_7rem_9rem_auto] sm:items-center">
            <Input
              autoFocus
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="금액(₩)"
              aria-label="비용 금액"
            />
            <Select aria-label="비용 종류" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="labor">인건비</option>
              <option value="material">자재</option>
              <option value="other">기타</option>
            </Select>
            <Input
              type="date"
              value={spentOn}
              onChange={(event) => setSpentOn(event.target.value)}
              aria-label="비용 발생일"
            />
            <Button size="sm" onClick={submit} disabled={!amount || logCost.isPending} className="w-full sm:w-auto">
              기록
            </Button>
          </div>
          {logCost.isError ? (
            <p role="alert" className="mt-2 text-xs text-of-danger">비용을 기록하지 못했습니다.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
