import { ChevronDown, ChevronUp, Pencil, Save } from 'lucide-react'
import { useEffect, useState } from 'react'

import { InlineActionMenu } from '@/components/ui/action-menu'
import { Button } from '@/components/ui/button'
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
  const [editing, setEditing] = useState(false)
  // Resync when the server value changes (after a rename refetch, or if a failed
  // rename left the server name unchanged) — otherwise the input shows a name the
  // server never accepted (fable5 audit: state-from-props anti-pattern).
  useEffect(() => setName(status.name), [status.name])

  if (editing) {
    return (
      <li className="rounded-of border border-of-border px-2 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="w-24 shrink-0 font-mono text-[11px] text-of-muted">{status.key}</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={`${status.key} 상태 이름 편집`}
            className="h-7 min-w-0 flex-1 text-xs"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!name.trim()}
              onClick={() => {
                const trimmed = name.trim()
                if (trimmed && trimmed !== status.name) onRename(trimmed)
                else setName(status.name)
                setEditing(false)
              }}
            >
              <Save size={14} />
              저장
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setName(status.name)
                setEditing(false)
              }}
            >
              취소
            </Button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="rounded-of border border-of-border px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-24 shrink-0 font-mono text-[11px] text-of-muted">{status.key}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{status.name}</span>
        <span className="hidden shrink-0 rounded-full bg-of-surface-2 px-2 py-0.5 text-[10px] text-of-muted sm:inline">
          위치 {status.position + 1}
        </span>
        <InlineActionMenu
          label={`${status.key} 상태 작업`}
          menuLabel={`${status.key} 상태 작업 메뉴`}
          note={isOwner ? '고정 상태 키라 삭제/비활성화는 제공하지 않습니다.' : '읽기 전용'}
          items={
            isOwner
              ? [
                  {
                    label: '편집',
                    ariaLabel: `${status.key} 상태 편집`,
                    icon: <Pencil size={14} />,
                    onSelect: () => setEditing(true),
                  },
                  {
                    label: '위로 이동',
                    ariaLabel: `${status.key} 위로`,
                    icon: <ChevronUp size={14} />,
                    disabled: isFirst,
                    onSelect: () => onMove(-1),
                  },
                  {
                    label: '아래로 이동',
                    ariaLabel: `${status.key} 아래로`,
                    icon: <ChevronDown size={14} />,
                    disabled: isLast,
                    onSelect: () => onMove(1),
                  },
                ]
              : []
          }
        />
      </div>
      <div className="mt-1 text-[11px] text-of-muted sm:hidden">위치 {status.position + 1}</div>
    </li>
  )
}
