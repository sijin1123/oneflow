import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

import { useDeleteCostEntry, useCostEntries, useLogCost } from './api'

const KIND_LABELS: Record<string, string> = { labor: '인건비', material: '자재', other: '기타' }

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function won(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`
}

export function CostSection({ wpId }: { wpId: string }) {
  const entries = useCostEntries(wpId)
  const logCost = useLogCost(wpId)
  const deleteEntry = useDeleteCostEntry(wpId)

  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('labor')
  const [spentOn, setSpentOn] = useState(todayStr())

  const submit = () => {
    const a = Number(amount)
    if (!Number.isFinite(a) || a <= 0) return
    logCost.mutate(
      { amount: a, kind, spent_on: spentOn, comment: null },
      { onSuccess: () => setAmount('') },
    )
  }

  return (
    <section aria-label="비용" className="space-y-2 border-t border-of-border pt-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-of-muted">비용</h3>
        {entries.data ? (
          <span className="text-xs font-medium">합계 {won(entries.data.total_amount)}</span>
        ) : null}
      </div>

      {entries.data && entries.data.total > 0 ? (
        <ul className="space-y-1">
          {entries.data.items.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
            >
              <span className="w-24 shrink-0 font-medium">{won(e.amount)}</span>
              <span className="w-14 shrink-0 text-of-muted">{KIND_LABELS[e.kind] ?? e.kind}</span>
              <span className="min-w-0 flex-1 truncate text-of-muted">{e.spent_on}</span>
              <button
                type="button"
                aria-label="비용 삭제"
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
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액(₩)"
          aria-label="비용 금액"
          className="w-28"
        />
        <Select
          aria-label="비용 종류"
          className="w-24"
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
          className="flex-1"
        />
        <Button size="sm" onClick={submit} disabled={!amount || logCost.isPending}>
          기록
        </Button>
      </div>
    </section>
  )
}
