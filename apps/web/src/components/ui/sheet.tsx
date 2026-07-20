/* Right-side drawer built on Radix Dialog — focus trap and focus return come
   from the primitive (a11y §8). */

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type * as React from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({
  className,
  children,
  title,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="of-sheet-overlay fixed inset-0 z-40 bg-of-overlay backdrop-blur-[2px]"
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        data-slot="sheet-content"
        className={cn(
          'of-sheet-content fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)] outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex h-[var(--of-topbar-height)] items-center justify-between border-b border-of-border-subtle px-4">
          <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <IconButton label="닫기"><X /></IconButton>
          </DialogPrimitive.Close>
        </div>
        <div className="of-scrollbar flex-1 overflow-y-auto p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
