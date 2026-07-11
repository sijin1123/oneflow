import type * as React from 'react'

import { cn } from '@/lib/utils'

const SIZE = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof SIZE
  className?: string
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-of-border bg-of-accent-soft font-semibold text-of-accent',
        SIZE[size],
        className,
      )}
      title={name}
      aria-label={name}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials || '?'}
    </span>
  )
}

export function AvatarGroup({ children }: { children: React.ReactNode }) {
  return <span className="flex -space-x-1.5 [&>*]:ring-2 [&>*]:ring-of-surface">{children}</span>
}
