import { ChevronDown, ChevronUp, GitBranch } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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
    <section
      aria-label="워크플로우 상태"
      className="space-y-3 rounded-of border border-of-border bg-of-surface p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <GitBranch size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">워크플로우 상태</h3>
            <Badge variant="outline">{sorted.length}개 상태</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            상태 이름과 순서를 조정합니다. 이름은 보드·목록·필터·대시보드 전체에 반영됩니다
            {isOwner ? '' : ' (소유자만 편집 가능)'}.
          </p>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-of-danger">
          변경을 저장하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <ul className="grid gap-2">
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
    </section>
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
    <li className="grid min-w-0 gap-2 rounded-of border border-of-border bg-of-surface-2 px-3 py-2 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
      <span className="flex min-w-0 items-center">
        <Badge variant="neutral" className="max-w-full truncate font-mono uppercase">
          {status.key}
        </Badge>
      </span>
      {isOwner ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name.trim())}
          aria-label={`${status.key} 상태 이름`}
          className="h-8 min-w-0 text-xs"
        />
      ) : (
        <span className="min-w-0 truncate text-sm font-medium">{status.name}</span>
      )}
      {isOwner ? (
        <span className="flex shrink-0 items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${status.key} 위로`}
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className={cn('h-7 w-7 text-of-muted', isFirst && 'opacity-30')}
          >
            <ChevronUp size={13} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${status.key} 아래로`}
            disabled={isLast}
            onClick={() => onMove(1)}
            className={cn('h-7 w-7 text-of-muted', isLast && 'opacity-30')}
          >
            <ChevronDown size={13} aria-hidden="true" />
          </Button>
        </span>
      ) : null}
    </li>
  )
}
