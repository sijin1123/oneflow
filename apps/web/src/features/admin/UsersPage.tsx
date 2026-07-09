import { UserPlus } from 'lucide-react'
import { Fragment, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/members/api'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { ApiError } from '@/lib/api'

import { useCreateUser, useUpdateUser, useUserMemberships, useUsers } from './api'

const ROLE_LABELS: Record<string, string> = {
  owner: '소유자',
  member: '멤버',
  viewer: '뷰어',
}

/* Workspace governance READ (Pass 62 PR-CB): which projects a user belongs
   to, for offboarding checks. Read-only — membership changes stay with each
   project's owner; the offboarding write tool is deactivation. */
function MembershipsRow({ userId, colSpan }: { userId: string; colSpan: number }) {
  const memberships = useUserMemberships(userId)
  return (
    <tr className="border-b border-of-border bg-of-surface-2/50">
      <td colSpan={colSpan} className="px-3 py-2">
        {memberships.isPending ? (
          <span className="text-xs text-of-muted">멤버십을 불러오는 중…</span>
        ) : memberships.isError ? (
          <span className="text-xs text-of-danger">멤버십을 불러오지 못했습니다.</span>
        ) : memberships.data.total === 0 ? (
          <span className="text-xs text-of-muted">속한 프로젝트가 없습니다.</span>
        ) : (
          <ul aria-label="프로젝트 멤버십" className="flex flex-wrap gap-1.5">
            {memberships.data.items.map((m) => (
              <li
                key={m.project_id}
                className="flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-0.5 text-xs"
              >
                <span className="font-medium">{m.project_name}</span>
                <span className="text-of-muted">· {ROLE_LABELS[m.role] ?? m.role}</span>
                {m.archived ? <span className="text-[10px] text-of-muted">(아카이브)</span> : null}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
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

  const activeAdmins = data.items.filter((u) => u.is_admin && u.is_active)
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
      actions={
        !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus size={14} /> 새 사용자
          </Button>
        ) : null
      }
    >
      {adding ? (
        <SettingsSection
          title="새 사용자"
          description="사용자를 생성한 뒤 필요한 프로젝트 멤버십은 각 프로젝트 설정에서 부여합니다."
          className="mb-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              aria-label="새 사용자 이메일"
              className="h-8 w-56 text-xs"
            />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="표시 이름"
              aria-label="새 사용자 이름"
              className="h-8 w-40 text-xs"
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

      <div className="min-w-0 overflow-x-auto rounded-of border border-of-border bg-of-surface">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-of-border text-left text-xs text-of-muted">
              <th className="px-3 py-2 font-medium">이름</th>
              <th className="px-3 py-2 font-medium">이메일</th>
              <th className="w-20 px-3 py-2 font-medium">상태</th>
              <th className="w-24 px-3 py-2 font-medium">관리자</th>
              <th className="w-28 px-3 py-2 font-medium">가입일</th>
              <th className="w-28 px-3 py-2 font-medium" aria-label="동작 열" />
            </tr>
          </thead>
          <tbody>
            {data.items.map((u) => (
              <Fragment key={u.id}>
                <tr className="border-b border-of-border">
                  <td className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="hover:text-of-accent hover:underline"
                      title="프로젝트 멤버십 보기"
                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                    >
                      {u.display_name}
                    </button>
                    {u.id === me.data?.id ? (
                      <span className="ml-1 text-xs text-of-muted">(나)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-of-muted">{u.email}</td>
                  <td className="px-3 py-2 text-xs">
                    {u.is_active ? '활성' : <span className="text-of-danger">비활성</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={u.is_admin}
                        // The last active admin cannot lose the flag (server 422;
                        // disabled here for clarity).
                        disabled={update.isPending || (u.is_admin && isLastActiveAdmin(u.id))}
                        onChange={() => update.mutate({ id: u.id, is_admin: !u.is_admin })}
                        aria-label={`${u.display_name} 관리자 권한`}
                        className="h-3 w-3 accent-of-accent"
                      />
                      관리자
                    </label>
                  </td>
                  <td className="px-3 py-2 text-xs text-of-muted">{u.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      // Self-deactivation and deactivating the last active admin
                      // are server 422s — surfaced as disabled buttons.
                      disabled={
                        update.isPending ||
                        (u.is_active && (u.id === me.data?.id || isLastActiveAdmin(u.id)))
                      }
                      onClick={() => update.mutate({ id: u.id, is_active: !u.is_active })}
                    >
                      {u.is_active ? '비활성화' : '활성화'}
                    </Button>
                  </td>
                </tr>
                {expanded === u.id ? <MembershipsRow userId={u.id} colSpan={6} /> : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-of-muted">
        비활성화는 로그인과 API 접근만 차단합니다. 기존 프로젝트 멤버십·담당 배정·작성 이력은
        유지되며, 새 프로젝트 멤버로는 추가할 수 없습니다.
      </p>
    </SettingsFrame>
  )
}
