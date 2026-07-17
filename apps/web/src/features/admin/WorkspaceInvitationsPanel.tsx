import {
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  Loader2,
  MailPlus,
  RefreshCw,
  RotateCw,
  Send,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSection } from '@/features/settings/SettingsShell'
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
  onRevoke: () => void
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
          <Button size="sm" variant="ghost" className="text-of-danger" disabled={busy} onClick={onRevoke}>
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

export function WorkspaceInvitationsPanel({ initialComposer = false }: { initialComposer?: boolean }) {
  const invitations = useWorkspaceInvitations()
  const create = useCreateWorkspaceInvitation()
  const rotate = useRotateWorkspaceInvitation()
  const revoke = useRevokeWorkspaceInvitation()
  const [composing, setComposing] = useState(initialComposer)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [secret, setSecret] = useState<WorkspaceInvitationSecret | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'history'>('all')

  useEffect(() => {
    if (initialComposer) setComposing(true)
  }, [initialComposer])

  const rows = useMemo(() => {
    const items = invitations.data?.items ?? []
    if (filter === 'pending') return items.filter((item) => item.status === 'pending')
    if (filter === 'history') return items.filter((item) => item.status !== 'pending')
    return items
  }, [filter, invitations.data?.items])

  const mutationError = create.error ?? rotate.error ?? revoke.error
  const submit = () => {
    create.mutate(
      { email: email.trim(), display_name: displayName.trim() },
      {
        onSuccess: (result) => {
          setSecret(result)
          setEmail('')
          setDisplayName('')
          setComposing(false)
        },
      },
    )
  }

  if (invitations.isPending) return <ListSkeleton />
  if (invitations.isError) return <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />

  return (
    <>
      {secret ? <SecretBanner invitation={secret} onDismiss={() => setSecret(null)} /> : null}
      <SettingsSection
        title="워크스페이스 초대"
        description="일회성 링크로 사용자를 초대합니다. 링크는 7일 후 만료되며 수락한 계정은 일반 사용자로 생성됩니다."
        actions={
          !composing ? (
            <Button size="sm" onClick={() => setComposing(true)}>
              <MailPlus size={14} /> 멤버 초대
            </Button>
          ) : null
        }
      >
        {composing ? (
          <div className="mb-4 rounded-of border border-of-border bg-of-surface-2 p-3">
            <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto_auto] md:items-center">
              <Input
                autoFocus
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); create.reset() }}
                placeholder="name@company.com"
                aria-label="초대 이메일"
                className="h-8 min-w-0 text-xs"
              />
              <Input
                value={displayName}
                onChange={(event) => { setDisplayName(event.target.value); create.reset() }}
                placeholder="표시 이름"
                aria-label="초대 사용자 이름"
                className="h-8 min-w-0 text-xs"
              />
              <Button size="sm" disabled={!email.trim() || !displayName.trim() || create.isPending} onClick={submit}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <Send size={13} />}
                링크 만들기
              </Button>
              <Button size="sm" variant="ghost" disabled={create.isPending} onClick={() => setComposing(false)}>취소</Button>
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
          <Button size="sm" variant="ghost" onClick={() => void invitations.refetch()} disabled={invitations.isFetching}>
            <RefreshCw size={13} className={cn(invitations.isFetching && 'animate-spin')} /> 새로고침
          </Button>
        </div>

        {mutationError ? (
          <p className="mb-3 rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger" role="alert">
            {mutationMessage(mutationError)}
          </p>
        ) : null}

        {rows.length === 0 ? (
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
                    rotate.reset()
                    rotate.mutate(
                      { id: invitation.id, expected_version: invitation.version },
                      { onSuccess: setSecret },
                    )
                  }}
                  onRevoke={() => {
                    revoke.reset()
                    revoke.mutate({ id: invitation.id, expected_version: invitation.version })
                  }}
                />
              )
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] leading-5 text-of-muted">
          OneFlow는 아직 초대 메일을 직접 발송하지 않습니다. 발급된 링크를 회사 메신저나 보안 메일로 전달하세요.
        </p>
      </SettingsSection>
    </>
  )
}
