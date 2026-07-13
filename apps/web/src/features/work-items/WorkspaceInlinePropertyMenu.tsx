import { AlertCircle, ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SearchResultItem } from '@/features/search/api'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { usePatchWorkPackage } from '@/features/work-packages/api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WpPriority,
  type WpStatus,
} from '@/features/work-packages/types'

type EditableProperty = 'status' | 'priority'

export function WorkspaceInlinePropertyMenu({
  item,
  property,
}: {
  item: SearchResultItem
  property: EditableProperty
}) {
  const patch = usePatchWorkPackage(item.project_id)
  const canWrite = item.current_user_can_write === true && typeof item.version === 'number'
  const label = property === 'status' ? '상태' : '우선순위'
  const currentLabel = property === 'status'
    ? STATUS_LABELS[item.status]
    : PRIORITY_LABELS[item.priority]
  const error = patch.isError
    ? patch.error instanceof Error ? patch.error.message : '속성을 저장하지 못했습니다.'
    : null

  const chip = property === 'status'
    ? <StatusChip status={item.status} />
    : <PriorityChip priority={item.priority} />

  if (!canWrite) return chip

  const update = (value: string) => {
    if (value === item[property] || patch.isPending) return
    patch.mutate({
      wpId: item.id,
      patch: {
        expected_version: item.version,
        [property]: value,
      },
    })
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu onOpenChange={(open) => { if (open && patch.isError) patch.reset() }}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label} 변경: ${currentLabel}`}
            aria-busy={patch.isPending}
            disabled={patch.isPending}
            className="flex min-w-0 items-center gap-1 rounded-of text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-60"
          >
            {chip}
            <ChevronDown size={11} className="shrink-0 text-of-muted" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuRadioGroup value={item[property]} onValueChange={update}>
            {property === 'status'
              ? WP_STATUSES.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <StatusChip status={value as WpStatus} />
                </DropdownMenuRadioItem>
              ))
              : WP_PRIORITIES.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <PriorityChip priority={value as WpPriority} />
                </DropdownMenuRadioItem>
              ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span className="text-of-danger" title={error} aria-label={`${label} 저장 실패: ${error}`}>
          <AlertCircle size={13} aria-hidden />
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {patch.isPending ? `${label} 저장 중` : error ? `${label} 저장 실패: ${error}` : ''}
      </span>
    </div>
  )
}
