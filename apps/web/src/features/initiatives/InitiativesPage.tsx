import { Plus, Trash2, X } from 'lucide-react'
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
  type InitiativeState,
  useConnectProject,
  useCreateInitiative,
  useDeleteInitiative,
  useDisconnectProject,
  useInitiatives,
  useUpdateInitiative,
} from './api'

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
}: {
  initiative: Initiative
  highlighted?: boolean
}) {
  const navigate = useNavigate()
  const update = useUpdateInitiative()
  const remove = useDeleteInitiative()
  const connect = useConnectProject(initiative.id)
  const disconnect = useDisconnectProject(initiative.id)
  const projects = useProjects()
  const [selecting, setSelecting] = useState('')

  const connectedIds = new Set(initiative.projects.map((p) => p.project_id))
  const candidates = (projects.data?.items ?? []).filter((p) => !connectedIds.has(p.id))
  const hiddenCount = initiative.connected_project_count - initiative.projects.length

  return (
    <li
      className={`min-w-0 space-y-3 rounded-of border bg-of-surface p-3 ${
        highlighted ? 'border-of-accent ring-1 ring-of-accent' : 'border-of-border'
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-[13px] font-medium">{initiative.name}</span>
            {initiative.health ? (
              <span
                title={initiative.health_note ?? undefined}
                className={`shrink-0 rounded-of px-1.5 py-0.5 text-[10px] font-medium ${HEALTH_STYLES[initiative.health]}`}
              >
                {HEALTH_LABELS[initiative.health]}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-of-muted">
            {initiative.owner_name ?? '알 수 없음'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {initiative.is_mine ? (
            <>
              <Select
                aria-label={`${initiative.name} 상태`}
                className="h-7 w-32 text-xs"
                value={initiative.state}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({ id: initiative.id, state: e.target.value as InitiativeState })
                }
              >
                {STATE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {INITIATIVE_STATE_LABELS[s]}
                  </option>
                ))}
              </Select>
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
          ) : (
            <Badge variant="neutral">{INITIATIVE_STATE_LABELS[initiative.state]}</Badge>
          )}
        </div>
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
      {initiative.is_mine ? (
        <HealthReportRow initiative={initiative} />
      ) : initiative.health_note ? (
        <p className="text-[11px] text-of-muted">상태 사유: {initiative.health_note}</p>
      ) : null}
    </li>
  )
}

/* Creator-only health report (Pass 44 — v37.1 table): the note travels with
   the status and is always replaced on save; '미설정' clears everything. */
function HealthReportRow({ initiative }: { initiative: Initiative }) {
  const update = useUpdateInitiative()
  const [health, setHealth] = useState<'' | NonNullable<Initiative['health']>>(
    initiative.health ?? '',
  )
  const [note, setNote] = useState(initiative.health_note ?? '')
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[96px_minmax(0,1fr)_auto_auto] sm:items-center">
      <Select
        aria-label={`${initiative.name} 헬스`}
        className="h-7 w-full text-xs"
        value={health}
        onChange={(e) => setHealth(e.target.value as '' | NonNullable<Initiative['health']>)}
      >
        <option value="">미설정</option>
        {(Object.keys(HEALTH_LABELS) as Array<NonNullable<Initiative['health']>>).map((h) => (
          <option key={h} value={h}>
            {HEALTH_LABELS[h]}
          </option>
        ))}
      </Select>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="상태 사유 (선택)"
        aria-label={`${initiative.name} 상태 사유`}
        disabled={health === ''}
        className="h-7 min-w-0 text-xs"
        maxLength={2000}
      />
      <Button
        size="sm"
        disabled={update.isPending}
        onClick={() =>
          update.mutate(
            health === ''
              ? { id: initiative.id, health: null }
              : { id: initiative.id, health, health_note: note.trim() === '' ? null : note.trim() },
          )
        }
      >
        상태 보고
      </Button>
      {initiative.health_updated_at ? (
        <span className="text-[10px] text-of-muted sm:text-right">
          {initiative.health_updated_at.slice(0, 10)}
        </span>
      ) : null}
    </div>
  )
}

/* Cross-project initiatives (Pass 3 PR-L): strategic groupings with per-project
   progress roll-ups limited to the caller's member projects. */
export function InitiativesPage() {
  const [searchParams] = useSearchParams()
  // Project-list chip deep link (Pass 51): highlight the target card;
  // an unknown/invisible id silently degrades to the plain page.
  const highlightId = searchParams.get('highlight')
  const initiatives = useInitiatives()
  const create = useCreateInitiative()
  const [name, setName] = useState('')

  if (initiatives.isPending) return <ListSkeleton />
  if (initiatives.isError)
    return <ErrorState error={initiatives.error} onRetry={() => initiatives.refetch()} />

  const items = initiatives.data.items
  const activeCount = items.filter((i) => i.state === 'in_progress').length
  const riskCount = items.filter((i) => i.health === 'at_risk' || i.health === 'off_track').length
  const visibleProjectCount = items.reduce((sum, i) => sum + i.projects.length, 0)
  const hiddenProjectCount = items.reduce(
    (sum, i) => sum + Math.max(0, i.connected_project_count - i.projects.length),
    0,
  )

  return (
    <ReportingSurface
      title="이니셔티브"
      description="여러 프로젝트를 하나의 전략 묶음으로 연결해 진행률과 헬스 상태를 봅니다."
    >
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
        <EmptyState title="이니셔티브가 없습니다" hint="위에서 첫 이니셔티브를 만들어 보세요." />
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
                    <InitiativeCard key={i.id} initiative={i} highlighted={i.id === highlightId} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </ReportingSurface>
  )
}
