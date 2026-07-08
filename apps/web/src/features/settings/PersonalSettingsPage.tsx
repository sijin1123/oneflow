import { Badge } from '@/components/ui/badge'
import { useMe } from '@/features/members/api'

import { NotificationsPanel } from './NotificationsPanel'

/* Personal settings (Pass 64 PR-CD): user-scoped configuration split OUT of
   project settings — the notification toggles are /me contracts and never
   belonged to a project. Read-only account card + the moved panel. */
export function PersonalSettingsPage() {
  const me = useMe()

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-base font-semibold">개인 설정</h1>
      <p className="mb-4 text-xs text-of-muted">
        내 계정에만 적용되는 설정입니다. 프로젝트별 설정은 각 프로젝트의 설정 화면에 있습니다.
      </p>

      <section
        aria-label="내 계정"
        className="mb-6 rounded-of border border-of-border bg-of-surface p-4"
      >
        <h2 className="mb-2 text-sm font-semibold">내 계정</h2>
        {me.data ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-of-accent-soft text-sm font-semibold text-of-accent">
              {me.data.display_name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {me.data.display_name}
                {me.data.is_admin ? (
                  <Badge variant="accent" className="ml-2">
                    워크스페이스 관리자
                  </Badge>
                ) : null}
              </p>
              <p className="truncate text-xs text-of-muted">{me.data.email}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section
        aria-label="알림 설정"
        className="rounded-of border border-of-border bg-of-surface p-4"
      >
        <NotificationsPanel />
      </section>
    </div>
  )
}
