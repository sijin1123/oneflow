import {
  CheckCircle2,
  CircleAlert,
  Crown,
  Eye,
  RotateCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
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

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-xs text-of-muted">
      {label}
      <strong className="font-semibold tabular-nums text-of-foreground">{value}</strong>
    </span>
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
  if (report.isPending) {
    return (
      <section aria-label="권한" className="border-t border-of-border pt-4">
        <ListSkeleton rows={4} className="min-h-48" />
      </section>
    )
  }
  if (report.isError || !report.data) {
    return (
      <section aria-label="권한" className="border-t border-of-border pt-4">
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      </section>
    )
  }
  const myRole = report.data.my_role
  const myCustomRole = report.data.my_custom_role
  const roleCol = (role: string) => (role === myRole ? 'bg-of-accent-soft/40 font-medium' : '')

  return (
    <section aria-label="권한" className="border-t border-of-border pt-4">
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
  confirmingRemove,
  onRoleChange,
  onCustomRoleChange,
  onRequestRemove,
  onCancelRemove,
  onRemove,
}: {
  member: Member
  customRoles: ProjectRoleCatalogItem[]
  catalogReady: boolean
  isOwner: boolean
  lastOwner: boolean
  updatePending: boolean
  removePending: boolean
  confirmingRemove: boolean
  onRoleChange: (role: BuiltInProjectRole) => void
  onCustomRoleChange: (customRoleId: string | null) => void
  onRequestRemove: () => void
  onCancelRemove: () => void
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
  if (confirmingRemove) {
    return (
      <div
        role="group"
        aria-label={`${member.display_name} 제거 확인`}
        className="flex min-w-0 flex-wrap items-center justify-end gap-1.5"
      >
        <span className="text-xs text-of-danger">프로젝트에서 제거할까요?</span>
        <Button size="sm" variant="ghost" disabled={removePending} onClick={onCancelRemove}>
          취소
        </Button>
        <Button size="sm" variant="danger" disabled={removePending} onClick={onRemove}>
          {removePending ? '제거 중' : '제거'}
        </Button>
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
        onClick={onRequestRemove}
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
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Member['role']>('all')
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [updatingMemberIds, setUpdatingMemberIds] = useState<Set<string>>(() => new Set())
  const [removingMemberIds, setRemovingMemberIds] = useState<Set<string>>(() => new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<
    | { kind: 'update'; userId: string; input: { role: BuiltInProjectRole; custom_role_id: string | null } }
    | { kind: 'remove'; userId: string }
    | null
  >(null)

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
  if (members.isPending) return <ListSkeleton rows={7} />
  if (members.isError || !members.data) {
    return <ErrorState error={members.error} onRetry={() => members.refetch()} />
  }

  const ownerCount = items.filter((m) => m.role === 'owner').length
  const memberCount = items.filter((m) => m.role === 'member').length
  const viewerCount = items.filter((m) => m.role === 'viewer').length
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleItems = items.filter((member) => {
    const matchesRole = roleFilter === 'all' || member.role === roleFilter
    const matchesQuery =
      !normalizedQuery
      || member.display_name.toLocaleLowerCase().includes(normalizedQuery)
      || member.email.toLocaleLowerCase().includes(normalizedQuery)
    return matchesRole && matchesQuery
  })
  const emailValue = email.trim()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)
  const addErr =
    addMember.error instanceof ApiError ? addMember.error.message : addMember.isError ? '실패' : null
  const memberMutationError = updateRole.error ?? removeMember.error
  const memberMutationMessage = memberMutationError instanceof ApiError
    ? memberMutationError.message
    : memberMutationError
      ? '멤버 역할을 변경하지 못했습니다.'
      : null

  const updateMember = (
    userId: string,
    input: { role: BuiltInProjectRole; custom_role_id: string | null },
  ) => {
    setNotice(null)
    setRetryAction(null)
    setUpdatingMemberIds((current) => new Set(current).add(userId))
    updateRole.mutate(
      { userId, input },
      {
        onSuccess: (updated) => setNotice(`${updated.display_name}의 역할을 변경했습니다.`),
        onError: () => setRetryAction({ kind: 'update', userId, input }),
        onSettled: () =>
          setUpdatingMemberIds((current) => {
            const next = new Set(current)
            next.delete(userId)
            return next
          }),
      },
    )
  }

  const removeProjectMember = (member: Member) => {
    setNotice(null)
    setRetryAction(null)
    setRemovingMemberIds((current) => new Set(current).add(member.user_id))
    removeMember.mutate(member.user_id, {
      onSuccess: () => {
        setConfirmingRemoveId(null)
        setNotice(`${member.display_name}을(를) 프로젝트에서 제거했습니다.`)
      },
      onError: () => setRetryAction({ kind: 'remove', userId: member.user_id }),
      onSettled: () =>
        setRemovingMemberIds((current) => {
          const next = new Set(current)
          next.delete(member.user_id)
          return next
        }),
    })
  }

  const retryLastAction = () => {
    if (!retryAction) return
    const target = items.find((member) => member.user_id === retryAction.userId)
    if (retryAction.kind === 'update') {
      updateMember(retryAction.userId, retryAction.input)
    } else if (target) {
      removeProjectMember(target)
    }
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-of border border-of-border bg-of-surface">
        <header className="flex min-w-0 flex-col gap-3 border-b border-of-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">Project access</p>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
                <UsersRound size={14} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">프로젝트 멤버</h2>
                <p className="mt-0.5 text-xs text-of-muted">
                  구성원 역할과 프로젝트에서 시행되는 권한을 관리합니다.
                </p>
              </div>
            </div>
          </div>
          <Badge variant={isOwner ? 'accent' : 'outline'} className="self-start">
            {isOwner ? '소유자 편집 가능' : '읽기 전용'}
          </Badge>
        </header>

        <div
          aria-label="멤버 요약"
          className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-of-border bg-of-surface-2/50 px-4 py-2.5"
        >
          <SummaryMetric label="전체 멤버" value={members.data.total} />
          <SummaryMetric label="소유자" value={ownerCount} />
          <SummaryMetric label="멤버" value={memberCount} />
          <SummaryMetric label="뷰어" value={viewerCount} />
        </div>

      {isOwner ? (
        <form
          aria-label="멤버 추가"
          className="border-b border-of-border px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!emailValid || addMember.isPending) return
            setNotice(null)
            addMember.mutate(
              {
                email: emailValue,
                role,
                custom_role_id: role === 'member' && customRoleId ? customRoleId : null,
              },
              {
                onSuccess: (created) => {
                  setEmail('')
                  setRole('member')
                  setCustomRoleId('')
                  setNotice(`${created.display_name}을(를) 프로젝트에 추가했습니다.`)
                },
              },
            )
          }}
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
              type="submit"
              size="sm"
              disabled={!emailValid || addMember.isPending}
            >
              {addMember.isPending ? '추가 중' : '추가'}
            </Button>
          </div>
          {emailValue && !emailValid ? (
            <p className="mt-2 text-xs text-of-danger">올바른 이메일 주소를 입력하세요.</p>
          ) : null}
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
        </form>
      ) : null}

        {notice ? (
          <p
            role="status"
            className="flex items-center gap-2 border-b border-of-border bg-of-success-soft px-4 py-2.5 text-xs text-of-success"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            {notice}
          </p>
        ) : null}
        {memberMutationMessage ? (
          <div
            role="alert"
            className="flex min-w-0 flex-wrap items-center gap-2 border-b border-of-border bg-of-danger/5 px-4 py-2.5 text-xs text-of-danger"
          >
            <CircleAlert size={14} aria-hidden="true" />
            <span className="min-w-0 flex-1">{memberMutationMessage}</span>
            {retryAction ? (
              <Button size="sm" variant="outline" onClick={retryLastAction}>
                <RotateCw size={13} aria-hidden="true" /> 다시 시도
              </Button>
            ) : null}
          </div>
        ) : null}

        <section aria-label="팀 디렉터리" className="px-4 py-4">
        <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">팀 디렉터리</h3>
            <p className="mt-1 text-xs leading-5 text-of-muted">
              프로젝트 역할과 현재 멤버를 확인합니다. 마지막 소유자는 보호됩니다.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0">
              <span className="sr-only">멤버 검색</span>
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름 또는 이메일 검색"
                className="h-8 min-w-0 pl-8 text-xs sm:w-52"
              />
            </label>
            <Select
              aria-label="멤버 역할 필터"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
              className="h-8 w-full text-xs sm:w-28"
            >
              <option value="all">모든 역할</option>
              <option value="owner">소유자</option>
              <option value="member">멤버</option>
              <option value="viewer">뷰어</option>
            </Select>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? '멤버가 없습니다' : '조건에 맞는 멤버가 없습니다'}
            hint={items.length === 0 ? undefined : '검색어나 역할 필터를 변경해 보세요.'}
            className="min-h-[12rem]"
          />
        ) : !mobileLayout ? (
          <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
            {visibleItems.map((m) => {
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
                    updatePending={updatingMemberIds.has(m.user_id)}
                    removePending={removingMemberIds.has(m.user_id)}
                    confirmingRemove={confirmingRemoveId === m.user_id}
                    onRoleChange={(nextRole) =>
                      updateMember(m.user_id, {
                        role: nextRole,
                        custom_role_id: nextRole === 'member' ? (m.custom_role_id ?? null) : null,
                      })
                    }
                    onCustomRoleChange={(nextCustomRoleId) =>
                      updateMember(m.user_id, {
                        role: 'member',
                        custom_role_id: nextCustomRoleId,
                      })
                    }
                    onRequestRemove={() => setConfirmingRemoveId(m.user_id)}
                    onCancelRemove={() => setConfirmingRemoveId(null)}
                    onRemove={() => removeProjectMember(m)}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className="grid gap-2" aria-label="멤버 카드 목록">
            {visibleItems.map((m) => {
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
                      updatePending={updatingMemberIds.has(m.user_id)}
                      removePending={removingMemberIds.has(m.user_id)}
                      confirmingRemove={confirmingRemoveId === m.user_id}
                      onRoleChange={(nextRole) =>
                        updateMember(m.user_id, {
                          role: nextRole,
                          custom_role_id: nextRole === 'member' ? (m.custom_role_id ?? null) : null,
                        })
                      }
                      onCustomRoleChange={(nextCustomRoleId) =>
                        updateMember(m.user_id, {
                          role: 'member',
                          custom_role_id: nextCustomRoleId,
                        })
                      }
                      onRequestRemove={() => setConfirmingRemoveId(m.user_id)}
                      onCancelRemove={() => setConfirmingRemoveId(null)}
                      onRemove={() => removeProjectMember(m)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        </section>
      </section>

      <PermissionsTable projectId={projectId} />
    </div>
  )
}
