import * as React from 'react'

import { cn } from '@/lib/utils'

/* Styled native select — keyboard/screen-reader behavior for free (a11y §8). */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-8 w-full appearance-none rounded-of border border-of-border bg-of-surface px-2.5 pr-7 text-sm transition-colors focus-visible:border-of-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus/20 disabled:cursor-not-allowed disabled:bg-of-surface-2 disabled:text-of-muted',
      "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23777%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_8px_center] bg-no-repeat",
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'
