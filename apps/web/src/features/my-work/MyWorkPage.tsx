import {
  ArrowUpRight,
  BellRing,
  FolderKanban,
  Gauge,
  ListChecks,
  Search,
  SquareActivity,
  TimerReset,
  type LucideIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { useNotifications } from '@/features/notifications/api'
import {
  getNotificationMessage,
  getNotificationTargetPath,
} from '@/features/notifications/view'
import { useProjects } from '@/features/projects/api'
import { FIELD_LABELS } from '@/features/work-packages/activityLabels'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

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
            className="grid w-full min-w-0 gap-2 px-3 py-2 text-left hover:bg-of-surface-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Badge variant="neutral" className="max-w-24 shrink-0 truncate sm:max-w-28">
                {wp.project_name}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-[13px]">{wp.subject}</span>
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              <StatusChip status={wp.status} />
              <PriorityChip priority={wp.priority} />
              {showAssignee ? (
                <span className="max-w-24 truncate text-[11px] text-of-muted">
                  {wp.assignee_name ?? '미배정'}
                </span>
              ) : null}
              <span className="text-[11px] text-of-muted">{wp.due_date ?? '기한 없음'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function QuickLink({
  to,
  label,
  detail,
  icon: Icon,
  accent = false,
}: {
  to: string
  label: string
  detail: string
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex min-h-16 min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3 text-left transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
        accent && 'border-of-accent/30 bg-of-accent-soft/40',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted',
          accent && 'bg-of-accent-soft text-of-accent',
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-of-muted">{detail}</span>
      </span>
      <ArrowUpRight size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
    </Link>
  )
}

/* Personal cross-project home (expansion PLAN Pass 1 PR-B): what is on my
   plate, what is due this week, my inbox, and what changed around me. */
export function MyWorkPage() {
  const myWork = useMyWork()
  const myTime = useMyTime()
  const notifications = useNotifications()
  const projects = useProjects()
  const navigate = useNavigate()

  if (myWork.isPending) return <ListSkeleton />
  if (myWork.isError) return <ErrorState error={myWork.error} onRetry={() => myWork.refetch()} />

  const { assigned_to_me, due_soon, created_by_me, recent_activity } = myWork.data
  const inbox = (notifications.data?.items ?? []).slice(0, 6)
  const unread = notifications.data?.unread ?? 0
  const projectItems = projects.data?.items ?? []
  const activeProjects = projectItems.filter((project) => !project.archived_at)
  const firstProject = activeProjects[0]

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="min-w-0 border-b border-of-border pb-4">
        <p className="mb-1 text-[11px] font-medium uppercase text-of-muted">Workspace home</p>
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-base font-semibold">내 작업</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
              내가 확인해야 할 작업, 알림, 프로젝트 이동 경로를 한 화면에서 시작합니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Badge variant={assigned_to_me.length > 0 ? 'accent' : 'outline'}>
              배정 {assigned_to_me.length}
            </Badge>
            <Badge variant={due_soon.length > 0 ? 'accent' : 'outline'}>기한 {due_soon.length}</Badge>
            <Badge variant={unread > 0 ? 'accent' : 'outline'}>알림 {unread}</Badge>
            <Badge variant="outline">프로젝트 {projects.data?.total ?? 0}</Badge>
          </div>
        </div>
      </header>

      <section aria-label="빠른 이동" className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">빠른 이동</h2>
          <span className="text-xs text-of-muted">자주 쓰는 표면</span>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink
            to="/work-items"
            label="전체 작업"
            detail="프로젝트 전체 작업 검색"
            icon={ListChecks}
            accent
          />
          <QuickLink
            to="/inbox"
            label="인박스"
            detail={unread > 0 ? `읽지 않음 ${unread}건` : '새 알림 없음'}
            icon={BellRing}
            accent={unread > 0}
          />
          <QuickLink
            to="/projects"
            label="프로젝트"
            detail={`${projects.data?.total ?? 0}개 프로젝트`}
            icon={FolderKanban}
          />
          <QuickLink
            to="/operations"
            label="운영 허브"
            detail="가져오기·내보내기·상태"
            icon={SquareActivity}
          />
        </div>
      </section>

      <section aria-label="프로젝트 바로가기" className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">프로젝트 바로가기</h2>
          <Link
            to="/projects"
            className="rounded-of px-1.5 py-1 text-xs text-of-muted hover:bg-of-surface-2 hover:text-of-text"
          >
            전체 보기
          </Link>
        </div>
        {projects.isPending ? (
          <p className="rounded-of border border-of-border bg-of-surface px-3 py-3 text-xs text-of-muted">
            프로젝트를 불러오는 중입니다.
          </p>
        ) : activeProjects.length === 0 ? (
          <p className="rounded-of border border-of-border bg-of-surface px-3 py-3 text-xs text-of-muted">
            활성 프로젝트가 없습니다.
          </p>
        ) : (
          <div className="grid min-w-0 gap-2 md:grid-cols-2">
            {activeProjects.slice(0, 4).map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}/work-packages`}
                className="grid min-w-0 gap-2 rounded-of border border-of-border bg-of-surface px-3 py-3 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{project.name}</span>
                  <span className="block text-xs text-of-muted">{project.key}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-of-muted sm:justify-end">
                  <span>열린 작업 {project.open_work_package_count}</span>
                  <span>멤버 {project.member_count}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {assigned_to_me.length === 0 && created_by_me.length === 0 && recent_activity.length === 0 ? (
        <EmptyState
          title="아직 배정된 작업이 없습니다"
          hint="프로젝트에서 작업을 배정받으면 여기에 모입니다."
        >
          {firstProject ? (
            <Link
              to={`/projects/${firstProject.id}/work-packages`}
              className="inline-flex h-7 items-center justify-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              <Gauge size={13} aria-hidden="true" /> 첫 프로젝트 열기
            </Link>
          ) : null}
        </EmptyState>
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
                      <span
                        className="h-2 rounded-full bg-of-accent/70"
                        style={{ width: `${Math.min(100, (p.hours / myTime.data.total_hours) * 100)}%` }}
                      />
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">알림</h2>
                <button
                  type="button"
                  className="rounded-of px-1.5 py-1 text-xs text-of-muted hover:bg-of-surface-2 hover:text-of-text"
                  onClick={() => navigate('/inbox')}
                >
                  전체 보기
                </button>
              </div>
              {inbox.length === 0 ? (
                <p className="text-xs text-of-muted">새 알림이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {inbox.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className="flex w-full items-baseline gap-2 text-left text-xs hover:underline"
                        onClick={() => {
                          const target = getNotificationTargetPath(n)
                          if (target) navigate(target)
                        }}
                      >
                        <span className={n.read ? 'text-of-muted' : 'font-medium'}>
                          {getNotificationMessage(n)}
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

          <section aria-label="홈 작업 도구" className="grid gap-2 sm:grid-cols-3">
            <QuickLink
              to="/search"
              label="검색"
              detail="문서·작업·프로젝트 검색"
              icon={Search}
            />
            <QuickLink
              to="/reports"
              label="리포트"
              detail="포트폴리오 진행 흐름"
              icon={Gauge}
            />
            <QuickLink
              to={firstProject ? `/projects/${firstProject.id}/timeline` : '/projects'}
              label="타임라인"
              detail="가장 최근 프로젝트 일정"
              icon={TimerReset}
            />
          </section>
        </div>
      )}
    </div>
  )
}
