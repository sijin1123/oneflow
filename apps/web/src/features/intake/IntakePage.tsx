import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'
import { formatDateTime } from '@/lib/datetime'

import { type IntakeItem, type IntakeStatus, useIntake, useSubmitIntake, useTriageIntake } from './api'

const STATUS_ORDER: IntakeStatus[] = ['pending', 'snoozed', 'accepted', 'declined', 'duplicate']

const STATUS_LABELS: Record<IntakeStatus, string> = {
  pending: '대기',
  snoozed: '보류',
  accepted: '수락됨',
  declined: '거절됨',
  duplicate: '중복',
}

function ItemRow({
  item,
  isOwner,
  projectId,
}: {
  item: IntakeItem
  isOwner: boolean
  projectId: string
}) {
  const navigate = useNavigate()
  const memberName = useMemberNames(projectId)
  const triage = useTriageIntake(projectId)
  const [note, setNote] = useState('')
  const open = item.status === 'pending' || item.status === 'snoozed'

  return (
    <li className="space-y-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</span>
        <span className="shrink-0 text-[11px] text-of-muted">
          {item.submitter_name ?? '알 수 없음'}
        </span>
        {item.status === 'snoozed' && item.snooze_until ? (
          <span className="shrink-0 text-[11px] text-of-muted">~{item.snooze_until}</span>
        ) : null}
        {item.accepted_wp_id ? (
          <button
            type="button"
            className="shrink-0 text-[11px] text-of-accent hover:underline"
            onClick={() =>
              navigate(`/projects/${projectId}/work-packages?wp=${item.accepted_wp_id}`)
            }
          >
            작업 보기
          </button>
        ) : null}
      </div>
      {isOwner && open ? (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={triage.isPending}
            onClick={() => triage.mutate({ itemId: item.id, status: 'accepted', note: note || null })}
          >
            수락
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={triage.isPending}
            onClick={() => triage.mutate({ itemId: item.id, status: 'declined', note: note || null })}
          >
            거절
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={triage.isPending}
            onClick={() => triage.mutate({ itemId: item.id, status: 'duplicate', note: note || null })}
          >
            중복
          </Button>
          {item.status !== 'snoozed' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={triage.isPending}
              onClick={() => triage.mutate({ itemId: item.id, status: 'snoozed' })}
            >
              보류
            </Button>
          ) : null}
          {triage.isError ? (
            <span role="alert" className="text-[11px] text-of-danger">
              처리 실패 — 이미 처리된 항목일 수 있습니다.
            </span>
          ) : null}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="판정 사유 (선택 — 거절 시 권장)"
            aria-label={`${item.title} 판정 사유`}
            className="h-7 min-w-0 flex-1 rounded-of border border-of-border bg-of-surface px-2 text-[11px]"
          />
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
  const intake = useIntake(projectId)
  const me = useMe()
  const members = useMembers(projectId)
  const submit = useSubmitIntake(projectId)
  const [title, setTitle] = useState('')

  if (intake.isPending || members.isPending) return <ListSkeleton />
  if (intake.isError) return <ErrorState error={intake.error} onRetry={() => intake.refetch()} />

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = intake.data.items

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-base font-semibold">인테이크</h1>
      <p className="mb-4 text-xs text-of-muted">
        {isOwner
          ? '접수된 요청을 검토해 수락(작업 생성)·거절·보류·중복으로 분류합니다.'
          : '요청을 제출하면 소유자가 검토합니다. 내가 제출한 항목만 보입니다.'}
      </p>

      <div className="mb-5 flex items-center gap-2 rounded-of border border-of-border bg-of-surface p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="요청 제목"
          aria-label="인테이크 요청 제목"
          className="h-8 flex-1 text-xs"
        />
        <Button
          size="sm"
          disabled={!title.trim() || submit.isPending}
          onClick={() =>
            submit.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') })
          }
        >
          요청 제출
        </Button>
      </div>
      {submit.isError ? (
        <p role="alert" className="mb-3 text-xs text-of-danger">
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
            return (
              <section key={status} aria-label={STATUS_LABELS[status]}>
                <h2 className="mb-1.5 text-sm font-semibold">
                  {STATUS_LABELS[status]}{' '}
                  <span className="text-xs font-normal text-of-muted">{group.length}</span>
                </h2>
                <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                  {group.map((i) => (
                    <ItemRow key={i.id} item={i} isOwner={isOwner} projectId={projectId} />
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
