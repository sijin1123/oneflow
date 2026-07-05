import * as React from 'react'

import { cn } from '@/lib/utils'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-24 w-full rounded-of border border-of-border bg-of-surface px-2.5 py-2 text-sm placeholder:text-of-muted focus-visible:border-of-accent',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
