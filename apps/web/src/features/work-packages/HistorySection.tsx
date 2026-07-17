import {
  Activity as ActivityIcon,
  Clock3,
  CornerDownRight,
  MessageSquareText,
  Send,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommentReactionBar } from '@/components/ui/comment-reactions'
import { Textarea } from '@/components/ui/textarea'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { FIELD_LABELS } from './activityLabels'
import { useActivities, useComments, useCreateComment, useToggleReaction } from './api'
import type { CommentThread } from './comments'
import { groupThreads } from './comments'
import { PRIORITY_LABELS } from './types'
import type { Activity, Comment } from './types'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

/** Merge activities and comment THREADS into one chronological feed — a thread
    sorts by its root, replies stay beneath it (PLAN v10.1 R1-⑦). */
type FeedItem =
  | { kind: 'activity'; at: string; activity: Activity }
  | { kind: 'thread'; at: string; thread: CommentThread }

type FeedFilter = 'all' | 'activity' | 'comments' | 'updates' | 'transitions' | 'history'

const FEED_FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'activity', label: '활동' },
  { key: 'comments', label: '댓글' },
  { key: 'updates', label: '업데이트' },
  { key: 'transitions', label: '전환' },
  { key: 'history', label: '이력' },
]

function FeedMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'accent' | 'neutral'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  )
}

export function HistorySection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const activityFilters =
    feedFilter === 'updates'
      ? { action: 'field_changed' as const }
      : feedFilter === 'transitions'
        ? { action: 'field_changed' as const, field: 'status' }
        : feedFilter === 'history'
          ? { action: 'created' as const }
          : {}
  const activities = useActivities(wpId, activityFilters)
  const comments = useComments(wpId)
  const createComment = useCreateComment(wpId)
  const toggleReaction = useToggleReaction(wpId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const members = useMembers(projectId)
  const canWrite = useCanWrite(projectId)
  const memberName = useMemberNames(projectId)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [mentioned, setMentioned] = useState<string[]>([])

  const labelValue = (field: string | null, value: string | null): string => {
    if (value === null) return '없음'
    if (field === 'status') return statusLabel(value)
    if (field === 'priority') return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value
    if (field === 'type') return typeLabel(value)
    // Members stay uuids in the log (the existing contract) — resolve here.
    // cycle/module/milestone records store NAME snapshots since Pass 71.
    if (field === 'assignee_id') return memberName(value)
    return value
  }

  const activityText = (a: Activity): string => {
    if (a.action === 'created') return '작업을 생성했습니다'
    if (a.action === 'commented') return '댓글을 남겼습니다'
    const field = a.field ? (FIELD_LABELS[a.field] ?? a.field) : '필드'
    return `${field}: ${labelValue(a.field, a.old_value)} → ${labelValue(a.field, a.new_value)}`
  }

  const visibleActivities =
    feedFilter === 'comments'
      ? []
      : feedFilter === 'updates'
        ? (activities.data?.items ?? []).filter((activity) => activity.field !== 'status')
        : (activities.data?.items ?? [])
  const showComments = feedFilter === 'all' || feedFilter === 'comments'
  const feed: FeedItem[] = [
    ...visibleActivities.map(
      (a): FeedItem => ({ kind: 'activity', at: a.created_at, activity: a }),
    ),
    ...(showComments ? groupThreads(comments.data?.items ?? []) : []).map(
      (t): FeedItem => ({ kind: 'thread', at: t.root.created_at, thread: t }),
    ),
  ].sort((x, y) => x.at.localeCompare(y.at))

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    createComment.mutate(
      { body, mentioned_user_ids: mentioned },
      {
        onSuccess: () => {
          setDraft('')
          setMentioned([])
        },
      },
    )
  }

  const toggleMention = (userId: string) => {
    setMentioned((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
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
  const error = activities.isError || comments.isError
  const activityCount = activities.data?.total ?? 0
  const commentCount = comments.data?.total ?? 0
  const threadCount = groupThreads(comments.data?.items ?? []).length
  const mentionCount = (comments.data?.items ?? []).reduce(
    (sum, comment) => sum + (comment.mentions?.length ?? 0),
    0,
  )

  const commentBox = (c: Comment, isReply: boolean) => (
    <div
      className={cn(
        'rounded-of border border-of-border bg-of-surface px-3 py-3',
        isReply ? 'ml-4 border-l-4 border-l-of-accent-soft' : '',
      )}
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {c.author_id ? memberName(c.author_id) : '댓글'}
          </p>
          <p className="mt-0.5 text-[11px] text-of-muted">{formatDateTime(c.created_at)}</p>
        </div>
        {isReply ? <Badge variant="outline">답글</Badge> : <Badge variant="neutral">댓글</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-[13px]">{c.body}</p>
      {c.mentions && c.mentions.length > 0 ? (
        <p className="mt-1 flex flex-wrap gap-1">
          {c.mentions.map((uid) => (
            <Badge key={uid} variant="accent" className="text-[10px]">
              @{memberName(uid)}
            </Badge>
          ))}
        </p>
      ) : null}
      <CommentReactionBar
        reactions={c.reactions}
        canReact={canWrite}
        pending={toggleReaction.isPending}
        onToggle={({ key, on }) => toggleReaction.mutate({ commentId: c.id, key, on })}
      />
      <p className="mt-2 flex items-center gap-2 text-[11px] text-of-muted">
        {canWrite && !isReply ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-of px-1 py-0.5 hover:bg-of-surface-2 hover:text-of-fg"
            onClick={() => {
              setReplyTo((prev) => (prev === c.id ? null : c.id))
              setReplyDraft('')
            }}
          >
            <CornerDownRight size={12} aria-hidden="true" />
            답글
          </button>
        ) : null}
      </p>
    </div>
  )

  return (
    <section aria-label="활동 및 댓글" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">활동 및 댓글</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            작업 변경과 논의를 시간순으로 모읍니다.
          </p>
        </div>
        <Badge variant={canWrite ? 'accent' : 'outline'} className="self-start">
          {canWrite ? '댓글 가능' : '읽기 전용'}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <FeedMetric icon={ActivityIcon} label="활동" value={`${activityCount}건`} tone="accent" />
        <FeedMetric icon={MessageSquareText} label="댓글" value={`${commentCount}건`} />
        <FeedMetric icon={CornerDownRight} label="스레드" value={`${threadCount}건`} />
        <FeedMetric icon={UsersRound} label="멘션" value={`${mentionCount}건`} />
      </div>

      <div
        role="tablist"
        aria-label="활동 피드 필터"
        className="mt-3 flex max-w-full gap-1 overflow-x-auto border-b border-of-border-subtle"
      >
        {FEED_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={feedFilter === filter.key}
            className={cn(
              'shrink-0 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors',
              feedFilter === filter.key
                ? 'border-of-accent text-of-accent'
                : 'border-transparent text-of-muted hover:text-of-text',
            )}
            onClick={() => setFeedFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {pending ? (
        <div className="mt-3 rounded-of border border-dashed border-of-border bg-of-surface-2/35 px-3 py-4 text-xs text-of-muted">
          불러오는 중...
        </div>
      ) : error ? (
        <div className="mt-3 rounded-of border border-of-border bg-of-surface px-3 py-4 text-xs text-of-danger">
          활동을 불러오지 못했습니다.
        </div>
      ) : feed.length === 0 ? (
        <div className="mt-3 rounded-of border border-dashed border-of-border bg-of-surface-2/35 px-3 py-4 text-xs text-of-muted">
          이 범위에 표시할 활동이 없습니다.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {feed.map((item) =>
            item.kind === 'thread' ? (
              <li key={`c-${item.thread.root.id}`} className="space-y-1.5">
                {commentBox(item.thread.root, false)}
                {item.thread.replies.map((r) => (
                  <div key={r.id}>{commentBox(r, true)}</div>
                ))}
                {replyTo === item.thread.root.id ? (
                  <div className="ml-4 space-y-1.5 rounded-of border border-of-border bg-of-surface-2/35 p-3">
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
              <li
                key={`a-${item.activity.id}`}
                className="flex gap-3 rounded-of border border-of-border bg-of-surface-2/35 p-3 text-xs text-of-muted"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-surface text-of-muted"
                  aria-hidden
                >
                  <Clock3 size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block text-of-text">{activityText(item.activity)}</span>
                  <span className="mt-1 block text-[11px]">{formatDateTime(item.activity.created_at)}</span>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {canWrite ? (
        <div className="mt-4 space-y-3 rounded-of border border-of-border bg-of-surface-2/35 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Send size={14} aria-hidden="true" />
            새 댓글
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="댓글을 입력하세요"
            aria-label="댓글 입력"
            className="min-h-20"
          />
          {(members.data?.items ?? []).length > 0 ? (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">멘션할 멤버</legend>
              <span className="text-[11px] text-of-muted">멘션</span>
              {(members.data?.items ?? []).map((m) => (
                <label
                  key={m.user_id}
                  className={cn(
                    'flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-[11px]',
                    mentioned.includes(m.user_id) ? 'border-of-accent text-of-accent' : '',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={mentioned.includes(m.user_id)}
                    onChange={() => toggleMention(m.user_id)}
                    aria-label={`${m.display_name} 멘션`}
                    className="h-3 w-3 accent-of-accent"
                  />
                  {m.display_name}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button size="sm" onClick={submit} disabled={createComment.isPending || !draft.trim()}>
              댓글 추가
            </Button>
            {createComment.isError ? (
              <span className="text-xs text-of-danger">댓글 저장 실패</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
