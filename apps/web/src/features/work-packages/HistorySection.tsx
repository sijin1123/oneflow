import {
  Activity as ActivityIcon,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CornerDownRight,
  MessageSquareText,
  Send,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { CommentReactionBar } from '@/components/ui/comment-reactions'
import { Textarea } from '@/components/ui/textarea'
import { profileImageSrc, useMemberNames, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { FIELD_LABELS } from './activityLabels'
import { useActivities, useCommentThreads, useCreateComment, useToggleReaction } from './api'
import type { CommentThread } from './comments'
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
type FeedOrder = 'oldest' | 'newest'

const FEED_FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'activity', label: '활동' },
  { key: 'comments', label: '댓글' },
  { key: 'updates', label: '업데이트' },
  { key: 'transitions', label: '전환' },
  { key: 'history', label: '이력' },
]

export function HistorySection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [feedOrder, setFeedOrder] = useState<FeedOrder>('oldest')
  const activityFilters =
    feedFilter === 'updates'
      ? { action: 'field_changed' as const, fieldNot: 'status' }
      : feedFilter === 'transitions'
        ? { action: 'field_changed' as const, field: 'status' }
        : feedFilter === 'history'
          ? { action: 'created' as const }
          : {}
  const showActivities = feedFilter !== 'comments'
  const showComments = feedFilter === 'all' || feedFilter === 'comments'
  const order = feedOrder === 'oldest' ? 'asc' : 'desc'
  const activities = useActivities(wpId, activityFilters, order, showActivities)
  const comments = useCommentThreads(wpId, order, showComments)
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

  const visibleActivities = showActivities
    ? (activities.data?.pages.flatMap((page) => page.items) ?? [])
    : []
  const visibleThreads = showComments
    ? (comments.data?.pages.flatMap((page) => page.items) ?? [])
    : []
  const feed: FeedItem[] = [
    ...visibleActivities.map(
      (a): FeedItem => ({ kind: 'activity', at: a.created_at, activity: a }),
    ),
    ...visibleThreads.map(
      (t): FeedItem => ({ kind: 'thread', at: t.root.created_at, thread: t }),
    ),
  ].sort((x, y) => (
    feedOrder === 'oldest' ? x.at.localeCompare(y.at) : y.at.localeCompare(x.at)
  ))

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    createComment.mutate(
      { body, mentioned_user_ids: mentioned },
      {
        onSuccess: () => {
          setDraft('')
          setMentioned([])
          setFeedOrder('newest')
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

  const pending =
    (showActivities && activities.isPending) || (showComments && comments.isPending)
  const error =
    (showActivities && activities.isError && !activities.data)
    || (showComments && comments.isError && !comments.data)
  const activityTotal = showActivities ? (activities.data?.pages[0]?.total ?? 0) : 0
  const commentTotal = showComments ? (comments.data?.pages[0]?.total_comments ?? 0) : 0
  const loadedActivityCount = visibleActivities.length
  const loadedCommentCount = visibleThreads.reduce(
    (count, thread) => count + 1 + thread.replies.length,
    0,
  )
  const loadedCount = loadedActivityCount + loadedCommentCount
  const totalCount = activityTotal + commentTotal
  const hasMoreActivities = showActivities && Boolean(activities.hasNextPage)
  const hasMoreComments = showComments && Boolean(comments.hasNextPage)
  const hasMore = hasMoreActivities || hasMoreComments
  const loadingMore = activities.isFetchingNextPage || comments.isFetchingNextPage
  const loadMoreError =
    (showActivities && activities.isFetchNextPageError)
    || (showComments && comments.isFetchNextPageError)

  const loadMore = () => {
    if (hasMoreActivities) void activities.fetchNextPage()
    if (hasMoreComments) void comments.fetchNextPage()
  }
  const activeFilter = FEED_FILTERS.find((filter) => filter.key === feedFilter) ?? FEED_FILTERS[0]
  const feedPanelId = `work-item-activity-panel-${wpId}`
  const activeTabId = `work-item-activity-tab-${wpId}-${activeFilter.key}`

  const commentBox = (c: Comment, isReply: boolean) => {
    const author = c.author_name ?? (c.author_id ? memberName(c.author_id) : '알 수 없는 사용자')
    return <article
      className={cn(
        'relative z-10 grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 py-3',
        isReply ? 'ml-7 border-l border-of-border-subtle pl-3' : '',
      )}
    >
      <Avatar name={author} src={profileImageSrc(c)} size="md" className="relative z-10" />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-xs font-semibold text-of-fg">{author}</p>
          <p className="text-[11px] text-of-muted">{formatDateTime(c.created_at)}</p>
          {isReply ? <span className="text-[10px] font-medium text-of-muted">답글</span> : null}
        </div>
        <p className="mt-1.5 whitespace-pre-wrap rounded-of bg-of-surface-2/55 px-3 py-2.5 text-[13px] leading-5 text-of-text">
          {c.body}
        </p>
        {c.mentions && c.mentions.length > 0 ? (
          <p className="mt-1.5 flex flex-wrap gap-1">
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
        {canWrite && !isReply ? (
          <button
            type="button"
            aria-expanded={replyTo === c.id}
            className="mt-1.5 inline-flex items-center gap-1 rounded-of px-1 py-0.5 text-[11px] text-of-muted hover:bg-of-surface-2 hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => {
              setReplyTo((prev) => (prev === c.id ? null : c.id))
              setReplyDraft('')
            }}
          >
            <CornerDownRight size={12} aria-hidden="true" />
            답글
          </button>
        ) : null}
      </div>
    </article>
  }

  return (
    <section aria-label="활동 및 댓글" className="min-w-0">
      <div className="flex min-w-0 items-end justify-between gap-2 border-b border-of-border-subtle">
        <div
          role="tablist"
          aria-label="활동 피드 필터"
          className="flex min-w-0 max-w-full gap-0.5 overflow-x-auto"
        >
          {FEED_FILTERS.map((filter) => (
            <button
              key={filter.key}
              id={`work-item-activity-tab-${wpId}-${filter.key}`}
              type="button"
              role="tab"
              aria-selected={feedFilter === filter.key}
              aria-controls={feedPanelId}
              className={cn(
                'shrink-0 rounded-t-of border-b-2 px-2.5 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
                feedFilter === filter.key
                  ? 'border-of-fg bg-of-surface-2 text-of-fg'
                  : 'border-transparent text-of-muted hover:bg-of-surface-hover hover:text-of-text',
              )}
              onClick={() => setFeedFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={feedOrder === 'oldest' ? '최신순으로 보기' : '오래된순으로 보기'}
          title={feedOrder === 'oldest' ? '최신순으로 보기' : '오래된순으로 보기'}
          aria-pressed={feedOrder === 'newest'}
          className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={() => setFeedOrder((order) => (order === 'oldest' ? 'newest' : 'oldest'))}
        >
          {feedOrder === 'oldest'
            ? <ArrowDownNarrowWide size={15} aria-hidden="true" />
            : <ArrowUpNarrowWide size={15} aria-hidden="true" />}
        </button>
      </div>

      <div id={feedPanelId} role="tabpanel" aria-labelledby={activeTabId} className="min-w-0">
        {!pending && !error && totalCount > 0 ? (
          <div className="flex min-h-8 items-center justify-between gap-3 border-b border-of-border-subtle px-1 text-[11px] text-of-muted">
            <span aria-live="polite">{loadedCount} / {totalCount}건 표시</span>
            {hasMore ? <span>{feedOrder === 'oldest' ? '이후 기록 있음' : '이전 기록 있음'}</span> : null}
          </div>
        ) : null}

        {pending ? (
          <div role="status" className="border-b border-of-border-subtle py-10 text-center text-xs text-of-muted">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 border-b border-of-border-subtle py-10 text-center">
            <p className="text-xs text-of-danger">활동을 불러오지 못했습니다.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (showActivities) void activities.refetch()
                if (showComments) void comments.refetch()
              }}
            >
              다시 시도
            </Button>
          </div>
        ) : feed.length === 0 ? (
          <div className="border-b border-of-border-subtle py-10 text-center text-xs text-of-muted">
            이 범위에 표시할 활동이 없습니다.
          </div>
        ) : (
          <ul aria-label="활동 타임라인" className="divide-y divide-of-border-subtle">
            {feed.map((item) =>
              item.kind === 'thread' ? (
                <li
                  key={`c-${item.thread.root.id}`}
                  className="relative before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-of-border-subtle"
                >
                  {commentBox(item.thread.root, false)}
                  {item.thread.replies.map((reply) => (
                    <div key={reply.id}>{commentBox(reply, true)}</div>
                  ))}
                  {replyTo === item.thread.root.id ? (
                    <div className="ml-11 space-y-2 border-l border-of-border-subtle pb-3 pl-3">
                      <Textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder="답글을 입력하세요"
                        aria-label="답글 입력"
                        className="min-h-12"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => submitReply(item.thread.root.id)}
                          disabled={createComment.isPending || !replyDraft.trim()}
                        >
                          답글 추가
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyDraft('')
                            setReplyTo(null)
                          }}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ) : (
                <li
                  key={`a-${item.activity.id}`}
                  className="relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 py-3 before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-of-border-subtle"
                >
                  {item.activity.actor_name ? (
                    <Avatar
                      name={item.activity.actor_name}
                      src={profileImageSrc(item.activity)}
                      size="md"
                      className="relative z-10"
                    />
                  ) : (
                    <span
                      className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-of-border bg-of-surface text-of-muted"
                      aria-label="시스템"
                    >
                      <ActivityIcon size={14} aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 self-center text-xs text-of-muted">
                    <span className="font-medium text-of-text">
                      {item.activity.actor_name ?? '시스템'}
                    </span>
                    <span> · {activityText(item.activity)}</span>
                    <span className="ml-1 whitespace-nowrap text-[11px]">
                      {formatDateTime(item.activity.created_at)}
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}

        {!pending && !error && hasMore ? (
          <div className="flex flex-col items-center gap-2 border-t border-of-border-subtle py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              aria-describedby={loadMoreError ? `${feedPanelId}-load-error` : undefined}
            >
              {loadingMore ? '불러오는 중...' : '더 불러오기'}
            </Button>
            {loadMoreError ? (
              <p id={`${feedPanelId}-load-error`} role="alert" className="text-[11px] text-of-danger">
                추가 기록을 불러오지 못했습니다. 다시 시도해 주세요.
              </p>
            ) : null}
          </div>
        ) : null}

        {canWrite && showComments ? (
          <div className="space-y-3 border-t border-of-border-subtle pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-of-fg">
              <MessageSquareText size={14} aria-hidden="true" />
              새 댓글
            </div>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="댓글을 입력하세요"
              aria-label="댓글 입력"
              className="min-h-20"
            />
            {(members.data?.items ?? []).length > 0 ? (
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">멘션할 멤버</legend>
                <span className="text-[11px] text-of-muted">멘션</span>
                {(members.data?.items ?? []).map((member) => (
                  <label
                    key={member.user_id}
                    className={cn(
                      'flex items-center gap-1 rounded-full border border-of-border bg-of-surface px-2 py-1 text-[11px]',
                      mentioned.includes(member.user_id) ? 'border-of-accent bg-of-accent-soft text-of-accent' : '',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={mentioned.includes(member.user_id)}
                      onChange={() => toggleMention(member.user_id)}
                      aria-label={`${member.display_name} 멘션`}
                      className="size-3 accent-of-accent"
                    />
                    {member.display_name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button size="sm" onClick={submit} disabled={createComment.isPending || !draft.trim()}>
                <Send size={13} aria-hidden="true" />
                댓글 추가
              </Button>
              {createComment.isError ? (
                <span className="text-xs text-of-danger">댓글 저장 실패</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
