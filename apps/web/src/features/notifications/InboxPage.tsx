import {
  BellRing,
  CheckCheck,
  Clock3,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ErrorState, EmptyState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  type Notification,
  type NotificationScope,
  useInboxNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from './api'
import { NotificationItem } from './NotificationItem'
import { getNotificationMessage, getNotificationTargetPath } from './view'

const filters: Array<{ key: NotificationScope; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'unread', label: '읽지 않음' },
  { key: 'read', label: '읽음' },
  { key: 'mentions', label: '멘션' },
]

function parseFilter(value: string | null): NotificationScope {
  return filters.some((filter) => filter.key === value)
    ? (value as NotificationScope)
    : 'all'
}

type ReadAction = {
  notification: Notification
  intent: 'open' | 'read'
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function NotificationGroup({
  title,
  count,
  items,
  onOpen,
  onRead,
  readPendingId,
}: {
  title: string
  count: number
  items: Notification[]
  onOpen: (notification: Notification) => void
  onRead: (notification: Notification) => void
  readPendingId: string | null
}) {
  if (items.length === 0) return null

  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-2 flex min-w-0 items-center gap-2 px-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-of-muted">{count}건</span>
      </div>
      <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onOpen={onOpen}
            showTargetHint
            disabled={readPendingId !== null}
            action={
              !notification.read ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readPendingId !== null}
                  onClick={() => onRead(notification)}
                >
                  {readPendingId === notification.id ? (
                    <LoaderCircle
                      size={13}
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {readPendingId === notification.id ? '처리 중' : '읽음'}
                </Button>
              ) : null
            }
          />
        ))}
      </ul>
    </section>
  )
}

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('filter'))
  const notifications = useInboxNotifications(filter)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const navigate = useNavigate()
  const [failedRead, setFailedRead] = useState<ReadAction | null>(null)

  if (notifications.isPending)
    return <ListSkeleton rows={8} className="mx-auto max-w-6xl" />
  if (notifications.isError && !notifications.data) {
    return (
      <ErrorState
        error={notifications.error}
        onRetry={() => notifications.refetch()}
      />
    )
  }

  const pages = notifications.data.pages
  const items = pages.flatMap((page) => page.items)
  const total = pages[0]?.total ?? 0
  const unread = pages[0]?.unread ?? 0
  const unreadItems = items.filter((item) => !item.read)
  const readItems = items.filter((item) => item.read)

  const selectFilter = (nextFilter: NotificationScope) => {
    setFailedRead(null)
    markRead.reset()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextFilter === 'all') next.delete('filter')
      else next.set('filter', nextFilter)
      return next
    })
  }

  const runRead = (action: ReadAction) => {
    setFailedRead(null)
    markRead.reset()
    markRead.mutate(action.notification.id, {
      onSuccess: () => {
        setFailedRead(null)
        if (action.intent !== 'open') return
        const target = getNotificationTargetPath(action.notification)
        if (target) navigate(target)
      },
      onError: () => setFailedRead(action),
    })
  }

  const openNotification = (notification: Notification) => {
    const target = getNotificationTargetPath(notification)
    if (notification.read) {
      if (target) navigate(target)
      return
    }
    runRead({ notification, intent: 'open' })
  }

  const markNotificationRead = (notification: Notification) => {
    if (!notification.read) runRead({ notification, intent: 'read' })
  }

  const markAllNotificationsRead = () => {
    markAll.reset()
    markAll.mutate()
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col px-4 sm:px-6">
      <FrameContextActions>
        <div className="flex h-full w-full min-w-0 items-center justify-end gap-1 px-1.5 sm:gap-2 sm:px-2">
          <Badge
            variant={unread > 0 ? 'accent' : 'outline'}
            className="max-w-24 truncate"
          >
            읽지 않음 {unread}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="전체 읽음 처리"
            title="전체 읽음 처리"
            disabled={unread === 0 || markAll.isPending}
            onClick={markAllNotificationsRead}
          >
            {markAll.isPending ? (
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <CheckCheck size={14} aria-hidden="true" />
            )}
          </Button>
          <Link
            to="/settings?tab=notifications"
            aria-label="알림 설정"
            title="알림 설정"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
          </Link>
        </div>
      </FrameContextActions>

      <header className="flex min-h-14 min-w-0 items-center gap-2 border-b border-of-border">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <BellRing size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-of-muted">
            내가 확인해야 할 업데이트
          </p>
          <h1 className="truncate text-sm font-semibold">인박스 · {total}건</h1>
        </div>
      </header>

      <div
        className="of-scrollbar flex min-w-0 gap-1 overflow-x-auto border-b border-of-border py-2"
        role="tablist"
        aria-label="인박스 필터"
      >
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            className={cn(
              'inline-flex h-7 shrink-0 items-center rounded-of border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
              filter === item.key
                ? 'border-of-accent bg-of-accent-soft text-of-accent'
                : 'border-of-border bg-of-surface hover:bg-of-surface-hover',
            )}
            onClick={() => selectFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {markAll.error ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-of-danger/20 bg-of-danger/5 px-2 py-2 text-xs text-of-danger"
        >
          <span>
            <span className="block font-medium">
              {errorMessage(
                markAll.error,
                '전체 읽음 처리를 완료하지 못했습니다.',
              )}
            </span>
            <span className="mt-0.5 block text-[11px]">
              현재 알림 상태를 유지했습니다.
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={markAllNotificationsRead}
          >
            <RefreshCw size={13} aria-hidden="true" /> 같은 요청 다시 시도
          </Button>
        </div>
      ) : null}

      {markRead.error && failedRead ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-of-danger/20 bg-of-danger/5 px-2 py-2 text-xs text-of-danger"
        >
          <span className="min-w-0">
            <span className="block font-medium">
              {errorMessage(markRead.error, '알림을 읽음 처리하지 못했습니다.')}
            </span>
            <span className="mt-0.5 block max-w-72 truncate text-[11px]">
              {getNotificationMessage(failedRead.notification)}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => runRead(failedRead)}
          >
            <RefreshCw size={13} aria-hidden="true" /> 같은 요청 다시 시도
          </Button>
        </div>
      ) : null}

      <div className="py-4">
        {items.length === 0 && filter === 'all' ? (
          <EmptyState
            title="확인할 알림이 없습니다"
            hint="작업 배정, 이니셔티브 변경, 기한, 멘션, 인테이크 판정 알림이 여기에 모입니다."
          >
            <Link
              to="/settings?tab=notifications"
              className="inline-flex h-7 items-center justify-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              <BellRing size={13} aria-hidden="true" /> 알림 설정
            </Link>
          </EmptyState>
        ) : items.length === 0 ? (
          <section className="flex min-h-[220px] min-w-0 items-center justify-center rounded-of border border-dashed border-of-border px-4 py-10 text-center">
            <div className="min-w-0">
              <Clock3
                className="mx-auto mb-2 text-of-muted"
                size={20}
                aria-hidden="true"
              />
              <p className="text-sm font-medium">
                이 필터에 표시할 알림이 없습니다
              </p>
              <p className="mt-1 text-xs text-of-muted">
                다른 필터로 전환해 남은 알림을 확인하세요.
              </p>
            </div>
          </section>
        ) : filter === 'all' ? (
          <div className="space-y-5">
            <NotificationGroup
              title="읽지 않음"
              count={unread}
              items={unreadItems}
              onOpen={openNotification}
              onRead={markNotificationRead}
              readPendingId={
                markRead.isPending ? (markRead.variables ?? null) : null
              }
            />
            <NotificationGroup
              title="읽음"
              count={Math.max(total - unread, 0)}
              items={readItems}
              onOpen={openNotification}
              onRead={markNotificationRead}
              readPendingId={
                markRead.isPending ? (markRead.variables ?? null) : null
              }
            />
          </div>
        ) : (
          <NotificationGroup
            title={filters.find((item) => item.key === filter)?.label ?? '전체'}
            count={total}
            items={items}
            onOpen={openNotification}
            onRead={markNotificationRead}
            readPendingId={
              markRead.isPending ? (markRead.variables ?? null) : null
            }
          />
        )}

        {items.length > 0 ? (
          <footer className="flex min-w-0 flex-col items-center gap-2 border-t border-of-border pt-4 sm:flex-row sm:justify-between">
            <p className="text-xs text-of-muted" aria-live="polite">
              {items.length} / {total}건 표시
            </p>
            <div className="flex min-w-0 flex-col items-center gap-2 sm:items-end">
              {notifications.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={notifications.isFetchingNextPage}
                  onClick={() => notifications.fetchNextPage()}
                  aria-describedby={
                    notifications.isFetchNextPageError
                      ? 'inbox-load-more-error'
                      : undefined
                  }
                >
                  {notifications.isFetchingNextPage
                    ? '불러오는 중...'
                    : notifications.isFetchNextPageError
                      ? '같은 페이지 다시 시도'
                      : '더 불러오기'}
                </Button>
              ) : null}
              {notifications.isFetchNextPageError ? (
                <p
                  id="inbox-load-more-error"
                  role="alert"
                  className="text-xs text-of-danger"
                >
                  추가 알림을 불러오지 못했습니다. 현재 {items.length}건을
                  유지했습니다.
                </p>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </main>
  )
}
