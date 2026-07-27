import * as Dialog from '@radix-ui/react-dialog'
import {
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  RotateCw,
  Send,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

import {
  type InvitationStatus,
  type WorkspaceInvitation,
  type WorkspaceInvitationSecret,
  useCreateWorkspaceInvitation,
  useRevokeWorkspaceInvitation,
  useRotateWorkspaceInvitation,
  useWorkspaceInvitations,
} from './workspaceInvitationsApi'

const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: '대기 중',
  accepted: '수락됨',
  revoked: '취소됨',
  expired: '만료됨',
}

function invitationUrl(token: string) {
  return `${window.location.origin}/invite/${encodeURIComponent(token)}`
}

function mutationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '요청을 처리하지 못했습니다. 다시 시도해 주세요.'
  if (error.status === 409) {
    if (error.message.includes('active user')) return '이미 활성 상태인 사용자입니다.'
    if (error.message.includes('pending invitation')) return '이 이메일에는 대기 중인 초대가 있습니다.'
    return '초대 상태가 변경되었습니다. 목록을 새로고침해 주세요.'
  }
  return error.message
}

function StatusBadge({ status }: { status: InvitationStatus }) {
  if (status === 'pending') return <Badge variant="accent"><Clock3 size={11} />{STATUS_LABEL[status]}</Badge>
  if (status === 'accepted') return <Badge variant="neutral"><CheckCircle2 size={11} />{STATUS_LABEL[status]}</Badge>
  return <Badge variant="outline" className="text-of-muted"><Ban size={11} />{STATUS_LABEL[status]}</Badge>
}

function SecretBanner({
  invitation,
  onDismiss,
}: {
  invitation: WorkspaceInvitationSecret
  onDismiss: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const url = invitationUrl(invitation.token)
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  return (
    <div className="mb-4 rounded-of border border-of-accent/30 bg-of-accent-soft p-3" role="status">
      <div className="flex min-w-0 items-start gap-2">
        <Link2 size={15} className="mt-0.5 shrink-0 text-of-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">새 초대 링크가 발급되었습니다</p>
          <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
            이 링크는 지금만 확인할 수 있습니다. 안전한 채널로 {invitation.email}에 전달하세요.
          </p>
          <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
            <Input readOnly aria-label="새 초대 링크" value={url} className="h-8 min-w-0 flex-1 text-xs" />
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
              {copyState === 'copied' ? '복사됨' : '링크 복사'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>닫기</Button>
          </div>
          {copyState === 'failed' ? (
            <p className="mt-1 text-[11px] text-of-danger" role="alert">
              자동 복사에 실패했습니다. 위 링크를 직접 선택해 복사해 주세요.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function InvitationRow({
  invitation,
  busy,
  onRotate,
  onRevoke,
}: {
  invitation: WorkspaceInvitation
  busy: boolean
  onRotate: () => void
  onRevoke: (trigger: HTMLButtonElement) => void
}) {
  return (
    <li className="grid min-w-0 gap-3 border-b border-of-border px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{invitation.display_name}</span>
          <StatusBadge status={invitation.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-of-muted">{invitation.email}</p>
        <p className="mt-1 text-[11px] text-of-muted">
          생성 {invitation.created_at.slice(0, 10)} · 만료 {invitation.expires_at.slice(0, 10)}
        </p>
      </div>
      {invitation.status === 'pending' ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2 md:justify-end">
          <Button size="sm" variant="outline" disabled={busy} onClick={onRotate}>
            {busy ? <Loader2 className="animate-spin" /> : <RotateCw size={13} />}
            새 링크 발급
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-of-danger"
            disabled={busy}
            onClick={(event) => onRevoke(event.currentTarget)}
          >
            초대 취소
          </Button>
        </div>
      ) : (
        <span className="text-xs text-of-muted md:col-span-2 md:text-right">
          {invitation.status === 'accepted' && invitation.accepted_at
            ? `수락 ${invitation.accepted_at.slice(0, 10)}`
            : STATUS_LABEL[invitation.status]}
        </span>
      )}
    </li>
  )
}

type InvitationAction =
  | { kind: 'create'; input: { email: string; display_name: string } }
  | { kind: 'rotate'; input: { id: string; expected_version: number } }
  | { kind: 'revoke'; input: { id: string; expected_version: number } }

type RevokeTarget = {
  invitation: WorkspaceInvitation
  trigger: HTMLButtonElement
}

export function WorkspaceInvitationsPanel({
  initialComposer = false,
  composerRequest = 0,
  onDirtyChange,
}: {
  initialComposer?: boolean
  composerRequest?: number
  onDirtyChange?: (dirty: boolean) => void
}) {
  const invitations = useWorkspaceInvitations()
  const create = useCreateWorkspaceInvitation()
  const rotate = useRotateWorkspaceInvitation()
  const revoke = useRevokeWorkspaceInvitation()
  const [composing, setComposing] = useState(initialComposer)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [secret, setSecret] = useState<WorkspaceInvitationSecret | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'history'>('all')
  const [failedAction, setFailedAction] = useState<InvitationAction | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null)
  const [revokeFocusId, setRevokeFocusId] = useState<string | null>(null)
  const revokeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const revokeFallbackRef = useRef<HTMLHeadingElement | null>(null)

  const composerDirty = composing && Boolean(email.trim() || displayName.trim())

  useEffect(() => {
    if (initialComposer) setComposing(true)
  }, [initialComposer])

  useEffect(() => {
    if (composerRequest > 0) setComposing(true)
  }, [composerRequest])

  useEffect(() => {
    onDirtyChange?.(composerDirty)
  }, [composerDirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  useEffect(() => {
    if (!revokeFocusId || !invitations.data) return
    const current = invitations.data.items.find((item) => item.id === revokeFocusId)
    if (current?.status === 'pending') return
    revokeFallbackRef.current?.focus()
    setRevokeFocusId(null)
  }, [invitations.data, revokeFocusId])

  const rows = useMemo(() => {
    const items = invitations.data?.items ?? []
    if (filter === 'pending') return items.filter((item) => item.status === 'pending')
    if (filter === 'history') return items.filter((item) => item.status !== 'pending')
    return items
  }, [filter, invitations.data?.items])

  const mutationError = create.error ?? rotate.error ?? revoke.error
  const items = invitations.data?.items ?? []
  const pendingTotal = items.filter((item) => item.status === 'pending').length
  const historyTotal = items.length - pendingTotal

  const resetMutationFeedback = () => {
    create.reset()
    rotate.reset()
    revoke.reset()
    setFailedAction(null)
  }

  const runAction = (action: InvitationAction, closeRevoke = false) => {
    resetMutationFeedback()
    if (action.kind === 'create') {
      create.mutate(action.input, {
        onSuccess: (result) => {
          setSecret(result)
          setEmail('')
          setDisplayName('')
          setComposing(false)
        },
        onError: () => setFailedAction(action),
      })
      return
    }
    if (action.kind === 'rotate') {
      rotate.mutate(action.input, {
        onSuccess: setSecret,
        onError: () => setFailedAction(action),
      })
      return
    }
    revoke.mutate(action.input, {
      onSuccess: () => {
        if (closeRevoke) {
          setRevokeTarget(null)
          setRevokeFocusId(action.input.id)
        }
      },
      onError: () => setFailedAction(action),
    })
  }

  const submit = () => {
    runAction({
      kind: 'create',
      input: { email: email.trim(), display_name: displayName.trim() },
    })
  }

  const refresh = async () => {
    setRefreshError(false)
    const result = await invitations.refetch()
    setRefreshError(Boolean(result.error))
  }

  const retryFailedAction = async () => {
    if (!failedAction) return
    if (
      mutationError instanceof ApiError &&
      mutationError.status === 409 &&
      failedAction.kind !== 'create'
    ) {
      const result = await invitations.refetch()
      const latest = result.data?.items.find((item) => item.id === failedAction.input.id)
      if (!latest || latest.status !== 'pending') return
      runAction({
        kind: failedAction.kind,
        input: { id: latest.id, expected_version: latest.version },
      }, failedAction.kind === 'revoke')
      return
    }
    runAction(failedAction, failedAction.kind === 'revoke')
  }

  return (
    <section
      aria-label="워크스페이스 초대"
      data-testid="workspace-invitations-scroll"
      className="mx-auto min-h-full w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6"
    >
      <header className="border-b border-of-border pb-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-of-muted">
            Workspace governance
          </p>
          <h2 ref={revokeFallbackRef} tabIndex={-1} className="mt-1 text-xl font-semibold">
            멤버 초대
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            7일 동안 유효한 일회성 링크를 발급합니다. 수락된 계정은 일반 사용자로 생성되며
            링크 원문은 발급 직후에만 표시됩니다.
          </p>
        </div>
      </header>

      <dl
        aria-label="워크스페이스 초대 요약"
        className="grid grid-cols-3 gap-px border-b border-of-border-subtle bg-of-border-subtle"
      >
        {[
          ['전체', invitations.data?.total ?? items.length],
          ['대기 중', pendingTotal],
          ['지난 초대', historyTotal],
        ].map(([label, value]) => (
          <div key={label} className="bg-of-surface px-3 py-3">
            <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="py-5">
        {secret ? <SecretBanner invitation={secret} onDismiss={() => setSecret(null)} /> : null}
        {composing ? (
          <div className="mb-4 border-y border-of-border bg-of-surface px-3 py-3 sm:rounded-of sm:border">
            <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto_auto] md:items-center">
              <Input
                autoFocus
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  resetMutationFeedback()
                }}
                placeholder="name@company.com"
                aria-label="초대 이메일"
                className="h-8 min-w-0 text-xs"
              />
              <Input
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  resetMutationFeedback()
                }}
                placeholder="표시 이름"
                aria-label="초대 사용자 이름"
                className="h-8 min-w-0 text-xs"
              />
              <Button size="sm" disabled={!email.trim() || !displayName.trim() || create.isPending} onClick={submit}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <Send size={13} />}
                링크 만들기
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={create.isPending}
                onClick={() => {
                  setComposing(false)
                  setEmail('')
                  setDisplayName('')
                  resetMutationFeedback()
                }}
              >
                취소
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div role="toolbar" aria-label="초대 상태 보기" className="flex items-center gap-1">
            {([
              ['all', '전체'],
              ['pending', '대기 중'],
              ['history', '지난 초대'],
            ] as const).map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? 'default' : 'ghost'} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={invitations.isFetching}>
            <RefreshCw size={13} className={cn(invitations.isFetching && 'animate-spin')} />
            {refreshError ? '새로고침 다시 시도' : '새로고침'}
          </Button>
        </div>

        {(refreshError || invitations.isRefetchError) && invitations.data ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-of border border-of-warning/30 bg-of-warning/5 px-3 py-2 text-xs"
            role="alert"
          >
            <span>최신 초대 목록을 불러오지 못했습니다. 마지막으로 확인한 목록을 유지합니다.</span>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              다시 시도
            </Button>
          </div>
        ) : null}

        {mutationError ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger"
            role="alert"
          >
            <span>{mutationMessage(mutationError)}</span>
            {failedAction &&
            !(
              failedAction.kind === 'create' &&
              mutationError instanceof ApiError &&
              mutationError.status === 409
            ) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={create.isPending || rotate.isPending || revoke.isPending}
                onClick={() => void retryFailedAction()}
              >
                <RefreshCw size={13} />
                {mutationError instanceof ApiError && mutationError.status === 409
                  ? '최신 상태로 다시 시도'
                  : '같은 요청 다시 시도'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!invitations.data && invitations.isPending ? (
          <ListSkeleton />
        ) : !invitations.data && invitations.isError ? (
          <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            visual="icon"
            title={filter === 'all' ? '아직 초대가 없습니다' : '이 상태의 초대가 없습니다'}
            hint="새 초대 링크를 만들어 안전한 채널로 전달하세요."
          />
        ) : (
          <ul className="overflow-hidden rounded-of border border-of-border bg-of-surface" aria-label="워크스페이스 초대 목록">
            {rows.map((invitation) => {
              const busy =
                (rotate.isPending && rotate.variables?.id === invitation.id) ||
                (revoke.isPending && revoke.variables?.id === invitation.id)
              return (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  busy={busy}
                  onRotate={() => {
                    runAction({
                      kind: 'rotate',
                      input: { id: invitation.id, expected_version: invitation.version },
                    })
                  }}
                  onRevoke={(trigger) => {
                    revokeTriggerRef.current = trigger
                    resetMutationFeedback()
                    setRevokeTarget({ invitation, trigger })
                  }}
                />
              )
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-5 text-of-muted">
          OneFlow는 아직 초대 메일을 직접 발송하지 않습니다. 발급된 링크를 회사 메신저나 보안 메일로 전달하세요.
        </p>
      </div>

      <Dialog.Root
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) setRevokeTarget(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-81 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (revokeTriggerRef.current?.isConnected) revokeTriggerRef.current.focus()
              else revokeFallbackRef.current?.focus()
            }}
          >
            <div className="border-b border-of-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold">초대 취소</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                <strong className="font-semibold text-of-text">
                  {revokeTarget?.invitation.display_name}
                </strong>
                의 대기 링크를 즉시 무효화합니다. 취소된 링크는 다시 사용할 수 없습니다.
              </Dialog.Description>
            </div>
            {revoke.isError ? (
              <p
                role="alert"
                className="mx-5 mt-4 rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger"
              >
                {mutationMessage(revoke.error)}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => setRevokeTarget(null)}
              >
                유지
              </Button>
              <Button
                variant="danger"
                disabled={!revokeTarget || revoke.isPending}
                onClick={() => {
                  if (!revokeTarget) return
                  if (revoke.isError) {
                    void retryFailedAction()
                    return
                  }
                  runAction(
                    {
                      kind: 'revoke',
                      input: {
                        id: revokeTarget.invitation.id,
                        expected_version: revokeTarget.invitation.version,
                      },
                    },
                    true,
                  )
                }}
              >
                {revoke.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : revoke.isError ? (
                  <RefreshCw />
                ) : (
                  <Ban />
                )}
                {revoke.isError ? '같은 취소 다시 시도' : '초대 취소 확인'}
              </Button>
            </div>
            <button
              type="button"
              aria-label="초대 취소 창 닫기"
              disabled={revoke.isPending}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => setRevokeTarget(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
