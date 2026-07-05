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
  const activities = useProjectActivities(projectId)

  return (
    <div className="rounded-of border border-of-border bg-of-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">최근 활동</h2>
      {activities.isPending ? (
        <p className="text-xs text-of-muted">불러오는 중…</p>
      ) : activities.isError ? (
        <p className="text-xs text-of-danger">활동을 불러오지 못했습니다.</p>
      ) : activities.data.total === 0 ? (
        <p className="text-xs text-of-muted">아직 활동이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {activities.data.items.slice(0, 12).map((a) => (
            <li key={a.id} className="flex items-baseline gap-2 text-xs">
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
      )}
    </div>
  )
}
