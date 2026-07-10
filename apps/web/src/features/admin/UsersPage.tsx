import {
  Ban,
  CheckCircle2,
  FolderKanban,
  Mail,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/members/api'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

import {
  type DirectoryUser,
  useCreateUser,
  useUpdateUser,
  useUserMemberships,
  useUsers,
} from './api'

const ROLE_LABELS: Record<string, string> = {
  owner: '소유자',
  member: '멤버',
  viewer: '뷰어',
}

type DirectoryFilter = 'all' | 'admins' | 'inactive'

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

function DirectoryMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof UsersRound
  label: string
  value: number
  tone?: 'neutral' | 'accent' | 'danger'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' && 'bg-of-accent-soft text-of-accent',
          tone === 'danger' && 'bg-of-danger/10 text-of-danger',
          tone === 'neutral' && 'bg-of-surface-2 text-of-muted',
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block text-base font-semibold tabular-nums">{value}</span>
      </span>
    </div>
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
  return (
    <div className="rounded-of border border-of-border bg-of-surface-2 px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium">
        <FolderKanban size={13} className="text-of-muted" aria-hidden="true" />
        프로젝트 멤버십
      </div>
      {memberships.isPending ? (
        <span className="text-xs text-of-muted">멤버십을 불러오는 중...</span>
      ) : memberships.isError ? (
        <span className="text-xs text-of-danger">멤버십을 불러오지 못했습니다.</span>
      ) : memberships.data.total === 0 ? (
        <span className="text-xs text-of-muted">속한 프로젝트가 없습니다.</span>
      ) : (
        <ul aria-label="프로젝트 멤버십" className="flex flex-wrap gap-1.5">
          {memberships.data.items.map((m) => (
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
  onToggleActive: () => void
  onToggleAdmin: () => void
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
          onChange={onToggleAdmin}
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
        onClick={onToggleActive}
      >
        {user.is_active ? '비활성화' : '활성화'}
      </Button>
    </div>
  )
}

/* Workspace user directory (expansion Pass 33 PR-AY). Admin-only — the
   server is the authority (403); the sidebar link is mere gating. Guards
   mirror the API contract: no self-deactivation, and the last ACTIVE admin
   can neither lose the flag nor be deactivated. */
export function UsersPage() {
  const me = useMe()
  const { data, isPending, isError, error, refetch } = useUsers()
  const create = useCreateUser()
  const update = useUpdateUser()
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DirectoryFilter>('all')
  const mobileLayout = useMobileDirectoryLayout()

  const users = useMemo(() => data?.items ?? [], [data?.items])
  const totalUsers = data?.total ?? users.length
  const activeAdmins = users.filter((u) => u.is_admin && u.is_active)
  const inactiveCount = users.filter((u) => !u.is_active).length
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((u) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'admins' && u.is_admin) ||
        (filter === 'inactive' && !u.is_active)
      const matchesQuery =
        !normalizedQuery ||
        u.display_name.toLowerCase().includes(normalizedQuery) ||
        u.email.toLowerCase().includes(normalizedQuery)
      return matchesFilter && matchesQuery
    })
  }, [filter, query, users])

  if (isPending) return <ListSkeleton />
  if (isError) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="워크스페이스 사용자 관리는 관리자만 사용할 수 있습니다."
        />
      )
    }
    return <ErrorState error={error} onRetry={() => refetch()} />
  }

  const isLastActiveAdmin = (id: string) =>
    activeAdmins.length === 1 && activeAdmins[0].id === id

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

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="사용자 관리"
      description="워크스페이스 계정, 관리자 권한, 비활성화 상태와 프로젝트 멤버십을 관리합니다."
      meta={`${totalUsers}명`}
      actions={
        !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus size={14} /> 새 사용자
          </Button>
        ) : null
      }
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DirectoryMetric icon={UsersRound} label="전체 계정" value={totalUsers} />
        <DirectoryMetric
          icon={CheckCircle2}
          label="활성 계정"
          value={users.length - inactiveCount}
          tone="accent"
        />
        <DirectoryMetric icon={ShieldCheck} label="관리자" value={activeAdmins.length} />
        <DirectoryMetric icon={Ban} label="비활성" value={inactiveCount} tone="danger" />
      </div>

      {adding ? (
        <SettingsSection
          title="새 사용자"
          description="사용자를 생성한 뒤 필요한 프로젝트 멤버십은 각 프로젝트 설정에서 부여합니다."
          className="mb-4"
        >
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto_auto] md:items-center">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              aria-label="새 사용자 이메일"
              className="h-8 min-w-0 text-xs"
            />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="표시 이름"
              aria-label="새 사용자 이름"
              className="h-8 min-w-0 text-xs"
            />
            <Button size="sm" disabled={!email.trim() || !name.trim() || create.isPending} onClick={submit}>
              추가
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              취소
            </Button>
            {create.isError ? (
              <span className="text-xs text-of-danger">
                추가 실패 — 이메일 중복 또는 형식을 확인해 주세요.
              </span>
            ) : null}
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="계정 디렉터리"
        description="계정 상태, 관리자 권한, 소속 프로젝트를 한 화면에서 점검합니다."
        actions={
          <div className="relative w-full sm:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="사용자 검색"
              placeholder="이름 또는 이메일"
              className="h-8 pl-8 text-xs"
            />
          </div>
        }
      >
        <div
          role="toolbar"
          aria-label="사용자 디렉터리 보기"
          className="mb-3 flex min-w-0 flex-wrap items-center gap-1"
        >
          {[
            ['all', '전체'],
            ['admins', '관리자'],
            ['inactive', '비활성'],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant={filter === key ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={filter === key}
              onClick={() => setFilter(key as DirectoryFilter)}
            >
              {label}
            </Button>
          ))}
        </div>

        {filteredUsers.length === 0 ? (
          <div className="rounded-of border border-dashed border-of-border bg-of-surface-2 px-3 py-8 text-center">
            <p className="text-sm font-medium">조건에 맞는 사용자가 없습니다</p>
            <p className="mt-1 text-xs text-of-muted">검색어나 상태 필터를 조정해 보세요.</p>
          </div>
        ) : (
          <>
            {!mobileLayout ? (
              <div className="min-w-0 overflow-x-auto rounded-of border border-of-border bg-of-surface">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-of-border text-left text-xs text-of-muted">
                      <th className="px-3 py-2 font-medium">이름</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium">이메일</th>
                      <th className="w-28 px-3 py-2 font-medium">가입일</th>
                      <th className="w-64 px-3 py-2 font-medium" aria-label="동작 열" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <Fragment key={u.id}>
                        <tr className="border-b border-of-border">
                          <td className="px-3 py-2 font-medium">
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
                          <td className="px-3 py-2">
                            <DirectoryActions
                              user={u}
                              currentUserId={me.data?.id}
                              updatePending={update.isPending}
                              lastActiveAdmin={isLastActiveAdmin(u.id)}
                              onToggleActive={() =>
                                update.mutate({ id: u.id, is_active: !u.is_active })
                              }
                              onToggleAdmin={() =>
                                update.mutate({ id: u.id, is_admin: !u.is_admin })
                              }
                            />
                          </td>
                        </tr>
                        {expanded === u.id ? <MembershipsRow userId={u.id} colSpan={5} /> : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="grid min-w-0 gap-2" aria-label="사용자 카드 목록">
                {filteredUsers.map((u) => (
                  <li key={u.id} className="rounded-of border border-of-border bg-of-surface p-3">
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
                      <span className="text-xs text-of-muted">가입 {u.created_at.slice(0, 10)}</span>
                    </div>
                    <div className="mt-3">
                      <DirectoryActions
                        user={u}
                        currentUserId={me.data?.id}
                        updatePending={update.isPending}
                        lastActiveAdmin={isLastActiveAdmin(u.id)}
                        onToggleActive={() => update.mutate({ id: u.id, is_active: !u.is_active })}
                        onToggleAdmin={() => update.mutate({ id: u.id, is_admin: !u.is_admin })}
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
          </>
        )}
      </SettingsSection>

      <p className="mt-3 text-xs text-of-muted">
        비활성화는 로그인과 API 접근만 차단합니다. 기존 프로젝트 멤버십·담당 배정·작성 이력은
        유지되며, 새 프로젝트 멤버로는 추가할 수 없습니다.
      </p>
    </SettingsFrame>
  )
}
