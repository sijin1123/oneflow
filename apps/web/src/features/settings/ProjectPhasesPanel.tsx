import { CalendarDays, LockKeyhole, RotateCcw, Save } from 'lucide-react'
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

function mutationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '단계를 저장하지 못했습니다. 다시 시도해 주세요.'
  if (error.status === 409) return '다른 변경이 먼저 저장되었습니다. 최신 일정을 확인해 주세요.'
  if (error.status === 403) return '프로젝트 소유자만 단계를 변경할 수 있습니다.'
  if (error.status === 422) return '활성 단계의 날짜와 순서를 확인해 주세요.'
  return '단계를 저장하지 못했습니다. 다시 시도해 주세요.'
}

function EditablePhaseRow({
  phase,
  projectId,
  canEdit,
  onDirtyChange,
}: {
  phase: ProjectPhase
  projectId: string
  canEdit: boolean
  onDirtyChange: (key: string, dirty: boolean) => void
}) {
  const update = useUpdateProjectPhase(projectId)
  const [startDate, setStartDate] = useState(phase.start_date ?? '')
  const [endDate, setEndDate] = useState(phase.end_date ?? '')

  useEffect(() => {
    setStartDate(phase.start_date ?? '')
    setEndDate(phase.end_date ?? '')
  }, [phase.end_date, phase.start_date, phase.version])

  const dirty = startDate !== (phase.start_date ?? '') || endDate !== (phase.end_date ?? '')
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)

  useEffect(() => {
    onDirtyChange(phase.key, dirty)
    return () => onDirtyChange(phase.key, false)
  }, [dirty, onDirtyChange, phase.key])

  const pendingForRow = update.isPending && update.variables?.phaseKey === phase.key

  return (
    <li className="border-b border-of-border py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', MARK_STYLES[phase.color])} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{phase.name}</p>
              <p className="mt-0.5 text-[11px] text-of-muted">{phase.position + 1}번째 단계</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={phase.active ? 'success' : 'neutral'}>
                {phase.active ? '활성' : '비활성'}
              </Badge>
              <Switch
                checked={phase.active}
                label={`${phase.name} 단계 ${phase.active ? '비활성화' : '활성화'}`}
                disabled={!canEdit || pendingForRow || dirty}
                onCheckedChange={(active) =>
                  update.mutate({ phaseKey: phase.key, active, version: phase.version })
                }
              />
            </div>
          </div>

          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="min-w-0 text-[11px] font-medium text-of-muted">
              시작일
              <Input
                type="date"
                value={startDate}
                readOnly={!canEdit}
                disabled={!phase.active || pendingForRow}
                aria-label={`${phase.name} 시작일`}
                className="mt-1 text-xs"
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="min-w-0 text-[11px] font-medium text-of-muted">
              종료일
              <Input
                type="date"
                value={endDate}
                readOnly={!canEdit}
                disabled={!phase.active || pendingForRow}
                aria-label={`${phase.name} 종료일`}
                className="mt-1 text-xs"
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!dirty || invalidRange || pendingForRow}
                onClick={() =>
                  update.mutate({
                    phaseKey: phase.key,
                    start_date: startDate || null,
                    end_date: endDate || null,
                    version: phase.version,
                  })
                }
              >
                <Save size={13} /> 저장
              </Button>
            ) : null}
          </div>

          {invalidRange ? (
            <p role="alert" className="mt-2 text-xs text-of-danger">종료일은 시작일보다 빠를 수 없습니다.</p>
          ) : null}
          {update.isError ? (
            <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-of-danger">
              <span>{mutationMessage(update.error)}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => update.reset()}>
                <RotateCcw size={12} /> 확인
              </Button>
            </div>
          ) : null}
        </div>
      </div>
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
  const canEdit = isOwner && !project.data?.archived_at

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const markDirty = useCallback(
    (key: string, dirty: boolean) => {
      if (dirty) dirtyKeys.current.add(key)
      else dirtyKeys.current.delete(key)
      onDirtyChange(dirtyKeys.current.size > 0)
    },
    [onDirtyChange],
  )

  if (phases.isPending || project.isPending) return <ListSkeleton />
  if (phases.isError) return <ErrorState error={phases.error} onRetry={() => phases.refetch()} />
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />

  const activeCount = phases.data.items.filter((phase) => phase.active).length

  return (
    <section aria-label="프로젝트 단계 설정" className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 border-b border-of-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">Project lifecycle</p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays size={15} /> 프로젝트 단계
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            팀이 공유할 수명주기 단계를 선택하고 각 단계의 기간을 지정합니다. 비활성 단계의 날짜는 보존됩니다.
          </p>
        </div>
        <Badge variant={canEdit ? 'accent' : 'outline'} className="shrink-0">
          {canEdit ? (
            `활성 ${activeCount}/4`
          ) : (
            <>
              <LockKeyhole size={12} /> 읽기 전용
            </>
          )}
        </Badge>
      </div>

      {project.data.archived_at ? (
        <p className="mt-3 border-l-2 border-of-warning px-3 text-xs leading-5 text-of-muted">
          보관된 프로젝트의 단계와 일정은 변경할 수 없습니다.
        </p>
      ) : null}

      <ol className="mt-2">
        {phases.data.items.map((phase) => (
          <EditablePhaseRow
            key={phase.key}
            phase={phase}
            projectId={projectId}
            canEdit={canEdit}
            onDirtyChange={markDirty}
          />
        ))}
      </ol>
    </section>
  )
}
