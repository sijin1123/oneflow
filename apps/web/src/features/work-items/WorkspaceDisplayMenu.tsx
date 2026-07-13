import { ArrowDownAZ, Columns3, Group, Rows2, Rows3, Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { GridDensity } from '@/components/ui/data-grid'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
  onSortChange: (value: WorkspaceWorkItemSort) => void
  onDensityChange: (value: GridDensity) => void
  onShowEmptyGroupsChange: (value: boolean) => void
  onShowIdsChange: (value: boolean) => void
}) {
  const showBoard = layout === 'board'
  const showTable = layout === 'table'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Display">
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
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><Columns3 size={12} />표시 열</span>
              <span className="font-normal tabular-nums">{columns.length}</span>
            </DropdownMenuLabel>
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
    </DropdownMenu>
  )
}
