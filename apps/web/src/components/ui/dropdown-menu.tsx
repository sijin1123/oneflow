import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import type * as React from 'react'

import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={4}
        className={cn(
          'z-50 min-w-36 rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'cursor-default select-none rounded-[4px] px-2 py-1.5 outline-none data-[highlighted]:bg-of-surface-2',
        className,
      )}
      {...props}
    />
  )
}
