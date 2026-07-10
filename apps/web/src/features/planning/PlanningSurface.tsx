import {
  CalendarClock,
  Clock3,
  Columns3,
  FolderKanban,
  ListChecks,
  Repeat2,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { useProject } from '@/features/projects/api'
import { cn } from '@/lib/utils'

export type PlanningSurfaceKey = 'backlog' | 'board' | 'timeline' | 'calendar' | 'cycles' | 'modules'

type PlanningMode = {
  key: PlanningSurfaceKey
  label: string
  hint: string
  path: string
  icon: LucideIcon
}

const PLANNING_MODES: PlanningMode[] = [
  { key: 'backlog', label: '백로그', hint: '정리', path: 'backlog', icon: ListChecks },
  { key: 'board', label: '보드', hint: '흐름', path: 'board', icon: Columns3 },
  { key: 'timeline', label: '타임라인', hint: '일정', path: 'timeline', icon: Clock3 },
  { key: 'calendar', label: '캘린더', hint: '마감', path: 'calendar', icon: CalendarClock },
  { key: 'cycles', label: '사이클', hint: '반복', path: 'cycles', icon: Repeat2 },
  { key: 'modules', label: '모듈', hint: '범위', path: 'modules', icon: FolderKanban },
]

export type PlanningMetric = {
  label: string
  value: ReactNode
  hint?: ReactNode
}

type PlanningSurfaceProps = {
  projectId: string
  active: PlanningSurfaceKey
  title: string
  description: ReactNode
  metrics?: PlanningMetric[]
  children: ReactNode
  className?: string
  bodyClassName?: string
  wide?: boolean
}

export function PlanningSurface({
  projectId,
  active,
  title,
  description,
  metrics = [],
  children,
  className,
  bodyClassName,
  wide = false,
}: PlanningSurfaceProps) {
  const project = useProject(projectId)
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined

  return (
    <div
      className={cn(
        'flex h-full w-full min-w-0 flex-col gap-4 px-4 py-5 sm:px-6',
        wide ? 'max-w-none' : 'mx-auto max-w-6xl',
        className,
      )}
    >
      <header className="border-b border-of-border pb-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">Planning surface</p>
            <h1 className="mt-1 text-base font-semibold">{title}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-of-muted">{description}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {project.data ? <Badge variant="outline">{project.data.key}</Badge> : null}
            <Badge variant={archived ? 'outline' : 'accent'}>{archived ? '보관됨' : '활성'}</Badge>
            <Badge variant="outline">{project.data?.name ?? '프로젝트'}</Badge>
          </div>
        </div>
      </header>

      <nav
        aria-label="계획 모드"
        className="-mx-1 block min-h-12 min-w-0 shrink-0 overflow-x-auto px-1 py-0.5"
      >
        <div className="relative z-10 flex min-w-max gap-1 rounded-of border border-of-border bg-of-surface p-1">
          {PLANNING_MODES.map((mode) => {
            const Icon = mode.icon
            const selected = mode.key === active
            return (
              <Link
                key={mode.key}
                to={`/projects/${projectId}/${mode.path}`}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-of px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                  selected
                    ? 'bg-of-accent-soft text-of-accent'
                    : 'text-of-muted hover:bg-of-surface-2 hover:text-of-text',
                )}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="font-medium">{mode.label}</span>
                <span className="hidden text-[11px] sm:inline">{mode.hint}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {metrics.length > 0 ? (
        <section aria-label="계획 요약" className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="min-w-0 rounded-of border border-of-border bg-of-surface px-3 py-2"
            >
              <p className="text-[11px] font-medium text-of-muted">{metric.label}</p>
              <p className="mt-1 truncate text-sm font-semibold tabular-nums">{metric.value}</p>
              {metric.hint ? <p className="mt-1 truncate text-[11px] text-of-muted">{metric.hint}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      <main className={cn('min-w-0 flex-1', bodyClassName)}>{children}</main>
    </div>
  )
}
