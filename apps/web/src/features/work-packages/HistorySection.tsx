import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { useActivities, useComments, useCreateComment } from './api'
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from './types'
import type { Activity, Comment } from './types'

const FIELD_LABELS: Record<string, string> = {
  subject: '제목',
  status: '상태',
  priority: '우선순위',
  type: '타입',
  assignee_id: '담당자',
  parent_id: '상위 작업',
  start_date: '시작일',
  due_date: '기한',
}

function labelValue(field: string | null, value: string | null): string {
  if (value === null) return '없음'
  if (field === 'status') return STATUS_LABELS[value as keyof typeof STATUS_LABELS] ?? value
  if (field === 'priority') return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value
  if (field === 'type') return TYPE_LABELS[value as keyof typeof TYPE_LABELS] ?? value
  return value
}

function activityText(a: Activity): string {
  if (a.action === 'created') return '작업을 생성했습니다'
  if (a.action === 'commented') return '댓글을 남겼습니다'
  const field = a.field ? (FIELD_LABELS[a.field] ?? a.field) : '필드'
  return `${field}: ${labelValue(a.field, a.old_value)} → ${labelValue(a.field, a.new_value)}`
}

/** Merge activities and comments into one chronological feed. */
type FeedItem =
  | { kind: 'activity'; at: string; activity: Activity }
  | { kind: 'comment'; at: string; comment: Comment }

export function HistorySection({ wpId }: { wpId: string }) {
  const activities = useActivities(wpId)
  const comments = useComments(wpId)
  const createComment = useCreateComment(wpId)
  const [draft, setDraft] = useState('')

  const feed: FeedItem[] = [
    ...(activities.data?.items ?? []).map(
      (a): FeedItem => ({ kind: 'activity', at: a.created_at, activity: a }),
    ),
    ...(comments.data?.items ?? []).map(
      (c): FeedItem => ({ kind: 'comment', at: c.created_at, comment: c }),
    ),
  ].sort((x, y) => x.at.localeCompare(y.at))

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    createComment.mutate(body, { onSuccess: () => setDraft('') })
  }

  const pending = activities.isPending || comments.isPending

  return (
    <section aria-label="활동 및 댓글" className="space-y-3 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">활동 및 댓글</h3>

      {pending ? (
        <p className="text-xs text-of-muted">불러오는 중…</p>
      ) : feed.length === 0 ? (
        <p className="text-xs text-of-muted">아직 활동이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {feed.map((item) =>
            item.kind === 'comment' ? (
              <li
                key={`c-${item.comment.id}`}
                className="rounded-of border border-of-border bg-of-surface-2/40 px-2.5 py-2"
              >
                <p className="whitespace-pre-wrap text-[13px]">{item.comment.body}</p>
                <p className="mt-1 text-[11px] text-of-muted">{item.comment.created_at.slice(0, 16).replace('T', ' ')}</p>
              </li>
            ) : (
              <li key={`a-${item.activity.id}`} className="flex gap-2 px-1 text-xs text-of-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-of-border" aria-hidden />
                <span>
                  {activityText(item.activity)}
                  <span className="ml-1.5 text-[11px]">
                    · {item.activity.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="댓글을 입력하세요"
          aria-label="댓글 입력"
          className="min-h-16"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={submit} disabled={createComment.isPending || !draft.trim()}>
            댓글 추가
          </Button>
          {createComment.isError ? (
            <span className="text-xs text-of-danger">댓글 저장 실패</span>
          ) : null}
        </div>
      </div>
    </section>
  )
}
