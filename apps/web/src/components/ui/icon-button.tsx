import type * as React from 'react'

import { cn } from '@/lib/utils'

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  tone?: 'default' | 'danger'
  size?: 'sm' | 'md'
}

export function IconButton({
  label,
  tone = 'default',
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'of-touch-target inline-flex shrink-0 items-center justify-center rounded-of border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
        size === 'sm' ? 'h-7 w-7 [&_svg]:size-3.5' : 'h-8 w-8 [&_svg]:size-4',
        tone === 'danger'
          ? 'text-of-danger hover:border-of-danger/20 hover:bg-of-danger-soft'
          : 'text-of-muted hover:border-of-border-subtle hover:bg-of-surface-hover hover:text-of-text',
        className,
      )}
      {...props}
    />
  )
}
