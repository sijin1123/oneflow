import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={4}
        className={cn(
          'of-dropdown-motion z-50 min-w-36 rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-[var(--of-shadow-popover)]',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}

/* Plain form controls don't work inside a Radix menu (the menu intercepts
   their pointer events) — checkbox rows must use this menu primitive. It
   keeps the menu open on toggle so several columns can be flipped in one
   visit. */
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem
      onSelect={(e) => e.preventDefault()}
      className={cn(
        'flex min-h-7 cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-xs outline-none transition-colors data-[disabled]:opacity-50 data-[highlighted]:bg-of-surface-hover data-[highlighted]:text-of-text',
        className,
      )}
      {...props}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-of-border">
        <DropdownPrimitive.ItemIndicator>
          <Check size={10} />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn('px-2 pb-1 pt-1.5 text-[11px] font-medium text-of-muted', className)}
      {...props}
    />
  )
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'min-h-7 cursor-default select-none rounded-[4px] px-2 py-1.5 outline-none transition-colors data-[highlighted]:bg-of-surface-hover data-[highlighted]:text-of-text',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem>) {
  return (
    <DropdownPrimitive.RadioItem
      className={cn(
        'flex min-h-7 cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-xs outline-none transition-colors data-[disabled]:opacity-50 data-[highlighted]:bg-of-surface-hover data-[highlighted]:text-of-text',
        className,
      )}
      {...props}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-of-border">
        <DropdownPrimitive.ItemIndicator>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.RadioItem>
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>) {
  return (
    <DropdownPrimitive.Separator
      className={cn('my-1 h-px bg-of-border', className)}
      {...props}
    />
  )
}
