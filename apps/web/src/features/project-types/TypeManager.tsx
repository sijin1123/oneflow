import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Pencil,
  Save,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { InlineActionMenu } from '@/components/ui/action-menu'
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
            isFirst={i === 0}
            isLast={i === sorted.length - 1}
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
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  type: ProjectType
  isOwner: boolean
  onRename: (name: string) => void
  onToggle: (active: boolean) => void
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [name, setName] = useState(type.name)
  const [editing, setEditing] = useState(false)
  useEffect(() => setName(type.name), [type.name])

  if (editing) {
    return (
      <li className="grid min-w-0 gap-2 rounded-of border border-of-border bg-of-surface-2 px-3 py-2 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
        <Badge variant="neutral" className="max-w-full truncate font-mono uppercase">
          {type.key}
        </Badge>
        <Input
          value={name}
          aria-label={`${type.key} 타입 이름 편집`}
          onChange={(event) => setName(event.target.value)}
          className="h-8 min-w-0 text-xs"
        />
        <span className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            disabled={!name.trim()}
            onClick={() => {
              const trimmed = name.trim()
              if (trimmed && trimmed !== type.name) onRename(trimmed)
              else setName(type.name)
              setEditing(false)
            }}
          >
            <Save size={14} aria-hidden="true" />
            저장
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setName(type.name)
              setEditing(false)
            }}
          >
            취소
          </Button>
        </span>
      </li>
    )
  }

  return (
    <li
      className={cn(
        'grid min-w-0 gap-2 rounded-of border border-of-border bg-of-surface-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
        !type.is_active && 'text-of-muted',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Badge variant="neutral" className="shrink-0 font-mono uppercase">
          {type.key}
        </Badge>
        <span className="min-w-0">
          <span className={`block truncate text-sm font-medium ${type.is_active ? '' : 'line-through'}`}>
            {type.name}
          </span>
          <span className="text-[11px] text-of-muted">
            {type.is_active ? '활성' : '비활성'} · 위치 {type.position + 1}
          </span>
        </span>
      </span>
      <InlineActionMenu
        label={`${type.key} 타입 작업`}
        menuLabel={`${type.key} 타입 작업 메뉴`}
        note={isOwner ? undefined : '읽기 전용'}
        items={
          isOwner
            ? [
                {
                  label: '편집',
                  ariaLabel: `${type.key} 타입 편집`,
                  icon: <Pencil size={14} />,
                  onSelect: () => setEditing(true),
                },
                {
                  label: type.is_active ? '비활성화' : '활성화',
                  ariaLabel: `${type.key} 타입 ${type.is_active ? '비활성화' : '활성화'}`,
                  icon: type.is_active ? <Archive size={14} /> : <CheckCircle2 size={14} />,
                  onSelect: () => onToggle(!type.is_active),
                },
                {
                  label: '위로 이동',
                  ariaLabel: `${type.key} 위로`,
                  icon: <ChevronUp size={14} />,
                  disabled: isFirst,
                  onSelect: onMoveUp,
                },
                {
                  label: '아래로 이동',
                  ariaLabel: `${type.key} 아래로`,
                  icon: <ChevronDown size={14} />,
                  disabled: isLast,
                  onSelect: onMoveDown,
                },
              ]
            : []
        }
      />
    </li>
  )
}
