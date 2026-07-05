import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'

import { type ProjectStatus, useProjectStatuses, useUpdateProjectStatus } from './api'

/* Workflow customization (PLAN §3 Phase 3): owners rename and reorder the status
   labels that drive the board columns. Status keys are fixed. */
export function StatusManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data } = useProjectStatuses(projectId)
  const update = useUpdateProjectStatus(projectId)

  const sorted = data ? [...data.items].sort((a, b) => a.position - b.position) : []

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= sorted.length) return
    const a = sorted[index]
    const b = sorted[j]
    // Swap the two positions (positions are not unique-constrained).
    update.mutate({ id: a.id, position: b.position })
    update.mutate({ id: b.id, position: a.position })
  }

  return (
    <div className="mb-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">워크플로우 상태</p>
      <p className="text-xs text-of-muted">
        보드 컬럼의 이름과 순서를 조정합니다{isOwner ? '' : ' (소유자만 편집 가능)'}.
      </p>
      <ul className="space-y-1">
        {sorted.map((status, index) => (
          <StatusRow
            key={status.id}
            status={status}
            isOwner={isOwner}
            isFirst={index === 0}
            isLast={index === sorted.length - 1}
            onRename={(name) => {
              if (name && name !== status.name) update.mutate({ id: status.id, name })
            }}
            onMove={(dir) => move(index, dir)}
          />
        ))}
      </ul>
    </div>
  )
}

function StatusRow({
  status,
  isOwner,
  isFirst,
  isLast,
  onRename,
  onMove,
}: {
  status: ProjectStatus
  isOwner: boolean
  isFirst: boolean
  isLast: boolean
  onRename: (name: string) => void
  onMove: (dir: -1 | 1) => void
}) {
  const [name, setName] = useState(status.name)

  return (
    <li className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5">
      <span className="w-24 shrink-0 font-mono text-[11px] text-of-muted">{status.key}</span>
      {isOwner ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name.trim())}
          aria-label={`${status.key} 상태 이름`}
          className="h-7 flex-1 text-xs"
        />
      ) : (
        <span className="flex-1 text-xs">{status.name}</span>
      )}
      {isOwner ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`${status.key} 위로`}
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className="rounded p-1 text-of-muted hover:bg-of-surface-2 disabled:opacity-30"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            aria-label={`${status.key} 아래로`}
            disabled={isLast}
            onClick={() => onMove(1)}
            className="rounded p-1 text-of-muted hover:bg-of-surface-2 disabled:opacity-30"
          >
            <ChevronDown size={13} />
          </button>
        </span>
      ) : null}
    </li>
  )
}
