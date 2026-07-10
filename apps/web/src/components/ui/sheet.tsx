/* Right-side drawer built on Radix Dialog — focus trap and focus return come
   from the primitive (a11y §8). */

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type * as React from 'react'

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
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-of-overlay data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-of-border bg-of-surface shadow-[var(--of-shadow-popover)] outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-of-border px-4 py-3">
          <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="닫기"
            className="rounded-of p-1 text-of-muted transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
