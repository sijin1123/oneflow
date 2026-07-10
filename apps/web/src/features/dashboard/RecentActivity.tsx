import { useState } from 'react'

import { Select } from '@/components/ui/select'
import { useMembers } from '@/features/members/api'
import { FIELD_LABELS } from '@/features/work-packages/activityLabels'
import { formatDateTime } from '@/lib/datetime'

import { useProjectActivities, type ProjectActivity } from './api'

function actionText(a: ProjectActivity): string {
  if (a.action === 'created') return '생성'
  if (a.action === 'commented') return '댓글'
  const field = a.field ? (FIELD_LABELS[a.field] ?? a.field) : '필드'
  return `${field} ${a.old_value ?? '없음'} → ${a.new_value ?? '없음'}`
}

export function RecentActivity({ projectId }: { projectId: string }) {
  const [action, setAction] = useState('')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  // Actor source = CURRENT member roster — filtering by former actors is a
  // deliberate non-goal (v38.1 R1-⑤); their rows still render in '전체'.
  const [actor, setActor] = useState('')
  const members = useMembers(projectId)
  const activities = useProjectActivities(projectId, {
    action: action || undefined,
    order,
    actor_id: actor || undefined,
  })

  return (
    <div className="min-w-0 rounded-of border border-of-border bg-of-surface p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">최근 활동</h2>
        <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:flex sm:items-center">
          <Select
            aria-label="활동 종류"
            className="h-7 w-full text-[11px] sm:w-24"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">전체</option>
            <option value="created">생성</option>
            <option value="field_changed">필드 변경</option>
            <option value="commented">댓글</option>
          </Select>
          <Select
            aria-label="활동 멤버"
            className="h-7 w-full text-[11px] sm:w-24"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            <option value="">전체 멤버</option>
            {(members.data?.items ?? []).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="활동 정렬"
            className="h-7 w-full text-[11px] sm:w-20"
            value={order}
            onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')}
          >
            <option value="desc">최신순</option>
            <option value="asc">과거순</option>
          </Select>
        </div>
      </div>
      {activities.isPending ? (
        <p className="text-xs text-of-muted">불러오는 중…</p>
      ) : activities.isError ? (
        <p className="text-xs text-of-danger">활동을 불러오지 못했습니다.</p>
      ) : activities.data.total === 0 ? (
        <p className="text-xs text-of-muted">조건에 맞는 활동이 없습니다.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {activities.data.items.slice(0, 12).map((a) => (
              <li key={a.id} className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="shrink-0 font-medium text-of-muted">
                  {a.actor_name ?? '시스템'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-of-muted">{a.work_package_subject}</span> · {actionText(a)}
                </span>
                <span className="shrink-0 text-[11px] text-of-muted">
                  {formatDateTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
          {activities.data.truncated ? (
            <p className="mt-1.5 text-[11px] text-of-muted">더 있음 — 종류를 좁혀 주세요.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
