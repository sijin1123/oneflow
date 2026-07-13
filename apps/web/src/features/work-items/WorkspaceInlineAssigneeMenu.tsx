import { AlertCircle, ChevronDown, RefreshCw, UserRoundX } from 'lucide-react'
import { useState } from 'react'

import { Avatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMembers } from '@/features/members/api'
import type { SearchResultItem } from '@/features/search/api'
import { usePatchWorkPackage } from '@/features/work-packages/api'

const UNASSIGNED = '__unassigned__'

function AssigneeChip({ name }: { name?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {name ? (
        <Avatar name={name} size="sm" className="h-5 w-5 text-[8px]" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-of-border text-of-faint">
          <UserRoundX size={11} aria-hidden />
        </span>
      )}
      <span className="truncate text-xs text-of-muted">{name ?? '미배정'}</span>
    </span>
  )
}

export function WorkspaceInlineAssigneeMenu({ item }: { item: SearchResultItem }) {
  const [open, setOpen] = useState(false)
  const patch = usePatchWorkPackage(item.project_id)
  const canWrite = item.current_user_can_write === true && typeof item.version === 'number'
  const members = useMembers(item.project_id, open && canWrite)
  const assignableMembers = (members.data?.items ?? []).filter((member) => member.role !== 'viewer')
  const currentLabel = item.assignee_name ?? '미배정'
  const patchError = patch.isError
    ? patch.error instanceof Error ? patch.error.message : '담당자를 저장하지 못했습니다.'
    : null

  const chip = <AssigneeChip name={item.assignee_name} />
  if (!canWrite) return chip

  const update = (value: string) => {
    const assigneeId = value === UNASSIGNED ? null : value
    if (assigneeId === (item.assignee_id ?? null) || patch.isPending) return
    patch.mutate({
      wpId: item.id,
      patch: {
        expected_version: item.version,
        assignee_id: assigneeId,
      },
    })
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (nextOpen && patch.isError) patch.reset()
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`담당자 변경: ${currentLabel}`}
            aria-busy={patch.isPending}
            disabled={patch.isPending}
            className="flex min-w-0 items-center gap-1 rounded-of text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-60"
          >
            {chip}
            <ChevronDown size={11} className="shrink-0 text-of-muted" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto">
          {members.isPending ? (
            <DropdownMenuItem disabled className="flex items-center gap-2 text-xs text-of-muted">
              <RefreshCw size={12} className="animate-spin" aria-hidden />
              멤버 불러오는 중
            </DropdownMenuItem>
          ) : members.isError ? (
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs text-of-danger"
              onSelect={(event) => {
                event.preventDefault()
                void members.refetch()
              }}
            >
              <RefreshCw size={12} aria-hidden />
              멤버 다시 불러오기
            </DropdownMenuItem>
          ) : (
            <DropdownMenuRadioGroup value={item.assignee_id ?? UNASSIGNED} onValueChange={update}>
              <DropdownMenuRadioItem value={UNASSIGNED}>
                <AssigneeChip />
              </DropdownMenuRadioItem>
              {assignableMembers.map((member) => (
                <DropdownMenuRadioItem key={member.user_id} value={member.user_id}>
                  <AssigneeChip name={member.display_name} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {patchError ? (
        <span className="text-of-danger" title={patchError} aria-label={`담당자 저장 실패: ${patchError}`}>
          <AlertCircle size={13} aria-hidden />
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {patch.isPending ? '담당자 저장 중' : patchError ? `담당자 저장 실패: ${patchError}` : ''}
      </span>
    </div>
  )
}
