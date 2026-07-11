import type * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type SettingsNavItem = {
  key: string
  label: string
  description?: string
  icon?: LucideIcon
}

export function SettingsFrame({
  eyebrow,
  title,
  description,
  meta,
  actions,
  children,
  className,
}: {
  eyebrow: string
  title: string
  description: string
  meta?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6', className)}>
      <header className="border-b border-of-border-subtle pb-4">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">{eyebrow}</p>
            <h1 className="mt-1 text-base font-semibold">{title}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">{description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {meta ? <Badge variant="outline">{meta}</Badge> : null}
            {actions}
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
  ariaLabel,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      className={cn('of-surface p-4 sm:p-5', className)}
    >
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-of-muted">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function SettingsTabList({
  items,
  activeKey,
  onSelect,
  ariaLabel,
  panelId,
  tabIdPrefix,
}: {
  items: readonly SettingsNavItem[]
  activeKey: string
  onSelect: (key: string) => void
  ariaLabel: string
  panelId: string
  tabIdPrefix: string
}) {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className="of-scrollbar flex min-w-0 gap-1 overflow-x-auto border-b border-of-border-subtle pb-2 lg:w-64 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3"
    >
      {items.map((item) => {
        const Icon = item.icon
        const selected = activeKey === item.key
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${tabIdPrefix}-${item.key}`}
            aria-label={item.label}
            aria-selected={selected}
            aria-controls={panelId}
            className={cn(
              'flex min-h-10 min-w-[9rem] items-start gap-2 rounded-of px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus lg:min-w-0',
              selected
                ? 'bg-of-surface-selected font-medium text-of-accent'
                : 'text-of-muted hover:bg-of-surface-2 hover:text-of-text',
            )}
            onClick={() => onSelect(item.key)}
          >
            {Icon ? <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
            <span className="min-w-0">
              <span className="block truncate">{item.label}</span>
              {item.description ? (
                <span
                  className={cn(
                    'mt-0.5 hidden text-[11px] font-normal leading-4 lg:block',
                    selected ? 'text-of-accent' : 'text-of-muted',
                  )}
                  aria-hidden="true"
                >
                  {item.description}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
