import { ListChecks, Plus, Tag } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'
import { Select } from '@/components/ui/select'
import {
  ReportingMetricCard,
  ReportingSection,
  ReportingSummaryGrid,
  ReportingSurface,
} from '@/features/reports/ReportingSurface'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeState,
  useCreateInitiative,
  useInitiativeLabels,
  useInitiatives,
} from './api'
import { InitiativeDetailDrawer } from './InitiativeDetailDrawer'

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
  // Project-list chip deep link (Pass 51): highlight the target card;
  // an unknown/invisible id silently degrades to the plain page.
  const highlightId = searchParams.get('highlight')
  const selectedLabelId = searchParams.get('label') ?? ''
  const initiatives = useInitiatives(selectedLabelId)
  const labels = useInitiativeLabels()
  const create = useCreateInitiative()
  const [name, setName] = useState('')

  if (initiatives.isPending) return <ListSkeleton />
  if (initiatives.isError)
    return <ErrorState error={initiatives.error} onRetry={() => initiatives.refetch()} />
  if (labels.isPending) return <ListSkeleton />
  if (labels.isError) return <ErrorState error={labels.error} onRetry={() => labels.refetch()} />

  const items = initiatives.data.items
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
  const activeCount = items.filter((i) => i.state === 'in_progress').length
  const riskCount = items.filter((i) => i.health === 'at_risk' || i.health === 'off_track').length
  const visibleProjectCount = items.reduce((sum, i) => sum + i.projects.length, 0)
  const hiddenProjectCount = items.reduce(
    (sum, i) => sum + Math.max(0, i.connected_project_count - i.projects.length),
    0,
  )

  return (
    <>
      <ReportingSurface
        title="이니셔티브"
        description="여러 프로젝트를 하나의 전략 묶음으로 연결해 진행률과 헬스 상태를 봅니다."
      >
        <div className="flex min-w-0 flex-col gap-2 border-b border-of-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-xs text-of-muted">
            <Tag size={14} aria-hidden="true" />
            <span>라벨로 전략 범위를 좁힙니다.</span>
          </div>
          <Select
            aria-label="이니셔티브 라벨 필터"
            className="h-8 min-w-0 sm:w-48"
            value={selectedLabelId}
            onChange={(event) => {
              setSearchParams((previous) => {
                const next = new URLSearchParams(previous)
                if (event.target.value) next.set('label', event.target.value)
                else next.delete('label')
                return next
              })
            }}
          >
            <option value="">모든 라벨</option>
            {labels.data.items.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
          </Select>
        </div>
        <ReportingSummaryGrid>
          <ReportingMetricCard label="전체" value={`${items.length}개`} detail="전략 묶음" />
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

        <ReportingSection title="새 이니셔티브">
          <div className="grid min-w-0 grid-cols-1 gap-2 rounded-of border border-of-border bg-of-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이니셔티브 이름"
              aria-label="새 이니셔티브 이름"
              className="h-8 min-w-0 text-xs"
            />
            <Button
              size="sm"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate({ name: name.trim() }, { onSuccess: () => setName('') })}
            >
              <Plus size={13} /> 이니셔티브 추가
            </Button>
          </div>
        </ReportingSection>

        {items.length === 0 ? (
          <EmptyState
            title={selectedLabelId ? '이 라벨의 이니셔티브가 없습니다' : '이니셔티브가 없습니다'}
            hint={selectedLabelId ? '다른 라벨을 선택하거나 이니셔티브에 라벨을 배정하세요.' : '위에서 첫 이니셔티브를 만들어 보세요.'}
          />
        ) : (
          <div className="space-y-5">
            {STATE_ORDER.map((state) => {
              const group = items.filter((i) => i.state === state)
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
