import {
  Crown,
  Eye,
  RotateCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/shell/states'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  useAddMember,
  useMe,
  useMembers,
  usePermissionReport,
  profileImageSrc,
  useRemoveMember,
  useUpdateMemberRole,
} from '@/features/members/api'
import type {
  BuiltInProjectRole,
  Member,
  PermissionAllow,
  PermissionVerb,
} from '@/features/members/types'
import { useProjectRoleCatalog } from '@/features/project-roles/api'
import type { ProjectRoleCatalogItem } from '@/features/project-roles/contract'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<Member['role'], string> = {
  owner: '소유자',
  member: '멤버',
  viewer: '뷰어',
}

const ROLE_META: Record<
  Member['role'],
  { icon: LucideIcon; badge: 'accent' | 'neutral' | 'outline'; description: string }
> = {
  owner: { icon: Crown, badge: 'accent', description: '프로젝트 설정과 멤버십을 관리합니다.' },
  member: { icon: UserRoundCheck, badge: 'neutral', description: '작업을 생성하고 협업합니다.' },
  viewer: { icon: Eye, badge: 'outline', description: '읽기 전용으로 프로젝트를 봅니다.' },
}

function useMobileMembersLayout() {
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

function RoleBadge({ role }: { role: Member['role'] }) {
  const meta = ROLE_META[role]
  const Icon = meta.icon
  return (
    <Badge variant={meta.badge}>
      <Icon size={12} aria-hidden="true" /> {ROLE_LABELS[role]}
    </Badge>
  )
}

function MemberAvatar({ member }: { member: Member }) {
  return (
    <Avatar
      name={member.display_name}
      src={profileImageSrc(member)}
      size="md"
      className={cn(
        'shrink-0',
        member.role === 'owner' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
      )}
    />
  )
}

function TeamMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: 'neutral' | 'accent'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
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

function AllowCell({ value, condition }: { value: PermissionAllow; condition: string | null }) {
  if (value === 'always') return <span className="text-of-accent">✓</span>
  if (value === 'never') return <span className="text-of-muted">—</span>
  return (
    <span
      title={condition ?? undefined}
      className="cursor-help text-[11px] text-of-muted underline decoration-dotted"
    >
      조건부
    </span>
  )
}

function PermissionCard({
  verb,
  myRole,
  showEffective,
}: {
  verb: PermissionVerb
  myRole: Member['role']
  showEffective: boolean
}) {
  const rows: Member['role'][] = ['owner', 'member', 'viewer']
  return (
    <li className="rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-sm font-medium">{verb.label}</p>
      {verb.note ? <p className="mt-1 text-xs text-of-muted">{verb.note}</p> : null}
      <div className="mt-3 grid gap-2">
        {showEffective ? (
          <div className="flex items-center justify-between rounded-of border border-of-accent/40 bg-of-accent-soft/40 px-2 py-1.5 text-xs font-medium">
            <span>내 실효 권한</span>
            <AllowCell value={verb.effective} condition={verb.condition} />
          </div>
        ) : null}
        {rows.map((role) => (
          <div
            key={role}
            className={cn(
              'flex items-center justify-between rounded-of border border-of-border bg-of-surface-2 px-2 py-1.5 text-xs',
              role === myRole && 'border-of-accent/40 bg-of-accent-soft/40 font-medium',
            )}
          >
            <span>{ROLE_LABELS[role]}</span>
            <AllowCell value={verb[role]} condition={verb.condition} />
          </div>
        ))}
      </div>
    </li>
  )
}

function PermissionsTable({ projectId }: { projectId: string }) {
  const mobileLayout = useMobileMembersLayout()
  const report = usePermissionReport(projectId)
  if (!report.data) return null
  const myRole = report.data.my_role
  const myCustomRole = report.data.my_custom_role
  const roleCol = (role: string) => (role === myRole ? 'bg-of-accent-soft/40 font-medium' : '')

  return (
    <section aria-label="권한" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">역할별 권한</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            시스템이 실제로 시행하는 규칙입니다. 내 역할({ROLE_LABELS[myRole] ?? myRole}
            {myCustomRole ? ` · ${myCustomRole.name}` : ''}) 기준 권한이 강조됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {myCustomRole ? <Badge variant="accent">실효 역할 · {myCustomRole.name}</Badge> : null}
          <Badge variant="outline" className="self-start">
            워크스페이스 관리자 권한과 별개
          </Badge>
        </div>
      </div>
      {!mobileLayout ? (
        <div className="overflow-x-auto rounded-of border border-of-border">
          <table className="w-full min-w-[34rem] bg-of-surface text-xs">
            <thead>
              <tr className="border-b border-of-border text-left text-[11px] text-of-muted">
                <th className="px-3 py-2 font-medium">기능</th>
                <th className={cn('w-20 px-2 py-2 text-center font-medium', roleCol('owner'))}>
                  소유자
                </th>
                <th className={cn('w-20 px-2 py-2 text-center font-medium', roleCol('member'))}>
                  멤버
                </th>
                <th className={cn('w-20 px-2 py-2 text-center font-medium', roleCol('viewer'))}>
                  뷰어
                </th>
                {myCustomRole ? (
                  <th className="w-24 bg-of-accent-soft/40 px-2 py-2 text-center font-medium">
                    내 실효 권한
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-of-border">
              {report.data.verbs.map((v) => (
                <tr key={v.key}>
                  <td className="px-3 py-2">
                    {v.label}
                    {v.note ? <span className="ml-1 text-[11px] text-of-muted">({v.note})</span> : null}
                  </td>
                  <td className={cn('px-2 py-2 text-center', roleCol('owner'))}>
                    <AllowCell value={v.owner} condition={v.condition} />
                  </td>
                  <td className={cn('px-2 py-2 text-center', roleCol('member'))}>
                    <AllowCell value={v.member} condition={v.condition} />
                  </td>
                  <td className={cn('px-2 py-2 text-center', roleCol('viewer'))}>
                    <AllowCell value={v.viewer} condition={v.condition} />
                  </td>
                  {myCustomRole ? (
                    <td className="bg-of-accent-soft/40 px-2 py-2 text-center font-medium">
                      <AllowCell value={v.effective} condition={v.condition} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-2">
          {report.data.verbs.map((verb) => (
            <PermissionCard
              key={verb.key}
              verb={verb}
              myRole={myRole}
              showEffective={Boolean(myCustomRole)}
            />
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-of-muted">조건부 항목은 마우스를 올리면 조건이 표시됩니다.</p>
    </section>
  )
}

function MemberControls({
  member,
  customRoles,
  catalogReady,
  isOwner,
  lastOwner,
  updatePending,
  removePending,
  onRoleChange,
  onCustomRoleChange,
  onRemove,
}: {
  member: Member
  customRoles: ProjectRoleCatalogItem[]
  catalogReady: boolean
  isOwner: boolean
  lastOwner: boolean
  updatePending: boolean
  removePending: boolean
  onRoleChange: (role: BuiltInProjectRole) => void
  onCustomRoleChange: (customRoleId: string | null) => void
  onRemove: () => void
}) {
  const assignedRole = member.custom_role_id
    ? customRoles.find((role) => role.id === member.custom_role_id)
    : null
  const unavailableAssignment = Boolean(
    member.custom_role_id && catalogReady && !assignedRole,
  )
  const customRoleLabel = member.custom_role_name ?? assignedRole?.name ?? '이름 없는 역할'

  if (!isOwner) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <RoleBadge role={member.role} />
        {member.custom_role_id ? (
          <Badge variant={unavailableAssignment ? 'outline' : 'neutral'}>
            <ShieldCheck size={12} aria-hidden="true" />
            {customRoleLabel}{unavailableAssignment ? ' · 보관됨' : ''}
          </Badge>
        ) : null}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        aria-label={`${member.display_name} 역할`}
        className="h-7 w-24 text-xs"
        value={member.role}
        disabled={updatePending || lastOwner}
        onChange={(e) => onRoleChange(e.target.value as BuiltInProjectRole)}
      >
        <option value="owner">소유자</option>
        <option value="member">멤버</option>
        <option value="viewer">뷰어</option>
      </Select>
      {member.role === 'member' ? (
        <Select
          aria-label={`${member.display_name} 커스텀 역할`}
          className="h-7 min-w-[8.5rem] max-w-44 text-xs"
          value={member.custom_role_id ?? ''}
          disabled={updatePending || !catalogReady}
          onChange={(e) => onCustomRoleChange(e.target.value || null)}
        >
          <option value="">기본 멤버</option>
          {unavailableAssignment && member.custom_role_id ? (
            <option value={member.custom_role_id}>
              {customRoleLabel} · 보관됨
            </option>
          ) : null}
          {customRoles.map((role) => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </Select>
      ) : null}
      <button
        type="button"
        aria-label={`${member.display_name} 제거`}
        disabled={lastOwner || removePending}
        className="rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger disabled:opacity-30"
        onClick={onRemove}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function MembersPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const mobileLayout = useMobileMembersLayout()
  const me = useMe()
  const members = useMembers(projectId)
  const roleCatalog = useProjectRoleCatalog()
  const addMember = useAddMember(projectId)
  const updateRole = useUpdateMemberRole(projectId)
  const removeMember = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Member['role']>('member')
  const [customRoleId, setCustomRoleId] = useState('')

  const dirty = email.trim() !== '' || role !== 'member' || customRoleId !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const items = useMemo(() => members.data?.items ?? [], [members.data?.items])
  const customRoles = useMemo(() => roleCatalog.data?.items ?? [], [roleCatalog.data?.items])
  useEffect(() => {
    if (
      roleCatalog.isSuccess
      && customRoleId
      && !customRoles.some((customRole) => customRole.id === customRoleId)
    ) {
      setCustomRoleId('')
    }
  }, [customRoleId, customRoles, roleCatalog.isSuccess])
  if (!members.data) return null

  const ownerCount = items.filter((m) => m.role === 'owner').length
  const memberCount = items.filter((m) => m.role === 'member').length
  const viewerCount = items.filter((m) => m.role === 'viewer').length
  const addErr =
    addMember.error instanceof ApiError ? addMember.error.message : addMember.isError ? '실패' : null
  const memberMutationError = updateRole.error ?? removeMember.error
  const memberMutationMessage = memberMutationError instanceof ApiError
    ? memberMutationError.message
    : memberMutationError
      ? '멤버 역할을 변경하지 못했습니다.'
      : null

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TeamMetric icon={UsersRound} label="전체 멤버" value={members.data.total} />
        <TeamMetric icon={Crown} label="소유자" value={ownerCount} tone="accent" />
        <TeamMetric icon={UserRoundCheck} label="멤버" value={memberCount} />
        <TeamMetric icon={Eye} label="뷰어" value={viewerCount} />
      </div>

      {isOwner ? (
        <section
          aria-label="멤버 추가"
          className="rounded-of border border-of-border bg-of-surface p-4"
        >
          <div className="mb-3 flex min-w-0 items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
              <UserPlus size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">멤버 추가</p>
              <p className="mt-1 text-xs leading-5 text-of-muted">
                이미 워크스페이스에 있는 사용자를 프로젝트 역할과 함께 초대합니다.
              </p>
            </div>
          </div>
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_7rem_minmax(8.5rem,11rem)_auto] md:items-center">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 (기존 사용자)"
              aria-label="추가할 멤버 이메일"
              className="h-8 min-w-0 text-xs"
            />
            <Select
              aria-label="추가 역할"
              className="h-8 w-full text-xs"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as Member['role']
                setRole(nextRole)
                if (nextRole !== 'member') setCustomRoleId('')
              }}
            >
              <option value="member">멤버</option>
              <option value="owner">소유자</option>
              <option value="viewer">뷰어</option>
            </Select>
            <Select
              aria-label="추가 커스텀 역할"
              className="h-8 w-full min-w-0 text-xs"
              value={customRoleId}
              disabled={role !== 'member' || roleCatalog.isPending || roleCatalog.isError}
              onChange={(e) => setCustomRoleId(e.target.value)}
            >
              <option value="">기본 멤버</option>
              {customRoles.map((customRole) => (
                <option key={customRole.id} value={customRole.id}>{customRole.name}</option>
              ))}
            </Select>
            <Button
              size="sm"
              disabled={!email.trim() || addMember.isPending}
              onClick={() =>
                addMember.mutate(
                  {
                    email: email.trim(),
                    role,
                    custom_role_id: role === 'member' && customRoleId ? customRoleId : null,
                  },
                  {
                    onSuccess: () => {
                      setEmail('')
                      setRole('member')
                      setCustomRoleId('')
                    },
                  },
                )
              }
            >
              추가
            </Button>
          </div>
          {addErr ? <p className="mt-2 text-xs text-of-danger">{addErr}</p> : null}
          {roleCatalog.isPending ? (
            <p className="mt-2 text-xs text-of-muted">커스텀 역할을 불러오는 중입니다.</p>
          ) : null}
          {roleCatalog.isError ? (
            <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-of-danger">
              <span>커스텀 역할을 불러오지 못했습니다. 기본 역할은 계속 사용할 수 있습니다.</span>
              <Button size="sm" variant="outline" onClick={() => roleCatalog.refetch()}>
                <RotateCw size={13} aria-hidden="true" /> 다시 시도
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {memberMutationMessage ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          {memberMutationMessage}
        </p>
      ) : null}

      <section
        aria-label="팀 디렉터리"
        className="rounded-of border border-of-border bg-of-surface p-4"
      >
        <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">팀 디렉터리</h3>
            <p className="mt-1 text-xs leading-5 text-of-muted">
              프로젝트 역할과 현재 멤버를 확인합니다. 마지막 소유자는 보호됩니다.
            </p>
          </div>
          <Badge variant={isOwner ? 'accent' : 'outline'} className="self-start">
            {isOwner ? '소유자 편집 가능' : '읽기 전용'}
          </Badge>
        </div>

        {items.length === 0 ? (
          <EmptyState title="멤버가 없습니다" className="min-h-[12rem]" />
        ) : !mobileLayout ? (
          <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
            {items.map((m) => {
              const lastOwner = m.role === 'owner' && ownerCount <= 1
              return (
                <li key={m.user_id} className="flex min-w-0 items-center gap-3 px-4 py-3">
                  <MemberAvatar member={m} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.display_name}
                      {m.user_id === me.data?.id ? (
                        <span className="ml-1.5 text-[11px] text-of-muted">(나)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-of-muted">{m.email}</p>
                  </div>
                  <div className="hidden min-w-0 flex-1 text-xs text-of-muted lg:block">
                    {ROLE_META[m.role].description}
                  </div>
                  {lastOwner ? <Badge variant="outline">마지막 소유자</Badge> : null}
                  <MemberControls
                    member={m}
                    customRoles={customRoles}
                    catalogReady={roleCatalog.isSuccess}
                    isOwner={isOwner}
                    lastOwner={lastOwner}
                    updatePending={updateRole.isPending}
                    removePending={removeMember.isPending}
                    onRoleChange={(nextRole) => updateRole.mutate({
                      userId: m.user_id,
                      input: {
                        role: nextRole,
                        custom_role_id: nextRole === 'member' ? (m.custom_role_id ?? null) : null,
                      },
                    })}
                    onCustomRoleChange={(nextCustomRoleId) => updateRole.mutate({
                      userId: m.user_id,
                      input: { role: 'member', custom_role_id: nextCustomRoleId },
                    })}
                    onRemove={() => removeMember.mutate(m.user_id)}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className="grid gap-2" aria-label="멤버 카드 목록">
            {items.map((m) => {
              const lastOwner = m.role === 'owner' && ownerCount <= 1
              return (
                <li key={m.user_id} className="rounded-of border border-of-border bg-of-surface p-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <MemberAvatar member={m} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.display_name}
                        {m.user_id === me.data?.id ? (
                          <span className="ml-1.5 text-[11px] text-of-muted">(나)</span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-of-muted">{m.email}</p>
                    </div>
                    {isOwner ? <RoleBadge role={m.role} /> : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-of-muted">{ROLE_META[m.role].description}</p>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    {lastOwner ? <Badge variant="outline">마지막 소유자</Badge> : null}
                    <MemberControls
                      member={m}
                      customRoles={customRoles}
                      catalogReady={roleCatalog.isSuccess}
                      isOwner={isOwner}
                      lastOwner={lastOwner}
                      updatePending={updateRole.isPending}
                      removePending={removeMember.isPending}
                      onRoleChange={(nextRole) => updateRole.mutate({
                        userId: m.user_id,
                        input: {
                          role: nextRole,
                          custom_role_id: nextRole === 'member' ? (m.custom_role_id ?? null) : null,
                        },
                      })}
                      onCustomRoleChange={(nextCustomRoleId) => updateRole.mutate({
                        userId: m.user_id,
                        input: { role: 'member', custom_role_id: nextCustomRoleId },
                      })}
                      onRemove={() => removeMember.mutate(m.user_id)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <PermissionsTable projectId={projectId} />
    </div>
  )
}
