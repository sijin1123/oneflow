import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Flag,
  LoaderCircle,
  Lock,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import {
  InlineActionMenu,
  type InlineActionMenuItem,
} from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type Milestone,
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useUpdateMilestone,
} from '@/features/milestones/api'
import { useProject } from '@/features/projects/api'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

type MilestoneInput = { name: string; due_date: string | null }
type MilestoneUpdateInput = MilestoneInput & { milestoneId: string }

function milestoneProgress(milestone: Milestone) {
  const total = milestone.work_package_count ?? 0
  const done = milestone.done_work_package_count ?? 0
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  }
}

function isOverdue(milestone: Milestone) {
  if (!milestone.due_date) return false
  const { total, done } = milestoneProgress(milestone)
  const complete = total > 0 && done >= total
  return (
    !complete &&
    new Date(`${milestone.due_date}T23:59:59`).getTime() < Date.now()
  )
}

function ProgressBar({ milestone }: { milestone: Milestone }) {
  const { total, done, percent } = milestoneProgress(milestone)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${milestone.name} 진행률`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-of-surface-2 sm:w-24 sm:flex-none"
      >
        <span
          className="block h-full rounded-full bg-of-accent"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
        {done}/{total}
      </span>
    </div>
  )
}

function MilestoneActions({
  milestone,
  canEdit,
  onOpenWork,
  onEdit,
  onDelete,
}: {
  milestone: Milestone
  canEdit: boolean
  onOpenWork: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const items: InlineActionMenuItem[] = [
    {
      label: '작업 목록 열기',
      ariaLabel: `${milestone.name} 작업 목록 열기`,
      icon: <ExternalLink size={14} />,
      onSelect: onOpenWork,
    },
    ...(canEdit
      ? [
          {
            label: '편집',
            ariaLabel: `${milestone.name} 편집`,
            icon: <Pencil size={14} />,
            onSelect: onEdit,
          },
          {
            label: '삭제',
            ariaLabel: `${milestone.name} 삭제`,
            icon: <Trash2 size={14} />,
            tone: 'danger' as const,
            onSelect: onDelete,
          },
        ]
      : [
          {
            label: '쓰기 권한 없음',
            ariaLabel: `${milestone.name} 쓰기 권한 없음`,
            icon: <Lock size={14} />,
            disabled: true,
            onSelect: () => undefined,
          },
        ]),
  ]

  return (
    <InlineActionMenu
      label={`${milestone.name} 마일스톤 작업`}
      menuLabel={`${milestone.name} 마일스톤 작업 메뉴`}
      items={items}
    />
  )
}

function MilestoneRow({
  milestone,
  projectId,
  canEdit,
  onDirtyChange,
}: {
  milestone: Milestone
  projectId: string
  canEdit: boolean
  onDirtyChange: (milestoneId: string, dirty: boolean) => void
}) {
  const navigate = useNavigate()
  const updateMilestone = useUpdateMilestone(projectId)
  const deleteMilestone = useDeleteMilestone(projectId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(milestone.name)
  const [dueDate, setDueDate] = useState(milestone.due_date ?? '')
  const [updateRetry, setUpdateRetry] = useState<MilestoneUpdateInput | null>(
    null,
  )
  const [deleteRetry, setDeleteRetry] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const dirty =
    editing &&
    (name.trim() !== milestone.name || dueDate !== (milestone.due_date ?? ''))

  useEffect(() => {
    onDirtyChange(milestone.id, dirty)
  }, [dirty, milestone.id, onDirtyChange])
  useEffect(
    () => () => {
      onDirtyChange(milestone.id, false)
    },
    [milestone.id, onDirtyChange],
  )

  const openWork = () =>
    navigate(
      `/projects/${projectId}/work-packages?milestone_id=${milestone.id}`,
    )

  const resetDraft = () => {
    setName(milestone.name)
    setDueDate(milestone.due_date ?? '')
    setEditing(false)
    setUpdateRetry(null)
    updateMilestone.reset()
  }

  const updateDraft = (field: 'name' | 'dueDate', value: string) => {
    if (field === 'name') setName(value)
    else setDueDate(value)
    setUpdateRetry(null)
    setMessage('')
    updateMilestone.reset()
  }

  const submitUpdate = (input: MilestoneUpdateInput) => {
    setMessage('')
    setUpdateRetry(input)
    updateMilestone.mutate(input, {
      onSuccess: (saved) => {
        setName(saved.name)
        setDueDate(saved.due_date ?? '')
        setEditing(false)
        setUpdateRetry(null)
        setMessage('마일스톤을 저장했습니다.')
      },
    })
  }

  const submitDelete = (milestoneId: string) => {
    setMessage('')
    setDeleteRetry(milestoneId)
    deleteMilestone.mutate(milestoneId, {
      onSuccess: () => {
        setDeleteRetry(null)
        setMessage('마일스톤을 삭제했습니다.')
      },
    })
  }

  const deleteMessage = `'${milestone.name}' 마일스톤을 삭제할까요?\n연결된 작업 ${
    milestone.work_package_count ?? 0
  }건은 삭제되지 않고 배정만 해제됩니다.`

  return (
    <li className="min-w-0 border-b border-of-border last:border-b-0">
      {editing ? (
        <div className="grid min-w-0 gap-2 bg-of-surface-2/45 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
          <Input
            value={name}
            onChange={(event) => updateDraft('name', event.target.value)}
            aria-label="마일스톤 이름 편집"
            className="h-8 min-w-0 text-xs"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => updateDraft('dueDate', event.target.value)}
            aria-label="마일스톤 기한 편집"
            className="h-8"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!name.trim() || updateMilestone.isPending}
              onClick={() =>
                submitUpdate({
                  milestoneId: milestone.id,
                  name: name.trim(),
                  due_date: dueDate || null,
                })
              }
            >
              {updateMilestone.isPending ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              {updateMilestone.isPending ? '저장 중' : '저장'}
            </Button>
            <Button size="sm" variant="outline" onClick={resetDraft}>
              취소
            </Button>
          </div>
          {updateMilestone.isError ? (
            <div
              role="alert"
              className="flex min-w-0 flex-col gap-2 text-xs text-of-danger sm:col-span-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>저장하지 못했습니다. 입력 내용은 유지됩니다.</span>
              {updateRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateMilestone.isPending}
                  onClick={() => submitUpdate(updateRetry)}
                >
                  <RefreshCw size={13} aria-hidden="true" /> 같은 내용으로 다시
                  시도
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left hover:text-of-accent"
            onClick={openWork}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-of border',
                isOverdue(milestone)
                  ? 'border-of-warning/30 bg-of-warning-soft text-of-warning'
                  : 'border-of-border bg-of-surface-2 text-of-muted',
              )}
            >
              <Flag size={14} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {milestone.name}
              </span>
              <span className="mt-0.5 block text-[10px] text-of-muted sm:hidden">
                {milestone.due_date ?? '기한 없음'}
              </span>
            </span>
          </button>
          <span
            className={cn(
              'hidden items-center gap-1 text-[11px] tabular-nums sm:flex',
              isOverdue(milestone) ? 'text-of-warning' : 'text-of-muted',
            )}
          >
            <CalendarDays size={13} aria-hidden="true" />
            {milestone.due_date ?? '기한 없음'}
          </span>
          <ProgressBar milestone={milestone} />
          <MilestoneActions
            milestone={milestone}
            canEdit={canEdit}
            onOpenWork={openWork}
            onEdit={() => {
              setName(milestone.name)
              setDueDate(milestone.due_date ?? '')
              setMessage('')
              setEditing(true)
            }}
            onDelete={() => {
              if (confirmDestructive(deleteMessage)) submitDelete(milestone.id)
            }}
          />
        </div>
      )}
      {deleteMilestone.isError ? (
        <div
          role="alert"
          className="flex min-w-0 flex-col gap-2 border-t border-of-danger/15 bg-of-danger-soft/35 px-3 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            삭제하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도하세요.
          </span>
          {deleteRetry ? (
            <Button
              size="sm"
              variant="outline"
              disabled={deleteMilestone.isPending}
              onClick={() => submitDelete(deleteRetry)}
            >
              <RefreshCw size={13} aria-hidden="true" /> 삭제 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className="border-t border-of-success/15 bg-of-success-soft/35 px-3 py-2 text-xs text-of-success"
        >
          {message}
        </p>
      ) : null}
    </li>
  )
}

export function MilestonesPanel({
  projectId,
  canManage,
  onDirtyChange,
}: {
  projectId: string
  canManage: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const milestones = useMilestones(projectId)
  const createMilestone = useCreateMilestone(projectId)
  const [msName, setMsName] = useState('')
  const [msDue, setMsDue] = useState('')
  const [createRetry, setCreateRetry] = useState<MilestoneInput | null>(null)
  const [createMessage, setCreateMessage] = useState('')
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set())
  const canEdit = canManage && !project.data?.archived_at
  const createDirty = msName.trim() !== '' || msDue !== ''

  const markRowDirty = useCallback((milestoneId: string, dirty: boolean) => {
    setDirtyRows((current) => {
      const next = new Set(current)
      if (dirty) next.add(milestoneId)
      else next.delete(milestoneId)
      return next
    })
  }, [])

  useEffect(() => {
    onDirtyChange(createDirty || dirtyRows.size > 0)
  }, [createDirty, dirtyRows, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const summary = useMemo(() => {
    const items = milestones.data?.items ?? []
    return items.reduce(
      (total, milestone) => {
        const progress = milestoneProgress(milestone)
        total.work += progress.total
        total.done += progress.done
        if (isOverdue(milestone)) total.overdue += 1
        return total
      },
      { work: 0, done: 0, overdue: 0 },
    )
  }, [milestones.data?.items])

  const updateCreateDraft = (field: 'name' | 'dueDate', value: string) => {
    if (field === 'name') setMsName(value)
    else setMsDue(value)
    setCreateRetry(null)
    setCreateMessage('')
    createMilestone.reset()
  }

  const submitCreate = (input: MilestoneInput) => {
    setCreateMessage('')
    setCreateRetry(input)
    createMilestone.mutate(input, {
      onSuccess: () => {
        setMsName('')
        setMsDue('')
        setCreateRetry(null)
        setCreateMessage('마일스톤을 추가했습니다.')
      },
    })
  }

  if (milestones.isPending || project.isPending) {
    return (
      <section aria-label="마일스톤 설정" className="min-w-0">
        <ListSkeleton rows={5} />
      </section>
    )
  }
  if (milestones.isError) {
    return (
      <ErrorState
        error={milestones.error}
        onRetry={() => void milestones.refetch()}
      />
    )
  }
  if (project.isError) {
    return (
      <ErrorState
        error={project.error}
        onRetry={() => void project.refetch()}
      />
    )
  }

  return (
    <section
      aria-label="마일스톤 설정"
      className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
    >
      <header className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">
            Project milestones
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <Flag size={15} aria-hidden="true" /> 릴리스 기준점
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            기한과 연결 작업의 진행률을 한 곳에서 확인하고 관리합니다.
          </p>
        </div>
        <Badge variant={canEdit ? 'accent' : 'outline'} className="self-start">
          {canEdit ? (
            `${milestones.data.total}개 관리 중`
          ) : (
            <>
              <LockKeyhole size={12} aria-hidden="true" /> 읽기 전용
            </>
          )}
        </Badge>
      </header>

      <div
        role="list"
        aria-label="마일스톤 요약"
        className="grid grid-cols-3 gap-px border-y border-of-border bg-of-border"
      >
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">마일스톤</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {milestones.data.total}
          </p>
        </div>
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">연결 작업 완료</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {summary.done}/{summary.work}
          </p>
        </div>
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">기한 초과</p>
          <p
            className={cn(
              'mt-1 text-sm font-semibold tabular-nums',
              summary.overdue > 0 && 'text-of-warning',
            )}
          >
            {summary.overdue}
          </p>
        </div>
      </div>

      {project.data.archived_at ? (
        <p className="border-b border-of-warning/40 bg-of-warning/5 px-4 py-2 text-xs leading-5 text-of-muted">
          보관된 프로젝트의 마일스톤은 조회할 수 있지만 변경할 수 없습니다.
        </p>
      ) : null}

      {canEdit ? (
        <div className="border-b border-of-border bg-of-surface-2/35 px-3 py-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
            <Input
              value={msName}
              onChange={(event) =>
                updateCreateDraft('name', event.target.value)
              }
              placeholder="새 마일스톤 이름"
              aria-label="마일스톤 이름"
              className="h-8 min-w-0 text-xs"
            />
            <Input
              type="date"
              value={msDue}
              onChange={(event) =>
                updateCreateDraft('dueDate', event.target.value)
              }
              aria-label="마일스톤 기한"
              className="h-8"
            />
            <Button
              size="sm"
              disabled={!msName.trim() || createMilestone.isPending}
              onClick={() =>
                submitCreate({ name: msName.trim(), due_date: msDue || null })
              }
            >
              {createMilestone.isPending ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {createMilestone.isPending ? '추가 중' : '추가'}
            </Button>
          </div>
          {createMilestone.isError ? (
            <div
              role="alert"
              className="mt-2 flex min-w-0 flex-col gap-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>추가하지 못했습니다. 입력 내용은 유지됩니다.</span>
              {createRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={createMilestone.isPending}
                  onClick={() => submitCreate(createRetry)}
                >
                  <RefreshCw size={13} aria-hidden="true" /> 같은 내용으로 다시
                  시도
                </Button>
              ) : null}
            </div>
          ) : null}
          {createMessage ? (
            <p
              role="status"
              className="mt-2 flex items-center gap-1 text-xs text-of-success"
            >
              <CheckCircle2 size={13} aria-hidden="true" /> {createMessage}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="border-b border-of-border bg-of-surface-2/45 px-4 py-2 text-xs text-of-muted">
          쓰기 권한이 없어 마일스톤 변경 작업은 숨겨졌습니다.
        </p>
      )}

      {milestones.data.total > 0 ? (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_2rem] gap-3 border-b border-of-border bg-of-surface-2/30 px-3 py-2 text-[10px] font-medium uppercase text-of-muted sm:grid">
            <span>마일스톤</span>
            <span>기한</span>
            <span>진행률</span>
            <span className="sr-only">작업</span>
          </div>
          <ul aria-label="마일스톤 목록" className="min-w-0">
            {milestones.data.items.map((milestone) => (
              <MilestoneRow
                key={milestone.id}
                milestone={milestone}
                projectId={projectId}
                canEdit={canEdit}
                onDirtyChange={markRowDirty}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title="마일스톤이 없습니다"
          hint={
            canEdit
              ? '이름과 기한을 입력해 첫 릴리스 기준점을 만드세요.'
              : '아직 등록된 릴리스 기준점이 없습니다.'
          }
          className="min-h-[190px] py-8"
        />
      )}
    </section>
  )
}
