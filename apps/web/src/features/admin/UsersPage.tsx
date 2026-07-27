import * as Dialog from '@radix-ui/react-dialog'
import {
  Ban,
  CheckCircle2,
  FolderKanban,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/members/api'
import { ApiError } from '@/lib/api'
import { useUnsavedLocationPrompt } from '@/lib/guards'
import { cn } from '@/lib/utils'

import {
  type DirectoryUser,
  type UserDirectoryScope,
  useCreateUser,
  useUpdateUser,
  useUserDirectory,
  useUserMemberships,
} from './api'
import { WorkspaceInvitationsPanel } from './WorkspaceInvitationsPanel'

const actionClassName =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

const ROLE_LABELS: Record<string, string> = {
  owner: '소유자',
  member: '멤버',
  viewer: '뷰어',
}

function initials(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function UserAvatar({ user }: { user: DirectoryUser }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        user.is_active ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
      )}
      aria-hidden="true"
    >
      {initials(user.display_name)}
    </span>
  )
}

function UserBadges({ user }: { user: DirectoryUser }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {user.is_active ? (
        <Badge variant="accent">
          <CheckCircle2 size={12} aria-hidden="true" /> 활성
        </Badge>
      ) : (
        <Badge variant="outline" className="text-of-danger">
          <Ban size={12} aria-hidden="true" /> 비활성
        </Badge>
      )}
      {user.is_admin ? (
        <Badge variant="neutral">
          <ShieldCheck size={12} aria-hidden="true" /> 관리자
        </Badge>
      ) : null}
    </span>
  )
}

function useMobileDirectoryLayout() {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 767px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return mobile
}

/* Workspace governance READ (Pass 62 PR-CB): which projects a user belongs
   to, for offboarding checks. Read-only — membership changes stay with each
   project's owner; the offboarding write tool is deactivation. */
function MembershipsPanel({ userId }: { userId: string }) {
  const memberships = useUserMemberships(userId)
  const items = memberships.data?.pages.flatMap((page) => page.items) ?? []
  const total = memberships.data?.pages[0]?.total ?? 0
  return (
    <div
      aria-label="프로젝트 멤버십"
      className="rounded-of border border-of-border bg-of-surface-2 px-3 py-2"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <FolderKanban size={13} className="text-of-muted" aria-hidden="true" />
        프로젝트 멤버십
      </div>
      {memberships.isPending ? (
        <span className="text-xs text-of-muted">멤버십을 불러오는 중...</span>
      ) : memberships.isError ? (
        <span className="inline-flex flex-wrap items-center gap-2 text-xs text-of-danger">
          멤버십을 불러오지 못했습니다.
          <Button variant="outline" size="sm" onClick={() => void memberships.refetch()}>
            다시 시도
          </Button>
        </span>
      ) : total === 0 ? (
        <span className="text-xs text-of-muted">속한 프로젝트가 없습니다.</span>
      ) : (
        <div className="space-y-2">
          <ul className="flex flex-wrap gap-1.5">
            {items.map((m) => (
              <li
                key={m.project_id}
                className="flex min-w-0 items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-0.5 text-xs"
              >
                <span className="max-w-[12rem] truncate font-medium">{m.project_name}</span>
                <span className="text-of-muted">· {ROLE_LABELS[m.role] ?? m.role}</span>
                {m.archived ? <span className="text-[10px] text-of-muted">(아카이브)</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[11px] text-of-muted">
            <span aria-live="polite">
              {items.length} / {total}개 표시
            </span>
            {memberships.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={memberships.isFetchingNextPage}
                onClick={() => void memberships.fetchNextPage()}
              >
                {memberships.isFetchingNextPage ? '불러오는 중...' : '더 불러오기'}
              </Button>
            ) : null}
            {memberships.isFetchNextPageError ? (
              <span role="alert" className="text-of-danger">
                추가 멤버십을 불러오지 못했습니다. 다시 시도해 주세요.
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function MembershipsRow({ userId, colSpan }: { userId: string; colSpan: number }) {
  return (
    <tr className="border-b border-of-border bg-of-surface-2/50">
      <td colSpan={colSpan} className="px-3 py-2">
        <MembershipsPanel userId={userId} />
      </td>
    </tr>
  )
}

function DirectoryActions({
  user,
  currentUserId,
  updatePending,
  lastActiveAdmin,
  onToggleActive,
  onToggleAdmin,
}: {
  user: DirectoryUser
  currentUserId?: string
  updatePending: boolean
  lastActiveAdmin: boolean
  onToggleActive: (trigger: HTMLButtonElement) => void
  onToggleAdmin: (trigger: HTMLInputElement) => void
}) {
  const cannotDeactivate = user.is_active && (user.id === currentUserId || lastActiveAdmin)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="flex min-h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs">
        <input
          type="checkbox"
          checked={user.is_admin}
          // The last active admin cannot lose the flag (server 422; disabled here for clarity).
          disabled={updatePending || (user.is_admin && lastActiveAdmin)}
          onChange={(event) => onToggleAdmin(event.currentTarget)}
          aria-label={`${user.display_name} 관리자 권한`}
          className="h-3 w-3 accent-of-accent"
        />
        관리자
      </label>
      <Button
        variant="outline"
        size="sm"
        // Self-deactivation and deactivating the last active admin are server 422s — surfaced as disabled buttons.
        disabled={updatePending || cannotDeactivate}
        onClick={(event) => onToggleActive(event.currentTarget)}
      >
        {user.is_active ? '비활성화' : '활성화'}
      </Button>
    </div>
  )
}

type UserUpdateInput = {
  id: string
  is_active?: boolean
  is_admin?: boolean
}

type ConfirmedUserAction = {
  user: DirectoryUser
  input: UserUpdateInput
  title: string
  description: string
  actionLabel: string
}

/* Workspace user directory (expansion Pass 33 PR-AY). Admin-only — the
   server is the authority (403); the sidebar link is mere gating. Guards
   mirror the API contract: no self-deactivation, and the last ACTIVE admin
   can neither lose the flag nor be deactivated. */
export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialInviteComposer = searchParams.get('new') === '1'
  const me = useMe()
  const create = useCreateUser()
  const update = useUpdateUser()
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [failedUpdate, setFailedUpdate] = useState<UserUpdateInput | null>(null)
  const [failedUpdateLabel, setFailedUpdateLabel] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmedUserAction | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  const [inviteDirty, setInviteDirty] = useState(false)
  const [inviteComposerRequest, setInviteComposerRequest] = useState(0)
  const createTriggerRef = useRef<HTMLButtonElement | null>(null)
  const confirmTriggerRef = useRef<HTMLElement | null>(null)
  const rawQuery = searchParams.get('q') ?? ''
  const query = rawQuery.slice(0, 120)
  const deferredQuery = useDeferredValue(query.trim())
  const rawScope = searchParams.get('scope')
  const filter: UserDirectoryScope =
    rawScope === 'admins' || rawScope === 'inactive' ? rawScope : 'all'
  const view = searchParams.get('view') === 'invites' ? 'invites' : 'directory'
  const directory = useUserDirectory({ q: deferredQuery, scope: filter }, view === 'directory')
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = directory
  const mobileLayout = useMobileDirectoryLayout()
  const createDirty = adding && Boolean(email.trim() || name.trim())

  useUnsavedLocationPrompt(
    createDirty || inviteDirty,
    '작성 중인 사용자 또는 초대 정보를 버리고 이동할까요?',
  )

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let changed = false
    if (searchParams.get('new') === '1') {
      next.delete('new')
      changed = true
    }
    if (rawQuery !== query) {
      next.set('q', query)
      changed = true
    }
    if (rawScope !== null && filter === 'all') {
      next.delete('scope')
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [filter, query, rawQuery, rawScope, searchParams, setSearchParams])

  const setQuery = (value: string) => {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set('q', value.slice(0, 120))
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const setFilter = (scope: UserDirectoryScope) => {
    const next = new URLSearchParams(window.location.search)
    if (scope === 'all') next.delete('scope')
    else next.set('scope', scope)
    setSearchParams(next)
  }

  const setView = (nextView: 'directory' | 'invites') => {
    const next = new URLSearchParams(searchParams)
    if (nextView === 'invites') next.set('view', 'invites')
    else next.delete('view')
    next.delete('new')
    setSearchParams(next)
  }

  useEffect(() => {
    if (view !== 'invites') return
    setAdding(false)
    setEmail('')
    setName('')
  }, [view])

  const users = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages])
  const total = data?.pages[0]?.total ?? users.length
  const summary = data?.pages[0]?.summary
  const directorySummary = summary ?? {
    users: total,
    active: users.filter((item) => item.is_active).length,
    admins: users.filter((item) => item.is_admin).length,
    inactive: users.filter((item) => !item.is_active).length,
    active_admins: users.filter((item) => item.is_active && item.is_admin).length,
  }
  const totalUsers = directorySummary.users

  if (
    view === 'directory' &&
    isError &&
    !data &&
    error instanceof ApiError &&
    error.status === 403
  ) {
    return (
      <EmptyState
        title="접근 권한이 없습니다"
        hint="워크스페이스 사용자 관리는 관리자만 사용할 수 있습니다."
      />
    )
  }

  const isLastActiveAdmin = (target: DirectoryUser) =>
    target.is_active && target.is_admin && directorySummary.active_admins === 1

  const submit = () => {
    create.mutate(
      { email: email.trim(), display_name: name.trim() },
      {
        onSuccess: () => {
          setEmail('')
          setName('')
          setAdding(false)
        },
      },
    )
  }

  const openCreate = () => {
    create.reset()
    setEmail('')
    setName('')
    setAdding(true)
  }

  const runUpdate = (input: UserUpdateInput, label: string, closeConfirmation = false) => {
    update.reset()
    setFailedUpdate(null)
    setFailedUpdateLabel('')
    update.mutate(input, {
      onSuccess: () => {
        if (closeConfirmation) setConfirmAction(null)
      },
      onError: () => {
        setFailedUpdate(input)
        setFailedUpdateLabel(label)
      },
    })
  }

  const requestActiveChange = (user: DirectoryUser, trigger: HTMLButtonElement) => {
    const input = { id: user.id, is_active: !user.is_active }
    if (!user.is_active) {
      runUpdate(input, `${user.display_name} 활성화`)
      return
    }
    setFailedUpdate(null)
    setFailedUpdateLabel('')
    update.reset()
    confirmTriggerRef.current = trigger
    setConfirmAction({
      user,
      input,
      title: '사용자 비활성화',
      description:
        '로그인과 API 접근을 차단합니다. 프로젝트 멤버십, 담당 배정과 작성 이력은 유지됩니다.',
      actionLabel: '비활성화',
    })
  }

  const requestAdminChange = (user: DirectoryUser, trigger: HTMLInputElement) => {
    const input = { id: user.id, is_admin: !user.is_admin }
    if (!user.is_admin) {
      runUpdate(input, `${user.display_name} 관리자 지정`)
      return
    }
    setFailedUpdate(null)
    setFailedUpdateLabel('')
    update.reset()
    confirmTriggerRef.current = trigger
    setConfirmAction({
      user,
      input,
      title: '관리자 권한 해제',
      description: '이 사용자는 더 이상 워크스페이스 관리 화면과 관리자 API를 사용할 수 없습니다.',
      actionLabel: '권한 해제',
    })
  }

  const refreshDirectory = async () => {
    setRefreshError(false)
    const result = await refetch()
    setRefreshError(Boolean(result.error))
  }

  const busy = isFetchingNextPage || directory.isFetching || create.isPending || update.isPending

  return (
    <section
      aria-label="워크스페이스 사용자 관리"
      className="flex min-h-full min-w-0 flex-col bg-of-surface"
    >
      <h1 className="sr-only">
        {view === 'invites' ? '워크스페이스 사용자 및 초대' : '사용자 관리'}
      </h1>
      <FrameContextActions>
        <div
          role="toolbar"
          aria-label="사용자 관리 화면 제어"
          className="flex items-center gap-1.5"
        >
          <Link to="/admin/overview" className={actionClassName}>
            <Settings2 size={13} aria-hidden="true" />
            관리 개요
          </Link>
          <span className="hidden px-1 text-xs tabular-nums text-of-muted sm:inline">
            {view === 'directory' ? `${totalUsers}명` : '7일 · 일회성 링크'}
          </span>
          {view === 'directory' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void refreshDirectory()}
              >
                <RefreshCw
                  size={13}
                  className={directory.isFetching ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                {refreshError ? '새로고침 다시 시도' : '새로고침'}
              </Button>
              <Button ref={createTriggerRef} size="sm" onClick={openCreate}>
                <UserPlus size={14} aria-hidden="true" />새 사용자
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => setInviteComposerRequest((request) => request + 1)}
            >
              <UserPlus size={14} aria-hidden="true" />멤버 초대
            </Button>
          )}
        </div>
      </FrameContextActions>

      <div
        role="tablist"
        aria-label="사용자 관리 보기"
        className="flex min-w-0 shrink-0 items-center gap-1 border-b border-of-border-subtle px-3 py-2"
      >
        <Button
          role="tab"
          aria-selected={view === 'directory'}
          variant={view === 'directory' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView('directory')}
        >
          <UsersRound size={14} aria-hidden="true" />
          멤버
        </Button>
        <Button
          role="tab"
          aria-selected={view === 'invites'}
          variant={view === 'invites' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView('invites')}
        >
          <Mail size={14} aria-hidden="true" />
          초대
        </Button>
      </div>

      {view === 'invites' ? (
        <main className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg">
          <WorkspaceInvitationsPanel
            initialComposer={initialInviteComposer}
            composerRequest={inviteComposerRequest}
            onDirtyChange={setInviteDirty}
          />
        </main>
      ) : (
        <>
          <div
            role="toolbar"
            aria-label="사용자 디렉터리 보기"
            className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-of-border-subtle px-3 py-2"
          >
            <label className="relative min-w-44 flex-1 sm:max-w-72">
              <span className="sr-only">사용자 검색</span>
              <Search
                size={13}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-of-muted"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={120}
                aria-label="사용자 검색"
                placeholder="이름 또는 이메일 검색"
                className="h-7 pl-7 text-xs"
              />
            </label>
            <div className="flex items-center gap-1">
              {(
                [
                  ['all', '전체'],
                  ['admins', '관리자'],
                  ['inactive', '비활성'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  variant={filter === key ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <dl
              aria-label="사용자 현황"
              className="ml-auto hidden items-center gap-3 text-[11px] tabular-nums text-of-muted lg:flex"
            >
              <div>
                <dt className="sr-only">활성 계정</dt>
                <dd>활성 {directorySummary.active}</dd>
              </div>
              <div>
                <dt className="sr-only">관리자</dt>
                <dd>관리자 {directorySummary.admins}</dd>
              </div>
              <div>
                <dt className="sr-only">비활성 계정</dt>
                <dd>비활성 {directorySummary.inactive}</dd>
              </div>
            </dl>
          </div>

          <main className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg">
            {refreshError || directory.isRefetchError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 border-b border-of-warning/30 bg-of-warning/5 px-4 py-2 text-xs"
              >
                <span>최신 사용자 목록을 불러오지 못했습니다. 마지막으로 확인한 목록을 유지합니다.</span>
                <Button size="sm" variant="outline" onClick={() => void refreshDirectory()}>
                  다시 시도
                </Button>
              </div>
            ) : null}
            {update.isError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 border-b border-of-danger/30 bg-of-danger/5 px-4 py-2 text-xs text-of-danger"
              >
                <span>
                  {failedUpdateLabel || '계정 상태 변경'}에 실패했습니다. 같은 요청을 다시 시도할 수
                  있습니다.
                </span>
                {failedUpdate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => runUpdate(failedUpdate, failedUpdateLabel, Boolean(confirmAction))}
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    같은 요청 다시 시도
                  </Button>
                ) : null}
              </div>
            ) : null}
            {isError && !data ? (
              <ErrorState error={error} onRetry={() => refetch()} />
            ) : isPending ? (
              <ListSkeleton />
            ) : users.length === 0 ? (
              <EmptyState
                title="조건에 맞는 사용자가 없습니다"
                hint="검색어나 상태 필터를 조정해 보세요."
                className="min-h-full"
              />
            ) : (
              <>
                {!mobileLayout ? (
                  <div className="min-w-0 overflow-x-auto bg-of-surface">
                    <table className="w-full min-w-[760px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-of-border-subtle bg-of-surface-2/70 text-left text-[11px] text-of-muted">
                          <th className="px-4 py-2 font-medium">이름</th>
                          <th className="px-3 py-2 font-medium">상태</th>
                          <th className="px-3 py-2 font-medium">이메일</th>
                          <th className="w-28 px-3 py-2 font-medium">가입일</th>
                          <th className="w-64 px-4 py-2 font-medium" aria-label="동작 열" />
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <Fragment key={u.id}>
                            <tr className="border-b border-of-border-subtle hover:bg-of-surface-hover">
                              <td className="px-4 py-2 font-medium">
                                <div className="flex min-w-0 items-center gap-2">
                                  <UserAvatar user={u} />
                                  <div className="min-w-0">
                                    <button
                                      type="button"
                                      className="block max-w-[14rem] truncate text-left hover:text-of-accent hover:underline"
                                      title="프로젝트 멤버십 보기"
                                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                                    >
                                      {u.display_name}
                                    </button>
                                    {u.id === me.data?.id ? (
                                      <span className="text-xs text-of-muted">(나)</span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <UserBadges user={u} />
                              </td>
                              <td className="px-3 py-2 text-xs text-of-muted">
                                <span className="inline-flex min-w-0 max-w-[16rem] items-center gap-1">
                                  <Mail size={12} className="shrink-0" aria-hidden="true" />
                                  <span className="truncate">{u.email}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-of-muted">
                                {u.created_at.slice(0, 10)}
                              </td>
                              <td className="px-4 py-2">
                                <DirectoryActions
                                  user={u}
                                  currentUserId={me.data?.id}
                                  updatePending={update.isPending}
                                  lastActiveAdmin={isLastActiveAdmin(u)}
                                  onToggleActive={(trigger) => requestActiveChange(u, trigger)}
                                  onToggleAdmin={(trigger) => requestAdminChange(u, trigger)}
                                />
                              </td>
                            </tr>
                            {expanded === u.id ? (
                              <MembershipsRow userId={u.id} colSpan={5} />
                            ) : null}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ul
                    className="min-w-0 divide-y divide-of-border-subtle bg-of-surface"
                    aria-label="사용자 카드 목록"
                  >
                    {users.map((u) => (
                      <li key={u.id} className="p-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <UserAvatar user={u} />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="block max-w-full truncate text-left text-sm font-medium hover:text-of-accent hover:underline"
                              title="프로젝트 멤버십 보기"
                              onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                            >
                              {u.display_name}
                            </button>
                            <p className="truncate text-xs text-of-muted">{u.email}</p>
                          </div>
                          {u.id === me.data?.id ? <Badge variant="outline">나</Badge> : null}
                        </div>
                        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                          <UserBadges user={u} />
                          <span className="text-xs text-of-muted">
                            가입 {u.created_at.slice(0, 10)}
                          </span>
                        </div>
                        <div className="mt-3">
                          <DirectoryActions
                            user={u}
                            currentUserId={me.data?.id}
                            updatePending={update.isPending}
                            lastActiveAdmin={isLastActiveAdmin(u)}
                            onToggleActive={(trigger) => requestActiveChange(u, trigger)}
                            onToggleAdmin={(trigger) => requestAdminChange(u, trigger)}
                          />
                        </div>
                        {expanded === u.id ? (
                          <div className="mt-3">
                            <MembershipsPanel userId={u.id} />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <footer className="flex min-w-0 flex-col items-center gap-2 border-t border-of-border-subtle bg-of-surface px-4 py-3 sm:flex-row sm:justify-between">
                  <p className="text-xs text-of-muted" aria-live="polite">
                    {users.length} / {total}명 표시
                  </p>
                  <div className="flex min-w-0 flex-col items-center gap-2 sm:items-end">
                    {hasNextPage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isFetchingNextPage}
                        aria-describedby={
                          isFetchNextPageError ? 'user-directory-load-more-error' : undefined
                        }
                        onClick={() => void fetchNextPage()}
                      >
                        {isFetchingNextPage ? '불러오는 중...' : '더 불러오기'}
                      </Button>
                    ) : null}
                    {isFetchNextPageError ? (
                      <p
                        id="user-directory-load-more-error"
                        role="alert"
                        className="text-xs text-of-danger"
                      >
                        추가 사용자를 불러오지 못했습니다. 다시 시도해 주세요.
                      </p>
                    ) : null}
                  </div>
                </footer>
              </>
            )}
            <p className="border-t border-of-border-subtle px-4 py-3 text-[11px] leading-5 text-of-muted">
              비활성화는 로그인과 API 접근만 차단합니다. 기존 프로젝트 멤버십·담당 배정·작성 이력은
              유지됩니다.
            </p>
          </main>
        </>
      )}

      <Dialog.Root
        open={adding}
        onOpenChange={(open) => {
          if (create.isPending) return
          setAdding(open)
          if (!open) create.reset()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-81 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              createTriggerRef.current?.focus()
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <div className="border-b border-of-border px-5 py-4">
                <Dialog.Title className="text-base font-semibold">새 사용자</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                  계정을 만든 뒤 프로젝트별 역할은 각 프로젝트 설정에서 지정하세요.
                </Dialog.Description>
              </div>
              <div className="space-y-4 px-5 py-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">이메일</span>
                  <Input
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      create.reset()
                    }}
                    placeholder="name@company.com"
                    aria-label="새 사용자 이메일"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">표시 이름</span>
                  <Input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      create.reset()
                    }}
                    placeholder="표시 이름"
                    aria-label="새 사용자 이름"
                  />
                </label>
                {create.isError ? (
                  <p role="alert" className="text-xs text-of-danger">
                    사용자를 추가하지 못했습니다. 이메일 형식과 중복 여부를 확인하세요.
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-of-border px-5 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => setAdding(false)}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={!email.trim() || !name.trim() || create.isPending}
                  aria-busy={create.isPending}
                >
                  {create.isPending ? '추가 중' : '추가'}
                </Button>
              </div>
            </form>
            <button
              type="button"
              aria-label="새 사용자 창 닫기"
              disabled={create.isPending}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => setAdding(false)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !update.isPending) setConfirmAction(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-81 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              confirmTriggerRef.current?.focus()
            }}
          >
            <div className="border-b border-of-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold">{confirmAction?.title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                <strong className="font-semibold text-of-text">{confirmAction?.user.display_name}</strong>
                {' · '}
                {confirmAction?.description}
              </Dialog.Description>
            </div>
            {update.isError ? (
              <p
                role="alert"
                className="mx-5 mt-4 rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger"
              >
                요청을 처리하지 못했습니다. 입력한 작업은 유지되어 같은 요청을 다시 시도할 수 있습니다.
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => setConfirmAction(null)}
              >
                취소
              </Button>
              <Button
                variant="danger"
                disabled={!confirmAction || update.isPending}
                onClick={() => {
                  if (!confirmAction) return
                  runUpdate(
                    confirmAction.input,
                    `${confirmAction.user.display_name} ${confirmAction.actionLabel}`,
                    true,
                  )
                }}
              >
                {update.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : update.isError ? (
                  <RefreshCw aria-hidden="true" />
                ) : (
                  <Ban aria-hidden="true" />
                )}
                {update.isError ? '같은 요청 다시 시도' : confirmAction?.actionLabel}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
