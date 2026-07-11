import type * as React from 'react'

import { Rows2, Rows3 } from 'lucide-react'

import { SegmentedControl } from '@/components/ui/controls'
import { cn } from '@/lib/utils'

export type GridDensity = 'compact' | 'comfortable'

export function DataGridFrame({
  density = 'comfortable',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  density?: GridDensity
}) {
  return (
    <div
      role="region"
      tabIndex={0}
      data-density={density}
      className={cn('of-scrollbar min-h-0 min-w-0 overflow-auto', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DensityControl({
  value,
  onChange,
}: {
  value: GridDensity
  onChange: (value: GridDensity) => void
}) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      label="목록 밀도"
      options={[
        { value: 'compact', label: '촘촘하게', icon: <Rows2 /> },
        { value: 'comfortable', label: '여유롭게', icon: <Rows3 /> },
      ]}
    />
  )
}

export function DataGrid({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('of-data-grid', className)} {...props} />
}
