import type * as React from 'react'

import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-of bg-[linear-gradient(90deg,var(--of-skeleton),var(--of-surface-3),var(--of-skeleton))] bg-[length:220%_100%]',
        className,
      )}
      {...props}
    />
  )
}
