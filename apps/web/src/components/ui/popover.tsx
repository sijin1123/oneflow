import * as PopoverPrimitive from '@radix-ui/react-popover'
import type * as React from 'react'

import { cn } from '@/lib/utils'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({
  align = 'start',
  sideOffset = 6,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'of-popover-motion z-50 rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-[var(--of-shadow-popover)]',
        className,
      )}
      {...props}
    />
  )
}
