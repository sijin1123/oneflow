import { CalendarRange, CircleDot, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { useProjectPhases } from './api'
import type { ProjectPhase } from './types'

const DOT_STYLES = {
  sky: 'border-sky-500 bg-sky-100 text-sky-700',
  indigo: 'border-indigo-500 bg-indigo-100 text-indigo-700',
  emerald: 'border-emerald-500 bg-emerald-100 text-emerald-700',
  amber: 'border-amber-500 bg-amber-100 text-amber-700',
} as const

type PhaseState = 'complete' | 'current' | 'upcoming' | 'unscheduled'

function phaseState(phase: ProjectPhase, today: string): PhaseState {
  if (!phase.start_date || !phase.end_date) return 'unscheduled'
  if (phase.end_date < today) return 'complete'
  if (phase.start_date <= today && today <= phase.end_date) return 'current'
  return 'upcoming'
}

const STATE_LABELS: Record<PhaseState, string> = {
  complete: '완료',
  current: '현재 단계',
  upcoming: '예정',
  unscheduled: '일정 필요',
}

function TimelineSkeleton() {
  return (
    <section aria-label="프로젝트 수명주기" className="min-w-0">
      <div className="mb-2 h-5 w-28 animate-pulse rounded bg-of-surface-hover" />
      <div
        role="status"
        aria-label="프로젝트 단계 불러오는 중"
        className="grid gap-2 border-y border-of-border py-3 sm:grid-cols-4"
      >
        {[0, 1, 2, 3].map((item) => (
          <span key={item} className="h-14 animate-pulse rounded-of bg-of-surface-hover" />
        ))}
      </div>
    </section>
  )
}

export function ProjectLifecycleTimeline({ projectId }: { projectId: string }) {
  const phases = useProjectPhases(projectId)

  if (phases.isPending) return <TimelineSkeleton />

  if (phases.isError) {
    return (
      <section aria-label="프로젝트 수명주기" className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CalendarRange size={14} /> 프로젝트 수명주기
        </div>
        <div
          role="alert"
          className="flex min-h-20 flex-col items-center justify-center gap-2 border-y border-of-border px-4 py-4 text-center"
        >
          <p className="text-xs text-of-danger">프로젝트 단계를 불러오지 못했습니다.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void phases.refetch()}>
            <RotateCcw size={13} /> 재시도
          </Button>
        </div>
      </section>
    )
  }

  const active = phases.data.items.filter((phase) => phase.active && !phase.retired)
  if (active.length === 0) return null
  const today = todayISO()

  return (
    <section aria-label="프로젝트 수명주기" className="min-w-0">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <CalendarRange size={14} className="shrink-0" /> 프로젝트 수명주기
        </h3>
        <span className="shrink-0 text-[11px] tabular-nums text-of-muted">{active.length}단계</span>
      </div>
      <ol className="flex min-w-0 flex-col border-y border-of-border sm:flex-row">
        {active.map((phase, index) => {
          const state = phaseState(phase, today)
          return (
            <li
              key={phase.key}
              className="relative flex min-w-0 flex-1 gap-3 border-b border-of-border px-2 py-3 last:border-b-0 sm:block sm:border-b-0 sm:px-3"
            >
              {index > 0 ? (
                <span
                  className="absolute left-[1.15rem] top-0 h-px w-[calc(100%-1.15rem)] -translate-y-px bg-of-border sm:left-0 sm:top-[1.3rem] sm:h-px sm:w-1/2 sm:translate-y-0"
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={cn(
                  'relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold',
                  DOT_STYLES[phase.color],
                  state === 'upcoming' && 'border-of-border bg-of-surface text-of-muted',
                  state === 'unscheduled' && 'border-dashed border-of-border bg-of-surface text-of-muted',
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 sm:mt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-semibold">{phase.name}</span>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      state === 'current' ? 'text-of-accent' : 'text-of-muted',
                    )}
                  >
                    {STATE_LABELS[state]}
                  </span>
                </div>
                <p className="mt-1 break-words text-[11px] leading-4 text-of-muted">
                  {phase.start_date || phase.end_date
                    ? `${phase.start_date ?? '미정'} - ${phase.end_date ?? '미정'}`
                    : '날짜 미정'}
                </p>
                {phase.start_gate.active || phase.finish_gate.active ? (
                  <ul className="mt-2 space-y-1 border-l border-of-border pl-2" aria-label={`${phase.name} 단계 게이트`}>
                    {[phase.start_gate, phase.finish_gate]
                      .filter((gate) => gate.active)
                      .map((gate) => (
                        <li key={gate.kind} className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4">
                          <CircleDot size={10} className="shrink-0 text-of-accent" aria-hidden="true" />
                          <span className="min-w-0 truncate font-medium">{gate.name}</span>
                          <span className="ml-auto shrink-0 tabular-nums text-of-muted">
                            {gate.date ?? '경계 날짜 미정'}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
