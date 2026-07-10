import {
  Crown,
  Eye,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  useAddMember,
  useMe,
  useMembers,
  usePermissionReport,
  useRemoveMember,
  useUpdateMemberRole,
} from '@/features/members/api'
import type { Member, PermissionAllow, PermissionVerb } from '@/features/members/types'
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

function initials(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
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
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        member.role === 'owner' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
      )}
      aria-hidden="true"
    >
      {initials(member.display_name)}
    </span>
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

function PermissionCard({ verb, myRole }: { verb: PermissionVerb; myRole: Member['role'] }) {
  const rows: Member['role'][] = ['owner', 'member', 'viewer']
  return (
    <li className="rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-sm font-medium">{verb.label}</p>
      {verb.note ? <p className="mt-1 text-xs text-of-muted">{verb.note}</p> : null}
      <div className="mt-3 grid gap-2">
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
  const roleCol = (role: string) => (role === myRole ? 'bg-of-accent-soft/40 font-medium' : '')

  return (
    <section aria-label="권한" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">역할별 권한</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            시스템이 실제로 시행하는 고정 규칙입니다. 내 역할(
            {ROLE_LABELS[myRole] ?? myRole}) 기준 열이 강조됩니다.
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          워크스페이스 관리자 권한과 별개
        </Badge>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-2">
          {report.data.verbs.map((verb) => (
            <PermissionCard key={verb.key} verb={verb} myRole={myRole} />
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-of-muted">조건부 항목은 마우스를 올리면 조건이 표시됩니다.</p>
    </section>
  )
}

function MemberControls({
  member,
  isOwner,
  lastOwner,
  updatePending,
  removePending,
  onRoleChange,
  onRemove,
}: {
  member: Member
  isOwner: boolean
  lastOwner: boolean
  updatePending: boolean
  removePending: boolean
  onRoleChange: (role: string) => void
  onRemove: () => void
}) {
  if (!isOwner) return <RoleBadge role={member.role} />
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select
        aria-label={`${member.display_name} 역할`}
        className="h-7 w-24 text-xs"
        value={member.role}
        disabled={updatePending || lastOwner}
        onChange={(e) => onRoleChange(e.target.value)}
      >
        <option value="owner">소유자</option>
        <option value="member">멤버</option>
        <option value="viewer">뷰어</option>
      </Select>
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
  const addMember = useAddMember(projectId)
  const updateRole = useUpdateMemberRole(projectId)
  const removeMember = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Member['role']>('member')

  const dirty = email.trim() !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const items = useMemo(() => members.data?.items ?? [], [members.data?.items])
  if (!members.data) return null

  const ownerCount = items.filter((m) => m.role === 'owner').length
  const memberCount = items.filter((m) => m.role === 'member').length
  const viewerCount = items.filter((m) => m.role === 'viewer').length
  const addErr =
    addMember.error instanceof ApiError ? addMember.error.message : addMember.isError ? '실패' : null

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
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_7rem_auto] md:items-center">
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
              onChange={(e) => setRole(e.target.value as Member['role'])}
            >
              <option value="member">멤버</option>
              <option value="owner">소유자</option>
              <option value="viewer">뷰어</option>
            </Select>
            <Button
              size="sm"
              disabled={!email.trim() || addMember.isPending}
              onClick={() =>
                addMember.mutate({ email: email.trim(), role }, { onSuccess: () => setEmail('') })
              }
            >
              추가
            </Button>
          </div>
          {addErr ? <p className="mt-2 text-xs text-of-danger">{addErr}</p> : null}
        </section>
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
                    isOwner={isOwner}
                    lastOwner={lastOwner}
                    updatePending={updateRole.isPending}
                    removePending={removeMember.isPending}
                    onRoleChange={(nextRole) => updateRole.mutate({ userId: m.user_id, role: nextRole })}
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
                    <RoleBadge role={m.role} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-of-muted">{ROLE_META[m.role].description}</p>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                    {lastOwner ? <Badge variant="outline">마지막 소유자</Badge> : null}
                    <MemberControls
                      member={m}
                      isOwner={isOwner}
                      lastOwner={lastOwner}
                      updatePending={updateRole.isPending}
                      removePending={removeMember.isPending}
                      onRoleChange={(nextRole) => updateRole.mutate({ userId: m.user_id, role: nextRole })}
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
