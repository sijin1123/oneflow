import { ListChecks, Search, SlidersHorizontal, X } from 'lucide-react'
import { type ChangeEvent, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'
import { Select } from '@/components/ui/select'
import {
  ReportingMetricCard,
  ReportingSummaryGrid,
  ReportingSurface,
} from '@/features/reports/ReportingSurface'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeState,
  useInitiativeLabels,
  useInitiatives,
} from './api'
import { InitiativeCreateDialog } from './InitiativeCreateDialog'
import { InitiativeDetailDrawer } from './InitiativeDetailDrawer'
import {
  countActiveInitiativeDiscovery,
  discoverInitiatives,
  readInitiativeDiscovery,
} from './discovery'

const STATE_ORDER: InitiativeState[] = ['in_progress', 'planned', 'paused', 'completed', 'cancelled']

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span className="text-[11px] text-of-muted">
      {done}/{total} ({pct}%)
    </span>
  )
}

function InitiativeCard({
  initiative,
  highlighted = false,
  onOpenDetails,
}: {
  initiative: Initiative
  highlighted?: boolean
  onOpenDetails: () => void
}) {
  const navigate = useNavigate()
  const hiddenCount = Math.max(0, initiative.connected_project_count - initiative.projects.length)

  return (
    <li
      className={`min-w-0 space-y-2.5 rounded-of border bg-of-surface p-3 ${
        highlighted ? 'border-of-accent ring-1 ring-of-accent' : 'border-of-border'
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="min-w-0 truncate text-left text-[13px] font-medium hover:text-of-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={onOpenDetails}
            >
              {initiative.name}
            </button>
            <Badge variant="neutral">{INITIATIVE_STATE_LABELS[initiative.state]}</Badge>
            {initiative.health ? (
              <span
                title={initiative.health_note ?? undefined}
                className={`shrink-0 rounded-of px-1.5 py-0.5 text-[10px] font-medium ${HEALTH_STYLES[initiative.health]}`}
              >
                {HEALTH_LABELS[initiative.health]}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-of-muted">
            <span>{initiative.owner_name ?? '소유자 없음'}</span>
            {!initiative.owner_active ? <Badge variant="outline">복구 필요</Badge> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${initiative.name} 전략 범위 열기`}
            onClick={onOpenDetails}
          >
            <ListChecks /> {initiative.connected_work_item_count}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {initiative.labels.map((label) => (
          <span
            key={label.id}
            className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-of border border-of-border bg-of-surface-2 px-2 text-xs"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: label.color }}
              aria-hidden="true"
            />
            <span className="max-w-36 truncate">{label.name}</span>
          </span>
        ))}
        {initiative.labels.length === 0 ? (
          <span className="text-[11px] text-of-muted">라벨 없음</span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {initiative.projects.map((p) => (
          <span
            key={p.project_id}
            className="flex min-w-0 items-center gap-1.5 rounded-of border border-of-border px-2 py-1 text-xs"
          >
            <button
              type="button"
              className="min-w-0 truncate hover:text-of-accent hover:underline"
              onClick={() => navigate(`/projects/${p.project_id}/dashboard`)}
            >
              {p.project_name}
            </button>
            <Progress done={p.done_work_package_count} total={p.work_package_count} />
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="text-[11px] text-of-muted">외 {hiddenCount}개 (권한 없음)</span>
        ) : null}
        {initiative.projects.length === 0 && hiddenCount === 0 ? (
          <span className="text-[11px] text-of-muted">연결 프로젝트 없음</span>
        ) : null}
      </div>
    </li>
  )
}

/* Cross-project initiatives (Pass 3 PR-L): strategic groupings with per-project
   progress roll-ups limited to the caller's member projects. */
export function InitiativesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const discoveryFormRef = useRef<HTMLFormElement>(null)
  // Project-list chip deep link (Pass 51): highlight the target card;
  // an unknown/invisible id silently degrades to the plain page.
  const highlightId = searchParams.get('highlight')
  const selectedLabelId = searchParams.get('label') ?? ''
  const discovery = readInitiativeDiscovery(searchParams)
  const initiatives = useInitiatives(selectedLabelId)
  const labels = useInitiativeLabels()

  if (initiatives.isPending) return <ListSkeleton />
  if (initiatives.isError)
    return <ErrorState error={initiatives.error} onRetry={() => initiatives.refetch()} />
  if (labels.isPending) return <ListSkeleton />
  if (labels.isError) return <ErrorState error={labels.error} onRetry={() => labels.refetch()} />

  const items = initiatives.data.items
  const visibleItems = discoverInitiatives(items, discovery)
  const activeDiscoveryCount = countActiveInitiativeDiscovery(discovery, selectedLabelId)
  const selectedInitiative =
    items.find((initiative) => initiative.id === searchParams.get('initiative')) ?? null
  const openDetails = (initiativeId: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('initiative', initiativeId)
      return next
    })
  }
  const closeDetails = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('initiative')
      return next
    })
  }
  const openCreated = (initiative: Initiative) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('highlight')
      next.delete('label')
      next.set('initiative', initiative.id)
      return next
    })
  }
  const syncDiscoveryForm = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const form = discoveryFormRef.current
    if (!form) return
    const data = new FormData(form)
    data.set(event.currentTarget.name, event.currentTarget.value)
    const next = new URLSearchParams(window.location.search)
    const values = [
      ['q', String(data.get('q') ?? ''), ''],
      ['label', String(data.get('label') ?? ''), ''],
      ['state', String(data.get('state') ?? 'all'), 'all'],
      ['health', String(data.get('health') ?? 'all'), 'all'],
      ['owner', String(data.get('owner') ?? 'all'), 'all'],
      ['sort', String(data.get('sort') ?? 'updated_desc'), 'updated_desc'],
    ] as const
    for (const [key, value, defaultValue] of values) {
      if (value && value !== defaultValue) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }
  const clearDiscovery = () => {
    const next = new URLSearchParams(window.location.search)
    for (const key of ['q', 'state', 'health', 'owner', 'sort', 'label']) next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const activeCount = visibleItems.filter((i) => i.state === 'in_progress').length
  const riskCount = visibleItems.filter(
    (i) => i.health === 'at_risk' || i.health === 'off_track',
  ).length
  const visibleProjectCount = visibleItems.reduce((sum, i) => sum + i.projects.length, 0)
  const hiddenProjectCount = visibleItems.reduce(
    (sum, i) => sum + Math.max(0, i.connected_project_count - i.projects.length),
    0,
  )

  return (
    <>
      <ReportingSurface
        title="이니셔티브"
        description="여러 프로젝트를 하나의 전략 묶음으로 연결해 진행률과 헬스 상태를 봅니다."
      >
        <form
          ref={discoveryFormRef}
          aria-label="이니셔티브 탐색"
          className="min-w-0 space-y-2 border-b border-of-border-subtle pb-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">이니셔티브 검색</span>
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                aria-hidden="true"
              />
              <Input
                name="q"
                aria-label="이니셔티브 검색"
                className="pl-8"
                placeholder="이름, 설명, 소유자, 라벨 또는 프로젝트 검색"
                value={discovery.query}
                onChange={syncDiscoveryForm}
              />
            </label>
            <InitiativeCreateDialog onCreated={openCreated} />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-5">
            <Select
              name="label"
              aria-label="이니셔티브 라벨 필터"
              className="h-8 min-w-0 w-full"
              value={selectedLabelId}
              onChange={syncDiscoveryForm}
            >
              <option value="">모든 라벨</option>
              {labels.data.items.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
            </Select>
            <Select
              name="state"
              aria-label="이니셔티브 상태 필터"
              className="h-8 min-w-0 w-full"
              value={discovery.state}
              onChange={syncDiscoveryForm}
            >
              <option value="all">모든 상태</option>
              {STATE_ORDER.map((state) => (
                <option key={state} value={state}>{INITIATIVE_STATE_LABELS[state]}</option>
              ))}
            </Select>
            <Select
              name="health"
              aria-label="이니셔티브 헬스 필터"
              className="h-8 min-w-0 w-full"
              value={discovery.health}
              onChange={syncDiscoveryForm}
            >
              <option value="all">모든 헬스</option>
              <option value="on_track">정상</option>
              <option value="at_risk">주의</option>
              <option value="off_track">위험</option>
              <option value="unreported">미보고</option>
            </Select>
            <Select
              name="owner"
              aria-label="이니셔티브 소유 범위 필터"
              className="h-8 min-w-0 w-full"
              value={discovery.ownership}
              onChange={syncDiscoveryForm}
            >
              <option value="all">모든 소유 범위</option>
              <option value="mine">내가 소유</option>
              <option value="shared">프로젝트로 공유</option>
              <option value="unowned">소유자 없음</option>
            </Select>
            <Select
              name="sort"
              aria-label="이니셔티브 정렬"
              className="col-span-2 h-8 min-w-0 w-full xl:col-span-1"
              value={discovery.sort}
              onChange={syncDiscoveryForm}
            >
              <option value="updated_desc">최근 업데이트순</option>
              <option value="target_asc">목표일 빠른순</option>
              <option value="name_asc">이름순</option>
            </Select>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-of-muted">
            <span className="inline-flex min-w-0 items-center gap-1.5" aria-live="polite">
              <SlidersHorizontal size={13} aria-hidden="true" />
              {visibleItems.length} / {items.length}개 표시
              {activeDiscoveryCount > 0 ? ` · 조건 ${activeDiscoveryCount}개` : ''}
            </span>
            {activeDiscoveryCount > 0 ? (
              <Button size="sm" variant="ghost" onClick={clearDiscovery}>
                <X size={13} /> 탐색 초기화
              </Button>
            ) : null}
          </div>
        </form>
        <ReportingSummaryGrid className="grid-cols-2 gap-2 sm:gap-3">
          <ReportingMetricCard
            label="표시 중"
            value={`${visibleItems.length}개`}
            detail={visibleItems.length === items.length ? '전체 전략 묶음' : `전체 ${items.length}개 중`}
          />
          <ReportingMetricCard label="진행 중" value={activeCount} tone="accent" />
          <ReportingMetricCard
            label="주의 필요"
            value={riskCount}
            detail="주의 또는 위험"
            tone={riskCount > 0 ? 'danger' : 'neutral'}
          />
          <ReportingMetricCard
            label="연결 프로젝트"
            value={visibleProjectCount}
            detail={hiddenProjectCount > 0 ? `권한 밖 ${hiddenProjectCount}개 제외` : '가시 범위'}
          />
        </ReportingSummaryGrid>

        {visibleItems.length === 0 ? (
          <EmptyState
            title={
              items.length === 0 && selectedLabelId && activeDiscoveryCount === 1
                ? '이 라벨의 이니셔티브가 없습니다'
                : activeDiscoveryCount > 0
                  ? '조건에 맞는 이니셔티브가 없습니다'
                  : '이니셔티브가 없습니다'
            }
            hint={
              items.length === 0 && selectedLabelId && activeDiscoveryCount === 1
                ? '다른 라벨을 선택하거나 이니셔티브에 라벨을 배정하세요.'
                : activeDiscoveryCount > 0
                  ? '검색어나 탐색 조건을 초기화하고 다시 확인하세요.'
                  : '상단의 새 이니셔티브 버튼에서 첫 전략 묶음을 만드세요.'
            }
          >
            {activeDiscoveryCount > 0 ? (
              <Button size="sm" variant="outline" onClick={clearDiscovery}>
                <X size={13} /> 탐색 초기화
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {STATE_ORDER.map((state) => {
              const group = visibleItems.filter((i) => i.state === state)
              if (group.length === 0) return null
              return (
                <section key={state} aria-label={INITIATIVE_STATE_LABELS[state]} className="min-w-0">
                  <h2 className="mb-1.5 text-sm font-semibold">
                    {INITIATIVE_STATE_LABELS[state]}{' '}
                    <span className="text-xs font-normal text-of-muted">{group.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {group.map((i) => (
                      <InitiativeCard
                        key={i.id}
                        initiative={i}
                        highlighted={i.id === highlightId}
                        onOpenDetails={() => openDetails(i.id)}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </ReportingSurface>
      <InitiativeDetailDrawer
        initiative={selectedInitiative}
        availableLabels={labels.data.items}
        onClose={closeDetails}
      />
    </>
  )
}
