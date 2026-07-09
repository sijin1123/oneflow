import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthConfig, useLogout } from '@/features/auth/api'
import { useMe } from '@/features/members/api'

import { NotificationsPanel } from './NotificationsPanel'
import { SettingsFrame, SettingsSection } from './SettingsShell'

/* Personal settings (Pass 64 PR-CD): user-scoped configuration split OUT of
   project settings — the notification toggles are /me contracts and never
   belonged to a project. Read-only account card + the moved panel. */
export function PersonalSettingsPage() {
  const me = useMe()
  const auth = useAuthConfig()
  const logout = useLogout()

  return (
    <SettingsFrame
      eyebrow="Account settings"
      title="개인 설정"
      description="내 계정, 로그인 세션, 알림 수신 방식처럼 사용자 개인에게만 적용되는 설정입니다."
      meta={me.data?.is_admin ? '워크스페이스 관리자' : undefined}
      className="max-w-5xl"
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <SettingsSection
            title="내 계정"
            description="워크스페이스에서 표시되는 이름과 현재 계정 권한을 확인합니다."
          >
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
          </SettingsSection>

          <SettingsSection
            title="로그인/세션"
            description="현재 인증 모드와 세션 종료 동작을 확인합니다."
          >
            <div className="space-y-1.5 text-xs">
              <p>
                인증 모드:{' '}
                <Badge variant="neutral">
                  {auth.data?.auth_mode === 'oidc' ? 'SSO (OIDC)' : '개발 모드'}
                </Badge>
              </p>
              {auth.data?.auth_mode !== 'oidc' ? (
                <p className="text-of-muted">
                  개발 모드에서는 로그인 세션이 필수 설정(ONEFLOW_DEV_LOGIN_REQUIRED)에 따라
                  적용됩니다. 꺼져 있으면 자동 개발 로그인으로 동작합니다.
                </p>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    onSuccess: () => window.location.assign('/login'),
                  })
                }
              >
                로그아웃
              </Button>
            </div>
          </SettingsSection>
        </div>

        <SettingsSection
          title="알림 설정"
          description="새 알림 생성 기준을 내 계정 기준으로 조정합니다."
        >
          <NotificationsPanel framed={false} />
        </SettingsSection>
      </div>
    </SettingsFrame>
  )
}
