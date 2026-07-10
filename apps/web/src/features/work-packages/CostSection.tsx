import { Banknote, Boxes, ReceiptText, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useDeleteCostEntry, useCostEntries, useLogCost } from './api'
import type { CostEntry } from './types'

const KIND_LABELS: Record<CostEntry['kind'], string> = { labor: '인건비', material: '자재', other: '기타' }

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function won(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`
}

function CostMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'neutral' | 'accent'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
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

  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('labor')
  const [spentOn, setSpentOn] = useState(todayStr())
  const costData = entries.data
  const byKind = costData ? kindSummary(costData.items) : null
  const topKind = byKind
    ? (Object.entries(byKind) as Array<[CostEntry['kind'], number]>).sort((a, b) => b[1] - a[1])[0]
    : null

  const submit = () => {
    const a = Number(amount)
    if (!Number.isFinite(a) || a <= 0) return
    logCost.mutate(
      { amount: a, kind, spent_on: spentOn, comment: null },
      { onSuccess: () => setAmount('') },
    )
  }

  return (
    <section aria-label="비용" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">비용</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            작업 실행 중 발생한 인건비, 자재, 기타 비용을 한 ledger에서 관리합니다.
          </p>
        </div>
        <Badge variant={canWrite ? 'accent' : 'outline'} className="self-start">
          {canWrite ? '기록 가능' : '읽기 전용'}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <CostMetric
          icon={Banknote}
          label="비용 합계"
          value={costData ? won(costData.total_amount) : won(0)}
          tone="accent"
        />
        <CostMetric icon={ReceiptText} label="기록 수" value={`${costData?.total ?? 0}건`} />
        <CostMetric
          icon={Boxes}
          label="주요 분류"
          value={topKind && topKind[1] > 0 ? KIND_LABELS[topKind[0]] : '-'}
        />
      </div>

      {byKind ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['labor', 'material', 'other'] as const).map((k) => (
            <Badge key={k} variant="outline">
              {KIND_LABELS[k]} {won(byKind[k])}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-of-muted">비용 ledger</p>
          {costData ? (
            <span className="text-xs text-of-muted tabular-nums">{won(costData.total_amount)}</span>
          ) : null}
        </div>
        {costData && costData.total > 0 ? (
          <ul className="grid gap-2">
            {costData.items.map((e) => (
              <li
                key={e.id}
                className="grid gap-2 rounded-of border border-of-border bg-of-surface-2/35 px-3 py-2 text-xs sm:grid-cols-[7rem_5rem_6.5rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="font-semibold tabular-nums">{won(e.amount)}</span>
                <span className="text-of-muted">{KIND_LABELS[e.kind]}</span>
                <span className="text-of-muted">{e.spent_on}</span>
                <span className="min-w-0 truncate">{e.comment || '메모 없음'}</span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label="비용 삭제"
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
            아직 기록된 비용이 없습니다.
          </div>
        )}
      </div>

      {canWrite ? (
        <div className="mt-4 grid gap-2 rounded-of border border-of-border bg-of-surface-2/35 p-3 sm:grid-cols-[8rem_7rem_9rem_auto] sm:items-end">
          <Input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="금액(₩)"
            aria-label="비용 금액"
          />
          <Select
            aria-label="비용 종류"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="labor">인건비</option>
            <option value="material">자재</option>
            <option value="other">기타</option>
          </Select>
          <Input
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            aria-label="비용 발생일"
          />
          <Button
            size="sm"
            onClick={submit}
            disabled={!amount || logCost.isPending}
            className="w-full sm:w-auto"
          >
            기록
          </Button>
        </div>
      ) : null}
    </section>
  )
}
