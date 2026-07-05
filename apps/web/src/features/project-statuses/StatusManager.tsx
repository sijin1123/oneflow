import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'

import {
  type ProjectStatus,
  useProjectStatuses,
  useReorderProjectStatuses,
  useUpdateProjectStatus,
} from './api'

/* Workflow customization (PLAN §3 Phase 3): owners rename and reorder the status
   labels that drive the board columns AND every other status surface. Status keys
   are fixed. */
export function StatusManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data } = useProjectStatuses(projectId)
  const update = useUpdateProjectStatus(projectId)
  const reorder = useReorderProjectStatuses(projectId)

  const sorted = data ? [...data.items].sort((a, b) => a.position - b.position) : []

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= sorted.length) return
    // Atomic reorder: send the whole ordered id list so a failed swap can never
    // leave two statuses sharing a position (fable5 audit).
    const next = [...sorted]
    ;[next[index], next[j]] = [next[j], next[index]]
    reorder.mutate(next.map((s) => s.id))
  }

  const failed = update.isError || reorder.isError

  return (
    <div className="mb-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">워크플로우 상태</p>
      <p className="text-xs text-of-muted">
        상태 이름과 순서를 조정합니다. 이름은 보드·목록·필터·대시보드 전체에 반영됩니다
        {isOwner ? '' : ' (소유자만 편집 가능)'}.
      </p>
      {failed ? (
        <p role="alert" className="text-xs text-of-danger">
          변경을 저장하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
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
  // Resync when the server value changes (after a rename refetch, or if a failed
  // rename left the server name unchanged) — otherwise the input shows a name the
  // server never accepted (fable5 audit: state-from-props anti-pattern).
  useEffect(() => setName(status.name), [status.name])

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
