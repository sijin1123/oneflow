import type * as React from 'react'

import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-of bg-of-surface-2', className)} {...props} />
  )
}
