/* OneFlow UI primitives — authored in-repo in the shadcn/ui style (MIT pattern:
   components live in our codebase). Original code, no reference-product source. */

import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'of-touch-target inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-transparent text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--of-duration-fast)] ease-[var(--of-ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-of-accent bg-of-accent text-white shadow-[var(--of-shadow-xs)] hover:border-of-accent-hover hover:bg-of-accent-hover',
        secondary: 'border-of-border-subtle bg-of-surface-2 text-of-text hover:border-of-border hover:bg-of-surface-3',
        outline: 'border-of-border bg-of-surface text-of-text hover:border-of-border-strong hover:bg-of-surface-hover',
        ghost: 'text-of-secondary hover:bg-of-surface-hover hover:text-of-text',
        danger: 'bg-of-danger text-white hover:bg-of-danger-hover',
        subtleDanger: 'border-of-danger/20 bg-of-danger-soft text-of-danger hover:border-of-danger/35',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-xs',
        icon: 'h-8 w-8',
        lg: 'h-9 px-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
