import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  PauseCircle,
  Plus,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { type IntakeItem, type IntakeStatus, useIntake, useSubmitIntake, useTriageIntake } from './api'

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

function SummaryCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: number
  hint: string
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-of border bg-of-surface px-3 py-3',
        tone === 'danger' ? 'border-of-danger/25' : 'border-of-border',
      )}
    >
      <p className="truncate text-[11px] font-medium text-of-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums text-of-text',
          tone === 'accent' && 'text-of-accent',
          tone === 'danger' && 'text-of-danger',
        )}
      >
        {value}
      </p>
      <p className="mt-1 break-words text-[11px] leading-4 text-of-muted">{hint}</p>
    </div>
  )
}

function ItemRow({
  item,
  isOwner,
  projectId,
  highlighted = false,
}: {
  item: IntakeItem
  isOwner: boolean
  projectId: string
  highlighted?: boolean
}) {
  const navigate = useNavigate()
  const memberName = useMemberNames(projectId)
  const triage = useTriageIntake(projectId)
  const [note, setNote] = useState('')
  const open = item.status === 'pending' || item.status === 'snoozed'
  const meta = STATUS_META[item.status]
  const Icon = meta.icon

  return (
    <li
      className={cn(
        'min-w-0 space-y-3 rounded-of border bg-of-surface p-3',
        highlighted ? 'border-of-accent ring-1 ring-of-accent' : 'border-of-border',
      )}
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-of border px-2 text-[11px] font-medium',
                meta.tone === 'accent' && 'border-of-accent/20 bg-of-accent-soft text-of-accent',
                meta.tone === 'danger' && 'border-of-danger/20 text-of-danger',
                meta.tone === 'neutral' && 'border-of-border bg-of-surface-2 text-of-muted',
              )}
            >
              <Icon size={12} aria-hidden="true" />
              {STATUS_LABELS[item.status]}
            </span>
            <span className="min-w-0 truncate text-[13px] font-medium">{item.title}</span>
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
              className="text-of-accent hover:underline"
              onClick={() =>
                navigate(`/projects/${projectId}/work-packages?wp=${item.accepted_wp_id}`)
              }
            >
              작업 보기
            </button>
          ) : null}
        </div>
      </div>
      {isOwner && open ? (
        <div className="grid min-w-0 grid-cols-1 gap-2 border-t border-of-border pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="판정 사유 (선택 — 거절 시 권장)"
            aria-label={`${item.title} 판정 사유`}
            className="h-8 min-w-0 rounded-of border border-of-border bg-of-surface px-2.5 text-xs focus-visible:border-of-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus/20"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              disabled={triage.isPending}
              onClick={() =>
                triage.mutate({ itemId: item.id, status: 'accepted', note: note || null })
              }
            >
              <CheckCircle2 size={13} /> 수락
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={triage.isPending}
              onClick={() =>
                triage.mutate({ itemId: item.id, status: 'declined', note: note || null })
              }
            >
              <XCircle size={13} /> 거절
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={triage.isPending}
              onClick={() =>
                triage.mutate({ itemId: item.id, status: 'duplicate', note: note || null })
              }
            >
              <Copy size={13} /> 중복
            </Button>
            {item.status !== 'snoozed' ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={triage.isPending}
                onClick={() => triage.mutate({ itemId: item.id, status: 'snoozed' })}
              >
                <PauseCircle size={13} /> 보류
              </Button>
            ) : null}
          </div>
          {triage.isError ? (
            <span role="alert" className="text-[11px] text-of-danger sm:col-span-2">
              처리 실패 — 이미 처리된 항목일 수 있습니다.
            </span>
          ) : null}
        </div>
      ) : null}
      {!open && item.triage_note ? (
        <p className="text-[11px] text-of-muted">
          판정 사유: <span className="whitespace-pre-wrap">{item.triage_note}</span>
          {item.triaged_by_id ? ` · ${memberName(item.triaged_by_id)}` : ''}
          {item.triaged_at ? ` · ${formatDateTime(item.triaged_at)}` : ''}
        </p>
      ) : null}
    </li>
  )
}

/* Project intake queue (expansion Pass 2 PR-H): members submit requests,
   owners triage them; accepting turns the request into a work package. */
export function IntakePage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams] = useSearchParams()
  // Bell deep-link anchor (Pass 49): highlight the triaged item.
  const highlightId = searchParams.get('item')
  const intake = useIntake(projectId)
  const me = useMe()
  const members = useMembers(projectId)
  const submit = useSubmitIntake(projectId)
  const canWrite = useCanWrite(projectId)
  const [title, setTitle] = useState('')

  if (intake.isPending || members.isPending) return <ListSkeleton />
  if (intake.isError) return <ErrorState error={intake.error} onRetry={() => intake.refetch()} />

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = intake.data.items
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [status, items.filter((item) => item.status === status).length]),
  ) as Record<IntakeStatus, number>
  const openCount = counts.pending + counts.snoozed

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-col gap-2 border-b border-of-border pb-4">
        <span className="inline-flex w-fit items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-[11px] font-medium text-of-muted">
          <ClipboardList size={12} aria-hidden="true" />
          Intake
        </span>
        <div className="min-w-0">
          <h1 className="break-words text-base font-semibold">인테이크</h1>
          <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-of-muted">
            {isOwner
              ? '접수된 요청을 검토해 작업화, 보류, 종료 여부를 결정합니다.'
              : '요청을 제출하면 소유자가 검토합니다. 내가 제출한 항목만 보입니다.'}
          </p>
        </div>
      </header>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="열린 요청" value={openCount} hint="대기와 보류" tone="accent" />
        <SummaryCard label="대기" value={counts.pending} hint={STATUS_META.pending.hint} />
        <SummaryCard
          label="수락됨"
          value={counts.accepted}
          hint={STATUS_META.accepted.hint}
          tone="accent"
        />
        <SummaryCard
          label="종료"
          value={counts.declined + counts.duplicate}
          hint="거절 또는 중복"
          tone={counts.declined > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {canWrite ? (
        <section className="min-w-0 space-y-2">
          <h2 className="text-sm font-semibold">새 요청</h2>
          <div className="grid min-w-0 grid-cols-1 gap-2 rounded-of border border-of-border bg-of-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="요청 제목"
            aria-label="인테이크 요청 제목"
            className="h-8 min-w-0 text-xs"
          />
          <Button
            size="sm"
            disabled={!title.trim() || submit.isPending}
            onClick={() =>
              submit.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') })
            }
          >
            <Plus size={13} /> 요청 제출
          </Button>
          </div>
        </section>
      ) : (
        <ReadOnlyNotice />
      )}
      {submit.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          제출하지 못했습니다.
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="접수된 요청이 없습니다" hint="위에서 첫 요청을 제출해 보세요." />
      ) : (
        <div className="space-y-5">
          {STATUS_ORDER.map((status) => {
            const group = items.filter((i) => i.status === status)
            if (group.length === 0) return null
            const meta = STATUS_META[status]
            const Icon = meta.icon
            return (
              <section key={status} aria-label={STATUS_LABELS[status]} className="min-w-0">
                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <Icon size={14} aria-hidden="true" />
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className="text-xs font-normal text-of-muted">
                    {group.length} · {meta.hint}
                  </span>
                </div>
                <ul className="space-y-2">
                  {group.map((i) => (
                    <ItemRow
                      key={i.id}
                      item={i}
                      isOwner={isOwner}
                      projectId={projectId}
                      highlighted={i.id === highlightId}
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
