import { CalendarDays, ExternalLink, Lock, Pencil, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { InlineActionMenu, type InlineActionMenuItem } from '@/components/ui/action-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type Milestone,
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useUpdateMilestone,
} from '@/features/milestones/api'
import { confirmDestructive } from '@/lib/guards'

function ProgressBar({ milestone }: { milestone: Milestone }) {
  const total = milestone.work_package_count ?? 0
  const done = milestone.done_work_package_count ?? 0
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${milestone.name} 진행률`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-of-surface-2 sm:w-24"
      >
        <span className="block h-full rounded-full bg-of-accent" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-[11px] text-of-muted">
        {done}/{total}
      </span>
    </div>
  )
}

function MilestoneActions({
  milestone,
  isOwner,
  onOpenWork,
  onEdit,
  onDelete,
}: {
  milestone: Milestone
  isOwner: boolean
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
    ...(isOwner
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
  isOwner,
}: {
  milestone: Milestone
  projectId: string
  isOwner: boolean
}) {
  const navigate = useNavigate()
  const updateMilestone = useUpdateMilestone(projectId)
  const deleteMilestone = useDeleteMilestone(projectId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(milestone.name)
  const [dueDate, setDueDate] = useState(milestone.due_date ?? '')

  const resetDraft = () => {
    setName(milestone.name)
    setDueDate(milestone.due_date ?? '')
    setEditing(false)
  }
  const deleteMessage = `'${milestone.name}' 마일스톤을 삭제할까요?\n연결된 작업 ${
    milestone.work_package_count ?? 0
  }건은 삭제되지 않고 배정만 해제됩니다.`

  if (editing) {
    return (
      <li className="rounded-of border border-of-border bg-of-surface px-2 py-2 text-xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="마일스톤 이름 편집"
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            aria-label="마일스톤 기한 편집"
            className="h-8 sm:w-36"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!name.trim() || updateMilestone.isPending}
              onClick={() =>
                updateMilestone.mutate(
                  {
                    milestoneId: milestone.id,
                    name: name.trim(),
                    due_date: dueDate || null,
                  },
                  { onSuccess: () => setEditing(false) },
                )
              }
            >
              <Save size={14} />
              저장
            </Button>
            <Button size="sm" variant="outline" onClick={resetDraft}>
              취소
            </Button>
          </div>
        </div>
        {updateMilestone.isError ? (
          <p role="alert" className="mt-1 text-xs text-of-danger">
            저장하지 못했습니다. 이름과 기한을 확인하세요.
          </p>
        ) : null}
      </li>
    )
  }

  return (
    <li className="rounded-of border border-of-border bg-of-surface px-2 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:text-of-accent hover:underline"
          onClick={() =>
            navigate(`/projects/${projectId}/work-packages?milestone_id=${milestone.id}`)
          }
        >
          {milestone.name}
        </button>
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-of-muted sm:inline-flex">
          <CalendarDays size={13} />
          {milestone.due_date ?? '기한 없음'}
        </span>
        <ProgressBar milestone={milestone} />
        <MilestoneActions
          milestone={milestone}
          isOwner={isOwner}
          onOpenWork={() =>
            navigate(`/projects/${projectId}/work-packages?milestone_id=${milestone.id}`)
          }
          onEdit={() => {
            setName(milestone.name)
            setDueDate(milestone.due_date ?? '')
            setEditing(true)
          }}
          onDelete={() => {
            if (confirmDestructive(deleteMessage)) deleteMilestone.mutate(milestone.id)
          }}
        />
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-of-muted sm:hidden">
        <CalendarDays size={13} />
        {milestone.due_date ?? '기한 없음'}
      </div>
      {deleteMilestone.isError ? (
        <p role="alert" className="mt-1 text-xs text-of-danger">
          삭제하지 못했습니다. 권한 또는 연결 상태를 확인하세요.
        </p>
      ) : null}
    </li>
  )
}

export function MilestonesPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const milestones = useMilestones(projectId)
  const createMilestone = useCreateMilestone(projectId)

  const [msName, setMsName] = useState('')
  const [msDue, setMsDue] = useState('')

  const dirty = msName.trim() !== '' || msDue !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  return (
    <div className="space-y-3 rounded-of border border-of-border bg-of-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium">마일스톤</p>
          <p className="text-[11px] text-of-muted">릴리스 기준점, 기한, 진행률과 연결 작업을 관리합니다.</p>
        </div>
        <span className="shrink-0 rounded-full bg-of-surface-2 px-2 py-0.5 text-[11px] text-of-muted">
          {milestones.data?.total ?? 0}개
        </span>
      </div>
      {milestones.isPending ? (
        <p className="rounded-of border border-dashed border-of-border px-3 py-2 text-xs text-of-muted">
          마일스톤을 불러오는 중입니다.
        </p>
      ) : milestones.data && milestones.data.total > 0 ? (
        <ul className="space-y-1.5">
          {milestones.data.items.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              milestone={milestone}
              projectId={projectId}
              isOwner={isOwner}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-of border border-dashed border-of-border px-3 py-2 text-xs text-of-muted">
          마일스톤이 없습니다.
        </p>
      )}
      {isOwner ? (
        <div className="flex flex-col gap-2 border-t border-of-border pt-3 sm:flex-row sm:items-center">
          <Input
            value={msName}
            onChange={(event) => setMsName(event.target.value)}
            placeholder="마일스톤 이름"
            aria-label="마일스톤 이름"
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Input
            type="date"
            value={msDue}
            onChange={(event) => setMsDue(event.target.value)}
            aria-label="마일스톤 기한"
            className="h-8 sm:w-36"
          />
          <Button
            size="sm"
            disabled={!msName.trim() || createMilestone.isPending}
            onClick={() =>
              createMilestone.mutate(
                { name: msName.trim(), due_date: msDue || null },
                {
                  onSuccess: () => {
                    setMsName('')
                    setMsDue('')
                  },
                },
              )
            }
          >
            추가
          </Button>
        </div>
      ) : (
        <p className="rounded-of bg-of-surface-2 px-3 py-2 text-xs text-of-muted">
          쓰기 권한이 없어 마일스톤 변경 작업은 숨겨졌습니다.
        </p>
      )}
    </div>
  )
}
