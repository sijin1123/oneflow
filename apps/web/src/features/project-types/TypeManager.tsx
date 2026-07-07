import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

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
    <div className="mt-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">워크 아이템 타입</p>
      <p className="text-xs text-of-muted">
        타입 이름과 순서를 조정하고, 쓰지 않는 타입은 비활성화합니다(기존 작업은 유지)
        {isOwner ? '' : ' (소유자만 편집 가능)'}.
      </p>
      <ul className="space-y-1">
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
    </div>
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
    <li className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5">
      {isOwner ? (
        <>
          <Input
            value={name}
            aria-label={`${type.key} 타입 이름`}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const trimmed = name.trim()
              if (trimmed && trimmed !== type.name) onRename(trimmed)
              else setName(type.name)
            }}
            className={`h-7 flex-1 text-xs ${type.is_active ? '' : 'text-of-muted line-through'}`}
          />
          <label className="flex shrink-0 items-center gap-1 text-[11px] text-of-muted">
            <input
              type="checkbox"
              aria-label={`${type.key} 타입 활성`}
              checked={type.is_active}
              onChange={(e) => onToggle(e.target.checked)}
              className="h-3 w-3 accent-of-accent"
            />
            활성
          </label>
          <button
            type="button"
            aria-label={`${type.key} 위로`}
            className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2"
            onClick={onMoveUp}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            aria-label={`${type.key} 아래로`}
            className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2"
            onClick={onMoveDown}
          >
            <ChevronDown size={13} />
          </button>
        </>
      ) : (
        <span className={`flex-1 text-xs ${type.is_active ? '' : 'text-of-muted line-through'}`}>
          {type.name}
        </span>
      )}
      <span className="shrink-0 text-[10px] uppercase text-of-muted">{type.key}</span>
    </li>
  )
}
