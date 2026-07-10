import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe, useMembers } from '@/features/members/api'
import { PlanningSurface } from '@/features/planning/PlanningSurface'

import {
  type Cycle,
  useCreateCycle,
  useCycles,
  useUpdateCycle,
  useCycleBurndown,
} from './api'
import { CycleItemActions } from './CycleItemActions'
import { recentVelocity } from './velocity'

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
  onMessage,
}: {
  cycle: Cycle
  isOwner: boolean
  projectId: string
  others: Cycle[]
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const navigate = useNavigate()
  const update = useUpdateCycle(projectId)
  const [editing, setEditing] = useState(false)
  const [showBurndown, setShowBurndown] = useState(false)
  const [activeAction, setActiveAction] = useState<{ top: number; left: number } | null>(null)
  const [name, setName] = useState(cycle.name)
  const [start, setStart] = useState(cycle.start_date)
  const [end, setEnd] = useState(cycle.end_date)

  const openActionMenu = (rect: DOMRect) => {
    const width = 240
    const height = 248
    const maxLeft = Math.max(8, window.innerWidth - width - 8)
    const maxTop = Math.max(8, window.innerHeight - height)
    const left = Math.min(Math.max(8, rect.right - width), maxLeft)
    const top = Math.min(Math.max(8, rect.bottom + 6), maxTop)
    setActiveAction({ top, left })
  }

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
    <li className="flex flex-wrap items-start gap-3 px-3 py-2">
      <div className="min-w-0 flex-1 space-y-1">
        <button
          type="button"
          className="block w-full truncate text-left text-[13px] font-medium hover:underline"
          onClick={() => navigate(`/projects/${projectId}/work-packages?cycle_id=${cycle.id}`)}
        >
          {cycle.name}
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="shrink-0 text-[11px] text-of-muted">
            {cycle.start_date} ~ {cycle.end_date}
          </span>
          <ProgressBar done={cycle.done_work_package_count} total={cycle.work_package_count} />
        </div>
      </div>
      <button
        type="button"
        aria-label={`${cycle.name} 사이클 작업`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-2 hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        onClick={(event) => openActionMenu(event.currentTarget.getBoundingClientRect())}
      >
        <MoreHorizontal size={14} />
      </button>
      {activeAction ? (
        <CycleItemActions
          cycle={cycle}
          projectId={projectId}
          isOwner={isOwner}
          others={others}
          top={activeAction.top}
          left={activeAction.left}
          onOpenWorkItems={(cycleId) =>
            navigate(`/projects/${projectId}/work-packages?cycle_id=${cycleId}`)
          }
          onEdit={() => setEditing(true)}
          onToggleBurndown={() => setShowBurndown((value) => !value)}
          onMessage={onMessage}
          onClose={() => setActiveAction(null)}
        />
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
  const [actionMessage, setActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)
  const description =
    '반복 기간으로 작업 범위를 묶고, 진행률과 이월 흐름을 계획 화면 안에서 이어 봅니다.'

  if (cycles.isPending || members.isPending) {
    return (
      <PlanningSurface projectId={projectId} active="cycles" title="사이클" description={description}>
        <ListSkeleton />
      </PlanningSurface>
    )
  }
  if (cycles.isError) {
    return (
      <PlanningSurface projectId={projectId} active="cycles" title="사이클" description={description}>
        <ErrorState error={cycles.error} onRetry={() => cycles.refetch()} />
      </PlanningSurface>
    )
  }

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = cycles.data.items
  const velocity = recentVelocity(items)
  const activeCount = items.filter((c) => c.status === 'active').length
  const plannedScope = items.reduce((total, c) => total + c.work_package_count, 0)
  const doneScope = items.reduce((total, c) => total + c.done_work_package_count, 0)

  return (
    <PlanningSurface
      projectId={projectId}
      active="cycles"
      title="사이클"
      description={description}
      metrics={[
        { label: '사이클', value: items.length, hint: '전체 기간' },
        { label: '진행 중', value: activeCount, hint: '현재 반복' },
        { label: '작업 범위', value: plannedScope, hint: `${doneScope}건 완료` },
        {
          label: '벨로시티',
          value: velocity ? velocity.average.toFixed(1) : '-',
          hint: velocity ? `최근 ${velocity.points.length}개` : '완료 데이터 부족',
        },
      ]}
    >
      <div className="space-y-5">
        {actionMessage ? (
          <p
            role={actionMessage.tone === 'error' ? 'alert' : 'status'}
            className={
              actionMessage.tone === 'error'
                ? 'rounded-of border border-of-danger/30 bg-of-surface px-3 py-2 text-xs text-of-danger'
                : 'rounded-of border border-of-border bg-of-surface px-3 py-2 text-xs text-of-muted'
            }
          >
            {actionMessage.text}
          </p>
        ) : null}
        {velocity ? (
          <section
            aria-label="벨로시티"
            className="rounded-of border border-of-border bg-of-surface p-3"
          >
            <p className="mb-2 text-xs font-medium">
              벨로시티{' '}
              <span className="font-normal text-of-muted">
                최근 완료 {velocity.points.length}개 사이클 · 평균 {velocity.average.toFixed(1)}건
              </span>
            </p>
            <div className="flex items-end gap-3" style={{ height: 72 }}>
              {velocity.points.map((pt) => (
                <div
                  key={pt.id}
                  className="flex min-w-0 flex-col items-center gap-1"
                  title={`${pt.name}: ${pt.done}건`}
                >
                  <span className="text-[10px] tabular-nums text-of-muted">{pt.done}</span>
                  <div
                    className="w-8 rounded-t bg-of-accent/70"
                    style={{ height: `${Math.max(4, (pt.done / velocity.max) * 48)}px` }}
                    aria-label={`${pt.name} 완료 ${pt.done}건`}
                  />
                  <span className="max-w-16 truncate text-[10px] text-of-muted">{pt.name}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2 rounded-of border border-of-border bg-of-surface p-3">
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
                    {label}{' '}
                    <span className="text-xs font-normal text-of-muted">{group.length}</span>
                  </h2>
                  <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                    {group.map((c) => (
                      <CycleRow
                        key={c.id}
                        cycle={c}
                        isOwner={isOwner}
                        projectId={projectId}
                        others={items.filter((o) => o.id !== c.id)}
                        onMessage={(text, tone = 'info') => setActionMessage({ text, tone })}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </PlanningSurface>
  )
}
