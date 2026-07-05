import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import {
  type Notification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from './api'

function message(n: Notification): string {
  const who = n.actor_name ?? '누군가'
  const subject = n.work_package_subject ?? '삭제된 작업'
  if (n.kind === 'assigned') return `${who}님이 '${subject}' 작업에 회원님을 배정했습니다.`
  return `${who}: ${subject}`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const navigate = useNavigate()

  const unread = data?.unread ?? 0

  const openTarget = (n: Notification) => {
    markRead.mutate(n.id)
    setOpen(false)
    if (n.work_package_id) {
      navigate(`/projects/${n.project_id}/work-packages?wp=${n.work_package_id}`)
    }
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
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            모두 읽음
          </Button>
        </div>

        {!data || data.items.length === 0 ? (
          <p className="text-sm text-of-muted">알림이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openTarget(n)}
                  className={cn(
                    'w-full rounded-of border border-of-border p-2 text-left text-sm hover:bg-of-surface-2',
                    !n.read && 'border-of-accent/40 bg-of-accent-soft/40',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        !n.read && 'bg-of-accent',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="break-words">{message(n)}</p>
                      <p className="mt-0.5 text-xs text-of-muted">{formatDateTime(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  )
}
