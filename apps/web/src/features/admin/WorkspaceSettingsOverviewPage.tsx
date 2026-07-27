import {
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  LayoutDashboard,
  MailPlus,
  RefreshCw,
  SlidersHorizontal,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import {
  useAdminWorkspaceProfile,
  useWorkspaceCalendar,
  useWorkspaceProjectPhaseDefinitions,
} from '@/features/workspace-profile/api'

import { useUsers } from './api'
import { useWorkspaceInvitations } from './workspaceInvitationsApi'

type StatusTone = NonNullable<BadgeProps['variant']>

type OverviewRowProps = {
  icon: LucideIcon
  title: string
  description: string
  status: string
  tone: StatusTone
  facts: string[]
  pending: boolean
  error: unknown
  onRetry: () => void
  action: ReactNode
}

const actionClassName =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

function ManageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={actionClassName}>
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </Link>
  )
}

function OverviewRow({
  icon: Icon,
  title,
  description,
  status,
  tone,
  facts,
  pending,
  error,
  onRetry,
  action,
}: OverviewRowProps) {
  return (
    <li aria-label={`${title} 상태`} className="grid min-w-0 gap-3 py-4 first:pt-1 last:pb-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            {pending ? <Skeleton className="h-5 w-16" /> : <Badge variant={error ? 'danger' : tone}>{error ? '확인 실패' : status}</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">{description}</p>
          {pending ? (
            <div role="status" aria-label={`${title} 확인 중`} className="mt-2 flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : error ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2" role="alert">
              <p className="text-xs text-of-danger">현재 상태를 불러오지 못했습니다.</p>
              <Button size="sm" variant="ghost" onClick={onRetry} aria-label={`${title} 다시 시도`}>
                <RefreshCw size={13} aria-hidden="true" /> 다시 시도
              </Button>
            </div>
          ) : (
            <ul aria-label={`${title} 세부 상태`} className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-of-muted">
              {facts.map((fact, index) => <li key={`${title}-${index}`}>{fact}</li>)}
            </ul>
          )}
        </div>
      </div>
      {action}
    </li>
  )
}

const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일'] as const

export function WorkspaceSettingsOverviewPage() {
  const profile = useAdminWorkspaceProfile()
  const users = useUsers()
  const invitations = useWorkspaceInvitations()
  const calendar = useWorkspaceCalendar()
  const phases = useWorkspaceProjectPhaseDefinitions()
  const capabilities = useWorkspaceCapabilities()

  const userItems = users.data?.items ?? []
  const activeUsers = userItems.filter((user) => user.is_active).length
  const activeAdmins = userItems.filter((user) => user.is_active && user.is_admin).length
  const pendingInvitations = invitations.data?.items.filter((invitation) => invitation.status === 'pending').length ?? 0
  const activePhases = phases.data?.items.filter((phase) => !phase.retired) ?? []
  const retiredPhases = phases.data?.items.filter((phase) => phase.retired).length ?? 0
  const customPhases = activePhases.filter((phase) => !phase.built_in).length
  const enabledCapabilities = capabilities.data
    ? [
        capabilities.data.wiki.enabled ? 'Wiki' : null,
        capabilities.data.ai.effective_enabled ? 'AI' : null,
        capabilities.data.initiatives.enabled ? 'Initiatives' : null,
        capabilities.data.releases.enabled ? 'Releases' : null,
        capabilities.data.customers.enabled ? 'Customers' : null,
      ].filter((label): label is string => label !== null)
    : []
  const fetching = profile.isFetching || users.isFetching || invitations.isFetching
    || calendar.isFetching || phases.isFetching || capabilities.isFetching
  const queries = [profile, users, invitations, calendar, phases, capabilities]
  const confirmedCount = queries.filter((query) => query.data !== undefined && !query.isError).length
  const failedCount = queries.filter((query) => query.isError).length
  const attentionCount = [
    !users.isError && users.data && (activeUsers === 0 || activeAdmins === 0),
    !invitations.isError && invitations.data && pendingInvitations > 0,
    !calendar.isError && calendar.data && calendar.data.working_weekdays.length === 0,
    !phases.isError && phases.data && activePhases.length === 0,
    !capabilities.isError
      && capabilities.data
      && capabilities.data.ai.enabled
      && !capabilities.data.ai.effective_enabled,
  ].filter(Boolean).length

  const refreshAll = () => {
    void Promise.all([
      profile.refetch(),
      users.refetch(),
      invitations.refetch(),
      calendar.refetch(),
      phases.refetch(),
      capabilities.refetch(),
    ])
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Button size="sm" variant="outline" onClick={refreshAll} disabled={fetching}>
          <RefreshCw size={13} className={fetching ? 'animate-spin' : undefined} aria-hidden="true" />
          모두 새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="workspace-admin-overview-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={fetching}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">Workspace administration</p>
              <h1 className="mt-1 text-xl font-semibold">관리 개요</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                워크스페이스 운영 상태를 실제 서버 응답으로 확인하고 필요한 설정으로 이동합니다.
              </p>
            </div>
            <dl
              aria-label="워크스페이스 관리 요약"
              className="grid grid-cols-4 divide-x divide-of-border-subtle border-y border-of-border-subtle lg:min-w-80"
            >
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">영역</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">6</dd>
              </div>
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">확인</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{confirmedCount}</dd>
              </div>
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">주의</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{attentionCount}</dd>
              </div>
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">실패</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{failedCount}</dd>
              </div>
            </dl>
          </header>

          <section aria-labelledby="workspace-status-title" className="py-6">
            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-of-border-subtle pb-3">
              <div className="min-w-0">
                <h2 id="workspace-status-title" className="text-sm font-semibold">워크스페이스 상태</h2>
                <p className="mt-1 text-xs leading-5 text-of-muted">
                  한 영역의 조회 실패는 다른 관리 상태와 설정 동선을 막지 않습니다.
                </p>
              </div>
              <LayoutDashboard size={16} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
            </div>

            <ul className="divide-y divide-of-border-subtle" aria-label="워크스페이스 관리 상태">
              <OverviewRow
                icon={Building2}
                title="Identity"
                description="앱 shell 전체에 표시되는 워크스페이스 이름과 로고 상태입니다."
                status={profile.data?.logo_url ? '브랜드 적용' : '기본 identity'}
                tone={profile.data?.logo_url ? 'success' : 'neutral'}
                facts={profile.data ? [
                  profile.data.name,
                  profile.data.logo_url ? `로고 ${profile.data.logo_width}×${profile.data.logo_height}` : '기본 문자 로고 사용',
                  `revision ${profile.data.revision}`,
                ] : []}
                pending={profile.isPending}
                error={profile.error}
                onRetry={() => void profile.refetch()}
                action={<ManageLink to="/admin/general">일반 설정</ManageLink>}
              />

              <OverviewRow
                icon={UsersRound}
                title="사용자"
                description="워크스페이스 계정의 활성 상태와 관리자 연속성을 확인합니다."
                status={`${activeUsers}명 활성`}
                tone={activeUsers > 0 && activeAdmins > 0 ? 'success' : 'warning'}
                facts={users.data ? [
                  `전체 ${users.data.total}명`,
                  `관리자 ${activeAdmins}명`,
                  `비활성 ${userItems.length - activeUsers}명`,
                ] : []}
                pending={users.isPending}
                error={users.error}
                onRetry={() => void users.refetch()}
                action={<ManageLink to="/admin/users">사용자 관리</ManageLink>}
              />

              <OverviewRow
                icon={MailPlus}
                title="워크스페이스 초대"
                description="일회성 초대 링크의 대기 상태와 전체 이력을 확인합니다."
                status={pendingInvitations > 0 ? `${pendingInvitations}건 대기` : '대기 없음'}
                tone={pendingInvitations > 0 ? 'warning' : 'success'}
                facts={invitations.data ? [
                  `전체 ${invitations.data.total}건`,
                  `대기 ${pendingInvitations}건`,
                  `종료 ${invitations.data.items.length - pendingInvitations}건`,
                ] : []}
                pending={invitations.isPending}
                error={invitations.error}
                onRetry={() => void invitations.refetch()}
                action={<ManageLink to="/admin/users?view=invites">초대 관리</ManageLink>}
              />

              <OverviewRow
                icon={CalendarCheck2}
                title="근무 일정"
                description="프로젝트 단계 자동 일정에 적용되는 근무 요일과 휴일입니다."
                status={`${calendar.data?.working_weekdays.length ?? 0}일 근무`}
                tone={(calendar.data?.working_weekdays.length ?? 0) > 0 ? 'success' : 'warning'}
                facts={calendar.data ? [
                  calendar.data.working_weekdays.map((weekday) => weekdayLabels[weekday]).join(' · '),
                  `휴일 ${calendar.data.holidays.length}일`,
                  `revision ${calendar.data.revision}`,
                ] : []}
                pending={calendar.isPending}
                error={calendar.error}
                onRetry={() => void calendar.refetch()}
                action={<ManageLink to="/admin/calendar">일정 관리</ManageLink>}
              />

              <OverviewRow
                icon={Workflow}
                title="프로젝트 단계"
                description="모든 프로젝트가 공유하는 활성 수명주기와 custom 단계 상태입니다."
                status={`${activePhases.length}개 활성`}
                tone={activePhases.length > 0 ? 'success' : 'warning'}
                facts={phases.data ? [
                  `Built-in ${activePhases.length - customPhases}개`,
                  `Custom ${customPhases}개`,
                  `은퇴 ${retiredPhases}개 · revision ${phases.data.revision}`,
                ] : []}
                pending={phases.isPending}
                error={phases.error}
                onRetry={() => void phases.refetch()}
                action={<ManageLink to="/admin/project-configuration?tab=phases">단계 관리</ManageLink>}
              />

              <OverviewRow
                icon={SlidersHorizontal}
                title="기능"
                description="현재 워크스페이스에서 실제로 활성화된 선택 기능입니다."
                status={`${enabledCapabilities.length}개 활성`}
                tone={enabledCapabilities.length > 0 ? 'success' : 'neutral'}
                facts={capabilities.data ? [
                  enabledCapabilities.length > 0 ? enabledCapabilities.join(' · ') : '활성 선택 기능 없음',
                  `전체 5개 중 ${enabledCapabilities.length}개`,
                  capabilities.data.ai.enabled && !capabilities.data.ai.effective_enabled ? 'AI 배포 상한 차단' : '정책과 배포 상한 일치',
                ] : []}
                pending={capabilities.isPending}
                error={capabilities.error}
                onRetry={() => void capabilities.refetch()}
                action={<ManageLink to="/admin/wiki">기능 설정</ManageLink>}
              />
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
