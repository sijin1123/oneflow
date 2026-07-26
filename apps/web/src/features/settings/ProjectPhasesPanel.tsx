import {
  Archive,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDot,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import {
  useProject,
  useProjectPhases,
  useUpdateProjectPhase,
} from '@/features/projects/api'
import type { ProjectPhase } from '@/features/projects/types'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const MARK_STYLES = {
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
} as const

type PhaseMutationInput = {
  phaseKey: string
  active?: boolean
  start_gate_active?: boolean
  finish_gate_active?: boolean
  start_date?: string | null
  end_date?: string | null
  version: number
}

type PhaseAction =
  | { kind: 'schedule'; willReschedule: boolean }
  | { kind: 'activation'; activating: boolean }
  | { kind: 'gate'; gate: 'start' | 'finish'; active: boolean }

type PhaseRetryAction = {
  input: PhaseMutationInput
  action: PhaseAction
}

function mutationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '단계를 저장하지 못했습니다. 다시 시도해 주세요.'
  if (error.status === 409) {
    return '다른 변경이 먼저 저장되었습니다. 최신 버전으로 같은 변경을 다시 시도할 수 있습니다.'
  }
  if (error.status === 403) return '프로젝트 소유자만 단계를 변경할 수 있습니다.'
  if (error.status === 422) return '활성 단계의 날짜와 순서를 확인해 주세요.'
  return error.message || '단계를 저장하지 못했습니다. 다시 시도해 주세요.'
}

function scheduleLabel(phase: ProjectPhase) {
  if (!phase.active) return '일정 보존'
  if (phase.start_date && phase.end_date) return `${phase.start_date} - ${phase.end_date}`
  if (phase.start_date) return `${phase.start_date}부터`
  if (phase.end_date) return `${phase.end_date}까지`
  return '일정 필요'
}

function successMessage(
  phase: ProjectPhase,
  updated: ProjectPhase,
  action: PhaseAction,
) {
  if (action.kind === 'schedule') {
    return action.willReschedule
      ? '일정을 저장하고 후속 활성 단계에 근무일 규칙을 적용했습니다.'
      : '단계 일정을 저장했습니다.'
  }
  if (action.kind === 'activation') {
    if (!action.activating) {
      return '단계를 비활성화했습니다. 저장된 일정과 게이트 설정은 보존됩니다.'
    }
    const datesChanged =
      updated.start_date !== phase.start_date || updated.end_date !== phase.end_date
    return datesChanged
      ? '단계를 활성화하고 저장된 일정을 이전 활성 단계 다음 근무일로 재배치했습니다.'
      : '단계를 활성화했습니다. 저장된 날짜는 변경되지 않았습니다.'
  }
  const gateName = action.gate === 'start' ? '시작 게이트' : '완료 게이트'
  return `${gateName}를 ${action.active ? '활성화' : '비활성화'}했습니다.`
}

function EditablePhaseRow({
  phase,
  projectId,
  canEdit,
  expanded,
  onExpandedChange,
  onDirtyChange,
  onRefreshPhase,
}: {
  phase: ProjectPhase
  projectId: string
  canEdit: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onDirtyChange: (key: string, dirty: boolean) => void
  onRefreshPhase: (key: string) => Promise<ProjectPhase | undefined>
}) {
  const update = useUpdateProjectPhase(projectId)
  const [startDate, setStartDate] = useState(phase.start_date ?? '')
  const [endDate, setEndDate] = useState(phase.end_date ?? '')
  const [notice, setNotice] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<PhaseRetryAction | null>(null)
  const [pendingAction, setPendingAction] = useState<PhaseAction['kind'] | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(false)

  const dirty =
    editingSchedule &&
    (startDate !== (phase.start_date ?? '') || endDate !== (phase.end_date ?? ''))
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)

  useEffect(() => {
    if (editingSchedule || retryAction) return
    setStartDate(phase.start_date ?? '')
    setEndDate(phase.end_date ?? '')
  }, [editingSchedule, phase.end_date, phase.start_date, phase.version, retryAction])

  useEffect(() => {
    onDirtyChange(phase.key, dirty)
    return () => onDirtyChange(phase.key, false)
  }, [dirty, onDirtyChange, phase.key])

  const runMutation = (input: PhaseMutationInput, action: PhaseAction) => {
    update.reset()
    setRetryAction(null)
    setNotice(null)
    setPendingAction(action.kind)
    update.mutate(input, {
      onSuccess: (updated) => {
        if (action.kind === 'schedule') {
          setStartDate(updated.start_date ?? '')
          setEndDate(updated.end_date ?? '')
          setEditingSchedule(false)
        }
        setNotice(successMessage(phase, updated, action))
      },
      onError: () => setRetryAction({ input, action }),
      onSettled: () => setPendingAction(null),
    })
  }

  const retryLastAction = async () => {
    if (!retryAction || update.isPending || retrying) return
    setRetrying(true)
    try {
      let version = phase.version
      if (update.error instanceof ApiError && update.error.status === 409) {
        const latest = await onRefreshPhase(phase.key)
        if (!latest) return
        version = latest.version
      }
      runMutation({ ...retryAction.input, version }, retryAction.action)
    } finally {
      setRetrying(false)
    }
  }

  const gates = [phase.start_gate, phase.finish_gate] as const
  const panelId = `project-phase-${phase.key}-editor`
  const activeGateCount = gates.filter((gate) => gate.active).length

  return (
    <li className={cn('min-w-0', !phase.active && 'text-of-muted')}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
              MARK_STYLES[phase.color],
              !phase.active && 'opacity-45',
            )}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-semibold">{phase.name}</p>
              <span className="text-[11px] text-of-muted">{phase.position + 1}번째 단계</span>
              {dirty ? <Badge variant="warning">저장되지 않음</Badge> : null}
              {update.isPending ? (
                <LoaderCircle size={12} className="animate-spin text-of-accent" aria-hidden="true" />
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-of-muted">
              <span className="tabular-nums">{scheduleLabel(phase)}</span>
              <span>게이트 {activeGateCount}/2</span>
              <span>version {phase.version}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={phase.active ? 'success' : 'neutral'}>
            {phase.active ? '활성' : '비활성'}
          </Badge>
          <Switch
            checked={phase.active}
            label={`${phase.name} 단계 ${phase.active ? '비활성화' : '활성화'}`}
            disabled={!canEdit || update.isPending || retrying || dirty}
            onCheckedChange={(active) =>
              runMutation(
                { phaseKey: phase.key, active, version: phase.version },
                { kind: 'activation', activating: active },
              )
            }
          />
          <button
            type="button"
            aria-label={`${phase.name} 일정 및 게이트 ${expanded ? '접기' : '펼치기'}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            title={`${phase.name} 일정 및 게이트 ${expanded ? '접기' : '펼치기'}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => onExpandedChange(!expanded)}
          >
            <ChevronDown
              size={15}
              className={cn('transition-transform duration-150', expanded && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {expanded ? (
        <div
          id={panelId}
          className="border-t border-of-border bg-of-surface-2/35 py-3 pl-4 pr-16"
        >
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="min-w-0 text-[11px] font-medium text-of-muted">
              시작일
              <Input
                type="date"
                value={startDate}
                readOnly={!canEdit}
                disabled={!phase.active || update.isPending || retrying}
                aria-label={`${phase.name} 시작일`}
                className="mt-1 text-xs"
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setNotice(null)
                  setStartDate(nextStartDate)
                  setEditingSchedule(
                    nextStartDate !== (phase.start_date ?? '') ||
                      endDate !== (phase.end_date ?? ''),
                  )
                }}
              />
            </label>
            <label className="min-w-0 text-[11px] font-medium text-of-muted">
              종료일
              <Input
                type="date"
                value={endDate}
                readOnly={!canEdit}
                disabled={!phase.active || update.isPending || retrying}
                aria-label={`${phase.name} 종료일`}
                className="mt-1 text-xs"
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setNotice(null)
                  setEndDate(nextEndDate)
                  setEditingSchedule(
                    startDate !== (phase.start_date ?? '') ||
                      nextEndDate !== (phase.end_date ?? ''),
                  )
                }}
              />
            </label>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!dirty || invalidRange || update.isPending || retrying}
                onClick={() =>
                  runMutation(
                    {
                      phaseKey: phase.key,
                      start_date: startDate || null,
                      end_date: endDate || null,
                      version: phase.version,
                    },
                    {
                      kind: 'schedule',
                      willReschedule:
                        Boolean(endDate) && endDate !== (phase.end_date ?? ''),
                    },
                  )
                }
              >
                {pendingAction === 'schedule' ? (
                  <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={13} aria-hidden="true" />
                )}
                {pendingAction === 'schedule' ? '저장 중' : '저장'}
              </Button>
            ) : null}
          </div>

          {invalidRange ? (
            <p role="alert" className="mt-2 text-xs text-of-danger">
              종료일은 시작일보다 빠를 수 없습니다.
            </p>
          ) : null}

          <div
            className="mt-3 grid min-w-0 gap-px overflow-hidden rounded-of border border-of-border bg-of-border sm:grid-cols-2"
            aria-label={`${phase.name} 단계 게이트`}
          >
            {gates.map((gate) => {
              const field =
                gate.kind === 'start' ? 'start_gate_active' : 'finish_gate_active'
              return (
                <div
                  key={gate.kind}
                  className="flex min-w-0 items-center gap-2 bg-of-surface px-3 py-2.5"
                >
                  <CircleDot
                    size={13}
                    className={cn(
                      'shrink-0',
                      gate.active ? 'text-of-accent' : 'text-of-muted',
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{gate.name}</p>
                    <p className="mt-0.5 truncate text-[10px] tabular-nums text-of-muted">
                      {gate.active ? gate.date ?? '경계 날짜 미정' : '사용 안 함'}
                    </p>
                  </div>
                  <Switch
                    checked={gate.active}
                    label={`${gate.name} ${gate.active ? '비활성화' : '활성화'}`}
                    disabled={!canEdit || update.isPending || retrying || dirty}
                    onCheckedChange={(active) =>
                      runMutation(
                        {
                          phaseKey: phase.key,
                          [field]: active,
                          version: phase.version,
                        },
                        { kind: 'gate', gate: gate.kind, active },
                      )
                    }
                  />
                </div>
              )
            })}
          </div>

        </div>
      ) : null}

      {notice && !update.isPending ? (
        <p
          role="status"
          className="flex items-start gap-1.5 border-t border-of-border px-4 py-2.5 text-xs text-of-success"
        >
          <CheckCircle2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      ) : null}

      {update.isError ? (
        <div
          role="alert"
          className="flex min-w-0 flex-wrap items-center gap-2 border-t border-of-danger/30 bg-of-danger/5 px-4 py-2.5 text-xs text-of-danger"
        >
          <CircleAlert size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{mutationMessage(update.error)}</span>
          {retryAction ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={update.isPending || retrying}
              onClick={() => void retryLastAction()}
            >
              {retrying ? (
                <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={13} aria-hidden="true" />
              )}
              {update.error instanceof ApiError && update.error.status === 409
                ? '최신 버전으로 다시 시도'
                : '다시 시도'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export function ProjectPhasesPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const phases = useProjectPhases(projectId)
  const dirtyKeys = useRef(new Set<string>())
  const initializedExpansion = useRef(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const canEdit = isOwner && !project.data?.archived_at

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  useEffect(() => {
    if (initializedExpansion.current || !phases.data) return
    const initial =
      phases.data.items.find((phase) => !phase.retired && phase.active) ??
      phases.data.items.find((phase) => !phase.retired)
    if (initial) setExpandedKeys(new Set([initial.key]))
    initializedExpansion.current = true
  }, [phases.data])

  const markDirty = useCallback(
    (key: string, dirty: boolean) => {
      if (dirty) dirtyKeys.current.add(key)
      else dirtyKeys.current.delete(key)
      onDirtyChange(dirtyKeys.current.size > 0)
    },
    [onDirtyChange],
  )

  const setExpanded = useCallback((key: string, expanded: boolean) => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (expanded) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const refreshPhase = useCallback(
    async (key: string) => {
      const refreshed = await phases.refetch()
      return refreshed.data?.items.find((phase) => phase.key === key)
    },
    [phases],
  )

  if (phases.isPending || project.isPending) {
    return (
      <section aria-label="프로젝트 단계 설정" className="min-w-0">
        <ListSkeleton />
      </section>
    )
  }
  if (phases.isError) return <ErrorState error={phases.error} onRetry={() => phases.refetch()} />
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />

  const available = phases.data.items
    .filter((phase) => !phase.retired)
    .sort((a, b) => a.position - b.position)
  const retired = phases.data.items
    .filter((phase) => phase.retired)
    .sort((a, b) => a.position - b.position)
  const activeCount = available.filter((phase) => phase.active).length

  return (
    <section
      aria-label="프로젝트 단계 설정"
      className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
    >
      <div className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">Project lifecycle</p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays size={15} aria-hidden="true" /> 프로젝트 단계
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            단계 흐름을 확인하고 필요한 단계만 펼쳐 일정과 시작·완료 게이트를 관리합니다.
          </p>
        </div>
        <Badge variant={canEdit ? 'accent' : 'outline'} className="shrink-0">
          {canEdit ? (
            `활성 ${activeCount}/${available.length}`
          ) : (
            <>
              <LockKeyhole size={12} aria-hidden="true" /> 읽기 전용
            </>
          )}
        </Badge>
      </div>

      {project.data.archived_at ? (
        <p className="border-y border-of-warning/40 bg-of-warning/5 px-4 py-2 text-xs leading-5 text-of-muted">
          보관된 프로젝트의 단계와 일정은 변경할 수 없습니다.
        </p>
      ) : null}

      {available.length > 0 ? (
        <div
          role="list"
          aria-label="프로젝트 단계 흐름"
          className="grid grid-cols-2 gap-px border-y border-of-border bg-of-border sm:grid-cols-4"
        >
          {available.map((phase) => (
            <div
              key={phase.key}
              role="listitem"
              className={cn(
                'min-w-0 bg-of-surface-2/55 px-3 py-2.5',
                !phase.active && 'opacity-60',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    MARK_STYLES[phase.color],
                  )}
                />
                <span className="min-w-0 truncate text-xs font-semibold">{phase.name}</span>
              </div>
              <p className="mt-1 truncate text-[10px] tabular-nums text-of-muted">
                {scheduleLabel(phase)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-y border-of-border px-4 py-5 text-xs text-of-muted">
          이 프로젝트에서 사용할 수 있는 단계 정의가 없습니다.
        </p>
      )}

      <div className="flex min-w-0 items-start gap-2 border-b border-of-border py-2.5 pl-4 pr-16">
        <CalendarCheck2 size={14} className="mt-0.5 shrink-0 text-of-accent" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">워크스페이스 근무일 자동 일정</p>
          <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
            종료일 저장이나 완전한 일정의 단계 활성화 시 후속 활성 단계를 다음 유효
            근무일부터 배치합니다.
          </p>
        </div>
      </div>

      {available.length > 0 ? (
        <ol className="divide-y divide-of-border">
          {available.map((phase) => (
            <EditablePhaseRow
              key={phase.key}
              phase={phase}
              projectId={projectId}
              canEdit={canEdit}
              expanded={expandedKeys.has(phase.key)}
              onExpandedChange={(expanded) => setExpanded(phase.key, expanded)}
              onDirtyChange={markDirty}
              onRefreshPhase={refreshPhase}
            />
          ))}
        </ol>
      ) : null}

      {retired.length > 0 ? (
        <div className="border-t border-of-border px-4 py-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <Archive size={13} aria-hidden="true" /> 은퇴한 Workspace 단계
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-of-muted">
            기존 프로젝트 값은 손실 없이 보존됩니다. Workspace 관리자가 복원하기 전에는
            변경하거나 자동 일정에 사용할 수 없습니다.
          </p>
          <ul className="mt-2 divide-y divide-of-border border-y border-of-border">
            {retired.map((phase) => (
              <li key={phase.key} className="flex min-w-0 items-center gap-3 py-3 text-xs">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full opacity-60',
                    MARK_STYLES[phase.color],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{phase.name}</p>
                  <p className="mt-0.5 truncate text-[10px] tabular-nums text-of-muted">
                    {phase.start_date ?? '미정'} - {phase.end_date ?? '미정'} · version{' '}
                    {phase.version}
                  </p>
                </div>
                <Badge variant="neutral">보존됨</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
