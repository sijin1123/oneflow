import { Bell, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

import {
  type Notification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from './api'
import { NotificationItem } from './NotificationItem'
import { getNotificationTargetPath } from './view'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const notifications = useNotifications()
  const { data } = notifications
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const navigate = useNavigate()

  const unread = data?.unread ?? 0

  const openTarget = (n: Notification) => {
    markRead.mutate(n.id)
    setOpen(false)
    const target = getNotificationTargetPath(n)
    if (target) navigate(target)
  }

  const openInbox = () => {
    setOpen(false)
    navigate('/inbox')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `알림 ${unread}건 읽지 않음` : '알림'}
          className="relative rounded-of p-1.5 text-of-muted hover:bg-of-surface-2"
        >
          <Bell size={16} />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-of-accent px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </SheetTrigger>
      <SheetContent title="알림">
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={openInbox}>
            인박스 열기 <ArrowUpRight size={13} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            모두 읽음
          </Button>
        </div>

        {notifications.isPending ? (
          <div className="space-y-2" aria-label="알림 불러오는 중">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-14 animate-pulse rounded-of bg-of-surface-2"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : notifications.isError ? (
          <div className="rounded-of border border-of-danger/30 bg-of-danger/5 p-3 text-sm">
            <p>알림을 불러오지 못했습니다.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => notifications.refetch()}
            >
              다시 시도
            </Button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-of-muted">알림이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
            {data.items.map((n) => (
              <NotificationItem key={n.id} notification={n} onOpen={openTarget} compact />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}
