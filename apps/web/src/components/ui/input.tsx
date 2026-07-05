import * as React from 'react'

import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-of border border-of-border bg-of-surface px-2.5 text-sm placeholder:text-of-muted focus-visible:border-of-accent',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
