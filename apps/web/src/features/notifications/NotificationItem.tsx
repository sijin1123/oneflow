import { BellRing } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import type { Notification } from './api'
import {
  getNotificationKindLabel,
  getNotificationMessage,
  getNotificationTargetPath,
} from './view'

export function NotificationItem({
  notification,
  onOpen,
  action,
  compact = false,
  showTargetHint = false,
}: {
  notification: Notification
  onOpen: (notification: Notification) => void
  action?: ReactNode
  compact?: boolean
  showTargetHint?: boolean
}) {
  const message = getNotificationMessage(notification)
  const target = getNotificationTargetPath(notification)

  return (
    <li>
      <article
        className={cn(
          'flex min-w-0 items-start gap-2.5 border-of-border transition-colors',
          compact ? 'px-2 py-2' : 'px-3 py-3',
          !notification.read && 'bg-of-accent-soft/30',
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          aria-label={message}
          onClick={() => onOpen(notification)}
        >
          <span className="relative mt-0.5 shrink-0">
            {notification.actor_name ? (
              <Avatar
                name={notification.actor_name}
                src={notification.actor_profile_image_url}
                size={compact ? 'sm' : 'md'}
              />
            ) : (
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full border border-of-border bg-of-surface-2 text-of-muted',
                  compact ? 'h-6 w-6' : 'h-8 w-8',
                )}
                title="시스템 알림"
                aria-label="시스템 알림"
              >
                <BellRing size={compact ? 12 : 14} aria-hidden="true" />
              </span>
            )}
            {!notification.read ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-of-surface bg-of-accent"
                aria-label="읽지 않음"
              />
            ) : null}
          </span>

          <span className="min-w-0 flex-1">
            <span className="mb-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant={notification.read ? 'outline' : 'accent'}>
                {getNotificationKindLabel(notification)}
              </Badge>
              <span className="text-[11px] text-of-muted">
                {formatDateTime(notification.created_at)}
              </span>
            </span>
            <span
              className={cn(
                'block break-words text-sm leading-5',
                !notification.read && 'font-medium',
              )}
            >
              {message}
            </span>
            {showTargetHint ? (
              <span className="mt-0.5 block truncate text-xs text-of-muted">
                {target ? '대상 화면으로 이동' : '읽음 처리만 가능한 알림'}
              </span>
            ) : null}
          </span>
        </button>
        {action ? <span className="shrink-0 self-center">{action}</span> : null}
      </article>
    </li>
  )
}
