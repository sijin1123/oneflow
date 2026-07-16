import {
  type NotificationSettings,
  type OverdueReminderDays,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/features/notifications/api'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'

type NotificationToggleKey = Exclude<keyof NotificationSettings, 'overdue_reminder_days'>

const TOGGLES: Array<{ key: NotificationToggleKey; label: string; hint: string }> = [
  { key: 'assigned', label: '배정 알림', hint: '작업이 나에게 배정되면 알립니다.' },
  {
    key: 'watched',
    label: '워치 알림',
    hint: '워치 중인 작업의 상태·담당자가 바뀌면 알립니다.',
  },
  { key: 'commented', label: '댓글 알림', hint: '워치 중인 작업에 댓글이 달리면 알립니다.' },
  { key: 'mention', label: '멘션 알림', hint: '댓글에서 나를 멘션하면 알립니다.' },
  {
    key: 'due_alerts',
    label: '기한 알림',
    hint: '담당 작업 기한이 내일이거나 지나면 알립니다.',
  },
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

  if (settings.isError || !settings.data) {
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
        'min-w-0 space-y-3',
        framed && 'rounded-of border border-of-border bg-of-surface p-3',
      )}
      aria-busy={update.isPending}
    >
      <p className="text-xs font-medium">알림 설정 (내 계정)</p>
      <p className="text-xs text-of-muted">
        끄면 그 종류의 새 알림이 생성되지 않습니다. 이미 받은 알림은 그대로 남습니다.
      </p>
      <ul className="divide-y divide-of-border-subtle border-y border-of-border-subtle">
        {TOGGLES.map((t) => (
          <li key={t.key} className="min-w-0 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <input
                id={`nt-${t.key}`}
                type="checkbox"
                checked={settings.data[t.key]}
                disabled={update.isPending}
                onChange={(e) => update.mutate({ [t.key]: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-of-accent"
              />
              <label htmlFor={`nt-${t.key}`} className="min-w-0 text-xs leading-5">
                <span className="font-medium text-of-text">{t.label}</span>
                <span className="ml-1.5 text-of-muted">{t.hint}</span>
              </label>
            </div>
            {t.key === 'due_alerts' ? (
              <div className="ml-6 mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
                <div>
                  <label
                    htmlFor="nt-overdue-reminder-days"
                    className="mb-1 block text-xs font-medium text-of-text"
                  >
                    초과 재알림
                  </label>
                  <Select
                    id="nt-overdue-reminder-days"
                    aria-label="초과 재알림 주기"
                    value={settings.data.overdue_reminder_days}
                    disabled={!settings.data.due_alerts || update.isPending}
                    onChange={(event) =>
                      update.mutate({
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
                <p className="text-xs leading-5 text-of-muted sm:pt-5">
                  {settings.data.due_alerts
                    ? selectedCadence.hint
                    : '기한 알림을 켜면 재알림 주기를 선택할 수 있습니다.'}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="min-h-5" aria-live="polite">
        {update.isPending ? (
          <p className="text-xs text-of-muted">변경사항을 저장하는 중입니다.</p>
        ) : update.isError ? (
          <p role="alert" className="text-xs text-of-danger">
            알림 설정을 저장하지 못했습니다. 다시 선택해 주세요.
          </p>
        ) : update.isSuccess ? (
          <p className="text-xs text-of-success">알림 설정을 저장했습니다.</p>
        ) : null}
      </div>
    </div>
  )
}
