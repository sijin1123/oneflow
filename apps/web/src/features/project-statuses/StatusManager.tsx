import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  GitBranch,
  LoaderCircle,
  Pencil,
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

import {
  type ProjectStatus,
  useProjectStatuses,
  useReorderProjectStatuses,
  useUpdateProjectStatus,
} from './api'

type StatusRetryAction =
  | { kind: 'rename'; input: { id: string; name: string }; label: string }
  | { kind: 'reorder'; orderedIds: string[]; label: string }

function statusMutationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '상태 변경을 저장하지 못했습니다.'
  if (error.status === 403) return '프로젝트 워크플로를 변경할 권한이 없습니다.'
  if (error.status === 422) return '현재 상태 순서를 다시 확인해 주세요.'
  return error.message || '상태 변경을 저장하지 못했습니다.'
}

export function StatusManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const statuses = useProjectStatuses(projectId)
  const update = useUpdateProjectStatus(projectId)
  const reorder = useReorderProjectStatuses(projectId)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<StatusRetryAction | null>(null)

  const sorted = statuses.data
    ? [...statuses.data.items].sort((a, b) => a.position - b.position)
    : []
  const mutationError = update.error ?? reorder.error
  const mutationBusy = update.isPending || reorder.isPending
  const queryStale = statuses.isError && Boolean(statuses.data)
  const interactionBusy = mutationBusy || queryStale

  const clearMutationState = () => {
    update.reset()
    reorder.reset()
    setNotice(null)
    setRetryAction(null)
  }

  const renameStatus = (input: { id: string; name: string }, label: string) => {
    if (queryStale) return
    clearMutationState()
    setPendingKey(`status:${input.id}`)
    update.mutate(input, {
      onSuccess: () => setNotice(`${label} 상태 이름을 저장했습니다.`),
      onError: () => setRetryAction({ kind: 'rename', input, label }),
      onSettled: () => setPendingKey(null),
    })
  }

  const reorderStatuses = (orderedIds: string[], label: string) => {
    if (queryStale) return
    clearMutationState()
    setPendingKey('status-order')
    reorder.mutate(orderedIds, {
      onSuccess: () => setNotice(`${label} 상태 순서를 저장했습니다.`),
      onError: () => setRetryAction({ kind: 'reorder', orderedIds, label }),
      onSettled: () => setPendingKey(null),
    })
  }

  const move = (index: number, dir: -1 | 1) => {
    const targetIndex = index + dir
    if (targetIndex < 0 || targetIndex >= sorted.length || interactionBusy) return
    const next = [...sorted]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    reorderStatuses(next.map((status) => status.id), sorted[index].name)
  }

  const retryLastAction = () => {
    if (!retryAction || interactionBusy) return
    if (retryAction.kind === 'rename') {
      renameStatus(retryAction.input, retryAction.label)
    } else {
      reorderStatuses(retryAction.orderedIds, retryAction.label)
    }
  }

  return (
    <section aria-label="워크플로우 상태" className="min-w-0 px-4 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <GitBranch size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">워크플로우 상태</h3>
            <Badge variant="outline">
              {statuses.isPending && !statuses.data
                ? '불러오는 중'
                : `${sorted.length}개 상태`}
            </Badge>
            {queryStale ? <Badge variant="warning">최신 상태 확인 필요</Badge> : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="상태 목록 새로고침"
              title="상태 목록 새로고침"
              disabled={statuses.isFetching || mutationBusy}
              onClick={() => void statuses.refetch()}
            >
              <RefreshCw
                size={13}
                aria-hidden="true"
                className={statuses.isFetching ? 'animate-spin' : undefined}
              />
            </Button>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            상태 이름과 순서가 보드·목록·필터에 함께 반영됩니다.
          </p>
        </div>
      </div>

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
          <span className="min-w-0 flex-1">{statusMutationMessage(mutationError)}</span>
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
            상태 목록을 새로 확인하지 못해 마지막 목록과 편집 초안을 유지합니다. 복구 전에는 상태 변경이 잠깁니다.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={statuses.isFetching}
            onClick={() => void statuses.refetch()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={statuses.isFetching ? 'animate-spin' : undefined}
            />
            상태 목록 다시 시도
          </Button>
        </div>
      ) : null}

      <div className="mt-3">
        {statuses.isPending && !statuses.data ? (
          <WorkflowRowsSkeleton label="상태 목록을 불러오는 중" />
        ) : statuses.isError && !statuses.data ? (
          <div
            role="alert"
            className="flex min-w-0 flex-wrap items-center gap-2 border-y border-of-border bg-of-surface-2/40 px-3 py-3 text-xs text-of-danger"
          >
            <CircleAlert size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1">상태 목록을 불러오지 못했습니다.</span>
            <Button size="sm" variant="outline" onClick={() => void statuses.refetch()}>
              <RefreshCw size={13} aria-hidden="true" /> 다시 시도
            </Button>
          </div>
        ) : sorted.length === 0 ? (
          <p className="border-y border-of-border px-3 py-4 text-xs text-of-muted">
            이 프로젝트에 정의된 상태가 없습니다.
          </p>
        ) : (
          <ul
            className="divide-y divide-of-border border-y border-of-border"
            aria-busy={mutationBusy || statuses.isFetching}
          >
            {sorted.map((status, index) => (
              <StatusRow
                key={status.id}
                status={status}
                isOwner={isOwner}
                isFirst={index === 0}
                isLast={index === sorted.length - 1}
                isPending={pendingKey === `status:${status.id}` || pendingKey === 'status-order'}
                mutationBusy={interactionBusy}
                onRename={(name) => renameStatus({ id: status.id, name }, status.name)}
                onMove={(dir) => move(index, dir)}
              />
            ))}
          </ul>
        )}
      </div>
      {!isOwner ? (
        <p className="mt-3 text-[11px] text-of-muted">
          현재 역할에서는 상태 이름과 순서를 읽기만 할 수 있습니다.
        </p>
      ) : null}
    </section>
  )
}

function WorkflowRowsSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
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
            <Skeleton className="h-2.5 w-16" />
          </span>
          <Skeleton className="h-7 w-7" />
        </div>
      ))}
    </div>
  )
}

function StatusRow({
  status,
  isOwner,
  isFirst,
  isLast,
  isPending,
  mutationBusy,
  onRename,
  onMove,
}: {
  status: ProjectStatus
  isOwner: boolean
  isFirst: boolean
  isLast: boolean
  isPending: boolean
  mutationBusy: boolean
  onRename: (name: string) => void
  onMove: (dir: -1 | 1) => void
}) {
  const [name, setName] = useState(status.name)
  const [editing, setEditing] = useState(false)

  useEffect(() => setName(status.name), [status.name])

  if (editing) {
    return (
      <li className="grid min-w-0 gap-2 bg-of-surface-2/50 px-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
        <Badge variant="neutral" className="max-w-full truncate font-mono uppercase">
          {status.key}
        </Badge>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setName(status.name)
            setEditing(false)
          }}
          aria-label={`${status.key} 상태 이름 편집`}
          className="h-8 min-w-0 text-xs"
        />
        <span className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            disabled={!name.trim() || mutationBusy}
            onClick={() => {
              const trimmed = name.trim()
              if (trimmed && trimmed !== status.name) onRename(trimmed)
              else setName(status.name)
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
              setName(status.name)
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
    <li className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
      <Badge variant="neutral" className="max-w-full truncate font-mono uppercase">
        {status.key}
      </Badge>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{status.name}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-of-muted">
          위치 {status.position + 1}
          {isPending ? <LoaderCircle size={11} className="animate-spin" aria-hidden="true" /> : null}
        </span>
      </span>
      <InlineActionMenu
        label={`${status.key} 상태 작업`}
        menuLabel={`${status.key} 상태 작업 메뉴`}
        note={isOwner ? '상태 키는 고정되어 이름과 순서만 변경할 수 있습니다.' : '읽기 전용'}
        items={
          isOwner
            ? [
                {
                  label: '편집',
                  ariaLabel: `${status.key} 상태 편집`,
                  icon: <Pencil size={14} />,
                  disabled: mutationBusy,
                  onSelect: () => setEditing(true),
                },
                {
                  label: '위로 이동',
                  ariaLabel: `${status.key} 위로`,
                  icon: <ChevronUp size={14} />,
                  disabled: isFirst || mutationBusy,
                  onSelect: () => onMove(-1),
                },
                {
                  label: '아래로 이동',
                  ariaLabel: `${status.key} 아래로`,
                  icon: <ChevronDown size={14} />,
                  disabled: isLast || mutationBusy,
                  onSelect: () => onMove(1),
                },
              ]
            : []
        }
      />
    </li>
  )
}
