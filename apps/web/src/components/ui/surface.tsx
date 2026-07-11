import type * as React from 'react'

import { cn } from '@/lib/utils'

export function Surface({
  className,
  elevation = 'flat',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { elevation?: 'flat' | 'raised' | 'floating' }) {
  return (
    <div
      className={cn(
        elevation === 'flat' && 'of-surface',
        elevation === 'raised' && 'of-surface bg-of-surface-raised shadow-[var(--of-shadow-sm)]',
        elevation === 'floating' && 'of-floating-surface',
        className,
      )}
      {...props}
    />
  )
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  className,
}: {
  title: string
  description?: React.ReactNode
  eyebrow?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('of-page-header flex min-w-0 flex-wrap items-center gap-3 px-4 py-2.5', className)}>
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="truncate text-[11px] font-medium text-of-muted">{eyebrow}</p> : null}
        <h1 className="truncate text-[15px] font-semibold leading-5 text-of-text">{title}</h1>
        {description ? <div className="truncate text-xs text-of-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function Toolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('of-toolbar flex min-w-0 flex-wrap items-center gap-2 px-4 py-2', className)} {...props} />
}

export function PropertyRow({
  label,
  children,
  icon,
}: {
  label: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="grid min-h-9 grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 border-b border-of-border-subtle py-1.5 last:border-b-0">
      <dt className="flex min-w-0 items-center gap-1.5 text-xs text-of-muted [&_svg]:size-3.5">
        {icon}{label}
      </dt>
      <dd className="min-w-0 text-sm text-of-text">{children}</dd>
    </div>
  )
}

export function InlineAlert({
  title,
  children,
  tone = 'info',
  className,
}: {
  title?: string
  children: React.ReactNode
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  className?: string
}) {
  const toneClass = {
    info: 'border-of-info/20 bg-of-info-soft text-of-info',
    success: 'border-of-success/20 bg-of-success-soft text-of-success',
    warning: 'border-of-warning/25 bg-of-warning-soft text-of-text',
    danger: 'border-of-danger/20 bg-of-danger-soft text-of-danger',
    neutral: 'border-of-border-subtle bg-of-surface-2 text-of-muted',
  }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-of border px-3 py-2 text-xs', toneClass, className)}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className={tone === 'warning' ? 'text-of-secondary' : undefined}>{children}</div>
    </div>
  )
}
