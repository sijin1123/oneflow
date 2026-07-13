import { ArrowDownAZ, ArrowUpZA, ChevronDown } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkspaceWorkItemSort } from '@/features/search/api'
import { cn } from '@/lib/utils'

type SortableWorkspaceColumn = 'status' | 'priority'

const OPTIONS: Record<SortableWorkspaceColumn, Array<{
  value: WorkspaceWorkItemSort
  label: string
  icon: typeof ArrowDownAZ
}>> = {
  status: [
    { value: 'status_asc', label: 'A → Z', icon: ArrowDownAZ },
    { value: 'status_desc', label: 'Z → A', icon: ArrowUpZA },
  ],
  priority: [
    { value: 'priority_asc', label: '없음 → 긴급', icon: ArrowDownAZ },
    { value: 'priority_desc', label: '긴급 → 없음', icon: ArrowUpZA },
  ],
}

const LABELS: Record<SortableWorkspaceColumn, string> = {
  status: '상태',
  priority: '우선순위',
}

export function WorkspaceColumnSortMenu({
  column,
  sort,
  disabled,
  onSortChange,
}: {
  column: SortableWorkspaceColumn
  sort: WorkspaceWorkItemSort
  disabled: boolean
  onSortChange: (value: WorkspaceWorkItemSort) => void
}) {
  const options = OPTIONS[column]
  const active = options.some((option) => option.value === sort)

  if (disabled) {
    return <span className="flex h-9 items-center px-3">{LABELS[column]}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${LABELS[column]} 열 정렬`}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 px-3 text-left text-[11px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
            active && 'text-of-accent',
          )}
        >
          <span>{LABELS[column]}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuRadioGroup
          value={active ? sort : ''}
          onValueChange={(value) => onSortChange(value as WorkspaceWorkItemSort)}
        >
          {options.map((option) => {
            const Icon = option.icon
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon size={13} aria-hidden />
                {option.label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
