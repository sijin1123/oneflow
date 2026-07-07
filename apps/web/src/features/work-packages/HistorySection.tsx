import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/datetime'

import { FIELD_LABELS } from './activityLabels'
import { useActivities, useComments, useCreateComment } from './api'
import type { CommentThread } from './comments'
import { groupThreads } from './comments'
import { PRIORITY_LABELS, TYPE_LABELS } from './types'
import type { Activity, Comment } from './types'
import { useStatusLabels } from './useStatusLabels'

/** Merge activities and comment THREADS into one chronological feed — a thread
    sorts by its root, replies stay beneath it (PLAN v10.1 R1-⑦). */
type FeedItem =
  | { kind: 'activity'; at: string; activity: Activity }
  | { kind: 'thread'; at: string; thread: CommentThread }

export function HistorySection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const activities = useActivities(wpId)
  const comments = useComments(wpId)
  const createComment = useCreateComment(wpId)
  const statusLabel = useStatusLabels(projectId)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  const labelValue = (field: string | null, value: string | null): string => {
    if (value === null) return '없음'
    if (field === 'status') return statusLabel(value)
    if (field === 'priority') return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value
    if (field === 'type') return TYPE_LABELS[value as keyof typeof TYPE_LABELS] ?? value
    return value
  }

  const activityText = (a: Activity): string => {
    if (a.action === 'created') return '작업을 생성했습니다'
    if (a.action === 'commented') return '댓글을 남겼습니다'
    const field = a.field ? (FIELD_LABELS[a.field] ?? a.field) : '필드'
    return `${field}: ${labelValue(a.field, a.old_value)} → ${labelValue(a.field, a.new_value)}`
  }

  const feed: FeedItem[] = [
    ...(activities.data?.items ?? []).map(
      (a): FeedItem => ({ kind: 'activity', at: a.created_at, activity: a }),
    ),
    ...groupThreads(comments.data?.items ?? []).map(
      (t): FeedItem => ({ kind: 'thread', at: t.root.created_at, thread: t }),
    ),
  ].sort((x, y) => x.at.localeCompare(y.at))

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    createComment.mutate({ body }, { onSuccess: () => setDraft('') })
  }

  const submitReply = (rootId: string) => {
    const body = replyDraft.trim()
    if (!body) return
    createComment.mutate(
      { body, parent_id: rootId },
      {
        onSuccess: () => {
          setReplyDraft('')
          setReplyTo(null)
        },
      },
    )
  }

  const pending = activities.isPending || comments.isPending

  const commentBox = (c: Comment, isReply: boolean) => (
    <div
      className={`rounded-of border border-of-border bg-of-surface-2/40 px-2.5 py-2 ${
        isReply ? 'ml-5' : ''
      }`}
    >
      <p className="whitespace-pre-wrap text-[13px]">{c.body}</p>
      <p className="mt-1 flex items-center gap-2 text-[11px] text-of-muted">
        {formatDateTime(c.created_at)}
        {!isReply ? (
          <button
            type="button"
            className="rounded-of px-1 py-0.5 hover:bg-of-surface-2 hover:text-of-fg"
            onClick={() => {
              setReplyTo((prev) => (prev === c.id ? null : c.id))
              setReplyDraft('')
            }}
          >
            답글
          </button>
        ) : null}
      </p>
    </div>
  )

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
            item.kind === 'thread' ? (
              <li key={`c-${item.thread.root.id}`} className="space-y-1.5">
                {commentBox(item.thread.root, false)}
                {item.thread.replies.map((r) => (
                  <div key={r.id}>{commentBox(r, true)}</div>
                ))}
                {replyTo === item.thread.root.id ? (
                  <div className="ml-5 space-y-1.5">
                    <Textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="답글을 입력하세요"
                      aria-label="답글 입력"
                      className="min-h-12"
                    />
                    <Button
                      size="sm"
                      onClick={() => submitReply(item.thread.root.id)}
                      disabled={createComment.isPending || !replyDraft.trim()}
                    >
                      답글 추가
                    </Button>
                  </div>
                ) : null}
              </li>
            ) : (
              <li key={`a-${item.activity.id}`} className="flex gap-2 px-1 text-xs text-of-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-of-border" aria-hidden />
                <span>
                  {activityText(item.activity)}
                  <span className="ml-1.5 text-[11px]">· {formatDateTime(item.activity.created_at)}</span>
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
