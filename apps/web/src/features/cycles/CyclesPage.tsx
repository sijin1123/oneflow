import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe, useMembers } from '@/features/members/api'
import { cn } from '@/lib/utils'

import {
  type Cycle,
  type CycleStatus,
  useCreateCycle,
  useCycleBurndown,
  useCycles,
  useUpdateCycle,
} from './api'
import { CycleItemActions } from './CycleItemActions'
import { recentVelocity } from './velocity'

const STATUS_TABS: Array<{ value: CycleStatus; label: string }> = [
  { value: 'active', label: '진행 중' },
  { value: 'upcoming', label: '예정' },
  { value: 'completed', label: '완료' },
]

function statusFrom(value: string | null): CycleStatus {
  return STATUS_TABS.some((tab) => tab.value === value) ? (value as CycleStatus) : 'active'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const circumference = 2 * Math.PI * 24
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative grid size-16 shrink-0 place-items-center" role="progressbar" aria-label={`완료율 ${percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <svg viewBox="0 0 56 56" className="size-16 -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r="24" fill="none" className="stroke-of-border" strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r="24"
          fill="none"
          className="stroke-of-accent transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">{percent}%</span>
    </div>
  )
}

function BurndownChart({
  projectId,
  cycle,
}: {
  projectId: string
  cycle: Cycle
}) {
  const { data, isPending, isError, refetch } = useCycleBurndown(projectId, cycle.id)

  if (isPending) {
    return (
      <div className="grid min-h-56 place-items-center" aria-label="번다운 불러오는 중">
        <div className="space-y-2 text-center text-xs text-of-muted">
          <CircleDashed className="mx-auto animate-spin" size={20} />
          <p>번다운을 불러오는 중입니다.</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="grid min-h-56 place-items-center px-4 text-center">
        <div>
          <p className="text-sm font-medium">번다운을 불러오지 못했습니다.</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            다시 시도
          </Button>
        </div>
      </div>
    )
  }

  const legacy = data.scope === 'legacy_current_assignment'
  const coverageLabel = legacy
    ? '정밀 추적 전 · 현재 배정 기준'
    : data.coverage_complete
      ? '배정 이력 기준'
      : `배정 이력 기준 · ${data.coverage_start} 이후`
  const stats = [
    { label: '최대 범위', value: data.total_scope },
    { label: cycle.status === 'completed' ? '마감 범위' : '현재 범위', value: data.current_scope },
    { label: '유입 / 이탈', value: `+${data.added_count} / -${data.removed_count}` },
    { label: '완료', value: data.delivered },
  ]

  if (data.days.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center px-4 text-center" data-testid="burndown-chart">
        <div>
          <Clock3 className="mx-auto text-of-muted" size={22} />
          <p className="mt-3 text-sm font-medium">아직 표시할 번다운이 없습니다.</p>
          <p className="mt-1 text-xs text-of-muted">기간이 시작되지 않았거나 추적 범위에 작업이 없습니다.</p>
          <p className="mt-3 text-[11px] text-of-muted">{coverageLabel}</p>
        </div>
      </div>
    )
  }

  const width = 100
  const height = 56
  const maxY = Math.max(data.total_scope, 1)
  const x = (index: number) => (data.days.length === 1 ? 0 : (index / (data.days.length - 1)) * width)
  const y = (value: number) => height - (value / maxY) * height
  const actual = data.days.map((day, index) => `${x(index)},${y(day.remaining)}`).join(' ')
  const scope = data.days.map((day, index) => `${x(index)},${y(day.scope)}`).join(' ')

  return (
    <div className="p-4" data-testid="burndown-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">번다운</p>
          <p className="mt-0.5 text-[11px] text-of-muted">{coverageLabel}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-of-muted" aria-label="차트 범례">
          <span className="inline-flex items-center gap-1"><span className="h-px w-3 bg-of-accent" /> 잔여</span>
          <span className="inline-flex items-center gap-1"><span className="h-px w-3 border-t border-dashed border-of-muted" /> 범위</span>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-of border border-of-border bg-of-border sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-of-surface px-2.5 py-2">
            <dt className="text-[10px] text-of-muted">{stat.label}</dt>
            <dd className="mt-0.5 text-xs font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-5 h-40 w-full overflow-visible"
        role="img"
        aria-label={`사이클 범위 ${data.current_scope}건, 잔여 ${data.days[data.days.length - 1].remaining}건`}
      >
        <line x1={0} y1={y(data.total_scope)} x2={width} y2={y(0)} strokeDasharray="3 2" className="stroke-of-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={scope} fill="none" strokeDasharray="3 2" className="stroke-of-muted" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={actual} fill="none" className="stroke-of-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-of-muted">
        <span>{data.days[0].date}</span>
        <span>{data.days[data.days.length - 1].date}</span>
      </div>
    </div>
  )
}

function CycleCreateDialog({
  open,
  projectId,
  onOpenChange,
}: {
  open: boolean
  projectId: string
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const create = useCreateCycle(projectId)

  const close = () => {
    if (create.isPending) return
    create.reset()
    setName('')
    setStart('')
    setEnd('')
    onOpenChange(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !start || !end || create.isPending) return
    create.mutate(
      { name: name.trim(), start_date: start, end_date: end },
      { onSuccess: close },
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-81 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none">
          <form onSubmit={submit}>
            <div className="border-b border-of-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold">사이클 추가</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                시작일과 종료일을 지정해 집중할 작업 기간을 만듭니다.
              </Dialog.Description>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-medium">
                이름
                <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-label="새 사이클 이름" placeholder="예: 8월 제품 안정화" className="mt-1" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium">
                  시작일
                  <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-label="새 사이클 시작일" className="mt-1" />
                </label>
                <label className="block text-xs font-medium">
                  종료일
                  <Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="새 사이클 종료일" className="mt-1" />
                </label>
              </div>
              {create.isError ? <p role="alert" className="text-xs text-of-danger">생성하지 못했습니다. 날짜 범위를 확인하세요.</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-of-border px-5 py-3">
              <Button type="button" variant="outline" disabled={create.isPending} onClick={close}>취소</Button>
              <Button type="submit" disabled={!name.trim() || !start || !end || create.isPending} aria-busy={create.isPending}>
                <Plus size={14} /> {create.isPending ? '추가 중' : '사이클 추가'}
              </Button>
            </div>
          </form>
          <button type="button" aria-label="사이클 추가 창 닫기" disabled={create.isPending} className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" onClick={close}>
            <X size={15} />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SelectedCycle({
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
  const [burndownOpen, setBurndownOpen] = useState(true)
  const [activeAction, setActiveAction] = useState<{ top: number; left: number; trigger: HTMLButtonElement } | null>(null)
  const [name, setName] = useState(cycle.name)
  const [start, setStart] = useState(cycle.start_date)
  const [end, setEnd] = useState(cycle.end_date)
  const remaining = Math.max(0, cycle.work_package_count - cycle.done_work_package_count)

  const openActionMenu = (trigger: HTMLButtonElement) => {
    const rect = trigger.getBoundingClientRect()
    const width = 240
    const height = 248
    setActiveAction({
      trigger,
      left: Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8)),
      top: Math.min(Math.max(8, rect.bottom + 6), Math.max(8, window.innerHeight - height)),
    })
  }

  return (
    <article className="overflow-hidden rounded-of border border-of-border bg-of-surface" aria-label={`${cycle.name} 사이클 상세`}>
      <header className="flex min-w-0 flex-wrap items-center gap-3 border-b border-of-border px-4 py-3">
        <ProgressRing done={cycle.done_work_package_count} total={cycle.work_package_count} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="truncate text-left text-sm font-semibold hover:underline" onClick={() => navigate(`/projects/${projectId}/work-packages?cycle_id=${cycle.id}`)}>
              {cycle.name}
            </button>
            <Badge variant={cycle.status === 'active' ? 'accent' : 'outline'}>{STATUS_TABS.find((tab) => tab.value === cycle.status)?.label}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-of-muted">
            <CalendarDays size={13} /> {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/projects/${projectId}/work-packages?cycle_id=${cycle.id}`)}>
          작업 {cycle.work_package_count}건 <ArrowUpRight size={13} />
        </Button>
        <button
          type="button"
          aria-label={`${cycle.name} 사이클 작업`}
          aria-haspopup="menu"
          aria-expanded={activeAction !== null}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={(event) => { if (activeAction) setActiveAction(null); else openActionMenu(event.currentTarget) }}
        >
          <MoreHorizontal size={15} />
        </button>
        {activeAction ? (
          <CycleItemActions
            cycle={cycle}
            projectId={projectId}
            isOwner={isOwner}
            others={others}
            trigger={activeAction.trigger}
            top={activeAction.top}
            left={activeAction.left}
            burndownOpen={burndownOpen}
            onOpenWorkItems={(cycleId) => navigate(`/projects/${projectId}/work-packages?cycle_id=${cycleId}`)}
            onEdit={() => setEditing(true)}
            onToggleBurndown={() => setBurndownOpen((value) => !value)}
            onMessage={onMessage}
            onClose={() => setActiveAction(null)}
          />
        ) : null}
      </header>

      {editing ? (
        <form
          className="flex flex-wrap items-end gap-2 border-b border-of-border bg-of-surface-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim() || !start || !end || update.isPending) return
            update.mutate(
              { cycleId: cycle.id, name: name.trim(), start_date: start, end_date: end },
              { onSuccess: () => setEditing(false) },
            )
          }}
        >
          <label className="text-xs font-medium">이름<Input value={name} onChange={(event) => setName(event.target.value)} aria-label="사이클 이름 편집" className="mt-1 h-8 w-44" /></label>
          <label className="text-xs font-medium">시작일<Input type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-label="시작일 편집" className="mt-1 h-8 w-36" /></label>
          <label className="text-xs font-medium">종료일<Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} aria-label="종료일 편집" className="mt-1 h-8 w-36" /></label>
          <Button type="submit" size="sm" disabled={!name.trim() || !start || !end || update.isPending}>저장</Button>
          <Button type="button" size="sm" variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>취소</Button>
          {update.isError ? <p role="alert" className="w-full text-xs text-of-danger">저장하지 못했습니다. 날짜 범위를 확인하세요.</p> : null}
        </form>
      ) : null}

      <div className="grid min-w-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <section className="border-b border-of-border p-4 lg:border-b-0 lg:border-r" aria-label="사이클 작업 요약">
          <p className="text-xs font-medium">작업 진행</p>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-4"><dt className="text-of-muted">전체 범위</dt><dd className="font-semibold tabular-nums">{cycle.work_package_count}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-of-muted">완료</dt><dd className="font-semibold tabular-nums text-of-success">{cycle.done_work_package_count}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-of-muted">남은 작업</dt><dd className="font-semibold tabular-nums">{remaining}</dd></div>
          </dl>
          <button type="button" className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-of-accent hover:underline" onClick={() => navigate(`/projects/${projectId}/work-packages?cycle_id=${cycle.id}`)}>
            사이클 작업 보기 <ChevronRight size={13} />
          </button>
        </section>
        <section aria-label="사이클 번다운">
          {burndownOpen ? <BurndownChart projectId={projectId} cycle={cycle} /> : (
            <div className="grid min-h-56 place-items-center px-4 text-center">
              <div>
                <p className="text-sm font-medium">번다운을 숨겼습니다.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setBurndownOpen(true)}>번다운 보기</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  )
}

function VelocitySummary({ cycles }: { cycles: Cycle[] }) {
  const velocity = recentVelocity(cycles)
  if (!velocity) return null

  return (
    <section aria-label="벨로시티" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">최근 벨로시티</h2>
        <p className="text-xs text-of-muted">완료 {velocity.points.length}개 · 평균 {velocity.average.toFixed(1)}건</p>
      </div>
      <div className="mt-4 flex h-20 items-end gap-4 overflow-x-auto">
        {velocity.points.map((point) => (
          <div key={point.id} className="flex min-w-14 flex-col items-center gap-1" title={`${point.name}: ${point.done}건`}>
            <span className="text-[10px] tabular-nums text-of-muted">{point.done}</span>
            <div className="w-8 rounded-t bg-of-accent/70" style={{ height: `${Math.max(4, (point.done / velocity.max) * 48)}px` }} aria-label={`${point.name} 완료 ${point.done}건`} />
            <span className="max-w-16 truncate text-[10px] text-of-muted">{point.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function CyclesPage() {
  const { projectId } = useParams() as { projectId: string }
  const [params, setParams] = useSearchParams()
  const cycles = useCycles(projectId)
  const me = useMe()
  const members = useMembers(projectId)
  const [createOpen, setCreateOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(Boolean(params.get('q')))
  const [actionMessage, setActionMessage] = useState<{ text: string; tone: 'info' | 'success' | 'error' } | null>(null)

  const status = statusFrom(params.get('status'))
  const query = params.get('q')?.trim() ?? ''
  const selectedId = params.get('cycle')
  const items = useMemo(() => cycles.data?.items ?? [], [cycles.data?.items])
  const myRole = members.data?.items.find((member) => member.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const counts = useMemo(() => Object.fromEntries(STATUS_TABS.map((tab) => [tab.value, items.filter((cycle) => cycle.status === tab.value).length])) as Record<CycleStatus, number>, [items])
  const visibleItems = useMemo(() => items.filter((cycle) => cycle.status === status && (!query || cycle.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [items, query, status])
  const selected = visibleItems.find((cycle) => cycle.id === selectedId) ?? visibleItems[0] ?? null

  const updateParams = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params)
    Object.entries(next).forEach(([key, value]) => {
      if (value) copy.set(key, value)
      else copy.delete(key)
    })
    setParams(copy, { replace: true })
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">Cycles</h1>
      <FrameContextActions>
        {isOwner ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> 사이클 추가
          </Button>
        ) : null}
      </FrameContextActions>

      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3">
        <div className="flex h-11 items-end gap-1 overflow-x-auto" role="tablist" aria-label="사이클 상태">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              className={cn(
                'relative inline-flex h-10 shrink-0 items-center gap-2 px-2.5 text-xs font-medium text-of-muted hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
                status === tab.value && 'text-of-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-of-text',
              )}
              onClick={() => updateParams({ status: tab.value === 'active' ? null : tab.value, cycle: null })}
            >
              {tab.label} <Badge variant="neutral">{counts[tab.value]}</Badge>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 py-1">
          {searchOpen ? (
            <label className="relative animate-in fade-in slide-in-from-right-1 duration-150 motion-reduce:animate-none">
              <span className="sr-only">사이클 검색</span>
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-of-muted" />
              <Input autoFocus value={query} aria-label="사이클 검색" placeholder="사이클 검색" className="h-7 w-40 pl-7 pr-7 text-xs" onChange={(event) => updateParams({ q: event.target.value || null, cycle: null })} />
              <button type="button" aria-label="사이클 검색 닫기" className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover" onClick={() => { updateParams({ q: null, cycle: null }); setSearchOpen(false) }}><X size={12} /></button>
            </label>
          ) : (
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="사이클 검색 열기" onClick={() => setSearchOpen(true)}><Search size={14} /></Button>
          )}
        </div>
      </div>

      <main data-testid="cycles-scroll" className="of-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {cycles.isPending || members.isPending ? <ListSkeleton /> : null}
        {cycles.isError ? <ErrorState error={cycles.error} onRetry={() => cycles.refetch()} /> : null}
        {!cycles.isPending && !members.isPending && !cycles.isError ? (
          <section aria-label={STATUS_TABS.find((tab) => tab.value === status)?.label} className="mx-auto max-w-6xl space-y-4">
            {actionMessage ? (
              <p role={actionMessage.tone === 'error' ? 'alert' : 'status'} className={cn('rounded-of border bg-of-surface px-3 py-2 text-xs', actionMessage.tone === 'error' ? 'border-of-danger/30 text-of-danger' : 'border-of-border text-of-muted')}>
                {actionMessage.text}
              </p>
            ) : null}

            {selected ? (
              <SelectedCycle key={selected.id} cycle={selected} isOwner={isOwner} projectId={projectId} others={items.filter((cycle) => cycle.id !== selected.id)} onMessage={(text, tone = 'info') => setActionMessage({ text, tone })} />
            ) : (
              <EmptyState
                title={query ? '검색 결과가 없습니다' : `${STATUS_TABS.find((tab) => tab.value === status)?.label} 사이클이 없습니다`}
                hint={query ? '다른 이름으로 검색하거나 검색어를 지워 보세요.' : isOwner ? '사이클 추가에서 첫 기간을 만들어 보세요.' : '프로젝트 소유자가 사이클을 만들 수 있습니다.'}
              >
                {query ? <Button type="button" variant="outline" size="sm" onClick={() => updateParams({ q: null })}>검색 지우기</Button> : null}
              </EmptyState>
            )}

            {visibleItems.length > 1 ? (
              <section aria-label="다른 사이클" className="rounded-of border border-of-border bg-of-surface">
                <h2 className="border-b border-of-border px-3 py-2 text-xs font-medium">다른 {STATUS_TABS.find((tab) => tab.value === status)?.label} 사이클</h2>
                <ul className="divide-y divide-of-border">
                  {visibleItems.filter((cycle) => cycle.id !== selected?.id).map((cycle) => {
                    const percent = cycle.work_package_count === 0 ? 0 : Math.round((cycle.done_work_package_count / cycle.work_package_count) * 100)
                    return (
                      <li key={cycle.id}>
                        <button type="button" className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus" onClick={() => updateParams({ cycle: cycle.id })}>
                          {cycle.status === 'completed' ? <CheckCircle2 size={15} className="shrink-0 text-of-success" /> : <CircleDashed size={15} className="shrink-0 text-of-muted" />}
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{cycle.name}</span>
                          <span className="hidden text-[11px] text-of-muted sm:inline">{formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}</span>
                          <span className="w-10 text-right text-[11px] tabular-nums text-of-muted">{percent}%</span>
                          <ChevronRight size={13} className="shrink-0 text-of-muted" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            {status === 'completed' ? <VelocitySummary cycles={items} /> : null}
          </section>
        ) : null}
      </main>

      {isOwner ? <CycleCreateDialog open={createOpen} projectId={projectId} onOpenChange={setCreateOpen} /> : null}
    </div>
  )
}
