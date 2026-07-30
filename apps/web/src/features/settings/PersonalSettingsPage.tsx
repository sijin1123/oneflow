import * as Dialog from '@radix-ui/react-dialog'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import {
  Bell,
  Copy,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import {
  type AuthConfig,
  type AuthSession,
  useAuthConfig,
  useAuthSessions,
  useRevokeAuthSession,
} from '@/features/auth/api'
import {
  profileImageSrc,
  useMe,
  useRemoveProfileImage,
  useReplaceProfileImage,
  useUpdateMyProfile,
} from '@/features/members/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { useUnsavedLocationPrompt } from '@/lib/guards'
import { cn } from '@/lib/utils'

import {
  type CreateAccessTokenInput,
  type PersonalAccessTokenCreated,
  type PersonalAccessToken,
  useAccessTokens,
  useCreateAccessToken,
  useRevokeAccessToken,
} from './accessTokensApi'
import { NotificationsPanel } from './NotificationsPanel'
import { SettingsSection, type SettingsNavItem } from './SettingsShell'

const PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const PERSONAL_TABS = [
  { key: 'profile', label: '계정', description: '프로필과 계정 정보', icon: UserRound },
  { key: 'security', label: '보안', description: '로그인 세션과 API 토큰', icon: ShieldCheck },
  { key: 'notifications', label: '알림', description: '개인 알림 수신 기준', icon: Bell },
] as const satisfies readonly SettingsNavItem[]

type PersonalTabKey = (typeof PERSONAL_TABS)[number]['key']

function Summary({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning'
}) {
  return (
    <div className="min-w-0 bg-of-surface px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 truncate text-xs font-semibold',
          tone === 'success' && 'text-of-success',
          tone === 'warning' && 'text-of-warning',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function ConfirmActionDialog({
  open,
  onOpenChange,
  returnFocusRef,
  fallbackFocusRef,
  title,
  description,
  pending,
  error,
  actionLabel,
  pendingLabel,
  actionDisabled = false,
  actionDisabledMessage,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
  fallbackFocusRef?: RefObject<HTMLButtonElement | null>
  title: string
  description: ReactNode
  pending: boolean
  error: string | null
  actionLabel: string
  pendingLabel: string
  actionDisabled?: boolean
  actionDisabledMessage?: string
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <Dialog.Portal>
        <ModalOverlay className="bg-black/40" />
        <ModalContent
          className="w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const returnTarget = returnFocusRef.current
            if (returnTarget?.isConnected && !returnTarget.disabled) {
              returnTarget.focus()
            } else {
              fallbackFocusRef?.current?.focus()
            }
          }}
        >
          <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-danger-soft text-of-danger">
              <LogOut size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="확인 창 닫기" disabled={pending}>
                <X size={14} aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </header>
          {error ? (
            <p
              role="alert"
              className="mx-4 mt-4 rounded-of border border-of-danger/20 bg-of-danger-soft px-3 py-2 text-xs leading-5 text-of-danger"
            >
              {error}
            </p>
          ) : null}
          {actionDisabled && actionDisabledMessage ? (
            <p
              role="alert"
              className="mx-4 mt-4 border border-of-warning/35 bg-of-warning/10 px-3 py-2 text-xs leading-5 text-of-text"
            >
              {actionDisabledMessage}
            </p>
          ) : null}
          <footer className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button type="button" size="sm" variant="outline" disabled={pending}>
                취소
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending || actionDisabled}
              onClick={onConfirm}
            >
              {pending ? pendingLabel : error ? `${actionLabel} 다시 시도` : actionLabel}
            </Button>
          </footer>
        </ModalContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AccountProfilePanel() {
  const me = useMe()
  const updateProfile = useUpdateMyProfile()
  const replaceImage = useReplaceProfileImage()
  const removeImage = useRemoveProfileImage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [selected, setSelected] = useState<File | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const currentName = me.data?.display_name ?? ''
  const effectiveName = nameDraft ?? currentName
  const normalizedName = effectiveName.trim()
  const nameDirty = nameDraft !== null && normalizedName !== currentName

  useUnsavedLocationPrompt(
    selected !== null || nameDirty,
    '저장하지 않은 프로필 변경을 버리고 이동할까요?',
  )

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

  const busy = updateProfile.isPending || replaceImage.isPending || removeImage.isPending
  const nameError = updateProfile.error
  const nameStale = nameError instanceof ApiError && nameError.status === 412
  const nameServerError = nameError instanceof ApiError ? nameError.message : null
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
      <div className="grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(12rem,auto)] sm:items-center">
        <Avatar
          name={me.data.display_name}
          src={previewUrl ?? currentSrc}
          size="lg"
          className="h-16 w-16 text-lg"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">{me.data.display_name}</p>
          <p className="truncate text-xs text-of-muted">{me.data.email}</p>
          <p className="mt-1 text-[11px] text-of-muted">
            PNG, JPEG 또는 WebP · 최대 2 MiB
          </p>
        </div>
        <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-of-border-subtle pt-3 text-[11px] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <div className="min-w-0">
            <dt className="text-of-muted">계정 상태</dt>
            <dd className="mt-0.5 font-medium text-of-success">
              {me.data.is_active ? '활성' : '비활성'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-of-muted">프로필 revision</dt>
            <dd className="mt-0.5 font-medium">{me.data.profile_revision}</dd>
          </div>
        </dl>
      </div>

      <div className="grid min-w-0 gap-2 border-t border-of-border-subtle pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="min-w-0 space-y-1.5">
          <span className="block text-xs font-medium">표시 이름</span>
          <Input
            value={effectiveName}
            maxLength={120}
            autoComplete="name"
            disabled={busy}
            aria-invalid={normalizedName.length === 0}
            onChange={(event) => {
              setNameDraft(event.target.value)
              updateProfile.reset()
            }}
          />
        </label>
        <div className="flex min-w-0 flex-wrap gap-2">
          {nameDirty ? (
            <Button
              type="button"
              size="sm"
              disabled={busy || normalizedName.length === 0 || me.isFetching}
              onClick={() =>
                updateProfile.mutate(
                  { displayName: normalizedName, revision: me.data.profile_revision },
                  { onSuccess: () => setNameDraft(null) },
                )
              }
            >
              {updateProfile.isPending
                ? '저장 중'
                : me.isFetching
                  ? '최신 상태 확인 중'
                  : nameError
                    ? '다시 저장'
                    : '이름 저장'}
            </Button>
          ) : null}
          {nameDraft !== null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setNameDraft(null)
                updateProfile.reset()
              }}
            >
              취소
            </Button>
          ) : null}
        </div>
      </div>

      {normalizedName.length === 0 ? (
        <p className="text-xs text-of-danger" role="alert">
          표시 이름을 입력해 주세요.
        </p>
      ) : nameError ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2" role="alert">
          <p className="text-xs text-of-danger">
            {nameStale
              ? me.isFetching
                ? '다른 화면에서 프로필이 변경되었습니다. 최신 상태를 불러오는 중입니다.'
                : '다른 화면에서 프로필이 변경되었습니다. 입력한 이름을 다시 저장해 주세요.'
              : nameServerError ?? '표시 이름을 변경하지 못했습니다.'}
          </p>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        className="sr-only"
        aria-label="프로필 이미지 파일"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          updateProfile.reset()
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
  const [creating, setCreating] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<PersonalAccessToken | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const revokeButtonRef = useRef<HTMLButtonElement>(null)
  const refreshButtonRef = useRef<HTMLButtonElement>(null)
  const hasTokenData = tokens.data !== undefined
  const stale = tokens.isError && hasTokenData
  const writeBlocked = tokens.isError || tokens.isFetching
  const currentRevokeTarget = revokeTarget
    ? tokens.data?.items.find((token) => token.id === revokeTarget.id && !token.revoked_at) ?? null
    : null
  const revokeTargetUnavailable =
    revokeTarget !== null && hasTokenData && !writeBlocked && currentRevokeTarget === null
  const revokeActionBlocked = writeBlocked || revokeTargetUnavailable

  useUnsavedLocationPrompt(
    created !== null || (creating && (name.trim().length > 0 || days !== 90)),
    created
      ? '지금만 확인할 수 있는 새 액세스 토큰을 닫고 이동할까요?'
      : '작성 중인 액세스 토큰을 버리고 이동할까요?',
  )
  const openCreator = () => {
    if (writeBlocked) return
    createToken.reset()
    setCreating(true)
    window.setTimeout(() => nameRef.current?.focus(), 0)
  }
  const create = (body: CreateAccessTokenInput) => {
    if (writeBlocked) return
    createToken.mutate(body, {
      onSuccess: (result) => {
        setCreated(result)
        setName('')
      },
    })
  }

  const revoke = async () => {
    if (!currentRevokeTarget || revokeActionBlocked) return
    try {
      await revokeToken.mutateAsync(currentRevokeTarget.id)
      setRevokeTarget(null)
    } catch {
      // The focused confirmation keeps the exact failed token available for retry.
    }
  }

  return (
    <>
      <SettingsSection
        title="개발자 액세스 토큰"
        description="개인 API 호출에 사용할 토큰을 만들고 필요 없어진 토큰을 폐기합니다."
        framed={false}
        className="border-b border-of-border-subtle p-0 pb-5 sm:p-0 sm:pb-6"
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              ref={refreshButtonRef}
              type="button"
              size="sm"
              variant="ghost"
              aria-disabled={tokens.isFetching}
              onClick={() => {
                if (!tokens.isFetching) void tokens.refetch()
              }}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={cn(tokens.isFetching && 'animate-spin')}
              />
              토큰 목록 새로고침
            </Button>
            <Button
              type="button"
              size="sm"
              variant={creating ? 'outline' : 'default'}
              aria-expanded={creating}
              aria-controls="access-token-creator"
              disabled={writeBlocked && !creating}
              onClick={() => {
                if (creating) {
                  createToken.reset()
                  setCreating(false)
                } else {
                  openCreator()
                }
              }}
            >
              {creating ? (
                <X size={14} aria-hidden="true" />
              ) : (
                <KeyRound size={14} aria-hidden="true" />
              )}
              {creating ? '닫기' : '액세스 토큰 추가'}
            </Button>
          </div>
        }
      >
      {creating ? (
        <form
          id="access-token-creator"
          className="mb-4 grid min-w-0 gap-3 rounded-of border border-of-border-subtle bg-of-subtle p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (!trimmed) return
            const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
            const tokenNonce = btoa(String.fromCharCode(...nonceBytes))
              .replaceAll('+', '-')
              .replaceAll('/', '_')
              .replace(/=+$/, '')
            create({ name: trimmed, expires_in_days: days, token_nonce: tokenNonce })
          }}
        >
          <label className="min-w-0 text-xs">
            <span className="mb-1 block font-medium text-of-muted">토큰 이름</span>
            <Input
              ref={nameRef}
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
          <Button
            type="submit"
            disabled={writeBlocked || createToken.isPending || !name.trim()}
          >
            <KeyRound size={14} aria-hidden="true" />
            {createToken.isPending ? '생성 중' : '토큰 생성'}
          </Button>
        </form>
      ) : null}

      {createToken.isError ? (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-of border border-of-danger/30 bg-of-danger/5 p-2 text-xs"
          role="alert"
        >
          <p className="text-of-danger">액세스 토큰을 만들지 못했습니다.</p>
          <Button
            size="sm"
            variant="outline"
            disabled={writeBlocked || !createToken.variables || createToken.isPending}
            onClick={() => {
              if (createToken.variables) create(createToken.variables)
            }}
          >
            다시 시도
          </Button>
        </div>
      ) : null}

      {created ? (
        <div className="mb-4 space-y-2 rounded-of bg-of-accent-soft p-3 text-xs" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-of-accent">새 토큰은 지금만 확인할 수 있습니다.</span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(created.token)}
              >
                <Copy size={13} aria-hidden="true" /> 복사
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                확인 완료
              </Button>
            </div>
          </div>
          <code
            aria-label="새 액세스 토큰"
            className="block break-all rounded-of bg-of-surface px-2 py-1 font-mono text-[11px]"
          >
            {created.token}
          </code>
        </div>
      ) : null}

      {stale ? (
        <div
          className="mb-4 flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-of-text">
              최신 액세스 토큰 목록을 불러오지 못했습니다.
            </p>
            <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
              마지막으로 확인한 토큰을 표시합니다. 목록을 복구할 때까지 생성과 폐기는
              중단됩니다.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={tokens.isFetching}
            onClick={() => void tokens.refetch()}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={cn(tokens.isFetching && 'animate-spin')}
            />
            토큰 목록 다시 시도
          </Button>
        </div>
      ) : null}

      {tokens.isPending && !tokens.data ? (
        <div className="space-y-2" aria-label="액세스 토큰 목록을 불러오는 중">
          <div className="h-12 animate-pulse rounded-of bg-of-subtle" />
          <div className="h-12 animate-pulse rounded-of bg-of-subtle" />
        </div>
      ) : !tokens.data ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs" role="alert">
          <p className="text-of-danger">토큰 목록을 불러오지 못했습니다.</p>
          <Button
            size="sm"
            variant="outline"
            disabled={tokens.isFetching}
            onClick={() => void tokens.refetch()}
          >
            다시 시도
          </Button>
        </div>
      ) : tokens.data.items.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-of bg-of-subtle text-of-muted">
            <KeyRound size={18} aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium">아직 만든 액세스 토큰이 없습니다.</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-of-muted">
            외부 도구나 자동화에서 OneFlow API를 호출할 때 사용할 토큰을 만드세요.
          </p>
          <Button size="sm" className="mt-3" disabled={writeBlocked} onClick={openCreator}>
            액세스 토큰 추가
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-of border border-of-border-subtle">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_10rem_7rem] gap-3 border-b border-of-border-subtle bg-of-subtle px-3 py-2 text-[11px] font-medium text-of-muted sm:grid"
              aria-hidden="true"
            >
              <span>토큰</span>
              <span>만료</span>
              <span className="text-right">작업</span>
            </div>
            <ul className="divide-y divide-of-border-subtle">
              {tokens.data.items.map((token) => {
                const revoked = Boolean(token.revoked_at)
                return (
                  <li
                    key={token.id}
                    className="grid min-w-0 gap-2 px-3 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_10rem_7rem] sm:items-center"
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
                      {token.last_used_at ? (
                        <p className="mt-1 text-[11px] text-of-muted">
                          마지막 사용 {formatDateTime(token.last_used_at)}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-of-muted">
                      <span className="sm:hidden">만료 </span>
                      {formatDateTime(token.expires_at)}
                    </p>
                    {!revoked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:justify-self-end"
                        disabled={writeBlocked || revokeToken.isPending}
                        aria-label={`${token.name} 폐기`}
                        onClick={(event) => {
                          if (writeBlocked) return
                          revokeButtonRef.current = event.currentTarget
                          revokeToken.reset()
                          setRevokeTarget(token)
                        }}
                      >
                        폐기
                      </Button>
                    ) : (
                      <span className="text-right text-[11px] text-of-muted">사용 불가</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
      </SettingsSection>
      <ConfirmActionDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            revokeToken.reset()
            setRevokeTarget(null)
          }
        }}
        returnFocusRef={revokeButtonRef}
        fallbackFocusRef={refreshButtonRef}
        title="액세스 토큰을 폐기할까요?"
        description={
          <>
            <span className="font-medium text-of-text">{revokeTarget?.name}</span> 토큰은 즉시
            사용할 수 없게 되며 다시 활성화할 수 없습니다.
          </>
        }
        pending={revokeToken.isPending}
        actionDisabled={revokeActionBlocked}
        actionDisabledMessage={
          revokeTargetUnavailable
            ? '이 토큰은 최신 목록에서 더 이상 활성 상태가 아닙니다. 확인 창을 닫고 목록을 확인하세요.'
            : '최신 토큰 목록을 복구한 뒤 이 토큰을 폐기할 수 있습니다.'
        }
        error={revokeToken.isError ? '액세스 토큰을 폐기하지 못했습니다.' : null}
        actionLabel="토큰 폐기"
        pendingLabel="폐기 중…"
        onConfirm={() => void revoke()}
      />
    </>
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
  const [revokeTarget, setRevokeTarget] = useState<AuthSession | null>(null)
  const revokeButtonRef = useRef<HTMLButtonElement>(null)
  const refreshButtonRef = useRef<HTMLButtonElement>(null)
  const hasSessionData = sessions.data !== undefined
  const stale = sessions.isError && hasSessionData
  const writeBlocked = sessions.isError || sessions.isFetching
  const currentRevokeTarget = revokeTarget
    ? sessions.data?.items.find((session) => session.id === revokeTarget.id) ?? null
    : null
  const revokeTargetUnavailable =
    revokeTarget !== null && hasSessionData && !writeBlocked && currentRevokeTarget === null
  const revokeActionBlocked = writeBlocked || revokeTargetUnavailable

  const revoke = async () => {
    if (!currentRevokeTarget || revokeActionBlocked) return
    try {
      await revokeSession.mutateAsync({
        id: currentRevokeTarget.id,
        isCurrent: currentRevokeTarget.is_current,
      })
      setRevokeTarget(null)
    } catch {
      // Keep the exact failed session in the confirmation for an explicit retry.
    }
  }

  return (
    <>
      <SettingsSection
        title="로그인 및 세션"
        description="인증 제공 경계를 확인하고 이 계정의 활성 브라우저 세션을 종료합니다."
        framed={false}
        className="border-b border-of-border-subtle p-0 pb-5 sm:p-0 sm:pb-6"
        actions={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {supported ? (
              <Button
                ref={refreshButtonRef}
                type="button"
                size="sm"
                variant="ghost"
                aria-label="세션 목록 새로고침"
                aria-disabled={sessions.isFetching}
                onClick={() => {
                  if (!sessions.isFetching) void sessions.refetch()
                }}
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={cn(sessions.isFetching && 'animate-spin')}
                />
                세션 목록 새로고침
              </Button>
            ) : null}
            <Badge variant={supported ? 'accent' : 'outline'}>
              {auth?.auth_mode === 'oidc' ? 'SSO (OIDC)' : '개발 모드'}
            </Badge>
          </div>
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
      ) : (
        <>
          {stale ? (
            <div
              className="mb-3 flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-of-text">
                  최신 활성 세션 목록을 불러오지 못했습니다.
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                  마지막으로 확인한 세션을 표시합니다. 목록을 복구할 때까지 세션 종료는
                  중단됩니다.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                aria-label="세션 목록 다시 시도"
                disabled={sessions.isFetching}
                onClick={() => void sessions.refetch()}
              >
                <RefreshCw
                  size={13}
                  aria-hidden="true"
                  className={cn(sessions.isFetching && 'animate-spin')}
                />
                세션 목록 다시 시도
              </Button>
            </div>
          ) : null}
          {sessions.isPending && !sessions.data ? (
        <div className="space-y-2" aria-label="세션 목록을 불러오는 중">
          <div className="h-12 animate-pulse rounded-of bg-of-subtle" />
          <div className="h-12 animate-pulse rounded-of bg-of-subtle" />
        </div>
          ) : !sessions.data ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-of-danger">활성 세션을 불러오지 못했습니다.</p>
          <Button
            size="sm"
            variant="outline"
            disabled={sessions.isFetching}
            onClick={() => void sessions.refetch()}
          >
            다시 시도
          </Button>
        </div>
          ) : (
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
                  disabled={writeBlocked || revokeSession.isPending}
                  aria-label={session.is_current ? '현재 세션 종료' : `${formatDateTime(session.created_at)} 세션 종료`}
                  onClick={(event) => {
                    if (writeBlocked) return
                    revokeButtonRef.current = event.currentTarget
                    revokeSession.reset()
                    setRevokeTarget(session)
                  }}
                >
                  <LogOut size={13} aria-hidden="true" /> 종료
                </Button>
              </li>
            ))}
          </ul>
          )}
        </>
      )}
      </SettingsSection>
      <ConfirmActionDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            revokeSession.reset()
            setRevokeTarget(null)
          }
        }}
        returnFocusRef={revokeButtonRef}
        fallbackFocusRef={refreshButtonRef}
        title={revokeTarget?.is_current ? '현재 세션을 종료할까요?' : '브라우저 세션을 종료할까요?'}
        description={
          revokeTarget?.is_current
            ? '현재 브라우저에서 즉시 로그아웃되며 다시 로그인해야 합니다.'
            : '선택한 브라우저는 즉시 로그아웃되며 해당 세션으로 더 이상 접근할 수 없습니다.'
        }
        pending={revokeSession.isPending}
        actionDisabled={revokeActionBlocked}
        actionDisabledMessage={
          revokeSession.isError && sessions.isFetching
            ? undefined
            : revokeTargetUnavailable
              ? '이 세션은 최신 목록에서 더 이상 활성 상태가 아닙니다. 확인 창을 닫고 목록을 확인하세요.'
              : '최신 세션 목록을 복구한 뒤 이 세션을 종료할 수 있습니다.'
        }
        error={revokeSession.isError ? '세션을 종료하지 못했습니다.' : null}
        actionLabel="세션 종료"
        pendingLabel="종료 중…"
        onConfirm={() => void revoke()}
      />
    </>
  )
}

export function PersonalSettingsPage() {
  const me = useMe()
  const auth = useAuthConfig()
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab: PersonalTabKey = PERSONAL_TABS.some((item) => item.key === requested)
    ? (requested as PersonalTabKey)
    : 'profile'
  const refreshing = me.isFetching || auth.isFetching
  const accountStatus = me.isError ? '확인 실패' : me.data ? (me.data.is_active ? '활성' : '비활성') : '확인 중'
  const role = me.data ? (me.data.is_admin ? '관리자' : '구성원') : '—'
  const authMode = auth.isError
    ? '확인 실패'
    : !auth.data
      ? '확인 중'
      : auth.data.auth_mode === 'oidc'
        ? 'SSO (OIDC)'
        : auth.data.session_management_enabled
          ? '개발 로그인'
          : '로컬 자동 로그인'

  const refreshAccount = () => {
    void Promise.all([me.refetch(), auth.refetch()])
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={refreshAccount}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          계정 상태 새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="personal-settings-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={refreshing}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">Account settings</p>
              <h1 className="mt-1 text-xl font-semibold">개인 설정</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                내 프로필, 로그인 경계, 개인 API 자격 증명과 새 알림 수신 기준을 관리합니다.
              </p>
            </div>
            <dl
              aria-label="개인 설정 요약"
              className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4 lg:min-w-[25rem]"
            >
              <Summary
                label="계정"
                value={accountStatus}
                tone={accountStatus === '활성' ? 'success' : accountStatus === '확인 실패' ? 'warning' : 'neutral'}
              />
              <Summary label="역할" value={role} />
              <Summary
                label="로그인"
                value={authMode}
                tone={authMode === '확인 실패' ? 'warning' : 'neutral'}
              />
              <Summary label="적용 범위" value="내 계정" />
            </dl>
          </header>

          <nav
            role="tablist"
            aria-label="개인 설정 섹션"
            className="of-scrollbar flex min-w-0 gap-1 overflow-x-auto border-b border-of-border py-3"
          >
            {PERSONAL_TABS.map((item) => {
              const Icon = item.icon
              const selected = item.key === tab
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  id={`personal-settings-tab-${item.key}`}
                  aria-label={item.label}
                  aria-selected={selected}
                  aria-controls="personal-settings-panel"
                  className={cn(
                    'flex min-h-9 shrink-0 items-center gap-2 rounded-of px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                    selected
                      ? 'bg-of-surface-selected text-of-accent'
                      : 'text-of-muted hover:bg-of-surface-2 hover:text-of-text',
                  )}
                  onClick={() => setSearchParams(item.key === 'profile' ? {} : { tab: item.key })}
                >
                  <Icon size={14} aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div
            id="personal-settings-panel"
            role="tabpanel"
            aria-labelledby={`personal-settings-tab-${tab}`}
            className="min-w-0 py-5 pb-10"
          >
            {tab === 'profile' ? (
              <SettingsSection
                title="내 계정"
                description="워크스페이스에서 표시되는 프로필 이미지와 현재 계정 정보를 관리합니다."
                framed={false}
                className="p-0 sm:p-0"
              >
                <AccountProfilePanel />
              </SettingsSection>
            ) : null}
            {tab === 'security' ? (
              <div className="min-w-0 space-y-5">
                <div className="flex min-w-0 items-start gap-3 border-b border-of-border-subtle pb-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-accent">
                    <ShieldCheck size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">계정 보안</h2>
                      {auth.data && !auth.isError ? (
                        <Badge variant="outline">
                          {auth.data.auth_mode === 'oidc' ? '조직 SSO' : '개발 인증'}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      로그인 경계를 확인하고 활성 세션과 개인 API 자격 증명을 관리합니다.
                    </p>
                  </div>
                </div>
                <SessionsPanel
                  auth={auth.data}
                  authError={auth.isError}
                  retryAuth={() => void auth.refetch()}
                />
                <AccessTokensPanel />
              </div>
            ) : null}
            {tab === 'notifications' ? (
              <SettingsSection
                title="알림 설정"
                description="새 알림 생성 기준을 내 계정 기준으로 조정합니다."
                framed={false}
                className="p-0 sm:p-0"
                actions={<Badge variant="outline">개인 정책</Badge>}
              >
                <NotificationsPanel framed={false} />
              </SettingsSection>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
