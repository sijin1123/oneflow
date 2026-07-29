import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Coins,
  FolderCog,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'

import { ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useProject, useUpdateProject } from '@/features/projects/api'
import { HEALTH_LABELS, type Project, type ProjectHealth } from '@/features/projects/types'
import { ApiError } from '@/lib/api'

type SaveFeedbackProps = {
  pending: boolean
  success: boolean
  error: unknown
  pendingLabel: string
  successLabel: string
  errorLabel: string
  onRetry: () => void
}

function SaveFeedback({
  pending,
  success,
  error,
  pendingLabel,
  successLabel,
  errorLabel,
  onRetry,
}: SaveFeedbackProps) {
  return (
    <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2" aria-live="polite">
      {pending ? (
        <>
          <LoaderCircle size={13} className="animate-spin text-of-muted" aria-hidden="true" />
          <p className="text-xs text-of-muted">{pendingLabel}</p>
        </>
      ) : error ? (
        <>
          <CircleAlert size={13} className="text-of-danger" aria-hidden="true" />
          <p role="alert" className="min-w-0 flex-1 text-xs text-of-danger">
            {error instanceof ApiError ? error.message : errorLabel}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw size={13} aria-hidden="true" />
            다시 시도
          </Button>
        </>
      ) : success ? (
        <>
          <CircleCheck size={13} className="text-of-success" aria-hidden="true" />
          <p className="text-xs text-of-success">{successLabel}</p>
        </>
      ) : null}
    </div>
  )
}

function formatProjectDate(value: string) {
  return value.slice(0, 10)
}

export function GeneralPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const identityUpdate = useUpdateProject(projectId)
  const budgetUpdate = useUpdateProject(projectId)
  const [pName, setPName] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [budget, setBudget] = useState('')
  const [healthDirty, setHealthDirty] = useState(false)
  const [identityAttempt, setIdentityAttempt] = useState<{
    name: string
    description: string | null
  } | null>(null)
  const [budgetAttempt, setBudgetAttempt] = useState<{ budget: number | null } | null>(null)
  const syncedProject = useRef<Project | null>(null)

  useEffect(() => {
    const next = project.data
    if (!next) return
    const previous = syncedProject.current
    if (!previous || previous.id !== next.id) {
      setPName(next.name)
      setPDesc(next.description ?? '')
      setBudget(next.budget === null ? '' : String(next.budget))
    } else {
      setPName((current) => (current === previous.name ? next.name : current))
      setPDesc((current) =>
        current === (previous.description ?? '') ? (next.description ?? '') : current,
      )
      setBudget((current) =>
        current === (previous.budget === null ? '' : String(previous.budget))
          ? next.budget === null
            ? ''
            : String(next.budget)
          : current,
      )
    }
    syncedProject.current = next
  }, [project.data])

  const identityDirty =
    project.data != null &&
    (pName !== project.data.name || pDesc !== (project.data.description ?? ''))
  const budgetValue = budget.trim() === '' ? null : Number(budget)
  const budgetValid =
    budgetValue === null ||
    (Number.isFinite(budgetValue) && budgetValue >= 0 && budgetValue <= 1_000_000_000_000)
  const budgetDirty =
    project.data != null &&
    budgetValue !== project.data.budget
  const archived = project.data?.archived_at != null
  const editable = isOwner && !archived
  const dirty = editable && (identityDirty || budgetDirty || healthDirty)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  if (project.isPending) {
    return (
      <div
        role="status"
        aria-label="프로젝트 일반 설정 불러오는 중"
        aria-busy="true"
        className="space-y-4"
      >
        <div className="flex items-center gap-3 border-b border-of-border-subtle pb-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="grid gap-3 py-4 md:grid-cols-[10rem_minmax(0,1fr)]">
            <Skeleton className="h-10 w-32" />
            <Skeleton className={index === 0 ? 'h-28 w-full' : 'h-16 w-full'} />
          </div>
        ))}
      </div>
    )
  }

  if (!project.data) {
    return <ErrorState error={project.error} onRetry={() => project.refetch()} />
  }

  const saveIdentity = (payload = {
    name: pName.trim(),
    description: pDesc.trim() === '' ? null : pDesc.trim(),
  }) => {
    setIdentityAttempt(payload)
    identityUpdate.mutate(payload, {
      onSuccess: (updated) => {
        setIdentityAttempt(null)
        setPName(updated.name)
        setPDesc(updated.description ?? '')
      },
    })
  }

  const saveBudget = (payload = { budget: budgetValue }) => {
    setBudgetAttempt(payload)
    budgetUpdate.mutate(payload, {
      onSuccess: (updated) => {
        setBudgetAttempt(null)
        setBudget(updated.budget === null ? '' : String(updated.budget))
      },
    })
  }

  return (
    <section
      aria-label="프로젝트 일반 설정"
      aria-busy={project.isFetching || identityUpdate.isPending || budgetUpdate.isPending}
      className="min-w-0"
    >
      <header className="flex min-w-0 flex-col gap-3 border-b border-of-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-of bg-of-accent-soft text-of-accent">
            <FolderCog size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{project.data.name}</h2>
            <p className="mt-0.5 text-xs text-of-muted">
              식별 정보, 예산과 상태 보고를 관리합니다.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={project.isFetching}
            onClick={() => void project.refetch()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={project.isFetching ? 'animate-spin' : undefined}
            />
            일반 설정 새로고침
          </Button>
          <Badge variant="outline">{project.data.key}</Badge>
          <Badge variant={archived ? 'danger' : isOwner ? 'accent' : 'outline'}>
            {archived ? '보관됨 · 읽기 전용' : isOwner ? '소유자 편집' : '읽기 전용'}
          </Badge>
        </div>
      </header>

      {project.isError ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2">
            <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-of-warning" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-of-text">
                최신 프로젝트 설정을 불러오지 못했습니다.
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                마지막으로 확인한 설정과 저장하지 않은 변경을 유지합니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={project.isFetching}
            onClick={() => void project.refetch()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={project.isFetching ? 'animate-spin' : undefined}
            />
            프로젝트 설정 다시 시도
          </Button>
        </div>
      ) : null}

      {archived ? (
        <div className="mt-3 flex items-start gap-2 border-l-2 border-of-warning bg-of-warning-soft/30 px-3 py-2 text-xs text-of-muted">
          <CircleAlert size={14} className="mt-0.5 shrink-0 text-of-warning" aria-hidden="true" />
          <p>보관된 프로젝트는 모든 변경이 차단됩니다. 위험 구역에서 복원한 뒤 편집하세요.</p>
        </div>
      ) : !isOwner ? (
        <div className="mt-3 flex items-start gap-2 border-l-2 border-of-border px-3 py-2 text-xs text-of-muted">
          <KeyRound size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>현재 역할에서는 설정을 조회할 수만 있습니다. 프로젝트 소유자에게 변경을 요청하세요.</p>
        </div>
      ) : null}

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 divide-y divide-of-border-subtle lg:pr-6">
          <section
            aria-labelledby="project-identity-title"
            className="grid min-w-0 gap-4 py-5 md:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <div>
              <h3 id="project-identity-title" className="text-xs font-semibold">
                기본 정보
              </h3>
              <p className="mt-1 text-[11px] leading-4 text-of-muted">
                프로젝트를 찾고 구분할 때 표시됩니다.
              </p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <div className="min-w-0 space-y-1">
                  <label htmlFor="p-name" className="text-[11px] font-medium text-of-text">
                    이름
                  </label>
                  <Input
                    id="p-name"
                    value={pName}
                    maxLength={120}
                    disabled={!editable || identityUpdate.isPending}
                    onChange={(event) => {
                      identityUpdate.reset()
                      setPName(event.target.value)
                    }}
                    aria-label="프로젝트 이름"
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <label htmlFor="p-key" className="text-[11px] font-medium text-of-text">
                    프로젝트 키
                  </label>
                  <Input
                    id="p-key"
                    value={project.data.key}
                    disabled
                    aria-label="프로젝트 키"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="p-desc" className="text-[11px] font-medium text-of-text">
                    설명
                  </label>
                  <span className="text-[10px] tabular-nums text-of-muted">
                    {pDesc.length.toLocaleString('ko-KR')} / 20,000
                  </span>
                </div>
                <Textarea
                  id="p-desc"
                  value={pDesc}
                  maxLength={20_000}
                  disabled={!editable || identityUpdate.isPending}
                  onChange={(event) => {
                    identityUpdate.reset()
                    setPDesc(event.target.value)
                  }}
                  aria-label="프로젝트 설명"
                  className="min-h-28 resize-y"
                />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !editable ||
                    identityUpdate.isPending ||
                    !identityDirty ||
                    pName.trim().length === 0
                  }
                  onClick={() => saveIdentity()}
                >
                  기본 정보 저장
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!editable || identityUpdate.isPending || !identityDirty}
                  onClick={() => {
                    identityUpdate.reset()
                    setPName(project.data.name)
                    setPDesc(project.data.description ?? '')
                  }}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  초기화
                </Button>
              </div>
              <SaveFeedback
                pending={identityUpdate.isPending}
                success={identityUpdate.isSuccess}
                error={identityUpdate.error}
                pendingLabel="기본 정보를 저장하는 중입니다."
                successLabel="기본 정보를 저장했습니다."
                errorLabel="기본 정보를 저장하지 못했습니다."
                onRetry={() => {
                  if (identityAttempt) saveIdentity(identityAttempt)
                }}
              />
            </div>
          </section>

          <section
            aria-labelledby="project-budget-title"
            className="grid min-w-0 gap-4 py-5 md:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <div>
              <div className="flex items-center gap-2">
                <Coins size={14} className="text-of-muted" aria-hidden="true" />
                <h3 id="project-budget-title" className="text-xs font-semibold">
                  예산
                </h3>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-of-muted">
                비용 보고와 대시보드 비교 기준입니다.
              </p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="max-w-sm space-y-1">
                <label htmlFor="p-budget" className="text-[11px] font-medium text-of-text">
                  프로젝트 예산 (원)
                </label>
                <Input
                  id="p-budget"
                  type="number"
                  min="0"
                  max="1000000000000"
                  step="1"
                  value={budget}
                  disabled={!editable || budgetUpdate.isPending}
                  onChange={(event) => {
                    budgetUpdate.reset()
                    setBudget(event.target.value)
                  }}
                  aria-label="프로젝트 예산"
                  aria-invalid={!budgetValid}
                  placeholder="예산 미설정"
                />
                <p className={budgetValid ? 'text-[11px] text-of-muted' : 'text-[11px] text-of-danger'}>
                  {budgetValid
                    ? budgetValue === null
                      ? '비워 두면 예산을 설정하지 않습니다.'
                      : `₩${budgetValue.toLocaleString('ko-KR')}`
                    : '0원 이상 1조 원 이하의 숫자를 입력하세요.'}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!editable || budgetUpdate.isPending || !budgetDirty || !budgetValid}
                  onClick={() => saveBudget()}
                >
                  예산 저장
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!editable || budgetUpdate.isPending || !budgetDirty}
                  onClick={() => {
                    budgetUpdate.reset()
                    setBudget(project.data.budget === null ? '' : String(project.data.budget))
                  }}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  초기화
                </Button>
              </div>
              <SaveFeedback
                pending={budgetUpdate.isPending}
                success={budgetUpdate.isSuccess}
                error={budgetUpdate.error}
                pendingLabel="예산을 저장하는 중입니다."
                successLabel="예산을 저장했습니다."
                errorLabel="예산을 저장하지 못했습니다."
                onRetry={() => {
                  if (budgetAttempt) saveBudget(budgetAttempt)
                }}
              />
            </div>
          </section>

          <HealthSection
            projectId={projectId}
            project={project.data}
            editable={editable}
            onDirtyChange={setHealthDirty}
          />
        </div>

        <aside
          aria-label="프로젝트 기록"
          className="border-t border-of-border-subtle py-5 lg:border-l lg:border-t-0 lg:pl-5"
        >
          <p className="text-[11px] font-medium uppercase text-of-muted">Project record</p>
          <dl className="mt-3 divide-y divide-of-border-subtle text-xs">
            <div className="py-2 first:pt-0">
              <dt className="text-[11px] text-of-muted">프로젝트 키</dt>
              <dd className="mt-0.5 font-mono font-medium">{project.data.key}</dd>
            </div>
            <div className="py-2">
              <dt className="text-[11px] text-of-muted">생성일</dt>
              <dd className="mt-0.5 font-medium">{formatProjectDate(project.data.created_at)}</dd>
            </div>
            <div className="py-2">
              <dt className="text-[11px] text-of-muted">마지막 변경</dt>
              <dd className="mt-0.5 font-medium">{formatProjectDate(project.data.updated_at)}</dd>
            </div>
            <div className="py-2">
              <dt className="text-[11px] text-of-muted">수명주기</dt>
              <dd className="mt-0.5 font-medium">
                {archived ? `보관 · ${formatProjectDate(project.data.archived_at!)}` : '활성'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] leading-4 text-of-muted">
            프로젝트 키는 생성 후 변경되지 않습니다. 보관과 복원은 위험 구역에서 관리합니다.
          </p>
        </aside>
      </div>
    </section>
  )
}

function HealthSection({
  projectId,
  project,
  editable,
  onDirtyChange,
}: {
  projectId: string
  project: Project
  editable: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const updateProject = useUpdateProject(projectId)
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const [health, setHealth] = useState<'' | ProjectHealth>(project.health ?? '')
  const [note, setNote] = useState(project.health_note ?? '')
  const [lastAttempt, setLastAttempt] = useState<
    { health: null } | { health: ProjectHealth; health_note: string | null } | null
  >(null)
  const syncedProject = useRef<Project | null>(null)

  useEffect(() => {
    const previous = syncedProject.current
    if (!previous || previous.id !== project.id) {
      setHealth(project.health ?? '')
      setNote(project.health_note ?? '')
    } else {
      setHealth((current) =>
        current === (previous.health ?? '') ? (project.health ?? '') : current,
      )
      setNote((current) =>
        current === (previous.health_note ?? '') ? (project.health_note ?? '') : current,
      )
    }
    syncedProject.current = project
  }, [project])

  const dirty =
    health !== (project.health ?? '') ||
    note !== (project.health_note ?? '')
  useEffect(() => onDirtyChange(editable && dirty), [dirty, editable, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const updatedBy = project.health_updated_by
  const reporterName = updatedBy
    ? members.data?.items.some((member) => member.user_id === updatedBy)
      ? memberName(updatedBy)
      : '이전 구성원'
    : null
  const payload = useMemo(
    () =>
      health === ''
        ? ({ health: null } as const)
        : {
            health,
            health_note: note.trim() === '' ? null : note.trim(),
          },
    [health, note],
  )
  const save = (input = payload) => {
    setLastAttempt(input)
    updateProject.mutate(input, {
      onSuccess: (updated) => {
        setLastAttempt(null)
        setHealth(updated.health ?? '')
        setNote(updated.health_note ?? '')
      },
    })
  }

  return (
    <section
      aria-labelledby="project-health-title"
      className="grid min-w-0 gap-4 py-5 md:grid-cols-[10rem_minmax(0,1fr)]"
    >
      <div>
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-of-muted" aria-hidden="true" />
          <h3 id="project-health-title" className="text-xs font-semibold">
            상태 보고
          </h3>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-of-muted">
          최신 판단과 근거를 대시보드에 공유합니다.
        </p>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="space-y-1">
            <label htmlFor="p-health" className="text-[11px] font-medium text-of-text">
              상태
            </label>
            <Select
              id="p-health"
              aria-label="프로젝트 상태"
              value={health}
              disabled={!editable || updateProject.isPending}
              onChange={(event) => {
                updateProject.reset()
                const next = event.target.value as '' | ProjectHealth
                setHealth(next)
                if (next === '') setNote('')
              }}
            >
              <option value="">미설정</option>
              {(Object.keys(HEALTH_LABELS) as ProjectHealth[]).map((value) => (
                <option key={value} value={value}>
                  {HEALTH_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="p-health-note" className="text-[11px] font-medium text-of-text">
              판단 근거
            </label>
            <Textarea
              id="p-health-note"
              value={note}
              maxLength={2000}
              disabled={!editable || health === '' || updateProject.isPending}
              onChange={(event) => {
                updateProject.reset()
                setNote(event.target.value)
              }}
              placeholder={health === '' ? '상태를 선택하면 근거를 입력할 수 있습니다.' : '선택 사항'}
              aria-label="상태 사유"
              className="min-h-20 resize-y"
            />
          </div>
        </div>
        {project.health_updated_at ? (
          <p className="text-[11px] text-of-muted">
            마지막 보고: {formatProjectDate(project.health_updated_at)}
            {reporterName ? ` · ${reporterName}` : ''}
          </p>
        ) : (
          <p className="text-[11px] text-of-muted">아직 공유된 상태 보고가 없습니다.</p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || updateProject.isPending || !dirty}
            onClick={() => save()}
          >
            상태 저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!editable || updateProject.isPending || !dirty}
            onClick={() => {
              updateProject.reset()
              setHealth(project.health ?? '')
              setNote(project.health_note ?? '')
            }}
          >
            <RotateCcw size={13} aria-hidden="true" />
            초기화
          </Button>
        </div>
        <SaveFeedback
          pending={updateProject.isPending}
          success={updateProject.isSuccess}
          error={updateProject.error}
          pendingLabel="상태 보고를 저장하는 중입니다."
          successLabel="상태 보고를 저장했습니다."
          errorLabel="상태 보고를 저장하지 못했습니다."
          onRetry={() => {
            if (lastAttempt) save(lastAttempt)
          }}
        />
      </div>
    </section>
  )
}
