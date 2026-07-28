import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Loader2,
  PauseCircle,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useMe,
  useMemberNames,
  useMembers,
  usePermissionReport,
} from '@/features/members/api'
import { canWriteFrom } from '@/features/members/canWrite'
import { useProject } from '@/features/projects/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import {
  type IntakeItem,
  type IntakeStatus,
  useIntake,
  useSubmitIntake,
  useTriageIntake,
} from './api'
import { IntakeDecisionTimeline } from './IntakeDecisionTimeline'

const STATUS_ORDER: IntakeStatus[] = ['pending', 'snoozed', 'accepted', 'declined', 'duplicate']

const STATUS_LABELS: Record<IntakeStatus, string> = {
  pending: '대기',
  snoozed: '보류',
  accepted: '수락됨',
  declined: '거절됨',
  duplicate: '중복',
}

const STATUS_META: Record<
  IntakeStatus,
  { icon: typeof Clock3; tone: 'neutral' | 'accent' | 'danger'; hint: string }
> = {
  pending: { icon: Clock3, tone: 'accent', hint: '검토 대기' },
  snoozed: { icon: PauseCircle, tone: 'neutral', hint: '나중에 검토' },
  accepted: { icon: CheckCircle2, tone: 'accent', hint: '작업 생성' },
  declined: { icon: XCircle, tone: 'danger', hint: '요청 종료' },
  duplicate: { icon: Copy, tone: 'neutral', hint: '기존 항목과 중복' },
}

const DECISION_LABELS: Record<Exclude<IntakeStatus, 'pending'>, string> = {
  accepted: '수락',
  declined: '거절',
  duplicate: '중복',
  snoozed: '보류',
}

const COMPACT_ERROR_STATE_CLASS =
  'min-h-0 justify-start px-0 py-0 text-left sm:px-0 [&>div]:grid [&>div]:w-full [&>div]:max-w-none [&>div]:grid-cols-[2rem_minmax(0,1fr)_auto] [&>div]:items-center [&>div]:gap-x-2 [&>div]:gap-y-0.5 [&>div]:px-3 [&>div]:py-3 [&>div]:text-left [&>div>span]:row-span-2 [&>div>span]:h-8 [&>div>span]:w-8 [&>div>p]:col-start-2 [&_button]:col-start-3 [&_button]:row-span-2 [&_button]:row-start-1 [&_button]:ml-auto [&_button]:mt-0'

type DecisionInput = {
  status: Exclude<IntakeStatus, 'pending'>
  note?: string | null
  snooze_until?: string | null
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  return (
    <div className="min-w-0 border border-of-border bg-of-surface px-3 py-2.5 -ml-px -mt-px">
      <span className="block truncate text-[11px] text-of-muted">{label}</span>
      <strong
        className={cn(
          'mt-0.5 block text-base font-semibold tabular-nums text-of-text',
          tone === 'accent' && 'text-of-accent',
          tone === 'danger' && 'text-of-danger',
        )}
      >
        {value}
      </strong>
    </div>
  )
}

function IntakeQueueSkeleton() {
  return (
    <div
      data-testid="project-intake-skeleton"
      className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5"
    >
      <div className="grid grid-cols-2 [&>*:last-child]:col-span-2 sm:grid-cols-5 sm:[&>*:last-child]:col-span-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="border border-of-border px-3 py-2.5 -ml-px -mt-px">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="mt-2 h-5 w-8" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-y border-of-border py-3">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-20" />
      </div>
      {Array.from({ length: 2 }).map((_, group) => (
        <section key={group} className="border-t border-of-border pt-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="mt-2 divide-y divide-of-border border-y border-of-border">
            {Array.from({ length: group === 0 ? 3 : 2 }).map((__, row) => (
              <div key={row} className="space-y-2 px-3 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ItemRow({
  item,
  canTriage,
  projectId,
  highlighted = false,
  markWriteAccessStale,
  refreshSurface,
}: {
  item: IntakeItem
  canTriage: boolean
  projectId: string
  highlighted?: boolean
  markWriteAccessStale: () => void
  refreshSurface: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const memberName = useMemberNames(projectId)
  const triage = useTriageIntake(projectId)
  const [note, setNote] = useState('')
  const [failedDecision, setFailedDecision] = useState<DecisionInput | null>(null)
  const [notice, setNotice] = useState('')
  const open = item.status === 'pending' || item.status === 'snoozed'
  const meta = STATUS_META[item.status]
  const Icon = meta.icon
  const staleState =
    triage.error instanceof ApiError &&
    (triage.error.status === 403 || triage.error.status === 409)

  const runDecision = async (decision: DecisionInput) => {
    if (triage.isPending) return
    triage.reset()
    setFailedDecision(null)
    setNotice('')
    try {
      await triage.mutateAsync({ itemId: item.id, ...decision })
      setNote('')
      setNotice(`${DECISION_LABELS[decision.status]} 처리했습니다.`)
    } catch (error) {
      setFailedDecision(decision)
      if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
        markWriteAccessStale()
        void refreshSurface()
      }
    }
  }

  return (
    <li
      id={`intake-${item.id}`}
      tabIndex={highlighted ? -1 : undefined}
      aria-current={highlighted ? 'true' : undefined}
      className={cn(
        'min-w-0 scroll-mt-3 px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
        highlighted && 'bg-of-accent-soft ring-1 ring-inset ring-of-accent',
      )}
    >
      {highlighted ? <span className="sr-only">알림에서 선택한 요청</span> : null}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium',
                meta.tone === 'accent' && 'border-of-accent/20 bg-of-accent-soft text-of-accent',
                meta.tone === 'danger' && 'border-of-danger/20 text-of-danger',
                meta.tone === 'neutral' && 'border-of-border bg-of-surface-2 text-of-muted',
              )}
            >
              <Icon size={11} aria-hidden="true" />
              {STATUS_LABELS[item.status]}
            </span>
            <span className="min-w-0 break-words text-[13px] font-medium">{item.title}</span>
          </div>
          <p className="mt-1 text-[11px] text-of-muted">
            {item.submitter_name ?? '알 수 없음'} · {formatDateTime(item.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-of-muted">
          {item.status === 'snoozed' && item.snooze_until ? (
            <span>~{item.snooze_until}</span>
          ) : null}
          {item.accepted_wp_id ? (
            <button
              type="button"
              className="font-medium text-of-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() =>
                navigate(`/projects/${projectId}/work-packages?wp=${item.accepted_wp_id}`)
              }
            >
              작업 보기
            </button>
          ) : null}
        </div>
      </div>

      {canTriage && open ? (
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 border-t border-of-border pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              setFailedDecision(null)
              triage.reset()
            }}
            placeholder="판정 사유 (선택 — 거절 시 권장)"
            aria-label={`${item.title} 판정 사유`}
            className="h-8 min-w-0 rounded-of border border-of-border bg-of-surface px-2.5 text-xs focus-visible:border-of-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus/20"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              disabled={triage.isPending}
              onClick={() =>
                void runDecision({ status: 'accepted', note: note.trim() || null })
              }
            >
              {triage.isPending && triage.variables?.status === 'accepted' ? (
                <Loader2 className="animate-spin" size={13} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={13} aria-hidden="true" />
              )}
              수락
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={triage.isPending}
              onClick={() =>
                void runDecision({ status: 'declined', note: note.trim() || null })
              }
            >
              {triage.isPending && triage.variables?.status === 'declined' ? (
                <Loader2 className="animate-spin" size={13} aria-hidden="true" />
              ) : (
                <XCircle size={13} aria-hidden="true" />
              )}
              거절
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={triage.isPending}
              onClick={() =>
                void runDecision({ status: 'duplicate', note: note.trim() || null })
              }
            >
              {triage.isPending && triage.variables?.status === 'duplicate' ? (
                <Loader2 className="animate-spin" size={13} aria-hidden="true" />
              ) : (
                <Copy size={13} aria-hidden="true" />
              )}
              중복
            </Button>
            {item.status !== 'snoozed' ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={triage.isPending}
                onClick={() =>
                  void runDecision({ status: 'snoozed', note: note.trim() || null })
                }
              >
                {triage.isPending && triage.variables?.status === 'snoozed' ? (
                  <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                ) : (
                  <PauseCircle size={13} aria-hidden="true" />
                )}
                보류
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {failedDecision ? (
        <div
          role="alert"
          className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 border-l-2 border-of-danger bg-of-danger-soft px-2.5 py-2 text-[11px] text-of-danger"
        >
          <span>
            {staleState
              ? '프로젝트, 권한 또는 요청 상태가 변경되었습니다. 최신 상태를 확인하세요.'
              : `${DECISION_LABELS[failedDecision.status]} 처리하지 못했습니다. 입력과 대상을 유지했습니다.`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={triage.isPending}
            onClick={() =>
              staleState ? void refreshSurface() : void runDecision(failedDecision)
            }
          >
            <RefreshCw size={13} aria-hidden="true" />
            {staleState ? '최신 상태 확인' : `${DECISION_LABELS[failedDecision.status]} 다시 시도`}
          </Button>
        </div>
      ) : notice ? (
        <p role="status" className="mt-2 text-[11px] text-of-accent">
          {notice}
        </p>
      ) : null}

      {!open && item.triage_note ? (
        <p className="mt-2 text-[11px] text-of-muted">
          현재 판정 사유: <span className="whitespace-pre-wrap">{item.triage_note}</span>
          {item.triaged_by_id ? ` · ${memberName(item.triaged_by_id)}` : ''}
          {item.triaged_at ? ` · ${formatDateTime(item.triaged_at)}` : ''}
        </p>
      ) : null}
      <div className="mt-2">
        <IntakeDecisionTimeline
          projectId={projectId}
          itemId={item.id}
          itemTitle={item.title}
          hasDecision={Boolean(item.triaged_at)}
        />
      </div>
    </li>
  )
}

export function IntakePage() {
  const { projectId } = useParams() as { projectId: string }
  return <IntakeSurface key={projectId} projectId={projectId} />
}

function IntakeSurface({ projectId }: { projectId: string }) {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('item')
  const intake = useIntake(projectId)
  const me = useMe()
  const members = useMembers(projectId)
  const project = useProject(projectId)
  const permissions = usePermissionReport(projectId)
  const submit = useSubmitIntake(projectId)
  const [title, setTitle] = useState('')
  const [failedSubmissionTitle, setFailedSubmissionTitle] = useState<string | null>(null)
  const [submissionNeedsRefresh, setSubmissionNeedsRefresh] = useState(false)
  const [writeAccessStaleProjectId, setWriteAccessStaleProjectId] = useState<string | null>(
    null,
  )
  const [notice, setNotice] = useState('')
  const composerRef = useRef<HTMLInputElement>(null)
  const focusedHighlightRef = useRef<string | null>(null)
  const activeProjectIdRef = useRef(projectId)
  const mountedRef = useRef(true)
  activeProjectIdRef.current = projectId

  const refreshAll = async () => {
    const refreshProjectId = projectId
    const results = await Promise.all([
      intake.refetch(),
      me.refetch(),
      members.refetch(),
      project.refetch(),
      permissions.refetch(),
    ])
    if (results.every((result) => result.isSuccess)) {
      setWriteAccessStaleProjectId((current) =>
        current === refreshProjectId ? null : current,
      )
    }
    return results
  }
  const refreshPending =
    intake.isFetching ||
    me.isFetching ||
    members.isFetching ||
    project.isFetching ||
    permissions.isFetching

  const myRole = members.data?.items.find((member) => member.user_id === me.data?.id)?.role
  const accessReady = Boolean(me.data && members.data && project.data)
  const writeAccessStale = writeAccessStaleProjectId === projectId
  const canSubmit =
    !writeAccessStale && canWriteFrom(myRole, project.data?.archived_at, accessReady)
  const canTriage =
    canSubmit &&
    (myRole === 'owner' ||
      permissions.data?.my_custom_role?.permissions.includes('intake.triage') === true)
  const supportingError = me.error ?? members.error ?? project.error ?? permissions.error
  const supportingPending =
    (!me.data && me.isPending) ||
    (!members.data && members.isPending) ||
    (!project.data && project.isPending) ||
    (!permissions.data && permissions.isPending)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!highlightId) {
      focusedHighlightRef.current = null
      return
    }
    if (
      !intake.data ||
      supportingPending ||
      focusedHighlightRef.current === highlightId
    ) {
      return
    }
    const target = document.getElementById(`intake-${highlightId}`)
    if (!target) return
    target.focus({ preventScroll: true })
    target?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
    focusedHighlightRef.current = highlightId
  }, [highlightId, intake.data, supportingPending])

  const submitRequest = async (requestTitle: string) => {
    if (!requestTitle || submit.isPending) return
    const submissionProjectId = projectId
    submit.reset()
    setFailedSubmissionTitle(null)
    setSubmissionNeedsRefresh(false)
    setNotice('')
    try {
      await submit.mutateAsync({ title: requestTitle })
      if (!mountedRef.current || activeProjectIdRef.current !== submissionProjectId) return
      setTitle((current) => (current.trim() === requestTitle ? '' : current))
      setNotice('요청을 제출했습니다.')
    } catch (error) {
      if (!mountedRef.current || activeProjectIdRef.current !== submissionProjectId) return
      setFailedSubmissionTitle(requestTitle)
      if (error instanceof ApiError && (error.status === 403 || error.status === 409)) {
        setSubmissionNeedsRefresh(true)
        setWriteAccessStaleProjectId(projectId)
        void refreshAll()
      }
    }
  }

  if (!intake.data || supportingPending) {
    const pending =
      intake.isPending ||
      supportingPending
    return (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
        <h1 className="sr-only">인테이크</h1>
        <FrameContextActions>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="인테이크 새로고침"
            title="새로고침"
            disabled={refreshPending}
            onClick={() => void refreshAll()}
          >
            <RefreshCw
              size={13}
              className={refreshPending ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
          </Button>
        </FrameContextActions>
        <section
          aria-label="인테이크 요청 결과"
          aria-busy={pending}
          className="of-scrollbar min-h-0 flex-1 overflow-y-auto"
        >
          {pending ? (
            <IntakeQueueSkeleton />
          ) : (
            <div className="mx-auto grid w-full max-w-6xl content-start gap-3 px-3 py-4 sm:px-5">
              {intake.isError ? (
                <section aria-label="인테이크 요청 오류">
                  <ErrorState
                    error={intake.error}
                    onRetry={() => intake.refetch()}
                    className={COMPACT_ERROR_STATE_CLASS}
                  />
                </section>
              ) : null}
              {supportingError ? (
                <section aria-label="인테이크 권한 오류">
                  <ErrorState
                    error={supportingError}
                    onRetry={() => void refreshAll()}
                    className={COMPACT_ERROR_STATE_CLASS}
                  />
                </section>
              ) : null}
            </div>
          )}
        </section>
      </div>
    )
  }

  const items = intake.data.items
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, items.filter((item) => item.status === status).length]),
  ) as Record<IntakeStatus, number>
  const openCount = counts.pending + counts.snoozed
  const retainedDataError = intake.isError || Boolean(supportingError)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <h1 className="sr-only">인테이크</h1>
      <FrameContextActions>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="인테이크 새로고침"
          title="새로고침"
          disabled={refreshPending || submit.isPending}
          onClick={() => void refreshAll()}
        >
          <RefreshCw
            size={13}
            className={refreshPending ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
        </Button>
        {canSubmit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => composerRef.current?.focus()}
          >
            <Plus size={13} aria-hidden="true" />
            새 요청
          </Button>
        ) : null}
      </FrameContextActions>

      <section
        aria-label="인테이크 상태"
        className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-of-border-subtle bg-of-surface-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <ClipboardList size={13} aria-hidden="true" />
            Intake
          </span>
          <span className="h-4 w-px bg-of-border" aria-hidden="true" />
          <span className="text-[11px] text-of-muted">
            열린 요청 {openCount} · 전체 {intake.data.total}
          </span>
          {project.data?.archived_at ? (
            <span className="rounded-full border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted">
              보관됨
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-of-muted">
          {canTriage
            ? '접수 요청을 검토하고 작업으로 전환할 수 있습니다.'
            : canSubmit
              ? '내가 제출한 요청과 처리 결과를 확인합니다.'
              : '읽기 전용으로 요청과 처리 결과를 확인합니다.'}
        </span>
      </section>

      {retainedDataError ? (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"
        >
          <span>마지막으로 불러온 요청을 유지하고 있습니다. 최신 상태를 다시 확인하세요.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshPending}
            onClick={() => void refreshAll()}
          >
            <RefreshCw
              size={13}
              className={refreshPending ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            다시 시도
          </Button>
        </div>
      ) : null}

      <div
        data-testid="project-intake-scroll"
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5">
          <section
            aria-label="인테이크 요약"
            className="grid grid-cols-2 [&>*:last-child]:col-span-2 sm:grid-cols-5 sm:[&>*:last-child]:col-span-1"
          >
            <SummaryTile label="열린 요청" value={openCount} tone="accent" />
            <SummaryTile label="대기" value={counts.pending} />
            <SummaryTile label="보류" value={counts.snoozed} />
            <SummaryTile label="수락됨" value={counts.accepted} tone="accent" />
            <SummaryTile
              label="종료"
              value={counts.declined + counts.duplicate}
              tone={counts.declined > 0 ? 'danger' : 'neutral'}
            />
          </section>

          {canSubmit ? (
            <section
              aria-label="새 인테이크 요청"
              className="grid min-w-0 grid-cols-1 gap-2 border-y border-of-border py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Input
                ref={composerRef}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setFailedSubmissionTitle(null)
                  setSubmissionNeedsRefresh(false)
                  submit.reset()
                }}
                placeholder="요청 제목"
                aria-label="인테이크 요청 제목"
                className="h-8 min-w-0 text-xs"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void submitRequest(title.trim())
                  }
                }}
              />
              <Button
                size="sm"
                disabled={!title.trim() || submit.isPending}
                onClick={() => void submitRequest(title.trim())}
              >
                {submit.isPending ? (
                  <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                ) : (
                  <Plus size={13} aria-hidden="true" />
                )}
                요청 제출
              </Button>
              {failedSubmissionTitle ? (
                <div
                  role="alert"
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-l-2 border-of-danger bg-of-danger-soft px-2.5 py-2 text-[11px] text-of-danger sm:col-span-2"
                >
                  <span>
                    {submissionNeedsRefresh
                      ? '프로젝트 또는 권한 상태가 변경되었습니다. 최신 상태를 확인하세요.'
                      : '요청을 제출하지 못했습니다. 제목과 제출 의도를 유지했습니다.'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={submit.isPending}
                    onClick={() =>
                      submissionNeedsRefresh
                        ? void refreshAll()
                        : void submitRequest(failedSubmissionTitle)
                    }
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    {submissionNeedsRefresh ? '최신 상태 확인' : '제출 다시 시도'}
                  </Button>
                </div>
              ) : notice ? (
                <p role="status" className="text-[11px] text-of-accent sm:col-span-2">
                  {notice}
                </p>
              ) : null}
            </section>
          ) : (
            <ReadOnlyNotice />
          )}

          {items.length === 0 ? (
            <EmptyState
              title="접수된 요청이 없습니다"
              hint={canSubmit ? '위에서 첫 요청을 제출해 보세요.' : '표시할 요청이 없습니다.'}
            />
          ) : (
            <div className="space-y-4">
              {STATUS_ORDER.map((status) => {
                const group = items.filter((item) => item.status === status)
                if (group.length === 0) return null
                const meta = STATUS_META[status]
                const Icon = meta.icon
                return (
                  <section
                    key={status}
                    aria-label={STATUS_LABELS[status]}
                    className="min-w-0 border-t border-of-border pt-3"
                  >
                    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold">
                        <Icon size={13} aria-hidden="true" />
                        {STATUS_LABELS[status]}
                      </h2>
                      <span className="text-[11px] font-normal text-of-muted">
                        {group.length} · {meta.hint}
                      </span>
                    </div>
                    <ul className="divide-y divide-of-border border-y border-of-border">
                      {group.map((item) => (
                        <ItemRow
                          key={`${projectId}:${item.id}`}
                          item={item}
                          canTriage={canTriage}
                          projectId={projectId}
                          highlighted={item.id === highlightId}
                          markWriteAccessStale={() => setWriteAccessStaleProjectId(projectId)}
                          refreshSurface={refreshAll}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
