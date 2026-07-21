import { useEffect, useRef, useState } from 'react'
import { Copy, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, Trash2, Upload } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type AuthConfig,
  useAuthConfig,
  useAuthSessions,
  useRevokeAuthSession,
} from '@/features/auth/api'
import {
  profileImageSrc,
  useMe,
  useRemoveProfileImage,
  useReplaceProfileImage,
} from '@/features/members/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

import {
  type PersonalAccessTokenCreated,
  useAccessTokens,
  useCreateAccessToken,
  useRevokeAccessToken,
} from './accessTokensApi'
import { NotificationsPanel } from './NotificationsPanel'
import { SettingsFrame, SettingsSection } from './SettingsShell'

const PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024

function AccountProfilePanel() {
  const me = useMe()
  const replaceImage = useReplaceProfileImage()
  const removeImage = useRemoveProfileImage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<File | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!selected) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selected)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selected])

  if (me.isError) {
    return (
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" role="alert">
        <p className="text-xs text-of-danger">계정 정보를 불러오지 못했습니다.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void me.refetch()}>
          다시 시도
        </Button>
      </div>
    )
  }
  if (!me.data) {
    return <div className="h-20 animate-pulse rounded-of bg-of-subtle" aria-label="계정 불러오는 중" />
  }

  const busy = replaceImage.isPending || removeImage.isPending
  const mutationError = replaceImage.error ?? removeImage.error
  const stale = mutationError instanceof ApiError && mutationError.status === 412
  const serverError = mutationError instanceof ApiError ? mutationError.message : null
  const currentSrc = profileImageSrc(me.data)

  const clearSelection = () => {
    setSelected(null)
    setSelectionError(null)
    replaceImage.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          name={me.data.display_name}
          src={previewUrl ?? currentSrc}
          size="lg"
          className="h-16 w-16 text-lg"
        />
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
          <p className="mt-1 text-[11px] text-of-muted">
            PNG, JPEG 또는 WebP · 최대 2 MiB
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="프로필 이미지 파일"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          replaceImage.reset()
          removeImage.reset()
          setSelectionError(null)
          if (!file) {
            setSelected(null)
            return
          }
          if (!PROFILE_IMAGE_TYPES.includes(file.type)) {
            setSelected(null)
            setSelectionError('PNG, JPEG 또는 WebP 이미지를 선택해 주세요.')
            event.target.value = ''
            return
          }
          if (file.size > PROFILE_IMAGE_MAX_BYTES) {
            setSelected(null)
            setSelectionError('프로필 이미지는 2 MiB 이하여야 합니다.')
            event.target.value = ''
            return
          }
          setSelected(file)
        }}
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={13} aria-hidden="true" />
          {currentSrc ? '이미지 교체' : '이미지 선택'}
        </Button>
        {selected ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              replaceImage.mutate(
                { file: selected, revision: me.data.profile_revision },
                { onSuccess: clearSelection },
              )
            }
          >
            {replaceImage.isPending ? '저장 중' : '프로필 이미지 저장'}
          </Button>
        ) : null}
        {currentSrc && !selected ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => removeImage.mutate(me.data.profile_revision)}
          >
            <Trash2 size={13} aria-hidden="true" />
            {removeImage.isPending ? '삭제 중' : '삭제'}
          </Button>
        ) : null}
        {selected ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={clearSelection}>
            취소
          </Button>
        ) : null}
      </div>

      {selected ? (
        <p className="truncate text-xs text-of-muted" role="status">
          선택됨: {selected.name}
        </p>
      ) : me.data.profile_image_filename ? (
        <p className="truncate text-xs text-of-muted">
          현재 이미지: {me.data.profile_image_filename}
          {me.data.profile_image_width && me.data.profile_image_height
            ? ` · ${me.data.profile_image_width}×${me.data.profile_image_height}`
            : ''}
        </p>
      ) : null}
      {selectionError ? <p className="text-xs text-of-danger" role="alert">{selectionError}</p> : null}
      {mutationError ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" role="alert">
          <p className="text-xs text-of-danger">
            {stale
              ? me.isFetching
                ? '다른 화면에서 계정 이미지가 변경되었습니다. 최신 상태를 불러오는 중입니다.'
                : '다른 화면에서 계정 이미지가 변경되었습니다. 최신 상태로 다시 저장해 주세요.'
              : serverError ?? '프로필 이미지를 변경하지 못했습니다.'}
          </p>
          {stale && selected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={replaceImage.isPending || me.isFetching}
              onClick={() =>
                replaceImage.mutate(
                  { file: selected, revision: me.data.profile_revision },
                  { onSuccess: clearSelection },
                )
              }
            >
              {me.isFetching ? '최신 상태 불러오는 중' : '다시 저장'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

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

function SessionsPanel({
  auth,
  authError,
  retryAuth,
}: {
  auth: AuthConfig | undefined
  authError: boolean
  retryAuth: () => void
}) {
  const supported = auth?.session_management_enabled === true
  const sessions = useAuthSessions(supported)
  const revokeSession = useRevokeAuthSession()

  return (
    <SettingsSection
      title="로그인 및 세션"
      description="인증 제공 경계를 확인하고 이 계정의 활성 브라우저 세션을 종료합니다."
      actions={
        <Badge variant={supported ? 'accent' : 'outline'}>
          {auth?.auth_mode === 'oidc' ? 'SSO (OIDC)' : '개발 모드'}
        </Badge>
      }
    >
      {authError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-of-danger">인증 구성을 불러오지 못했습니다.</p>
          <Button size="sm" variant="outline" onClick={retryAuth}>
            다시 시도
          </Button>
        </div>
      ) : !auth ? (
        <p className="text-xs text-of-muted">인증 구성을 불러오는 중입니다.</p>
      ) : auth.auth_mode === 'oidc' ? (
        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-2 rounded-of border border-of-border bg-of-subtle p-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-of-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium">SSO 공급자가 세션을 관리합니다.</p>
              <p className="mt-1 text-of-muted">
                OneFlow에서는 OIDC 연결 상태만 확인하며 세션 종료는 조직의 인증 공급자 정책을
                따릅니다.
              </p>
            </div>
          </div>
          <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-of-muted">Issuer</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px]">
                {auth.oidc_issuer ?? '미설정'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-of-muted">Client ID</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px]">
                {auth.oidc_client_id ?? '미설정'}
              </dd>
            </div>
          </dl>
        </div>
      ) : !supported ? (
        <div className="flex items-start gap-2 rounded-of border border-of-border bg-of-subtle p-3 text-xs">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
          <div>
            <p className="font-medium">자동 개발 로그인이 사용 중입니다.</p>
            <p className="mt-1 text-of-muted">
              브라우저 세션을 만들지 않는 로컬 전용 모드입니다. 세션 관리는 배포 시
              ONEFLOW_DEV_LOGIN_REQUIRED를 활성화한 환경에서 제공됩니다.
            </p>
          </div>
        </div>
      ) : sessions.isPending ? (
        <div className="space-y-2" aria-label="세션 목록을 불러오는 중">
          <div className="h-12 animate-pulse rounded-of bg-of-subtle" />
          <div className="h-12 animate-pulse rounded-of bg-of-subtle" />
        </div>
      ) : sessions.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-of-danger">활성 세션을 불러오지 못했습니다.</p>
          <Button size="sm" variant="outline" onClick={() => void sessions.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : (
        <>
          {revokeSession.isError ? (
            <div
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-of border border-of-danger/30 bg-of-danger/5 p-2 text-xs"
              role="alert"
            >
              <p className="text-of-danger">세션을 종료하지 못했습니다.</p>
              <Button
                size="sm"
                variant="outline"
                disabled={!revokeSession.variables || revokeSession.isPending}
                onClick={() => {
                  if (revokeSession.variables) revokeSession.mutate(revokeSession.variables)
                }}
              >
                다시 시도
              </Button>
            </div>
          ) : null}
          <ul className="divide-y divide-of-border border-y border-of-border">
            {sessions.data.items.map((session) => (
              <li
                key={session.id}
                className="grid min-w-0 gap-2 py-2.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <MonitorSmartphone
                    size={16}
                    className="mt-0.5 shrink-0 text-of-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">브라우저 세션</span>
                      {session.is_current ? <Badge variant="accent">현재 세션</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-of-muted">
                      시작 {formatDateTime(session.created_at)} · 만료{' '}
                      {formatDateTime(session.expires_at)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revokeSession.isPending}
                  aria-label={session.is_current ? '현재 세션 종료' : `${formatDateTime(session.created_at)} 세션 종료`}
                  onClick={() =>
                    revokeSession.mutate({ id: session.id, isCurrent: session.is_current })
                  }
                >
                  <LogOut size={13} aria-hidden="true" /> 종료
                </Button>
              </li>
            ))}
          </ul>
        </>
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
            description="워크스페이스에서 표시되는 프로필 이미지, 이름과 현재 계정 권한을 관리합니다."
          >
            <AccountProfilePanel />
          </SettingsSection>

          <SessionsPanel
            auth={auth.data}
            authError={auth.isError}
            retryAuth={() => void auth.refetch()}
          />

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
