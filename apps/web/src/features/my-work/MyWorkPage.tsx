import { useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { useNotifications } from '@/features/notifications/api'
import { FIELD_LABELS } from '@/features/work-packages/activityLabels'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { formatDateTime } from '@/lib/datetime'

import { type MyActivity, type MyWorkPackage, useMyWork, useMyTime } from './api'

function actionText(a: MyActivity): string {
  if (a.action === 'created') return '생성'
  if (a.action === 'commented') return '댓글'
  const field = a.field ? (FIELD_LABELS[a.field] ?? a.field) : '필드'
  return `${field} ${a.old_value ?? '없음'} → ${a.new_value ?? '없음'}`
}

function WorkList({
  items,
  emptyText,
  showAssignee = false,
}: {
  items: MyWorkPackage[]
  emptyText: string
  showAssignee?: boolean
}) {
  const navigate = useNavigate()
  if (items.length === 0) return <p className="px-1 py-2 text-xs text-of-muted">{emptyText}</p>
  return (
    <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border">
      {items.map((wp) => (
        <li key={wp.id}>
          <button
            type="button"
            onClick={() => navigate(`/projects/${wp.project_id}/work-packages?wp=${wp.id}`)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-of-surface-2"
          >
            <Badge variant="neutral" className="max-w-28 shrink-0 truncate">
              {wp.project_name}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-[13px]">{wp.subject}</span>
            <StatusChip status={wp.status} />
            <PriorityChip priority={wp.priority} />
            {showAssignee ? (
              <span className="w-20 shrink-0 truncate text-right text-[11px] text-of-muted">
                {wp.assignee_name ?? '미배정'}
              </span>
            ) : null}
            <span className="w-20 shrink-0 text-right text-[11px] text-of-muted">
              {wp.due_date ?? '기한 없음'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* Personal cross-project home (expansion PLAN Pass 1 PR-B): what is on my
   plate, what is due this week, my inbox, and what changed around me. */
export function MyWorkPage() {
  const myWork = useMyWork()
  const myTime = useMyTime()
  const notifications = useNotifications()
  const navigate = useNavigate()

  if (myWork.isPending) return <ListSkeleton />
  if (myWork.isError) return <ErrorState error={myWork.error} onRetry={() => myWork.refetch()} />

  const { assigned_to_me, due_soon, created_by_me, recent_activity } = myWork.data
  const inbox = (notifications.data?.items ?? []).slice(0, 6)

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-base font-semibold">내 작업</h1>
      <p className="mb-4 text-xs text-of-muted">
        내가 속한 모든 프로젝트에서 나에게 배정된 일과 최근 흐름을 모아 봅니다.
      </p>

      {assigned_to_me.length === 0 && created_by_me.length === 0 && recent_activity.length === 0 ? (
        <EmptyState
          title="아직 배정된 작업이 없습니다"
          hint="프로젝트에서 작업을 배정받으면 여기에 모입니다."
        />
      ) : (
        <div className="space-y-6">
          <section aria-label="기한 임박">
            <h2 className="mb-2 text-sm font-semibold">
              기한 임박 <span className="text-xs font-normal text-of-muted">(7일 이내)</span>
            </h2>
            <WorkList items={due_soon} emptyText="7일 내 마감되는 작업이 없습니다." />
          </section>

          <section aria-label="나에게 배정됨">
            <h2 className="mb-2 text-sm font-semibold">
              나에게 배정됨{' '}
              <span className="text-xs font-normal text-of-muted">{assigned_to_me.length}건</span>
            </h2>
            <WorkList items={assigned_to_me} emptyText="배정된 미완료 작업이 없습니다." />
          </section>

          <section aria-label="내 시간" className="rounded-of border border-of-border bg-of-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">
              내 시간{' '}
              <span className="text-xs font-normal text-of-muted">
                최근 7일 {myTime.data ? `${myTime.data.total_hours}h` : ''}
              </span>
            </h2>
            {!myTime.data || myTime.data.total === 0 ? (
              <p className="text-xs text-of-muted">최근 7일간 기록한 시간이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                <ul className="space-y-1">
                  {myTime.data.by_project.map((p) => (
                    <li key={p.project_id} className="flex items-center gap-2 text-xs">
                      <span className="w-32 shrink-0 truncate text-of-muted">{p.project_name}</span>
                      <span className="h-2 rounded-full bg-of-accent/70" style={{ width: `${Math.min(100, (p.hours / myTime.data.total_hours) * 100)}%` }} />
                      <span className="shrink-0 tabular-nums">{p.hours}h</span>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1 border-t border-of-border pt-2">
                  {myTime.data.items.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex items-baseline gap-2 text-xs">
                      <span className="shrink-0 text-of-muted">{e.spent_on}</span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left hover:text-of-accent"
                        onClick={() =>
                          navigate(`/projects/${e.project_id}/work-packages?wp=${e.work_package_id}`)
                        }
                      >
                        {e.work_package_subject}
                      </button>
                      <span className="shrink-0 tabular-nums">{e.hours}h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section aria-label="내가 만든 작업">
            <h2 className="mb-2 text-sm font-semibold">
              내가 만든 작업{' '}
              <span className="text-xs font-normal text-of-muted">
                {created_by_me.length}건 · 내 담당 제외
              </span>
            </h2>
            <WorkList
              items={created_by_me}
              emptyText="위임하거나 미배정으로 남긴 열린 작업이 없습니다."
              showAssignee
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="알림" className="rounded-of border border-of-border bg-of-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">알림</h2>
              {inbox.length === 0 ? (
                <p className="text-xs text-of-muted">새 알림이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {inbox.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className="flex w-full items-baseline gap-2 text-left text-xs hover:underline"
                        onClick={() =>
                          n.work_package_id
                            ? navigate(`/projects/${n.project_id}/work-packages?wp=${n.work_package_id}`)
                            : undefined
                        }
                      >
                        <span className={n.read ? 'text-of-muted' : 'font-medium'}>
                          {n.actor_name ?? '시스템'}: {n.work_package_subject ?? '작업'}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-of-muted">
                          {formatDateTime(n.created_at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-label="최근 활동"
              className="rounded-of border border-of-border bg-of-surface p-4"
            >
              <h2 className="mb-3 text-sm font-semibold">최근 활동</h2>
              {recent_activity.length === 0 ? (
                <p className="text-xs text-of-muted">아직 활동이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {recent_activity.map((a) => (
                    <li key={a.id} className="flex items-baseline gap-2 text-xs">
                      <span className="shrink-0 font-medium text-of-muted">
                        {a.actor_name ?? '시스템'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-of-muted">
                          {a.project_name} · {a.work_package_subject}
                        </span>{' '}
                        · {actionText(a)}
                      </span>
                      <span className="shrink-0 text-[11px] text-of-muted">
                        {formatDateTime(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
