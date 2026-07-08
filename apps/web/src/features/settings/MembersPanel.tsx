import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { ApiError } from '@/lib/api'

const ROLE_LABELS: Record<string, string> = {
  owner: '소유자',
  member: '멤버',
  viewer: '뷰어',
}

function AllowCell({ value, condition }: { value: string; condition: string | null }) {
  if (value === 'always') return <span className="text-of-accent">✓</span>
  if (value === 'never') return <span className="text-of-muted">—</span>
  return (
    <span title={condition ?? undefined} className="cursor-help text-[11px] text-of-muted underline decoration-dotted">
      조건부
    </span>
  )
}

function PermissionsTable({ projectId }: { projectId: string }) {
  const report = usePermissionReport(projectId)
  if (!report.data) return null
  const myRole = report.data.my_role
  const roleCol = (role: string) =>
    role === myRole ? 'bg-of-accent-soft/40 font-medium' : ''
  return (
    <section aria-label="권한" className="mt-6">
      <h3 className="mb-1 text-xs font-semibold">역할별 권한</h3>
      <p className="mb-2 text-[11px] text-of-muted">
        이 표는 시스템이 실제로 시행하는 고정 규칙입니다. 내 역할(
        {ROLE_LABELS[myRole] ?? myRole}) 열이 강조됩니다. 워크스페이스 관리자 권한은 프로젝트
        역할과 별개이며 프로젝트 권한을 부여하지 않습니다.
      </p>
      <div className="overflow-x-auto rounded-of border border-of-border">
        <table className="w-full min-w-[28rem] bg-of-surface text-xs">
          <thead>
            <tr className="border-b border-of-border text-left text-[11px] text-of-muted">
              <th className="px-3 py-2 font-medium">기능</th>
              <th className={`w-16 px-2 py-2 text-center font-medium ${roleCol('owner')}`}>소유자</th>
              <th className={`w-16 px-2 py-2 text-center font-medium ${roleCol('member')}`}>멤버</th>
              <th className={`w-16 px-2 py-2 text-center font-medium ${roleCol('viewer')}`}>뷰어</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-of-border">
            {report.data.verbs.map((v) => (
              <tr key={v.key}>
                <td className="px-3 py-1.5">
                  {v.label}
                  {v.note ? <span className="ml-1 text-[11px] text-of-muted">({v.note})</span> : null}
                </td>
                <td className={`px-2 py-1.5 text-center ${roleCol('owner')}`}>
                  <AllowCell value={v.owner} condition={v.condition} />
                </td>
                <td className={`px-2 py-1.5 text-center ${roleCol('member')}`}>
                  <AllowCell value={v.member} condition={v.condition} />
                </td>
                <td className={`px-2 py-1.5 text-center ${roleCol('viewer')}`}>
                  <AllowCell value={v.viewer} condition={v.condition} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-of-muted">조건부 항목은 마우스를 올리면 조건이 표시됩니다.</p>
    </section>
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
  const me = useMe()
  const members = useMembers(projectId)
  const addMember = useAddMember(projectId)
  const updateRole = useUpdateMemberRole(projectId)
  const removeMember = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')

  const dirty = email.trim() !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  if (!members.data) return null

  const ownerCount = members.data.items.filter((m) => m.role === 'owner').length
  const addErr =
    addMember.error instanceof ApiError ? addMember.error.message : addMember.isError ? '실패' : null

  return (
    <div>
      {members.data.total === 0 ? (
        <EmptyState title="멤버가 없습니다" />
      ) : (
        <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
          {members.data.items.map((m) => {
            const lastOwner = m.role === 'owner' && ownerCount <= 1
            return (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-of-accent-soft text-xs font-semibold text-of-accent">
                  {m.display_name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.display_name}
                    {m.user_id === me.data?.id ? (
                      <span className="ml-1.5 text-[11px] text-of-muted">(나)</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-of-muted">{m.email}</p>
                </div>
                {isOwner ? (
                  <Select
                    aria-label={`${m.display_name} 역할`}
                    className="h-7 w-24 text-xs"
                    value={m.role}
                    disabled={updateRole.isPending || lastOwner}
                    onChange={(e) => updateRole.mutate({ userId: m.user_id, role: e.target.value })}
                  >
                    <option value="owner">소유자</option>
                    <option value="member">멤버</option>
                    <option value="viewer">뷰어</option>
                  </Select>
                ) : (
                  <Badge variant={m.role === 'owner' ? 'accent' : 'neutral'}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Badge>
                )}
                {isOwner ? (
                  <button
                    type="button"
                    aria-label={`${m.display_name} 제거`}
                    disabled={lastOwner || removeMember.isPending}
                    className="rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger disabled:opacity-30"
                    onClick={() => removeMember.mutate(m.user_id)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {isOwner ? (
        <div className="mt-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
          <p className="text-xs font-medium">멤버 추가</p>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 (기존 사용자)"
              aria-label="추가할 멤버 이메일"
              className="flex-1"
            />
            <Select
              aria-label="추가 역할"
              className="w-24"
              value={role}
              onChange={(e) => setRole(e.target.value)}
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
          {addErr ? <p className="text-xs text-of-danger">{addErr}</p> : null}
        </div>
      ) : null}

      <PermissionsTable projectId={projectId} />
    </div>
  )
}
