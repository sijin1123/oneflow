import * as DialogPrimitive from '@radix-ui/react-dialog'
import type * as React from 'react'

import { cn } from '@/lib/utils'

export function ModalOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="modal-overlay"
      className={cn(
        'of-modal-overlay fixed inset-0 z-[var(--of-z-modal)] bg-black/30',
        className,
      )}
      {...props}
    />
  )
}

export function ModalContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Content
      data-slot="modal-content"
      className={cn(
        'of-modal-content fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}
