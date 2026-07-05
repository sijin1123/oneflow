import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api'

import { useAddMember, useMe, useMembers, useRemoveMember, useUpdateMemberRole } from './api'

export function SettingsPage() {
  const { projectId } = useParams() as { projectId: string }
  const me = useMe()
  const members = useMembers(projectId)
  const addMember = useAddMember(projectId)
  const updateRole = useUpdateMemberRole(projectId)
  const removeMember = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')

  if (members.isPending || me.isPending) return <ListSkeleton />
  if (members.isError) return <ErrorState error={members.error} onRetry={() => members.refetch()} />

  const myRole = members.data.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const ownerCount = members.data.items.filter((m) => m.role === 'owner').length

  const addErr =
    addMember.error instanceof ApiError ? addMember.error.message : addMember.isError ? '실패' : null

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-base font-semibold">프로젝트 설정 · 멤버</h1>
      <p className="mb-4 text-xs text-of-muted">
        {isOwner ? '소유자는 멤버를 추가·삭제하고 역할을 변경할 수 있습니다.' : '멤버 목록(읽기 전용) — 관리는 소유자만 가능합니다.'}
      </p>

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
                  </Select>
                ) : (
                  <Badge variant={m.role === 'owner' ? 'accent' : 'neutral'}>
                    {m.role === 'owner' ? '소유자' : '멤버'}
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
            </Select>
            <Button
              size="sm"
              disabled={!email.trim() || addMember.isPending}
              onClick={() =>
                addMember.mutate(
                  { email: email.trim(), role },
                  { onSuccess: () => setEmail('') },
                )
              }
            >
              추가
            </Button>
          </div>
          {addErr ? <p className="text-xs text-of-danger">{addErr}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
