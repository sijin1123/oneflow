import { useSearchParams } from 'react-router-dom'

import { Select } from '@/components/ui/select'

import { PRIORITY_LABELS, TYPE_LABELS, WP_PRIORITIES, WP_STATUSES, WP_TYPES } from './types'
import { useStatusLabels } from './useStatusLabels'

/* URL-backed filters (client state lives in search params — PLAN §8). */
export function Filters({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusLabel = useStatusLabels(projectId)

  const set = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        상태
        <Select
          aria-label="상태 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('status') ?? ''}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">전체</option>
          {WP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        우선순위
        <Select
          aria-label="우선순위 필터"
          className="h-7 w-24 text-xs"
          value={searchParams.get('priority') ?? ''}
          onChange={(e) => set('priority', e.target.value)}
        >
          <option value="">전체</option>
          {WP_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        타입
        <Select
          aria-label="타입 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('type') ?? ''}
          onChange={(e) => set('type', e.target.value)}
        >
          <option value="">전체</option>
          {WP_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}
