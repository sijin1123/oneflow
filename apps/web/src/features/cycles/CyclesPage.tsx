import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMe, useMembers } from '@/features/members/api'
import { confirmDestructive } from '@/lib/guards'

import {
  type Cycle,
  useCreateCycle,
  useCycles,
  useDeleteCycle,
  useRolloverCycle,
  useUpdateCycle,
  useCycleBurndown,
} from './api'

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

function BurndownChart({ projectId, cycleId }: { projectId: string; cycleId: string }) {
  const { data, isPending, isError } = useCycleBurndown(projectId, cycleId)
  if (isPending) return <p className="px-3 pb-2 text-[11px] text-of-muted">불러오는 중…</p>
  if (isError) return <p className="px-3 pb-2 text-[11px] text-of-danger">번다운을 불러오지 못했습니다.</p>
  if (data.days.length === 0)
    return <p className="px-3 pb-2 text-[11px] text-of-muted">표시할 기간 데이터가 없습니다.</p>

  const W = 100
  const H = 48
  const maxY = Math.max(data.total_scope, 1)
  const x = (i: number) => (data.days.length === 1 ? 0 : (i / (data.days.length - 1)) * W)
  const y = (v: number) => H - (v / maxY) * H
  const actual = data.days.map((d, i) => `${x(i)},${y(d.remaining)}`).join(' ')

  return (
    <div className="px-3 pb-2" data-testid="burndown-chart">
      <p className="mb-1 text-[10px] text-of-muted">
        번다운 (현재 배정 기준 · 전체 {data.total_scope}건)
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full">
        {/* ideal: total scope on day 1 → 0 at the end */}
        <line x1={0} y1={y(data.total_scope)} x2={W} y2={y(0)} strokeDasharray="3 2" className="stroke-of-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={actual} fill="none" className="stroke-of-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-of-muted">
        <span>{data.days[0].date}</span>
        <span>{data.days[data.days.length - 1].date}</span>
      </div>
    </div>
  )
}

function CycleRow({
  cycle,
  isOwner,
  projectId,
  others,
}: {
  cycle: Cycle
  isOwner: boolean
  projectId: string
  others: Cycle[]
}) {
  const navigate = useNavigate()
  const update = useUpdateCycle(projectId)
  const remove = useDeleteCycle(projectId)
  const rollover = useRolloverCycle(projectId)
  const [editing, setEditing] = useState(false)
  const [showBurndown, setShowBurndown] = useState(false)
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
      {isOwner && cycle.status === 'completed' && others.length > 0 ? (
        <Select
          aria-label={`${cycle.name} 미완료 이월`}
          className="h-7 w-36 text-xs"
          value=""
          disabled={rollover.isPending}
          onChange={(e) => {
            const target = others.find((c) => c.id === e.target.value)
            if (!target) return
            const openCount = cycle.work_package_count - cycle.done_work_package_count
            if (
              confirmDestructive(
                `'${cycle.name}'의 미완료 작업 ${openCount}건을 '${target.name}'(으)로 이월할까요?\n(반대 방향 이월로 언제든 되돌릴 수 있습니다)`,
              )
            )
              rollover.mutate({ cycleId: cycle.id, targetCycleId: target.id })
          }}
        >
          <option value="">미완료 이월…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      ) : null}
      <button
        type="button"
        aria-label={`${cycle.name} 번다운`}
        className="shrink-0 rounded-of border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted hover:bg-of-surface-2"
        onClick={() => setShowBurndown((v) => !v)}
      >
        번다운
      </button>
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
      {showBurndown ? (
        <div className="w-full">
          <BurndownChart projectId={projectId} cycleId={cycle.id} />
        </div>
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
                    <CycleRow
                      key={c.id}
                      cycle={c}
                      isOwner={isOwner}
                      projectId={projectId}
                      others={items.filter((o) => o.id !== c.id)}
                    />
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
