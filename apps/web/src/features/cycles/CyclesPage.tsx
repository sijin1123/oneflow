import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe, useMembers } from '@/features/members/api'
import { confirmDestructive } from '@/lib/guards'

import { type Cycle, useCreateCycle, useCycles, useDeleteCycle, useUpdateCycle } from './api'

const GROUPS: Array<{ status: Cycle['status']; label: string }> = [
  { status: 'active', label: '진행 중' },
  { status: 'upcoming', label: '예정' },
  { status: 'completed', label: '완료' },
]

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-of-surface-2"
      >
        <div className="h-full rounded-full bg-of-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-of-muted">
        {done}/{total}
      </span>
    </div>
  )
}

function CycleRow({
  cycle,
  isOwner,
  projectId,
}: {
  cycle: Cycle
  isOwner: boolean
  projectId: string
}) {
  const navigate = useNavigate()
  const update = useUpdateCycle(projectId)
  const remove = useDeleteCycle(projectId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(cycle.name)
  const [start, setStart] = useState(cycle.start_date)
  const [end, setEnd] = useState(cycle.end_date)

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="사이클 이름 편집"
          className="h-7 w-40 text-xs"
        />
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label="시작일 편집"
          className="h-7 w-36 text-xs"
        />
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="종료일 편집"
          className="h-7 w-36 text-xs"
        />
        <Button
          size="sm"
          disabled={!name.trim() || !start || !end || update.isPending}
          onClick={() =>
            update.mutate(
              { cycleId: cycle.id, name: name.trim(), start_date: start, end_date: end },
              { onSuccess: () => setEditing(false) },
            )
          }
        >
          저장
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          취소
        </Button>
        {update.isError ? (
          <p role="alert" className="w-full text-xs text-of-danger">
            저장하지 못했습니다. 날짜 범위를 확인하세요.
          </p>
        ) : null}
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline"
        onClick={() => navigate(`/projects/${projectId}/work-packages?cycle_id=${cycle.id}`)}
      >
        {cycle.name}
      </button>
      <span className="shrink-0 text-[11px] text-of-muted">
        {cycle.start_date} ~ {cycle.end_date}
      </span>
      <ProgressBar done={cycle.done_work_package_count} total={cycle.work_package_count} />
      {isOwner ? (
        <>
          <button
            type="button"
            aria-label={`${cycle.name} 편집`}
            className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            aria-label={`${cycle.name} 삭제`}
            disabled={remove.isPending}
            className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
            onClick={() => {
              if (
                confirmDestructive(
                  `'${cycle.name}' 사이클을 삭제할까요?\n연결된 작업 ${cycle.work_package_count}건은 삭제되지 않고 사이클 배정만 해제됩니다.`,
                )
              )
                remove.mutate(cycle.id)
            }}
          >
            <Trash2 size={13} />
          </button>
        </>
      ) : null}
    </li>
  )
}

/* Project cycles/sprints (expansion PLAN Pass 1 PR-C): date-boxed iterations
   grouped by derived status, with per-cycle progress. Managing cycles is an
   owner action; assigning work happens in the work-package drawer. */
export function CyclesPage() {
  const { projectId } = useParams() as { projectId: string }
  const cycles = useCycles(projectId)
  const me = useMe()
  const members = useMembers(projectId)

  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const create = useCreateCycle(projectId)

  if (cycles.isPending || members.isPending) return <ListSkeleton />
  if (cycles.isError) return <ErrorState error={cycles.error} onRetry={() => cycles.refetch()} />

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = cycles.data.items

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-base font-semibold">사이클</h1>
      <p className="mb-4 text-xs text-of-muted">
        기간 단위(스프린트)로 작업을 묶어 진행률을 봅니다. 작업 배정은 각 작업의 드로어에서 합니다.
      </p>

      {isOwner ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-of border border-of-border bg-of-surface p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="사이클 이름"
            aria-label="새 사이클 이름"
            className="h-8 w-44 text-xs"
          />
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="새 사이클 시작일"
            className="h-8 w-36 text-xs"
          />
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="새 사이클 종료일"
            className="h-8 w-36 text-xs"
          />
          <Button
            size="sm"
            disabled={!name.trim() || !start || !end || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), start_date: start, end_date: end },
                {
                  onSuccess: () => {
                    setName('')
                    setStart('')
                    setEnd('')
                  },
                },
              )
            }
          >
            사이클 추가
          </Button>
          {create.isError ? (
            <p role="alert" className="w-full text-xs text-of-danger">
              생성하지 못했습니다. 날짜 범위를 확인하세요.
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="사이클이 없습니다"
          hint={isOwner ? '위에서 첫 사이클을 만들어 보세요.' : '소유자가 사이클을 만들 수 있습니다.'}
        />
      ) : (
        <div className="space-y-5">
          {GROUPS.map(({ status, label }) => {
            const group = items.filter((c) => c.status === status)
            if (group.length === 0) return null
            return (
              <section key={status} aria-label={label}>
                <h2 className="mb-1.5 text-sm font-semibold">
                  {label} <span className="text-xs font-normal text-of-muted">{group.length}</span>
                </h2>
                <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                  {group.map((c) => (
                    <CycleRow key={c.id} cycle={c} isOwner={isOwner} projectId={projectId} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
