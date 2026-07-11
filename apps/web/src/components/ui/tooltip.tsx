import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Tooltip({
  label,
  children,
  side = 'bottom',
  className,
}: {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}) {
  const id = useId()
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-[70] hidden -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-of-text px-2 py-1 text-[11px] font-medium text-white shadow-sm group-hover/tooltip:block group-focus-within/tooltip:block',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  )
}
