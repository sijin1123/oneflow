import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDown, ArrowDownAZ, ArrowUp, ArrowUpDown, Columns3, Group, Rows2, Rows3, Settings2, X } from 'lucide-react'
import { type RefObject, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { GridDensity } from '@/components/ui/data-grid'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkspaceWorkItemSort } from '@/features/search/api'

import {
  WORKSPACE_COLUMNS,
  type WorkspaceColumn,
  type WorkspaceGroupBy,
} from './workspaceDisplay'

const COLUMN_LABELS: Record<WorkspaceColumn, string> = {
  project: '프로젝트',
  status: '상태',
  priority: '우선순위',
  type: '타입',
  assignee: '담당자',
  start: '시작일',
  due: '기한',
  updated: '수정일',
}

const GROUPS: Array<{ value: WorkspaceGroupBy; label: string }> = [
  { value: 'state', label: '상태 그룹' },
  { value: 'priority', label: '우선순위' },
  { value: 'project', label: '프로젝트' },
  { value: 'assignee', label: '담당자' },
  { value: 'none', label: '그룹 없음' },
]

const COLUMN_SORT_LABELS: Partial<Record<WorkspaceWorkItemSort, string>> = {
  status_asc: '상태 A → Z',
  status_desc: '상태 Z → A',
  priority_asc: '우선순위 없음 → 긴급',
  priority_desc: '우선순위 긴급 → 없음',
}

export function WorkspaceDisplayMenu({
  layout,
  groupBy,
  columns,
  sort,
  density,
  showEmptyGroups,
  showIds,
  pqlSorting,
  onGroupByChange,
  onToggleColumn,
  onReorderColumns,
  onSortChange,
  onDensityChange,
  onShowEmptyGroupsChange,
  onShowIdsChange,
}: {
  layout: 'board' | 'calendar' | 'table' | 'timeline'
  groupBy: WorkspaceGroupBy
  columns: WorkspaceColumn[]
  sort: WorkspaceWorkItemSort
  density: GridDensity
  showEmptyGroups: boolean
  showIds: boolean
  pqlSorting: boolean
  onGroupByChange: (value: WorkspaceGroupBy) => void
  onToggleColumn: (value: WorkspaceColumn) => void
  onReorderColumns: (columns: WorkspaceColumn[]) => void
  onSortChange: (value: WorkspaceWorkItemSort) => void
  onDensityChange: (value: GridDensity) => void
  onShowEmptyGroupsChange: (value: boolean) => void
  onShowIdsChange: (value: boolean) => void
}) {
  const showBoard = layout === 'board'
  const showTable = layout === 'table'
  const [columnOrderOpen, setColumnOrderOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} type="button" variant="outline" size="sm" aria-label="Display">
          <Settings2 size={13} /> Display
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="of-scrollbar max-h-[min(32rem,calc(100vh-6rem))] w-64 overflow-y-auto">
        {showBoard ? (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5"><Group size={12} />그룹 기준</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={groupBy} onValueChange={(value) => onGroupByChange(value as WorkspaceGroupBy)}>
              {GROUPS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuLabel className="flex items-center gap-1.5">
          <ArrowDownAZ size={12} />정렬{COLUMN_SORT_LABELS[sort] ? ` · ${COLUMN_SORT_LABELS[sort]}` : ''}
        </DropdownMenuLabel>
        {pqlSorting ? (
          <DropdownMenuLabel className="pb-2 normal-case text-[11px]">PQL의 ORDER BY가 정렬을 제어합니다.</DropdownMenuLabel>
        ) : (
          <DropdownMenuRadioGroup value={sort} onValueChange={(value) => onSortChange(value as WorkspaceWorkItemSort)}>
            <DropdownMenuRadioItem value="updated">최근 수정순</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="due">기한 빠른순</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>밀도</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={(value) => onDensityChange(value as GridDensity)}>
          {([
            ['compact', '조밀하게', Rows2],
            ['comfortable', '여유롭게', Rows3],
          ] as const).map(([value, label, Icon]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon size={13} />{label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {showTable ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              aria-label="열 순서 변경"
              className="flex min-h-0 items-center justify-between py-1 text-[11px] font-medium text-of-muted"
              onSelect={() => window.setTimeout(() => setColumnOrderOpen(true), 0)}
            >
              <span className="flex items-center gap-1.5"><Columns3 size={12} />표시 열</span>
              <span className="flex items-center gap-1 font-normal tabular-nums text-of-muted">
                {columns.length}<ArrowUpDown size={12} aria-hidden="true" />
              </span>
            </DropdownMenuItem>
            {WORKSPACE_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column}
                checked={columns.includes(column)}
                disabled={columns.length === 1 && columns.includes(column)}
                onCheckedChange={() => onToggleColumn(column)}
              >
                {COLUMN_LABELS[column]}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}

        {showBoard || showTable ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>표시 옵션</DropdownMenuLabel>
            {showBoard && (groupBy === 'state' || groupBy === 'priority') ? (
              <DropdownMenuCheckboxItem checked={showEmptyGroups} onCheckedChange={(checked) => onShowEmptyGroupsChange(checked === true)}>
                빈 그룹 표시
              </DropdownMenuCheckboxItem>
            ) : null}
            <DropdownMenuCheckboxItem checked={showIds} onCheckedChange={(checked) => onShowIdsChange(checked === true)}>
              작업 ID 표시
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
      </DropdownMenuContent>
      <WorkspaceColumnOrderDialog
        columns={columns}
        open={columnOrderOpen}
        triggerRef={triggerRef}
        onOpenChange={setColumnOrderOpen}
        onReorder={onReorderColumns}
      />
    </DropdownMenu>
  )
}

function WorkspaceColumnOrderDialog({
  columns,
  open,
  triggerRef,
  onOpenChange,
  onReorder,
}: {
  columns: WorkspaceColumn[]
  open: boolean
  triggerRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onReorder: (columns: WorkspaceColumn[]) => void
}) {
  const moveButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (column: WorkspaceColumn, direction: -1 | 1) => {
    const index = columns.indexOf(column)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= columns.length) return
    const next = [...columns]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    onReorder(next)
    const focusDirection = targetIndex === 0 || targetIndex === columns.length - 1
      ? -direction
      : direction
    requestAnimationFrame(() => moveButtonRefs.current[`${column}:${focusDirection}`]?.focus())
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <ModalOverlay />
        <ModalContent
          className="w-[min(28rem,calc(100vw-1.5rem))] rounded-of-lg border border-of-border bg-of-surface-raised p-4 shadow-[var(--of-shadow-popover)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold">열 순서 변경</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-of-muted">
                위·아래 버튼으로 표에 표시되는 열 순서를 바꿉니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="열 순서 닫기">
                <X size={14} aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <ol aria-label="현재 표시 열" className="mt-4 max-h-[min(50vh,22rem)] space-y-1 overflow-y-auto pr-1">
            {columns.map((column, index) => (
              <li key={column} className="flex min-h-10 items-center gap-2 rounded-of border border-of-border px-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{COLUMN_LABELS[column]}</span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    ref={(element) => { moveButtonRefs.current[`${column}:-1`] = element }}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`${COLUMN_LABELS[column]} 위로 이동`}
                    disabled={index === 0}
                    onClick={() => move(column, -1)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    ref={(element) => { moveButtonRefs.current[`${column}:1`] = element }}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`${COLUMN_LABELS[column]} 아래로 이동`}
                    disabled={index === columns.length - 1}
                    onClick={() => move(column, 1)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </ModalContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
