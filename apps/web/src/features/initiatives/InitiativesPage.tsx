import { ListChecks, Loader2, Plus, RefreshCw, Tag, Trash2, UserRoundCog, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'
import { Select } from '@/components/ui/select'
import { useProjects } from '@/features/projects/api'
import {
  ReportingMetricCard,
  ReportingSection,
  ReportingSummaryGrid,
  ReportingSurface,
} from '@/features/reports/ReportingSurface'
import { confirmDestructive } from '@/lib/guards'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeLabel,
  type InitiativeState,
  useClaimInitiativeOwnership,
  useConnectProject,
  useCreateInitiative,
  useDeleteInitiative,
  useDisconnectProject,
  useInitiativeOwnerCandidates,
  useInitiativeLabels,
  useInitiatives,
  useReplaceInitiativeLabels,
  useTransferInitiativeOwnership,
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
  availableLabels,
  highlighted = false,
  onOpenDetails,
}: {
  initiative: Initiative
  availableLabels: InitiativeLabel[]
  highlighted?: boolean
  onOpenDetails: () => void
}) {
  const navigate = useNavigate()
  const remove = useDeleteInitiative()
  const connect = useConnectProject(initiative.id)
  const disconnect = useDisconnectProject(initiative.id)
  const transfer = useTransferInitiativeOwnership()
  const claim = useClaimInitiativeOwnership()
  const replaceLabels = useReplaceInitiativeLabels()
  const projects = useProjects()
  const [selecting, setSelecting] = useState('')
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [nextOwnerId, setNextOwnerId] = useState('')
  const ownerCandidates = useInitiativeOwnerCandidates(
    initiative.id,
    ownerOpen && initiative.is_mine,
  )

  const connectedIds = new Set(initiative.projects.map((p) => p.project_id))
  const candidates = (projects.data?.items ?? []).filter((p) => !connectedIds.has(p.id))
  const hiddenCount = initiative.connected_project_count - initiative.projects.length
  const assignedLabelIds = new Set(initiative.labels.map((label) => label.id))
  const labelCandidates = availableLabels.filter((label) => !assignedLabelIds.has(label.id))

  return (
    <li
      className={`min-w-0 space-y-3 rounded-of border bg-of-surface p-3 ${
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
          {initiative.is_mine ? (
            <>
              <button
                type="button"
                aria-label={`${initiative.name} 소유권 관리`}
                aria-expanded={ownerOpen}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => {
                  setOwnerOpen((open) => !open)
                  setNextOwnerId('')
                  transfer.reset()
                }}
              >
                <UserRoundCog size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`${initiative.name} 삭제`}
                disabled={remove.isPending}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-danger"
                onClick={() => {
                  if (
                    confirmDestructive(
                      `'${initiative.name}' 이니셔티브를 삭제할까요?\n연결된 프로젝트는 삭제되지 않습니다.`,
                    )
                  )
                    remove.mutate(initiative.id)
                }}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </>
          ) : initiative.can_claim_ownership ? (
            <Button
              size="sm"
              variant="outline"
              disabled={claim.isPending}
              onClick={() => {
                claim.reset()
                if (window.confirm(`'${initiative.name}' 이니셔티브의 소유권을 가져올까요?`)) {
                  claim.mutate(initiative.id)
                }
              }}
            >
              {claim.isPending ? <Loader2 className="animate-spin" /> : <UserRoundCog />}
              소유권 가져오기
            </Button>
          ) : null}
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
            {initiative.is_mine ? (
              <button
                type="button"
                aria-label={`${initiative.name}에서 ${label.name} 라벨 제거`}
                disabled={replaceLabels.isPending}
                className="rounded p-0.5 text-of-muted hover:bg-of-hover hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => replaceLabels.mutate({
                  id: initiative.id,
                  labelIds: initiative.labels.filter((item) => item.id !== label.id).map((item) => item.id),
                })}
              >
                <X size={11} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
        {initiative.is_mine ? (
          <Select
            aria-label={`${initiative.name}에 라벨 배정`}
            className="h-7 w-40 text-xs"
            value=""
            disabled={replaceLabels.isPending || initiative.labels.length >= 8 || labelCandidates.length === 0}
            onChange={(event) => {
              if (event.target.value) {
                replaceLabels.mutate({
                  id: initiative.id,
                  labelIds: [...initiative.labels.map((label) => label.id), event.target.value],
                })
              }
            }}
          >
            <option value="">+ 라벨 배정</option>
            {labelCandidates.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
          </Select>
        ) : null}
        {initiative.labels.length === 0 && !initiative.is_mine ? (
          <span className="text-[11px] text-of-muted">라벨 없음</span>
        ) : null}
      </div>
      {replaceLabels.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          {replaceLabels.error instanceof Error ? replaceLabels.error.message : '라벨을 변경하지 못했습니다.'}
        </p>
      ) : null}

      {ownerOpen && initiative.is_mine ? (
        <div
          role="group"
          aria-label={`${initiative.name} 소유권 이전`}
          className="flex min-w-0 flex-col gap-2 border-y border-of-border-subtle bg-of-surface-2 px-2 py-2 sm:flex-row sm:items-center sm:flex-wrap"
        >
          {ownerCandidates.isPending ? (
            <p className="flex items-center gap-1.5 text-xs text-of-muted" role="status">
              <Loader2 className="animate-spin" size={13} aria-hidden="true" /> 후보 확인 중
            </p>
          ) : ownerCandidates.isError ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="alert">
              <span className="text-xs text-of-danger">소유권 후보를 불러오지 못했습니다.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void ownerCandidates.refetch()}
              >
                <RefreshCw /> 재시도
              </Button>
            </div>
          ) : ownerCandidates.data.total === 0 ? (
            <p className="min-w-0 flex-1 text-xs text-of-muted">
              함께 볼 수 있는 연결 프로젝트에 이전 가능한 활성 멤버가 없습니다.
            </p>
          ) : (
            <>
              <Select
                aria-label={`${initiative.name} 새 소유자`}
                className="h-7 min-w-0 flex-1 text-xs"
                value={nextOwnerId}
                disabled={transfer.isPending}
                onChange={(event) => setNextOwnerId(event.target.value)}
              >
                <option value="">새 소유자 선택</option>
                {ownerCandidates.data.items.map((candidate) => (
                  <option key={candidate.user_id} value={candidate.user_id}>
                    {candidate.display_name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                disabled={!nextOwnerId || transfer.isPending}
                onClick={() => {
                  const candidate = ownerCandidates.data.items.find(
                    (item) => item.user_id === nextOwnerId,
                  )
                  if (
                    candidate &&
                    window.confirm(
                      `'${initiative.name}' 이니셔티브의 소유권을 ${candidate.display_name}님에게 이전할까요?`,
                    )
                  ) {
                    transfer.mutate(
                      { id: initiative.id, ownerId: candidate.user_id },
                      { onSuccess: () => setOwnerOpen(false) },
                    )
                  }
                }}
              >
                {transfer.isPending ? <Loader2 className="animate-spin" /> : null}
                이전
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={transfer.isPending}
            onClick={() => setOwnerOpen(false)}
          >
            취소
          </Button>
          {transfer.isError ? (
            <p role="alert" className="w-full text-xs text-of-danger sm:basis-full">
              {transfer.error instanceof Error
                ? transfer.error.message
                : '소유권을 이전하지 못했습니다.'}
            </p>
          ) : null}
        </div>
      ) : null}
      {claim.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          {claim.error instanceof Error
            ? claim.error.message
            : '이니셔티브 소유권을 복구하지 못했습니다.'}
        </p>
      ) : null}

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
            {initiative.is_mine ? (
              <button
                type="button"
                aria-label={`${p.project_name} 연결 해제`}
                className="text-of-muted hover:text-of-danger"
                onClick={() => disconnect.mutate(p.project_id)}
              >
                <X size={11} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="text-[11px] text-of-muted">외 {hiddenCount}개 (권한 없음)</span>
        ) : null}
        {initiative.is_mine ? (
          <Select
            aria-label={`${initiative.name}에 프로젝트 연결`}
            className="h-7 w-44 text-xs"
            value={selecting}
            disabled={connect.isPending || candidates.length === 0}
            onChange={(e) => {
              const pid = e.target.value
              setSelecting('')
              if (pid) connect.mutate(pid)
            }}
          >
            <option value="">+ 프로젝트 연결</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
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
                        availableLabels={labels.data.items}
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
      <InitiativeDetailDrawer initiative={selectedInitiative} onClose={closeDetails} />
    </>
  )
}
