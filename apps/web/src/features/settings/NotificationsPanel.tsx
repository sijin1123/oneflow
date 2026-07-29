import { useState } from 'react'
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Target,
} from 'lucide-react'

import {
  type NotificationSettings,
  type OverdueReminderDays,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/features/notifications/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/controls'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type NotificationToggleKey = Exclude<keyof NotificationSettings, 'overdue_reminder_days'>

const GROUPS: Array<{
  key: string
  label: string
  hint: string
  icon: typeof MessageSquare
  items: Array<{ key: NotificationToggleKey; label: string; hint: string }>
}> = [
  {
    key: 'collaboration',
    label: '업무 협업',
    hint: '내 작업과 대화에서 발생하는 변화를 선택합니다.',
    icon: MessageSquare,
    items: [
      { key: 'assigned', label: '배정 알림', hint: '작업이 나에게 배정되면 알립니다.' },
      {
        key: 'watched',
        label: '워치 알림',
        hint: '워치 중인 작업의 상태·담당자가 바뀌면 알립니다.',
      },
      {
        key: 'commented',
        label: '댓글 알림',
        hint: '워치 중인 작업에 댓글이 달리면 알립니다.',
      },
      { key: 'mention', label: '멘션 알림', hint: '댓글에서 나를 멘션하면 알립니다.' },
    ],
  },
  {
    key: 'planning',
    label: '일정',
    hint: '담당 작업의 기한과 초과 알림 간격을 관리합니다.',
    icon: CalendarClock,
    items: [
      {
        key: 'due_alerts',
        label: '기한 알림',
        hint: '담당 작업 기한이 내일이거나 지나면 알립니다.',
      },
    ],
  },
  {
    key: 'portfolio',
    label: '포트폴리오',
    hint: '접수 요청과 상위 계획의 중요한 변화를 선택합니다.',
    icon: Target,
    items: [
      {
        key: 'intake',
        label: '접수 판정 알림',
        hint: '내가 제출한 접수 항목이 판정되면 알립니다.',
      },
      {
        key: 'initiatives',
        label: '이니셔티브 알림',
        hint: '팔로우한 이니셔티브의 상태·헬스·소유권·전략 범위 변경을 알립니다.',
      },
    ],
  },
]

const OVERDUE_CADENCES: Array<{
  value: OverdueReminderDays
  label: string
  hint: string
}> = [
  {
    value: 0,
    label: '첫 초과 알림 1회',
    hint: '기한이 지난 다음 날 한 번만 알립니다.',
  },
  {
    value: 3,
    label: '첫 알림 후 3일마다',
    hint: '첫 초과 알림을 보낸 날부터 3일 간격으로 다시 알립니다.',
  },
  {
    value: 7,
    label: '첫 알림 후 7일마다',
    hint: '매주 같은 간격으로 남아 있는 초과 작업을 다시 알립니다.',
  },
  {
    value: 14,
    label: '첫 알림 후 14일마다',
    hint: '장기 초과 작업을 2주 간격으로 다시 알립니다.',
  },
]

/* Personal notification preferences (PR-E2) — applies to NEW notifications
   only; the existing inbox is never retro-hidden. Not owner-gated: everyone
   edits their own. */
export function NotificationsPanel({ framed = true }: { framed?: boolean }) {
  const settings = useNotificationSettings()
  const update = useUpdateNotificationSettings()
  const [lastAttempt, setLastAttempt] = useState<Partial<NotificationSettings> | null>(null)

  const save = (input: Partial<NotificationSettings>) => {
    setLastAttempt(input)
    update.mutate(input, {
      onSuccess: () => setLastAttempt(null),
    })
  }

  if (settings.isPending) {
    return (
      <div
        className={cn(
          'space-y-3',
          framed && 'rounded-of border border-of-border bg-of-surface p-3',
        )}
        role="status"
        aria-label="알림 설정 불러오는 중"
        aria-busy="true"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full max-w-md" />
        <div className="space-y-3 pt-1">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className={cn('h-3', index % 2 === 0 ? 'w-3/5' : 'w-4/5')} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!settings.data) {
    return (
      <div
        className={cn(
          'flex min-w-0 flex-col items-start gap-2 border-y border-of-danger/20 bg-of-danger-soft/35 px-3 py-4',
          framed && 'rounded-of border',
        )}
        role="alert"
      >
        <p className="text-sm font-medium text-of-text">알림 설정을 불러오지 못했습니다.</p>
        <p className="text-xs text-of-muted">연결을 확인한 뒤 다시 시도해 주세요.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void settings.refetch()}
          disabled={settings.isFetching}
        >
          <RefreshCw size={13} className={cn(settings.isFetching && 'animate-spin')} />
          다시 시도
        </Button>
      </div>
    )
  }

  const selectedCadence =
    OVERDUE_CADENCES.find(
      (cadence) => cadence.value === settings.data.overdue_reminder_days,
    ) ?? OVERDUE_CADENCES[0]

  return (
    <div
      className={cn(
        'min-w-0',
        framed && 'rounded-of border border-of-border bg-of-surface p-3',
      )}
      role="region"
      aria-label="개인 알림 설정"
      aria-busy={update.isPending}
    >
      <div className="flex min-w-0 flex-col gap-2 border-b border-of-border-subtle pb-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="min-w-0 text-xs leading-5 text-of-muted">
          선택한 이벤트만 새 알림으로 받습니다. 이미 받은 알림과 읽음 상태는 변경되지 않습니다.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-full shrink-0 sm:w-auto"
          disabled={settings.isFetching}
          onClick={() => void settings.refetch()}
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            className={cn(settings.isFetching && 'animate-spin')}
          />
          알림 설정 새로고침
        </Button>
      </div>
      {settings.isError ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2">
            <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-of-warning" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-of-text">
                최신 알림 설정을 불러오지 못했습니다.
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                마지막으로 확인한 개인 설정을 표시합니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={settings.isFetching}
            onClick={() => void settings.refetch()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={cn(settings.isFetching && 'animate-spin')}
            />
            알림 설정 다시 시도
          </Button>
        </div>
      ) : null}
      <div className="divide-y divide-of-border-subtle">
        {GROUPS.map((group) => {
          const Icon = group.icon
          return (
            <section
              key={group.key}
              aria-labelledby={`notification-group-${group.key}`}
              className="grid min-w-0 gap-3 py-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-5"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-of bg-of-surface-2 text-of-muted">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3
                    id={`notification-group-${group.key}`}
                    className="text-xs font-semibold text-of-text"
                  >
                    {group.label}
                  </h3>
                  <p className="mt-1 text-[11px] leading-4 text-of-muted">{group.hint}</p>
                </div>
              </div>
              <ul className="min-w-0 divide-y divide-of-border-subtle">
                {group.items.map((item) => (
                  <li key={item.key} className="min-w-0 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-of-text">{item.label}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-of-muted">{item.hint}</p>
                      </div>
                      <Switch
                        checked={settings.data[item.key]}
                        disabled={update.isPending}
                        label={`${item.label} 사용`}
                        onCheckedChange={(checked) => save({ [item.key]: checked })}
                      />
                    </div>
                    {item.key === 'due_alerts' ? (
                      <div className="mt-3 grid min-w-0 gap-2 border-l-2 border-of-border-subtle pl-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start">
                        <div>
                          <label
                            htmlFor="nt-overdue-reminder-days"
                            className="mb-1 block text-[11px] font-medium text-of-text"
                          >
                            초과 재알림
                          </label>
                          <Select
                            id="nt-overdue-reminder-days"
                            aria-label="초과 재알림 주기"
                            value={settings.data.overdue_reminder_days}
                            disabled={!settings.data.due_alerts || update.isPending}
                            onChange={(event) =>
                              save({
                                overdue_reminder_days: Number(
                                  event.target.value,
                                ) as OverdueReminderDays,
                              })
                            }
                          >
                            {OVERDUE_CADENCES.map((cadence) => (
                              <option key={cadence.value} value={cadence.value}>
                                {cadence.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <p className="text-[11px] leading-4 text-of-muted sm:pt-5">
                          {settings.data.due_alerts
                            ? selectedCadence.hint
                            : '기한 알림을 켜면 재알림 주기를 선택할 수 있습니다.'}
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <div
        className="flex min-h-8 min-w-0 flex-wrap items-center gap-2 border-t border-of-border-subtle pt-3"
        aria-live="polite"
      >
        {update.isPending ? (
          <>
            <LoaderCircle size={13} className="animate-spin text-of-muted" aria-hidden="true" />
            <p className="text-xs text-of-muted">변경사항을 저장하는 중입니다.</p>
          </>
        ) : update.isError ? (
          <>
            <CircleAlert size={13} className="text-of-danger" aria-hidden="true" />
            <p role="alert" className="min-w-0 flex-1 text-xs text-of-danger">
              알림 설정을 저장하지 못했습니다. 변경은 적용되지 않았습니다.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!lastAttempt}
              onClick={() => {
                if (lastAttempt) save(lastAttempt)
              }}
            >
              <RefreshCw size={13} aria-hidden="true" />
              다시 시도
            </Button>
          </>
        ) : update.isSuccess ? (
          <>
            <CircleCheck size={13} className="text-of-success" aria-hidden="true" />
            <p className="text-xs text-of-success">알림 설정을 저장했습니다.</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
