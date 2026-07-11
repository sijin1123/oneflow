import {
  ArrowUpRight,
  BellRing,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Gauge,
  ListChecks,
  Pin,
  Plus,
  Search,
  Sparkles,
  SquareActivity,
  StickyNote,
  TimerReset,
  type LucideIcon,
} from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCapabilities } from '@/features/ai/api'
import { useNotifications } from '@/features/notifications/api'
import {
  getNotificationMessage,
  getNotificationTargetPath,
} from '@/features/notifications/view'
import { useProjects } from '@/features/projects/api'
import { usePersonalNotes } from '@/features/personal-notes/api'
import { FIELD_LABELS } from '@/features/work-packages/activityLabels'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import {
  type MyActivity,
  type MyWorkItemRelationship,
  type MyWorkItemSort,
  type MyWorkItemState,
  type MyWorkPackage,
  useMyActivities,
  useMyWork,
  useMyWorkItems,
  useMyTime,
} from './api'

function actionText(a: MyActivity): string {
  if (a.action === 'created') return '생성'
  if (a.action === 'commented') return '댓글'
  const field = a.field ? (FIELD_LABELS[a.field] ?? a.field) : '필드'
  return `${field} ${a.old_value ?? '없음'} → ${a.new_value ?? '없음'}`
}

type MyWorkTab = 'overview' | 'assigned' | 'created' | 'subscribed' | 'activity'

const MY_WORK_TABS: Array<{ key: MyWorkTab; label: string }> = [
  { key: 'overview', label: '개요' },
  { key: 'assigned', label: '배정됨' },
  { key: 'created', label: '생성함' },
  { key: 'subscribed', label: '구독' },
  { key: 'activity', label: '활동' },
]

function MyWorkTabs({ active }: { active: MyWorkTab }) {
  return (
    <nav aria-label="내 작업 보기" className="mt-4 overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b border-of-border">
        {MY_WORK_TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.key === 'overview' ? '/my' : `/my?tab=${tab.key}`}
            aria-current={active === tab.key ? 'page' : undefined}
            className={cn(
              'min-h-9 border-b-2 border-transparent px-3 py-2 text-xs font-medium text-of-muted hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
              active === tab.key && 'border-of-accent text-of-accent',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

const PROFILE_PAGE_SIZE = 25

function MyWorkProfileSurface({
  tab,
}: {
  tab: Exclude<MyWorkTab, 'overview'>
}) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q')?.trim() ?? ''
  const state: MyWorkItemState = params.get('state') === 'all' ? 'all' : 'open'
  const sort: MyWorkItemSort = params.get('sort') === 'due' ? 'due' : 'updated'
  const parsedOffset = Number(params.get('offset') ?? 0)
  const offset =
    Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0
  const activityTab = tab === 'activity'
  const relationship: MyWorkItemRelationship =
    tab === 'created' || tab === 'subscribed' ? tab : 'assigned'
  const workItems = useMyWorkItems({
    relationship,
    state,
    sort,
    q,
    limit: PROFILE_PAGE_SIZE,
    offset,
    enabled: !activityTab,
  })
  const activities = useMyActivities({
    q,
    limit: PROFILE_PAGE_SIZE,
    offset,
    enabled: activityTab,
  })
  const query = activityTab ? activities : workItems
  const activityItems = activities.data?.items ?? []
  const workItemItems = workItems.data?.items ?? []
  const total = query.data?.total ?? 0

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search)
    next.set('tab', tab)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next)
  }

  const labels = {
    assigned: {
      title: '나에게 배정된 작업',
      description: '현재 담당자로 지정된 작업을 프로젝트 경계 안에서 모아봅니다.',
      empty: '조건에 맞는 배정 작업이 없습니다.',
    },
    created: {
      title: '내가 생성한 작업',
      description: '담당자와 관계없이 내가 만든 작업을 추적합니다.',
      empty: '조건에 맞는 생성 작업이 없습니다.',
    },
    subscribed: {
      title: '구독 중인 작업',
      description: '변경 알림을 받도록 구독한 작업을 모아봅니다.',
      empty: '조건에 맞는 구독 작업이 없습니다.',
    },
    activity: {
      title: '내 프로젝트 활동',
      description: '현재 참여 중인 활성 프로젝트의 작업 변경을 최신순으로 봅니다.',
      empty: '조건에 맞는 활동이 없습니다.',
    },
  }[tab]

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="min-w-0">
        <p className="mb-1 text-[11px] font-medium uppercase text-of-muted">Your work</p>
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold">{labels.title}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
              {labels.description}
            </p>
          </div>
          {query.data ? (
            <Badge variant={total > 0 ? 'accent' : 'outline'}>{total}건</Badge>
          ) : null}
        </div>
        <MyWorkTabs active={tab} />
      </header>

      <section
        aria-label="내 작업 필터"
        className="flex min-w-0 flex-col gap-2 border-y border-of-border py-3 md:flex-row md:items-end"
      >
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            const value = String(new FormData(event.currentTarget).get('q') ?? '').trim()
            updateParams({ q: value || null, offset: null })
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-of-muted">검색</span>
            <Input
              key={q}
              name="q"
              defaultValue={q}
              maxLength={255}
              placeholder={activityTab ? '작업 또는 프로젝트 검색' : '작업 제목 검색'}
              aria-label="내 작업 검색"
            />
          </label>
        </form>
        {!activityTab ? (
          <>
            <label className="min-w-36">
              <span className="mb-1 block text-xs font-medium text-of-muted">범위</span>
              <Select
                aria-label="작업 범위"
                value={state}
                onChange={(event) =>
                  updateParams({
                    state: event.target.value === 'all' ? 'all' : null,
                    offset: null,
                  })
                }
              >
                <option value="open">열린 작업</option>
                <option value="all">전체 작업</option>
              </Select>
            </label>
            <label className="min-w-36">
              <span className="mb-1 block text-xs font-medium text-of-muted">정렬</span>
              <Select
                aria-label="작업 정렬"
                value={sort}
                onChange={(event) =>
                  updateParams({
                    sort: event.target.value === 'due' ? 'due' : null,
                    offset: null,
                  })
                }
              >
                <option value="updated">최근 변경순</option>
                <option value="due">기한순</option>
              </Select>
            </label>
          </>
        ) : null}
        <Button
          variant="outline"
          onClick={() => updateParams({ q: null, state: null, sort: null, offset: null })}
          disabled={!q && state === 'open' && sort === 'updated' && offset === 0}
        >
          초기화
        </Button>
      </section>

      {query.isPending ? (
        <ListSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : activityTab ? (
        activityItems.length === 0 ? (
          <EmptyState title={labels.empty} hint="검색을 지우거나 다른 탭을 확인해 보세요." />
        ) : (
          <ul
            aria-label="내 프로젝트 활동 목록"
            className="divide-y divide-of-border border-y border-of-border"
          >
            {activityItems.map((activity) => (
              <li key={activity.id}>
                <button
                  type="button"
                  className="grid min-h-12 w-full min-w-0 gap-1 px-3 py-2 text-left hover:bg-of-surface-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  onClick={() =>
                    navigate(
                      `/projects/${activity.project_id}/work-packages?wp=${activity.work_package_id}`,
                    )
                  }
                >
                  <span className="min-w-0 truncate text-[13px]">
                    <strong className="font-medium">{activity.actor_name ?? '시스템'}</strong>{' '}
                    <span className="text-of-muted">
                      {activity.project_name} · {activity.work_package_subject}
                    </span>{' '}
                    · {actionText(activity)}
                  </span>
                  <span className="text-[11px] text-of-muted">
                    {formatDateTime(activity.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : workItemItems.length === 0 ? (
        <EmptyState title={labels.empty} hint="검색이나 작업 범위를 조정해 보세요." />
      ) : (
        <WorkList
          items={workItemItems}
          emptyText={labels.empty}
          showAssignee={tab !== 'assigned'}
          showUpdated={sort === 'updated'}
        />
      )}

      {query.data && (offset > 0 || offset + query.data.items.length < total) ? (
        <nav aria-label="내 작업 페이지" className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-of-muted">
            {total === 0 ? 0 : offset + 1}-
            {Math.min(offset + query.data.items.length, total)} / {total}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              aria-label="이전 페이지"
              disabled={offset === 0}
              onClick={() =>
                updateParams({
                  offset: offset > PROFILE_PAGE_SIZE ? String(offset - PROFILE_PAGE_SIZE) : null,
                })
              }
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="다음 페이지"
              disabled={offset + query.data.items.length >= total}
              onClick={() =>
                updateParams({ offset: String(offset + PROFILE_PAGE_SIZE) })
              }
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

function WorkList({
  items,
  emptyText,
  showAssignee = false,
  showUpdated = false,
}: {
  items: MyWorkPackage[]
  emptyText: string
  showAssignee?: boolean
  showUpdated?: boolean
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
              <span className="text-[11px] text-of-muted">
                {showUpdated && 'updated_at' in wp && typeof wp.updated_at === 'string'
                  ? formatDateTime(wp.updated_at)
                  : (wp.due_date ?? '기한 없음')}
              </span>
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

function PersonalNotesPanel() {
  // This deliberately has its own query boundary: a notes outage must never
  // hide the rest of the workspace home.
  const notes = usePersonalNotes('', 3)
  return (
    <section
      aria-label="개인 메모"
      className="min-w-0 rounded-of border border-of-border bg-of-surface p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StickyNote size={15} className="text-of-muted" />
          <h2 className="text-sm font-semibold">개인 메모</h2>
        </div>
        <Link to="/notes" className="text-xs text-of-accent hover:underline">
          전체 보기
        </Link>
      </div>
      {notes.isPending ? (
        <p className="mt-2 text-xs text-of-muted">메모를 불러오는 중입니다.</p>
      ) : notes.isError ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-of-danger">
          메모를 불러오지 못했습니다.
          <button type="button" className="underline" onClick={() => notes.refetch()}>
            재시도
          </button>
        </div>
      ) : notes.data?.items.length ? (
        <ul className="mt-2 divide-y divide-of-border">
          {notes.data.items.map((note) => (
            <li key={note.id} className="py-1.5">
              <Link to="/notes" className="block min-w-0 hover:text-of-accent">
                <span className="flex min-w-0 items-center gap-1 text-xs font-medium">
                  {note.is_pinned ? <Pin size={11} className="shrink-0 text-of-accent" /> : null}
                  <span className="truncate">{note.title}</span>
                </span>
                {note.body ? (
                  <span className="block truncate text-[11px] text-of-muted">{note.body}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-of-muted">아직 메모가 없습니다.</p>
      )}
      <Link
        to="/notes?new=1"
        className="mt-3 inline-flex h-7 items-center gap-1 rounded-of border border-of-border px-2 text-xs hover:bg-of-surface-2"
      >
        <Plus size={13} /> 메모 추가
      </Link>
    </section>
  )
}

function AiWorkspacePanel({
  assigned,
  dueSoon,
  created,
}: {
  assigned: MyWorkPackage[]
  dueSoon: MyWorkPackage[]
  created: MyWorkPackage[]
}) {
  const caps = useCapabilities()
  const candidate = dueSoon[0] ?? assigned[0] ?? created[0]
  const scopedIds = new Set([...assigned, ...dueSoon, ...created].map((wp) => wp.id))
  const enabled = caps.data?.ai_summary_enabled === true
  const disabled = caps.data?.ai_summary_enabled === false

  return (
    <section
      id="ai-workspace"
      aria-label="AI workspace"
      className="grid min-w-0 gap-3 rounded-of border border-of-border bg-of-surface p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
            <Sparkles size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">AI workspace</h2>
            <p className="text-xs leading-5 text-of-muted">
              현재 사용자에게 보이는 작업만 대상으로 요약 진입점을 제공합니다.
            </p>
          </div>
          {enabled ? (
            <Badge variant="accent">사용 가능</Badge>
          ) : caps.isPending ? (
            <Badge variant="outline">확인 중</Badge>
          ) : (
            <Badge variant="outline">{disabled ? '꺼짐' : '상태 오류'}</Badge>
          )}
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <span className="rounded-of border border-of-border bg-of-surface-2 px-2.5 py-2">
            배정 <strong className="font-semibold">{assigned.length}</strong>
          </span>
          <span className="rounded-of border border-of-border bg-of-surface-2 px-2.5 py-2">
            기한 <strong className="font-semibold">{dueSoon.length}</strong>
          </span>
          <span className="rounded-of border border-of-border bg-of-surface-2 px-2.5 py-2">
            후보 <strong className="font-semibold">{scopedIds.size}</strong>
          </span>
        </div>

        {caps.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-of-muted">
            <span>AI 기능 상태를 확인하지 못했습니다.</span>
            <button
              type="button"
              className="rounded-of border border-of-border bg-of-surface px-2 py-1 font-medium text-of-text hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => caps.refetch()}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {enabled && candidate ? (
          <div className="min-w-0 rounded-of border border-of-border bg-of-surface-2 px-3 py-2">
            <p className="mb-1 text-[11px] font-medium uppercase text-of-muted">추천 요약 대상</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="neutral" className="max-w-28 truncate">
                {candidate.project_name}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {candidate.subject}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusChip status={candidate.status} />
              <PriorityChip priority={candidate.priority} />
              <span className="text-[11px] text-of-muted">{candidate.due_date ?? '기한 없음'}</span>
            </div>
          </div>
        ) : enabled ? (
          <p className="rounded-of border border-of-border bg-of-surface-2 px-3 py-2 text-xs text-of-muted">
            요약할 열린 작업 후보가 없습니다.
          </p>
        ) : (
          <p className="text-xs leading-5 text-of-muted">
            AI 요약은 운영 설정이 켜진 경우에만 작업 상세에서 실행됩니다.
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-end gap-2 lg:w-44 lg:flex-col lg:justify-end">
        {enabled && candidate ? (
          <Link
            to={`/projects/${candidate.project_id}/work-packages?wp=${candidate.id}`}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-of bg-of-accent px-3 text-sm font-medium text-white hover:bg-of-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <Sparkles size={14} aria-hidden="true" />
            <span className="truncate">AI 요약 열기</span>
          </Link>
        ) : enabled ? (
          <Link
            to="/work-items"
            className="inline-flex h-8 items-center justify-center rounded-of border border-of-border bg-of-surface px-3 text-sm font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            전체 작업
          </Link>
        ) : (
          <Link
            to="/status"
            className="inline-flex h-8 items-center justify-center rounded-of border border-of-border bg-of-surface px-3 text-sm font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            시스템 상태
          </Link>
        )}
      </div>
    </section>
  )
}

/* Personal cross-project home (expansion PLAN Pass 1 PR-B): what is on my
   plate, what is due this week, my inbox, and what changed around me. */
function MyWorkOverview() {
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
        <MyWorkTabs active="overview" />
      </header>

      <AiWorkspacePanel assigned={assigned_to_me} dueSoon={due_soon} created={created_by_me} />

      <section aria-label="빠른 이동" className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">빠른 이동</h2>
          <span className="text-xs text-of-muted">자주 쓰는 표면</span>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <QuickLink
            to="/notes?new=1"
            label="개인 메모"
            detail="빠르게 기록하고 정리"
            icon={StickyNote}
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

      <section aria-label="최근 항목" className="min-w-0 border-y border-of-border py-4">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">최근 항목</h2>
            <p className="mt-0.5 text-xs text-of-muted">지금 이어서 볼 작업과 변경입니다.</p>
          </div>
          <Link to="/my?tab=activity" className="shrink-0 text-xs text-of-accent hover:underline">
            전체 활동
          </Link>
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="min-w-0 space-y-5">
            <section aria-label="기한 임박">
              <h3 className="mb-2 text-xs font-semibold text-of-secondary">
                기한 임박 <span className="font-normal text-of-muted">(7일 이내)</span>
              </h3>
              <WorkList items={due_soon} emptyText="7일 내 마감되는 작업이 없습니다." />
            </section>
            <section aria-label="나에게 배정됨">
              <h3 className="mb-2 text-xs font-semibold text-of-secondary">
                나에게 배정됨 <span className="font-normal text-of-muted">{assigned_to_me.length}건</span>
              </h3>
              <WorkList items={assigned_to_me} emptyText="배정된 미완료 작업이 없습니다." />
            </section>
          </div>
          <section aria-label="최근 활동" className="min-w-0 border-t border-of-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <h3 className="mb-2 text-xs font-semibold text-of-secondary">최근 활동</h3>
            {recent_activity.length === 0 ? (
              <p className="text-xs text-of-muted">아직 활동이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {recent_activity.slice(0, 6).map((activity) => (
                  <li key={activity.id} className="min-w-0 text-xs">
                    <button
                      type="button"
                      className="block w-full min-w-0 text-left hover:text-of-accent"
                      onClick={() => navigate(`/projects/${activity.project_id}/work-packages?wp=${activity.work_package_id}`)}
                    >
                      <span className="block truncate font-medium">{activity.work_package_subject}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-of-muted">
                        {activity.project_name} · {actionText(activity)} · {formatDateTime(activity.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>

      <PersonalNotesPanel />

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

          <div className="min-w-0">
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

export function MyWorkPage() {
  const [params] = useSearchParams()
  const requested = params.get('tab') ?? 'overview'
  const tab = MY_WORK_TABS.find((item) => item.key === requested)?.key
  if (!tab) return <Navigate to="/my" replace />
  if (tab === 'overview') return <MyWorkOverview />
  return <MyWorkProfileSurface tab={tab} />
}
