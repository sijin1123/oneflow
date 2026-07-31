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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import {
  getMemberRequestState,
  isMemberRequestAccepted,
} from '@/features/members/api'
import {
  getProjectPhaseRequestState,
  getProjectRequestState,
  isProjectPhaseRequestAccepted,
  isProjectRequestAccepted,
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
    if (error.message === 'phase version conflict') {
      return '다른 변경이 먼저 저장되었습니다. 최신 버전으로 같은 변경을 다시 시도할 수 있습니다.'
    }
    if (error.message === 'project is archived') {
      return '프로젝트가 보관되어 단계를 변경할 수 없습니다.'
    }
    if (error.message === 'phase is retired') {
      return '이 단계가 Workspace에서 은퇴해 더 이상 변경할 수 없습니다.'
    }
    return '프로젝트와 단계 상태가 변경되었습니다. 최신 상태를 확인해 주세요.'
  }
  if (error.status === 403) return '프로젝트 소유자만 단계를 변경할 수 있습니다.'
  if (error.status === 422) return '활성 단계의 날짜와 순서를 확인해 주세요.'
  return error.message || '단계를 저장하지 못했습니다. 다시 시도해 주세요.'
}

function isPhaseVersionConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message === 'phase version conflict'
  )
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
  actionsEnabled,
  actionsFresh,
}: {
  phase: ProjectPhase
  projectId: string
  canEdit: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onDirtyChange: (key: string, dirty: boolean) => void
  onRefreshPhase: (key: string) => Promise<ProjectPhase | undefined>
  actionsEnabled: boolean
  actionsFresh: () => boolean
}) {
  const update = useUpdateProjectPhase(projectId)
  const [startDate, setStartDate] = useState(phase.start_date ?? '')
  const [endDate, setEndDate] = useState(phase.end_date ?? '')
  const [scheduleBaseline, setScheduleBaseline] = useState({
    startDate: phase.start_date ?? '',
    endDate: phase.end_date ?? '',
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<PhaseRetryAction | null>(null)
  const [pendingAction, setPendingAction] = useState<PhaseAction['kind'] | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(false)

  const dirty =
    editingSchedule &&
    (startDate !== scheduleBaseline.startDate ||
      endDate !== scheduleBaseline.endDate)
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)

  useEffect(() => {
    if (editingSchedule || retryAction) return
    setStartDate(phase.start_date ?? '')
    setEndDate(phase.end_date ?? '')
    setScheduleBaseline({
      startDate: phase.start_date ?? '',
      endDate: phase.end_date ?? '',
    })
  }, [editingSchedule, phase.end_date, phase.start_date, phase.version, retryAction])

  useEffect(() => {
    onDirtyChange(phase.key, dirty)
    return () => onDirtyChange(phase.key, false)
  }, [dirty, onDirtyChange, phase.key])

  const runMutation = (input: PhaseMutationInput, action: PhaseAction) => {
    if (!canEdit || !actionsFresh()) return
    update.reset()
    setRetryAction(null)
    setNotice(null)
    setPendingAction(action.kind)
    update.mutate(input, {
      onSuccess: (updated) => {
        if (action.kind === 'schedule') {
          setStartDate(updated.start_date ?? '')
          setEndDate(updated.end_date ?? '')
          setScheduleBaseline({
            startDate: updated.start_date ?? '',
            endDate: updated.end_date ?? '',
          })
          setEditingSchedule(false)
        }
        setNotice(successMessage(phase, updated, action))
      },
      onError: () => setRetryAction({ input, action }),
      onSettled: () => setPendingAction(null),
    })
  }

  const retryLastAction = async () => {
    if (
      !retryAction ||
      !canEdit ||
      update.isPending ||
      retrying ||
      !actionsFresh()
    ) {
      return
    }
    setRetrying(true)
    try {
      let version = phase.version
      if (
        update.error instanceof ApiError &&
        (update.error.status === 409 || update.error.status === 403)
      ) {
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
            disabled={!canEdit || !actionsEnabled || update.isPending || retrying || dirty}
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
                disabled={!canEdit || !phase.active || update.isPending || retrying}
                aria-label={`${phase.name} 시작일`}
                className="mt-1 text-xs"
                onChange={(event) => {
                  const nextStartDate = event.target.value
                  setNotice(null)
                  setStartDate(nextStartDate)
                  setEditingSchedule(
                    nextStartDate !== scheduleBaseline.startDate ||
                      endDate !== scheduleBaseline.endDate,
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
                disabled={!canEdit || !phase.active || update.isPending || retrying}
                aria-label={`${phase.name} 종료일`}
                className="mt-1 text-xs"
                onChange={(event) => {
                  const nextEndDate = event.target.value
                  setNotice(null)
                  setEndDate(nextEndDate)
                  setEditingSchedule(
                    startDate !== scheduleBaseline.startDate ||
                      nextEndDate !== scheduleBaseline.endDate,
                  )
                }}
              />
            </label>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  !dirty ||
                  invalidRange ||
                  !actionsEnabled ||
                  update.isPending ||
                  retrying
                }
                onClick={() =>
                  runMutation(
                    {
                      phaseKey: phase.key,
                      ...(startDate !== scheduleBaseline.startDate
                        ? { start_date: startDate || null }
                        : {}),
                      ...(endDate !== scheduleBaseline.endDate
                        ? { end_date: endDate || null }
                        : {}),
                      version: phase.version,
                    },
                    {
                      kind: 'schedule',
                      willReschedule:
                        Boolean(endDate) && endDate !== scheduleBaseline.endDate,
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
                    disabled={
                      !canEdit ||
                      !actionsEnabled ||
                      update.isPending ||
                      retrying ||
                      dirty
                    }
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
              disabled={!canEdit || !actionsEnabled || update.isPending || retrying}
              onClick={() => void retryLastAction()}
            >
              {retrying ? (
                <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={13} aria-hidden="true" />
              )}
              {isPhaseVersionConflict(update.error)
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
  permissionsFresh,
  permissionsDataUpdatedAt,
  permissionsFetching,
  permissionsError,
  onRefreshPermissions,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  permissionsFresh: boolean
  permissionsDataUpdatedAt: number
  permissionsFetching: boolean
  permissionsError: boolean
  onRefreshPermissions: () => Promise<unknown>
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const phases = useProjectPhases(projectId)
  const dirtyKeys = useRef(new Set<string>())
  const initializedExpansion = useRef(false)
  const phasesFreshRef = useRef(false)
  const projectFreshRef = useRef(false)
  const permissionsFreshRef = useRef(false)
  const committedPhaseVersionRef = useRef(0)
  const committedProjectVersionRef = useRef(0)
  const committedPermissionVersionRef = useRef(0)
  const canEditRef = useRef(false)
  const freshWaitersRef = useRef<Array<() => void>>([])
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const phasesFresh = Boolean(
    phases.data &&
      !phases.isFetching &&
      !phases.isError &&
      isProjectPhaseRequestAccepted(projectId),
  )
  const projectFresh = Boolean(
    project.data &&
      !project.isFetching &&
      !project.isError &&
      isProjectRequestAccepted(projectId),
  )
  const surfaceFresh = phasesFresh && projectFresh && permissionsFresh
  const canEdit =
    isOwner &&
    !project.isError &&
    !phases.isError &&
    !permissionsError &&
    !project.data?.archived_at

  useLayoutEffect(() => {
    phasesFreshRef.current = phasesFresh
    projectFreshRef.current = projectFresh
    permissionsFreshRef.current = permissionsFresh
    canEditRef.current = canEdit
    if (phasesFresh) {
      committedPhaseVersionRef.current =
        getProjectPhaseRequestState(projectId).requestVersion
    }
    if (projectFresh) {
      committedProjectVersionRef.current =
        getProjectRequestState(projectId).requestVersion
    }
    if (permissionsFresh) {
      committedPermissionVersionRef.current =
        getMemberRequestState(projectId).requestVersion
    }
    if (
      (surfaceFresh || phases.isError || project.isError || permissionsError) &&
      freshWaitersRef.current.length > 0
    ) {
      const waiters = freshWaitersRef.current
      freshWaitersRef.current = []
      waiters.forEach((resolve) => resolve())
    }
  }, [
    permissionsDataUpdatedAt,
    permissionsError,
    permissionsFresh,
    canEdit,
    phases.dataUpdatedAt,
    phasesFresh,
    phases.isError,
    project.dataUpdatedAt,
    projectFresh,
    project.isError,
    projectId,
    surfaceFresh,
  ])

  useEffect(
    () => () => {
      onDirtyChange(false)
      const waiters = freshWaitersRef.current
      freshWaitersRef.current = []
      waiters.forEach((resolve) => resolve())
    },
    [onDirtyChange],
  )

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

  const actionsFresh = useCallback(() => {
    const phaseRequest = getProjectPhaseRequestState(projectId)
    const projectRequest = getProjectRequestState(projectId)
    const permissionRequest = getMemberRequestState(projectId)
    return Boolean(
      phasesFreshRef.current &&
        projectFreshRef.current &&
        permissionsFreshRef.current &&
        canEditRef.current &&
        phaseRequest.requestVersion === committedPhaseVersionRef.current &&
        projectRequest.requestVersion === committedProjectVersionRef.current &&
        permissionRequest.requestVersion === committedPermissionVersionRef.current &&
        isProjectPhaseRequestAccepted(projectId) &&
        isProjectRequestAccepted(projectId) &&
        isMemberRequestAccepted(projectId),
    )
  }, [projectId])

  const waitForSurfaceFresh = useCallback(() => {
    if (actionsFresh()) return Promise.resolve()
    return new Promise<void>((resolve) => {
      freshWaitersRef.current.push(resolve)
    })
  }, [actionsFresh])

  const refreshPhase = useCallback(
    async (key: string) => {
      phasesFreshRef.current = false
      projectFreshRef.current = false
      permissionsFreshRef.current = false
      const [refreshed] = await Promise.all([
        phases.refetch(),
        project.refetch(),
        onRefreshPermissions(),
      ])
      if (refreshed.isError || !refreshed.data) return undefined
      await waitForSurfaceFresh()
      if (!actionsFresh()) return undefined
      return refreshed.data.items.find((phase) => phase.key === key && !phase.retired)
    },
    [
      actionsFresh,
      onRefreshPermissions,
      phases,
      project,
      waitForSurfaceFresh,
    ],
  )

  const refreshAll = () => {
    phasesFreshRef.current = false
    projectFreshRef.current = false
    permissionsFreshRef.current = false
    return Promise.all([
      phases.refetch(),
      project.refetch(),
      onRefreshPermissions(),
    ])
  }
  const refreshPhases = () => {
    phasesFreshRef.current = false
    return phases.refetch()
  }
  const refreshProject = () => {
    projectFreshRef.current = false
    return project.refetch()
  }
  const refreshPermissions = () => {
    permissionsFreshRef.current = false
    return onRefreshPermissions()
  }

  if (
    (phases.isPending && !phases.data) ||
    (project.isPending && !project.data)
  ) {
    return (
      <section aria-label="프로젝트 단계 설정" className="min-w-0">
        <ListSkeleton />
      </section>
    )
  }
  if (!phases.data) {
    return (
      <ErrorState
        error={phases.error}
        onRetry={() => void phases.refetch()}
      />
    )
  }
  if (!project.data) {
    return (
      <ErrorState
        error={project.error}
        onRetry={() => void project.refetch()}
      />
    )
  }

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
      aria-busy={phases.isFetching || project.isFetching || permissionsFetching}
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={phases.isFetching || project.isFetching || permissionsFetching}
            onClick={() => void refreshAll()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={
                phases.isFetching || project.isFetching || permissionsFetching
                  ? 'animate-spin'
                  : undefined
              }
            />
            프로젝트 단계 새로고침
          </Button>
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
      </div>

      {phases.isError ? (
        <div
          role="alert"
          className="mx-3 mb-3 flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:mx-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2">
            <CircleAlert
              size={13}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-of-warning"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-of-text">
                최신 프로젝트 단계 목록을 불러오지 못했습니다.
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                마지막으로 확인한 단계와 저장하지 않은 일정 초안을 유지합니다.
                다시 확인할 때까지 변경은 차단됩니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={phases.isFetching}
            onClick={() => void refreshPhases()}
          >
            <RefreshCw size={13} aria-hidden="true" /> 프로젝트 단계 다시 시도
          </Button>
        </div>
      ) : null}

      {project.isError ? (
        <div
          role="alert"
          className="mx-3 mb-3 flex min-w-0 flex-col gap-2 border border-of-danger/25 bg-of-danger-soft/35 px-3 py-2.5 sm:mx-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2">
            <LockKeyhole
              size={13}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-of-danger"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-of-text">
                프로젝트 상태를 다시 확인하지 못했습니다.
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                단계와 일정은 계속 볼 수 있지만 활성화·일정·게이트 변경은
                상태 확인 전까지 차단됩니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={project.isFetching}
            onClick={() => void refreshProject()}
          >
            <RefreshCw size={13} aria-hidden="true" /> 프로젝트 상태 다시 시도
          </Button>
        </div>
      ) : null}

      {permissionsError ? (
        <div
          role="alert"
          className="mx-3 mb-3 flex min-w-0 flex-col gap-2 border border-of-danger/25 bg-of-danger-soft/35 px-3 py-2.5 sm:mx-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2">
            <LockKeyhole
              size={13}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-of-danger"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-of-text">
                프로젝트 권한을 다시 확인하지 못했습니다.
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                단계와 일정은 계속 볼 수 있지만 활성화·일정·게이트 변경은
                권한 확인 전까지 차단됩니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={permissionsFetching}
            onClick={() => void refreshPermissions()}
          >
            <RefreshCw size={13} aria-hidden="true" /> 프로젝트 권한 다시 시도
          </Button>
        </div>
      ) : null}

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
              actionsEnabled={surfaceFresh}
              actionsFresh={actionsFresh}
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
