import { ArrowDownAZ, Check, Columns3, Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CustomField } from '@/features/custom-fields/api'

import {
  COLUMN_LABELS,
  LIST_COLUMNS,
  MAX_CUSTOM_COLUMNS,
  type ListColumn,
} from './columns'
import {
  WORK_PACKAGE_SORT_LABELS,
  WORK_PACKAGE_SORTS,
  type WorkPackageSort,
} from './displayOptions'

type DisplayMenuProps = {
  sort: WorkPackageSort
  columns: ListColumn[]
  customColumns: string[]
  customFields: CustomField[]
  onSortChange: (value: WorkPackageSort) => void
  onToggleColumn: (key: ListColumn) => void
  onToggleCustomColumn: (id: string) => void
}

export function DisplayMenu({
  sort,
  columns,
  customColumns,
  customFields,
  onSortChange,
  onToggleColumn,
  onToggleCustomColumn,
}: DisplayMenuProps) {
  const activeCustomFields = customFields.filter((field) => field.is_active)
  const show = (key: ListColumn) => columns.includes(key)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="표시">
          <Settings2 size={14} /> 표시
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <ArrowDownAZ size={12} /> 정렬
        </DropdownMenuLabel>
        {WORK_PACKAGE_SORTS.map((key) => (
          <DropdownMenuItem
            key={key}
            className="flex items-center justify-between gap-3 text-xs"
            onSelect={() => onSortChange(key)}
            aria-label={`정렬 ${WORK_PACKAGE_SORT_LABELS[key]}`}
          >
            <span>{WORK_PACKAGE_SORT_LABELS[key]}</span>
            {sort === key ? <Check size={12} aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Columns3 size={12} /> 열
        </DropdownMenuLabel>
        {LIST_COLUMNS.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={show(key)}
            disabled={show(key) && columns.length === 1}
            onCheckedChange={() => onToggleColumn(key)}
            aria-label={`${COLUMN_LABELS[key]} 열 표시`}
          >
            {COLUMN_LABELS[key]}
          </DropdownMenuCheckboxItem>
        ))}

        {activeCustomFields.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>커스텀 필드</DropdownMenuLabel>
            {activeCustomFields.map((field) => {
              const lower = field.id.toLowerCase()
              const on = customColumns.includes(lower)
              return (
                <DropdownMenuCheckboxItem
                  key={field.id}
                  checked={on}
                  disabled={!on && customColumns.length >= MAX_CUSTOM_COLUMNS}
                  onCheckedChange={() => onToggleCustomColumn(field.id)}
                  aria-label={`${field.name} 열 표시`}
                >
                  {field.name}
                </DropdownMenuCheckboxItem>
              )
            })}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
