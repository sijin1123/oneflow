import {
  ArrowUpRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  UserRoundCog,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useProjects } from '@/features/projects/api'
import { confirmDestructive } from '@/lib/guards'

import {
  type Initiative,
  type InitiativeLabel,
  useClaimInitiativeOwnership,
  useConnectProject,
  useDeleteInitiative,
  useDisconnectProject,
  useInitiativeOwnerCandidates,
  useReplaceInitiativeLabels,
  useTransferInitiativeOwnership,
} from './api'

function Progress({ done, total }: { done: number; total: number }) {
  const percentage = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span className="text-[11px] tabular-nums text-of-muted">
      {done}/{total} ({percentage}%)
    </span>
  )
}

export function InitiativeOrganizationPanel({
  initiative,
  availableLabels,
  onDeleted,
}: {
  initiative: Initiative
  availableLabels: InitiativeLabel[]
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const projects = useProjects()
  const replaceLabels = useReplaceInitiativeLabels()
  const connect = useConnectProject(initiative.id)
  const disconnect = useDisconnectProject(initiative.id)
  const transfer = useTransferInitiativeOwnership()
  const claim = useClaimInitiativeOwnership()
  const remove = useDeleteInitiative()
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [nextOwnerId, setNextOwnerId] = useState('')
  const [nextProjectId, setNextProjectId] = useState('')
  const ownerCandidates = useInitiativeOwnerCandidates(
    initiative.id,
    ownerOpen && initiative.is_mine,
  )

  const assignedLabelIds = new Set(initiative.labels.map((label) => label.id))
  const labelCandidates = availableLabels.filter((label) => !assignedLabelIds.has(label.id))
  const connectedProjectIds = new Set(initiative.projects.map((project) => project.project_id))
  const projectCandidates = (projects.data?.items ?? []).filter(
    (project) => !connectedProjectIds.has(project.id),
  )
  const hiddenProjectCount = Math.max(
    0,
    initiative.connected_project_count - initiative.projects.length,
  )

  const transferAgain = () => {
    if (transfer.variables) transfer.mutate(transfer.variables)
  }
  const replaceLabelsAgain = () => {
    if (replaceLabels.variables) replaceLabels.mutate(replaceLabels.variables)
  }
  const connectAgain = () => {
    if (connect.variables) connect.mutate(connect.variables)
  }
  const disconnectAgain = () => {
    if (disconnect.variables) disconnect.mutate(disconnect.variables)
  }

  return (
    <section className="pt-4" aria-labelledby="initiative-organization-heading">
      <div className="min-w-0">
        <h3 id="initiative-organization-heading" className="text-sm font-semibold">
          조직과 연결
        </h3>
        <p className="mt-0.5 text-[11px] text-of-muted">
          소유권, 분류와 프로젝트 범위를 한곳에서 관리합니다.
        </p>
      </div>

      <div className="mt-3 divide-y divide-of-border-subtle border-y border-of-border-subtle">
        <div className="grid min-w-0 gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-medium">소유권</p>
            <p className="mt-0.5 text-[11px] text-of-muted">편집 책임과 복구 권한</p>
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-xs font-medium">
                {initiative.owner_name ?? '소유자 없음'}
              </span>
              {!initiative.owner_active ? <Badge variant="outline">복구 필요</Badge> : null}
              {initiative.is_mine ? (
                <Button
                  size="sm"
                  variant={ownerOpen ? 'secondary' : 'outline'}
                  aria-expanded={ownerOpen}
                  onClick={() => {
                    setOwnerOpen((open) => !open)
                    setNextOwnerId('')
                    transfer.reset()
                  }}
                >
                  <UserRoundCog /> {ownerOpen ? '이전 닫기' : '소유권 이전'}
                </Button>
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

            {ownerOpen && initiative.is_mine ? (
              <div role="group" aria-label="이니셔티브 소유권 이전" className="space-y-2 bg-of-surface-2 p-2">
                {ownerCandidates.isPending ? (
                  <p className="flex items-center gap-1.5 text-xs text-of-muted" role="status">
                    <Loader2 className="animate-spin" /> 후보 확인 중
                  </p>
                ) : ownerCandidates.isError ? (
                  <div className="flex flex-wrap items-center gap-2" role="alert">
                    <span className="text-xs text-of-danger">소유권 후보를 불러오지 못했습니다.</span>
                    <Button size="sm" variant="outline" onClick={() => void ownerCandidates.refetch()}>
                      <RefreshCw /> 재시도
                    </Button>
                  </div>
                ) : ownerCandidates.data.total === 0 ? (
                  <p className="text-xs text-of-muted">
                    연결 프로젝트에 이전 가능한 활성 멤버가 없습니다.
                  </p>
                ) : (
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <Select
                      aria-label="이니셔티브 새 소유자"
                      className="h-8 min-w-0 flex-1 text-xs"
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
                  </div>
                )}
                {transfer.isError ? (
                  <div className="flex flex-wrap items-center gap-2" role="alert">
                    <span className="text-xs text-of-danger">
                      {transfer.error instanceof Error
                        ? transfer.error.message
                        : '소유권을 이전하지 못했습니다.'}
                    </span>
                    <Button size="sm" variant="outline" onClick={transferAgain}>
                      <RefreshCw /> 재시도
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {claim.isError ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-of-danger">
                  {claim.error instanceof Error
                    ? claim.error.message
                    : '이니셔티브 소유권을 복구하지 못했습니다.'}
                </span>
                <Button size="sm" variant="outline" onClick={() => claim.mutate(initiative.id)}>
                  <RefreshCw /> 재시도
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-medium">라벨</p>
            <p className="mt-0.5 text-[11px] text-of-muted">전략 분류, 최대 8개</p>
          </div>
          <div className="min-w-0 space-y-2">
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
                      aria-label={`${label.name} 라벨 제거`}
                      disabled={replaceLabels.isPending}
                      className="rounded p-0.5 text-of-muted hover:bg-of-hover hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={() => {
                        replaceLabels.reset()
                        replaceLabels.mutate({
                          id: initiative.id,
                          labelIds: initiative.labels
                            .filter((item) => item.id !== label.id)
                            .map((item) => item.id),
                        })
                      }}
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              ))}
              {initiative.labels.length === 0 ? (
                <span className="text-xs text-of-muted">배정된 라벨이 없습니다.</span>
              ) : null}
            </div>
            {initiative.is_mine ? (
              <Select
                aria-label="이니셔티브 라벨 배정"
                className="h-8 min-w-0 text-xs sm:w-52"
                value=""
                disabled={
                  replaceLabels.isPending ||
                  initiative.labels.length >= 8 ||
                  labelCandidates.length === 0
                }
                onChange={(event) => {
                  if (!event.target.value) return
                  replaceLabels.reset()
                  replaceLabels.mutate({
                    id: initiative.id,
                    labelIds: [
                      ...initiative.labels.map((label) => label.id),
                      event.target.value,
                    ],
                  })
                }}
              >
                <option value="">+ 라벨 배정</option>
                {labelCandidates.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {replaceLabels.isError ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-of-danger">
                  {replaceLabels.error instanceof Error
                    ? replaceLabels.error.message
                    : '라벨을 변경하지 못했습니다.'}
                </span>
                {replaceLabels.variables ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={replaceLabelsAgain}
                  >
                    <RefreshCw /> 재시도
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div>
            <p className="text-xs font-medium">연결 프로젝트</p>
            <p className="mt-0.5 text-[11px] text-of-muted">전략 범위와 진행률</p>
          </div>
          <div className="min-w-0 space-y-2">
            {initiative.projects.length === 0 ? (
              <p className="text-xs text-of-muted">표시 가능한 연결 프로젝트가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-of-border-subtle">
                {initiative.projects.map((project) => (
                  <li key={project.project_id} className="flex min-w-0 items-center gap-2 py-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={() => navigate(`/projects/${project.project_id}/dashboard`)}
                    >
                      <span className="block truncate text-xs font-medium hover:text-of-accent">
                        {project.project_name}
                      </span>
                      <Progress
                        done={project.done_work_package_count}
                        total={project.work_package_count}
                      />
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${project.project_name} 대시보드 열기`}
                      onClick={() => navigate(`/projects/${project.project_id}/dashboard`)}
                    >
                      <ArrowUpRight />
                    </Button>
                    {initiative.is_mine ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${project.project_name} 연결 해제`}
                        disabled={
                          disconnect.isPending && disconnect.variables === project.project_id
                        }
                        onClick={() => {
                          disconnect.reset()
                          if (
                            window.confirm(
                              `'${project.project_name}' 프로젝트의 이니셔티브 연결을 해제할까요?`,
                            )
                          ) {
                            disconnect.mutate(project.project_id)
                          }
                        }}
                      >
                        {disconnect.isPending && disconnect.variables === project.project_id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <X />
                        )}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {hiddenProjectCount > 0 ? (
              <p className="text-[11px] text-of-muted">
                권한이 없는 연결 프로젝트 {hiddenProjectCount}개는 세부 정보를 숨겼습니다.
              </p>
            ) : null}
            {initiative.is_mine ? (
              projects.isError ? (
                <div className="flex flex-wrap items-center gap-2" role="alert">
                  <span className="text-xs text-of-danger">프로젝트 후보를 불러오지 못했습니다.</span>
                  <Button size="sm" variant="outline" onClick={() => void projects.refetch()}>
                    <RefreshCw /> 재시도
                  </Button>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Select
                    aria-label="이니셔티브 연결 프로젝트"
                    className="h-8 min-w-0 flex-1 text-xs"
                    value={nextProjectId}
                    disabled={projects.isPending || connect.isPending || projectCandidates.length === 0}
                    onChange={(event) => setNextProjectId(event.target.value)}
                  >
                    <option value="">연결할 프로젝트 선택</option>
                    {projectCandidates.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!nextProjectId || connect.isPending}
                    onClick={() => {
                      connect.reset()
                      connect.mutate(nextProjectId, { onSuccess: () => setNextProjectId('') })
                    }}
                  >
                    {connect.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                    연결
                  </Button>
                </div>
              )
            ) : null}
            {connect.isError ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-of-danger">
                  {connect.error instanceof Error
                    ? connect.error.message
                    : '프로젝트를 연결하지 못했습니다.'}
                </span>
                {connect.variables ? (
                  <Button size="sm" variant="outline" onClick={connectAgain}>
                    <RefreshCw /> 재시도
                  </Button>
                ) : null}
              </div>
            ) : null}
            {disconnect.isError ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-of-danger">
                  {disconnect.error instanceof Error
                    ? disconnect.error.message
                    : '프로젝트 연결을 해제하지 못했습니다.'}
                </span>
                {disconnect.variables ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={disconnectAgain}
                  >
                    <RefreshCw /> 재시도
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {initiative.is_mine ? (
          <div className="grid min-w-0 gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-medium text-of-danger">삭제</p>
              <p className="mt-0.5 text-[11px] text-of-muted">되돌릴 수 없는 작업</p>
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-of-muted">
                연결된 프로젝트와 작업은 유지되며 이니셔티브 연결만 제거됩니다.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-of-danger hover:text-of-danger"
                disabled={remove.isPending}
                onClick={() => {
                  remove.reset()
                  if (
                    confirmDestructive(
                      `'${initiative.name}' 이니셔티브를 삭제할까요?\n연결된 프로젝트와 작업은 삭제되지 않습니다.`,
                    )
                  ) {
                    remove.mutate(initiative.id, { onSuccess: onDeleted })
                  }
                }}
              >
                {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                이니셔티브 삭제
              </Button>
              {remove.isError ? (
                <div className="flex flex-wrap items-center gap-2" role="alert">
                  <span className="text-xs text-of-danger">
                    {remove.error instanceof Error
                      ? remove.error.message
                      : '이니셔티브를 삭제하지 못했습니다.'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove.mutate(initiative.id, { onSuccess: onDeleted })}
                  >
                    <RefreshCw /> 재시도
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
