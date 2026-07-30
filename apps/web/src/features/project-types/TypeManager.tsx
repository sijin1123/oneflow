import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { InlineActionMenu } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

import {
  type ProjectType,
  useCreateProjectType,
  useProjectTypes,
  useReorderProjectTypes,
  useUpdateProjectType,
} from './api'

type TypeUpdateInput = { typeId: string; name?: string; is_active?: boolean }
type TypeRetryAction =
  | { kind: 'create'; name: string }
  | { kind: 'update'; input: TypeUpdateInput; label: string; action: 'name' | 'active' }
  | { kind: 'reorder'; orderedIds: string[]; label: string }

function typeMutationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '작업 타입 변경을 저장하지 못했습니다.'
  if (error.status === 403) return '프로젝트 작업 타입을 변경할 권한이 없습니다.'
  if (error.status !== 409) return error.message || '작업 타입 변경을 저장하지 못했습니다.'
  if (error.message.includes('active work-item type limit')) {
    return '활성 타입은 최대 12개까지 사용할 수 있습니다.'
  }
  if (error.message.includes('work-item type limit')) {
    return '타입은 프로젝트당 최대 32개까지 만들 수 있습니다.'
  }
  if (error.message.includes('at least one')) return '최소 1개의 타입은 활성 상태여야 합니다.'
  return '같은 이름의 타입이 이미 있거나 현재 상태와 충돌합니다.'
}

export function TypeManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const types = useProjectTypes(projectId)
  const create = useCreateProjectType(projectId)
  const update = useUpdateProjectType(projectId)
  const reorder = useReorderProjectTypes(projectId)
  const [newName, setNewName] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<TypeRetryAction | null>(null)

  const sorted = types.data
    ? [...types.data.items].sort((a, b) => a.position - b.position)
    : []
  const mutationError = create.error ?? update.error ?? reorder.error
  const mutationBusy = create.isPending || update.isPending || reorder.isPending
  const queryStale = types.isError && Boolean(types.data)
  const interactionBusy = mutationBusy || queryStale

  const clearMutationState = () => {
    create.reset()
    update.reset()
    reorder.reset()
    setNotice(null)
    setRetryAction(null)
  }

  const createType = (name: string) => {
    if (!name || interactionBusy) return
    clearMutationState()
    setPendingKey('type-create')
    create.mutate(name, {
      onSuccess: (created) => {
        setNewName((current) => (current.trim() === name ? '' : current))
        setNotice(`${created.name} 타입을 추가했습니다.`)
      },
      onError: () => setRetryAction({ kind: 'create', name }),
      onSettled: () => setPendingKey(null),
    })
  }

  const updateType = (
    input: TypeUpdateInput,
    label: string,
    action: 'name' | 'active',
  ) => {
    if (queryStale) return
    clearMutationState()
    setPendingKey(`type:${input.typeId}`)
    update.mutate(input, {
      onSuccess: (updated) =>
        setNotice(
          action === 'name'
            ? `${label} 타입 이름을 저장했습니다.`
            : `${updated.name} 타입을 ${updated.is_active ? '활성화' : '비활성화'}했습니다.`,
        ),
      onError: () => setRetryAction({ kind: 'update', input, label, action }),
      onSettled: () => setPendingKey(null),
    })
  }

  const reorderTypes = (orderedIds: string[], label: string) => {
    if (queryStale) return
    clearMutationState()
    setPendingKey('type-order')
    reorder.mutate(orderedIds, {
      onSuccess: () => setNotice(`${label} 타입 순서를 저장했습니다.`),
      onError: () => setRetryAction({ kind: 'reorder', orderedIds, label }),
      onSettled: () => setPendingKey(null),
    })
  }

  const move = (index: number, dir: -1 | 1) => {
    const targetIndex = index + dir
    if (targetIndex < 0 || targetIndex >= sorted.length || interactionBusy) return
    const next = [...sorted]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    reorderTypes(next.map((type) => type.id), sorted[index].name)
  }

  const retryLastAction = () => {
    if (!retryAction || interactionBusy) return
    if (retryAction.kind === 'create') {
      createType(retryAction.name)
    } else if (retryAction.kind === 'update') {
      updateType(retryAction.input, retryAction.label, retryAction.action)
    } else {
      reorderTypes(retryAction.orderedIds, retryAction.label)
    }
  }

  return (
    <section aria-label="워크 아이템 타입" className="min-w-0 px-4 py-4 pb-16 sm:pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <ListChecks size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">워크 아이템 타입</h3>
            <Badge variant="outline">
              {types.isPending && !types.data
                ? '불러오는 중'
                : `${sorted.filter((type) => type.is_active).length}/${sorted.length} 활성`}
            </Badge>
            {queryStale ? <Badge variant="warning">최신 상태 확인 필요</Badge> : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="타입 목록 새로고침"
              title="타입 목록 새로고침"
              disabled={types.isFetching || mutationBusy}
              onClick={() => void types.refetch()}
            >
              <RefreshCw
                size={13}
                aria-hidden="true"
                className={types.isFetching ? 'animate-spin' : undefined}
              />
            </Button>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            작업 분류를 만들고 신규 작업에서 사용할 타입과 순서를 정합니다.
          </p>
        </div>
      </div>

      {isOwner ? (
        <form
          className="mt-3 flex min-w-0 flex-col gap-2 border-y border-of-border bg-of-surface-2/40 px-3 py-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            createType(newName.trim())
          }}
        >
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-xs font-medium text-of-muted">새 타입 이름</span>
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="예: 사용자 스토리"
              maxLength={40}
              aria-label="새 작업 타입 이름"
              disabled={(types.isPending && !types.data) || queryStale || mutationBusy}
            />
          </label>
          <Button
            type="submit"
            disabled={
              !newName.trim() || (types.isPending && !types.data) || queryStale || mutationBusy
            }
          >
            {pendingKey === 'type-create' ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
            {pendingKey === 'type-create' ? '추가 중' : '타입 추가'}
          </Button>
        </form>
      ) : null}

      {notice && !mutationBusy ? (
        <p
          role="status"
          className="mt-3 flex min-w-0 items-center gap-2 border-l-2 border-of-success px-3 py-1.5 text-xs text-of-success"
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {mutationError ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-of-danger bg-of-danger/5 px-3 py-2 text-xs text-of-danger"
        >
          <CircleAlert size={14} aria-hidden="true" />
          <span className="min-w-0 flex-1">{typeMutationMessage(mutationError)}</span>
          {retryAction ? (
            <Button size="sm" variant="outline" disabled={interactionBusy} onClick={retryLastAction}>
              <RefreshCw size={13} aria-hidden="true" /> 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      {queryStale ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="min-w-0 break-words text-of-muted">
            타입 목록을 새로 확인하지 못해 마지막 목록과 생성 초안을 유지합니다. 복구 전에는 타입 변경이 잠깁니다.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={types.isFetching}
            onClick={() => void types.refetch()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={types.isFetching ? 'animate-spin' : undefined}
            />
            타입 목록 다시 시도
          </Button>
        </div>
      ) : null}

      <div className="mt-3">
        {types.isPending && !types.data ? (
          <TypeRowsSkeleton />
        ) : types.isError && !types.data ? (
          <div
            role="alert"
            className="flex min-w-0 flex-wrap items-center gap-2 border-y border-of-border bg-of-surface-2/40 px-3 py-3 text-xs text-of-danger"
          >
            <CircleAlert size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1">타입 목록을 불러오지 못했습니다.</span>
            <Button size="sm" variant="outline" onClick={() => void types.refetch()}>
              <RefreshCw size={13} aria-hidden="true" /> 다시 시도
            </Button>
          </div>
        ) : sorted.length === 0 ? (
          <p className="border-y border-of-border px-3 py-4 text-xs text-of-muted">
            정의된 타입이 없습니다. 첫 타입을 추가해 작업 분류를 시작하세요.
          </p>
        ) : (
          <ul
            className="divide-y divide-of-border border-y border-of-border"
            aria-busy={mutationBusy || types.isFetching}
          >
            {sorted.map((type, index) => (
              <TypeRow
                key={type.id}
                type={type}
                isOwner={isOwner}
                isPending={pendingKey === `type:${type.id}` || pendingKey === 'type-order'}
                mutationBusy={interactionBusy}
                onRename={(name) =>
                  updateType({ typeId: type.id, name }, type.name, 'name')
                }
                onToggle={(active) =>
                  updateType({ typeId: type.id, is_active: active }, type.name, 'active')
                }
                isFirst={index === 0}
                isLast={index === sorted.length - 1}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
              />
            ))}
          </ul>
        )}
      </div>
      {!isOwner ? (
        <p className="mt-3 text-[11px] text-of-muted">
          현재 역할에서는 작업 타입을 읽기만 할 수 있습니다.
        </p>
      ) : null}
    </section>
  )
}

function TypeRowsSkeleton() {
  return (
    <div
      role="status"
      aria-label="타입 목록을 불러오는 중"
      aria-busy="true"
      className="divide-y divide-of-border border-y border-of-border"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-center gap-3 px-3 py-2.5"
        >
          <Skeleton className="h-5 w-full" />
          <span className="space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-24" />
          </span>
          <Skeleton className="h-7 w-7" />
        </div>
      ))}
    </div>
  )
}

function TypeRow({
  type,
  isOwner,
  isPending,
  mutationBusy,
  onRename,
  onToggle,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  type: ProjectType
  isOwner: boolean
  isPending: boolean
  mutationBusy: boolean
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
      <li className="grid min-w-0 gap-2 bg-of-surface-2/50 px-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
        <Badge
          variant="neutral"
          title={type.key}
          className="max-w-full truncate font-mono uppercase"
        >
          {type.is_builtin ? type.key : 'custom'}
        </Badge>
        <Input
          autoFocus
          value={name}
          aria-label={`${type.key} 타입 이름 편집`}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setName(type.name)
            setEditing(false)
          }}
          className="h-8 min-w-0 text-xs"
        />
        <span className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            disabled={!name.trim() || mutationBusy}
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
            disabled={mutationBusy}
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
        'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5',
        !type.is_active && 'text-of-muted',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Badge variant="neutral" title={type.key} className="shrink-0 font-mono uppercase">
          {type.is_builtin ? type.key : 'custom'}
        </Badge>
        <span className="min-w-0">
          <span className={cn('block truncate text-sm font-medium', !type.is_active && 'line-through')}>
            {type.name}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-of-muted">
            {type.is_builtin ? '기본' : '사용자 정의'} · {type.is_active ? '활성' : '비활성'} · 위치{' '}
            {type.position + 1}
            {isPending ? <LoaderCircle size={11} className="animate-spin" aria-hidden="true" /> : null}
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
                  disabled: mutationBusy,
                  onSelect: () => setEditing(true),
                },
                {
                  label: type.is_active ? '비활성화' : '활성화',
                  ariaLabel: `${type.key} 타입 ${type.is_active ? '비활성화' : '활성화'}`,
                  icon: type.is_active ? <Archive size={14} /> : <CheckCircle2 size={14} />,
                  disabled: mutationBusy,
                  onSelect: () => onToggle(!type.is_active),
                },
                {
                  label: '위로 이동',
                  ariaLabel: `${type.key} 위로`,
                  icon: <ChevronUp size={14} />,
                  disabled: isFirst || mutationBusy,
                  onSelect: onMoveUp,
                },
                {
                  label: '아래로 이동',
                  ariaLabel: `${type.key} 아래로`,
                  icon: <ChevronDown size={14} />,
                  disabled: isLast || mutationBusy,
                  onSelect: onMoveDown,
                },
              ]
            : []
        }
      />
    </li>
  )
}
