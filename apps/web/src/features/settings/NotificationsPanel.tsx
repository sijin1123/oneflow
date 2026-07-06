import {
  type NotificationSettings,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/features/notifications/api'

const TOGGLES: Array<{ key: keyof NotificationSettings; label: string; hint: string }> = [
  { key: 'assigned', label: '배정 알림', hint: '작업이 나에게 배정되면 알립니다.' },
  {
    key: 'watched',
    label: '워치 알림',
    hint: '워치 중인 작업의 상태·담당자가 바뀌면 알립니다.',
  },
  { key: 'commented', label: '댓글 알림', hint: '워치 중인 작업에 댓글이 달리면 알립니다.' },
]

/* Personal notification preferences (PR-E2) — applies to NEW notifications
   only; the existing inbox is never retro-hidden. Not owner-gated: everyone
   edits their own. */
export function NotificationsPanel() {
  const settings = useNotificationSettings()
  const update = useUpdateNotificationSettings()

  if (!settings.data) return null

  return (
    <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">알림 설정 (내 계정)</p>
      <p className="text-xs text-of-muted">
        끄면 그 종류의 새 알림이 생성되지 않습니다. 이미 받은 알림은 그대로 남습니다.
      </p>
      <ul className="space-y-2">
        {TOGGLES.map((t) => (
          <li key={t.key} className="flex items-center gap-3">
            <input
              id={`nt-${t.key}`}
              type="checkbox"
              checked={settings.data[t.key]}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ [t.key]: e.target.checked })}
              className="h-3.5 w-3.5 accent-of-accent"
            />
            <label htmlFor={`nt-${t.key}`} className="text-xs">
              <span className="font-medium">{t.label}</span>
              <span className="ml-1.5 text-of-muted">{t.hint}</span>
            </label>
          </li>
        ))}
      </ul>
      {update.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          저장하지 못했습니다.
        </p>
      ) : null}
    </div>
  )
}
