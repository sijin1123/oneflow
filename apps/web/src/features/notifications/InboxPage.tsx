import { BellRing, CheckCheck, Clock3, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorState, EmptyState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  type Notification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from './api'
import { NotificationItem } from './NotificationItem'
import { getNotificationTargetPath } from './view'

type Filter = 'all' | 'unread' | 'read'

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'unread', label: '읽지 않음' },
  { key: 'read', label: '읽음' },
]

function NotificationGroup({
  title,
  count,
  items,
  onOpen,
  onRead,
  readPending,
}: {
  title: string
  count: number
  items: Notification[]
  onOpen: (notification: Notification) => void
  onRead: (notification: Notification) => void
  readPending: boolean
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
            action={
              !notification.read ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readPending}
                  onClick={() => onRead(notification)}
                >
                  읽음
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
  const notifications = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')

  if (notifications.isPending) return <ListSkeleton rows={8} className="mx-auto max-w-6xl" />
  if (notifications.isError) {
    return <ErrorState error={notifications.error} onRetry={() => notifications.refetch()} />
  }

  const items = notifications.data.items
  const unreadItems = items.filter((item) => !item.read)
  const readItems = items.filter((item) => item.read)
  const filteredItems =
    filter === 'unread' ? unreadItems : filter === 'read' ? readItems : items

  const openNotification = (notification: Notification) => {
    if (!notification.read) markRead.mutate(notification.id)
    const target = getNotificationTargetPath(notification)
    if (target) navigate(target)
  }

  const markNotificationRead = (notification: Notification) => {
    if (!notification.read) markRead.mutate(notification.id)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-col gap-3 border-b border-of-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium uppercase text-of-muted">Inbox</p>
          <h1 className="text-base font-semibold">인박스</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            작업, 이니셔티브, 인테이크, 기한 변경에서 내가 확인해야 할 알림을 정리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={notifications.data.unread > 0 ? 'accent' : 'outline'}>
            읽지 않음 {notifications.data.unread}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={notifications.data.unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck size={13} aria-hidden="true" /> 전체 읽음
          </Button>
          <Link
            to="/settings"
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <SlidersHorizontal size={13} aria-hidden="true" /> 알림 설정
          </Link>
        </div>
      </header>

      <div className="flex min-w-0 flex-wrap items-center gap-2" role="tablist" aria-label="인박스 필터">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            className={cn(
              'inline-flex h-7 items-center rounded-of border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
              filter === item.key
                ? 'border-of-accent bg-of-accent-soft text-of-accent'
                : 'border-of-border bg-of-surface hover:bg-of-surface-hover',
            )}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="확인할 알림이 없습니다"
          hint="작업 배정, 이니셔티브 변경, 기한, 멘션, 인테이크 판정 알림이 여기에 모입니다."
        >
          <Link
            to="/settings"
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <BellRing size={13} aria-hidden="true" /> 알림 설정
          </Link>
        </EmptyState>
      ) : filteredItems.length === 0 ? (
        <section className="flex min-h-[220px] min-w-0 items-center justify-center rounded-of border border-dashed border-of-border px-4 py-10 text-center">
          <div className="min-w-0">
            <Clock3 className="mx-auto mb-2 text-of-muted" size={20} aria-hidden="true" />
            <p className="text-sm font-medium">이 필터에 표시할 알림이 없습니다</p>
            <p className="mt-1 text-xs text-of-muted">다른 필터로 전환해 남은 알림을 확인하세요.</p>
          </div>
        </section>
      ) : filter === 'all' ? (
        <div className="space-y-5">
          <NotificationGroup
            title="읽지 않음"
            count={unreadItems.length}
            items={unreadItems}
            onOpen={openNotification}
            onRead={markNotificationRead}
            readPending={markRead.isPending}
          />
          <NotificationGroup
            title="읽음"
            count={readItems.length}
            items={readItems}
            onOpen={openNotification}
            onRead={markNotificationRead}
            readPending={markRead.isPending}
          />
        </div>
      ) : (
        <NotificationGroup
          title={filter === 'unread' ? '읽지 않음' : '읽음'}
          count={filteredItems.length}
          items={filteredItems}
          onOpen={openNotification}
          onRead={markNotificationRead}
          readPending={markRead.isPending}
        />
      )}
    </div>
  )
}
