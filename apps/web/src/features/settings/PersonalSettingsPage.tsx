import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthConfig, useLogout } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { formatDateTime } from '@/lib/datetime'

import {
  type PersonalAccessTokenCreated,
  useAccessTokens,
  useCreateAccessToken,
  useRevokeAccessToken,
} from './accessTokensApi'
import { NotificationsPanel } from './NotificationsPanel'
import { SettingsFrame, SettingsSection } from './SettingsShell'

function AccessTokensPanel() {
  const tokens = useAccessTokens()
  const createToken = useCreateAccessToken()
  const revokeToken = useRevokeAccessToken()
  const [name, setName] = useState('')
  const [days, setDays] = useState(90)
  const [created, setCreated] = useState<PersonalAccessTokenCreated | null>(null)

  return (
    <SettingsSection
      title="개발자 액세스 토큰"
      description="개인 API 호출에 사용할 토큰을 만들고 필요 없어진 토큰을 폐기합니다."
      actions={<Badge variant="outline">Bearer</Badge>}
    >
      <form
        className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          createToken.mutate(
            { name: trimmed, expires_in_days: days },
            {
              onSuccess: (result) => {
                setCreated(result)
                setName('')
              },
            },
          )
        }}
      >
        <label className="min-w-0 text-xs">
          <span className="mb-1 block font-medium text-of-muted">토큰 이름</span>
          <Input
            value={name}
            maxLength={80}
            placeholder="예: 배포 스크립트"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium text-of-muted">유효 일수</span>
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => {
              const next = Number(event.target.value)
              setDays(Number.isFinite(next) ? Math.min(365, Math.max(1, next)) : 90)
            }}
          />
        </label>
        <Button type="submit" className="self-end" disabled={createToken.isPending || !name.trim()}>
          <KeyRound size={14} aria-hidden="true" /> 토큰 생성
        </Button>
      </form>

      {created ? (
        <div className="mt-3 space-y-2 rounded-of bg-of-accent-soft p-3 text-xs" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-of-accent">새 토큰은 지금만 확인할 수 있습니다.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(created.token)}
            >
              <Copy size={13} aria-hidden="true" /> 복사
            </Button>
          </div>
          <code
            aria-label="새 액세스 토큰"
            className="block break-all rounded-of bg-of-surface px-2 py-1 font-mono text-[11px]"
          >
            {created.token}
          </code>
        </div>
      ) : null}

      {tokens.isPending ? (
        <p className="mt-3 text-xs text-of-muted">토큰을 불러오는 중입니다.</p>
      ) : tokens.isError ? (
        <p className="mt-3 text-xs text-of-danger">토큰 목록을 불러오지 못했습니다.</p>
      ) : tokens.data.items.length === 0 ? (
        <p className="mt-3 text-xs text-of-muted">아직 만든 액세스 토큰이 없습니다.</p>
      ) : (
        <ul className="mt-3 divide-y divide-of-border border-y border-of-border">
          {tokens.data.items.map((token) => {
            const revoked = Boolean(token.revoked_at)
            return (
              <li
                key={token.id}
                className="grid min-w-0 gap-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{token.name}</span>
                    <Badge variant={revoked ? 'outline' : 'neutral'}>
                      {revoked ? '폐기됨' : '활성'}
                    </Badge>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-of-muted">
                    {token.token_prefix}••••
                  </p>
                  <p className="mt-1 text-[11px] text-of-muted">
                    만료 {formatDateTime(token.expires_at)}
                    {token.last_used_at ? ` · 마지막 사용 ${formatDateTime(token.last_used_at)}` : ''}
                  </p>
                </div>
                {!revoked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revokeToken.isPending}
                    aria-label={`${token.name} 폐기`}
                    onClick={() => revokeToken.mutate(token.id)}
                  >
                    폐기
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </SettingsSection>
  )
}

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

          <AccessTokensPanel />
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
