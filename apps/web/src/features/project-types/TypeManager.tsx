import { ChevronDown, ChevronUp, ListChecks } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

import {
  type ProjectType,
  useProjectTypes,
  useReorderProjectTypes,
  useUpdateProjectType,
} from './api'

/* Work-item type configuration (Pass 7 PR-R): owners rename, reorder, and
   enable/disable the fixed type keys. Disabling blocks NEW usage only —
   existing work packages keep their type. */
export function TypeManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data } = useProjectTypes(projectId)
  const update = useUpdateProjectType(projectId)
  const reorder = useReorderProjectTypes(projectId)

  const sorted = data ? [...data.items].sort((a, b) => a.position - b.position) : []

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= sorted.length) return
    const next = [...sorted]
    ;[next[index], next[j]] = [next[j], next[index]]
    reorder.mutate(next.map((t) => t.id))
  }

  const lastActive =
    update.error instanceof ApiError && update.error.status === 409
      ? '최소 1개의 타입은 활성 상태여야 합니다.'
      : null

  if (sorted.length === 0) return null

  return (
    <section
      aria-label="워크 아이템 타입"
      className="space-y-3 rounded-of border border-of-border bg-of-surface p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <ListChecks size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">워크 아이템 타입</h3>
            <Badge variant="outline">
              {sorted.filter((type) => type.is_active).length}/{sorted.length} 활성
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            타입 이름과 순서를 조정하고, 쓰지 않는 타입은 비활성화합니다(기존 작업은 유지)
            {isOwner ? '' : ' (소유자만 편집 가능)'}.
          </p>
        </div>
      </div>
      <ul className="grid gap-2">
        {sorted.map((t, i) => (
          <TypeRow
            key={t.id}
            type={t}
            isOwner={isOwner}
            onRename={(name) => update.mutate({ typeId: t.id, name })}
            onToggle={(active) => update.mutate({ typeId: t.id, is_active: active })}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
          />
        ))}
      </ul>
      {lastActive ? (
        <p role="alert" className="text-xs text-of-danger">
          {lastActive}
        </p>
      ) : update.isError || reorder.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          저장하지 못했습니다.
        </p>
      ) : null}
    </section>
  )
}

function TypeRow({
  type,
  isOwner,
  onRename,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  type: ProjectType
  isOwner: boolean
  onRename: (name: string) => void
  onToggle: (active: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [name, setName] = useState(type.name)
  useEffect(() => setName(type.name), [type.name])

  return (
    <li
      className={cn(
        'grid min-w-0 gap-2 rounded-of border border-of-border bg-of-surface-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
        !type.is_active && 'text-of-muted',
      )}
    >
      {isOwner ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="neutral" className="shrink-0 font-mono uppercase">
              {type.key}
            </Badge>
            <Input
              value={name}
              aria-label={`${type.key} 타입 이름`}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const trimmed = name.trim()
                if (trimmed && trimmed !== type.name) onRename(trimmed)
                else setName(type.name)
              }}
              className={`h-8 min-w-0 flex-1 text-xs ${type.is_active ? '' : 'text-of-muted line-through'}`}
            />
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <label className="flex shrink-0 items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-[11px] text-of-muted">
              <input
                type="checkbox"
                aria-label={`${type.key} 타입 활성`}
                checked={type.is_active}
                onChange={(e) => onToggle(e.target.checked)}
                className="h-3 w-3 accent-of-accent"
              />
              활성
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${type.key} 위로`}
              className="h-7 w-7 text-of-muted"
              onClick={onMoveUp}
            >
              <ChevronUp size={13} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${type.key} 아래로`}
              className="h-7 w-7 text-of-muted"
              onClick={onMoveDown}
            >
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
          </div>
        </>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <Badge variant="neutral" className="shrink-0 font-mono uppercase">
            {type.key}
          </Badge>
          <span className={`min-w-0 truncate text-sm font-medium ${type.is_active ? '' : 'line-through'}`}>
            {type.name}
          </span>
        </span>
      )}
    </li>
  )
}
