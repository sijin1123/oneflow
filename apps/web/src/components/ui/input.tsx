import * as React from 'react'

import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-of border border-of-border bg-of-surface px-2.5 text-sm placeholder:text-of-muted transition-colors focus-visible:border-of-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus/20 disabled:cursor-not-allowed disabled:bg-of-surface-2 disabled:text-of-muted',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
