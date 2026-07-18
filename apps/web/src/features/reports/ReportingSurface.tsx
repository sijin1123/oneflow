import type * as React from 'react'
import { BarChart3, Gauge, Target, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { cn } from '@/lib/utils'

type ReportingNavItem = {
  to: string
  label: string
  icon: LucideIcon
}

const DEFAULT_NAV: ReportingNavItem[] = [
  { to: '/reports', label: '리포트', icon: BarChart3 },
  { to: '/initiatives', label: '이니셔티브', icon: Target },
]

export function ReportingSurface({
  title,
  description,
  context,
  actions,
  children,
  navItems = DEFAULT_NAV,
}: {
  title: string
  description?: string
  context?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  navItems?: ReportingNavItem[]
}) {
  const location = useLocation()
  const capabilities = useWorkspaceCapabilities()
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true
  const visibleNavItems = navItems.filter(
    (item) => item.to !== '/initiatives' || initiativesEnabled,
  )
  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-col gap-4 border-b border-of-border pb-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-[11px] font-medium text-of-muted">
              <span className="inline-flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1">
                <Gauge size={12} aria-hidden="true" />
                Reporting
              </span>
              {context}
            </div>
            <h1 className="break-words text-base font-semibold text-of-text">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-of-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
          ) : null}
        </div>
        <nav
          aria-label="Reporting navigation"
          className="flex min-w-0 gap-1 overflow-x-auto rounded-of border border-of-border bg-of-surface p-1 text-xs"
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            const active = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-of px-2.5 py-1.5 font-medium transition-colors',
                  active
                    ? 'bg-of-accent-soft text-of-accent'
                    : 'text-of-muted hover:bg-of-surface-hover hover:text-of-text',
                )}
              >
                <Icon size={13} aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      {children}
    </div>
  )
}

export function ReportingMetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-of border bg-of-surface px-3 py-3',
        tone === 'danger' ? 'border-of-danger/25' : 'border-of-border',
      )}
    >
      <p className="truncate text-[11px] font-medium text-of-muted">{label}</p>
      <p
        className={cn(
          'mt-1 break-words text-lg font-semibold tabular-nums text-of-text',
          tone === 'accent' && 'text-of-accent',
          tone === 'danger' && 'text-of-danger',
        )}
      >
        {value}
      </p>
      {detail ? <p className="mt-1 break-words text-[11px] leading-4 text-of-muted">{detail}</p> : null}
    </div>
  )
}

export function ReportingSummaryGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  )
}

export function ReportingSection({
  title,
  actions,
  children,
  className,
}: {
  title?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('min-w-0 space-y-3', className)}>
      {title || actions ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-sm font-semibold text-of-text">{title}</h2> : <span />}
          {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function ReportingSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: LucideIcon }>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex overflow-hidden rounded-of border border-of-border bg-of-surface text-xs"
    >
      {options.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium transition-colors',
              active
                ? 'bg-of-accent-soft text-of-accent'
                : 'text-of-muted hover:bg-of-surface-hover hover:text-of-text',
            )}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon size={13} aria-hidden="true" /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
