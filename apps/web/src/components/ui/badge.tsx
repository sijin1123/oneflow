import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex min-h-5 max-w-full items-center gap-1 rounded-of border px-1.5 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-of-border-subtle bg-of-surface-2 text-of-secondary',
        accent: 'border-transparent bg-of-accent-soft text-of-accent',
        outline: 'border-of-border text-of-muted',
        info: 'border-of-info/15 bg-of-info-soft text-of-info',
        success: 'border-of-success/15 bg-of-success-soft text-of-success',
        warning: 'border-of-warning/20 bg-of-warning-soft text-of-secondary',
        danger: 'border-of-danger/15 bg-of-danger-soft text-of-danger',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
