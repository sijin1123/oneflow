import {
  ArrowRight,
  Check,
  Circle,
  FolderKanban,
  ListChecks,
  Rocket,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ErrorState } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/surface'
import { useUsers } from '@/features/admin/api'
import { useMe } from '@/features/members/api'
import { useProjects } from '@/features/projects/api'
import { useWorkspaceWorkItems } from '@/features/search/api'
import { cn } from '@/lib/utils'

type OnboardingStep = {
  key: string
  title: string
  description: string
  complete: boolean
  href: string
  action: string
  icon: LucideIcon
}

function ChecklistSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl animate-pulse px-4 py-5 sm:px-6" aria-label="시작하기 불러오는 중">
      <div className="h-20 rounded-of bg-of-surface-2" />
      <div className="mt-5 space-y-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 rounded-of border border-of-border-subtle bg-of-surface-2/60" />
        ))}
      </div>
    </div>
  )
}

function ChecklistRow({ step }: { step: OnboardingStep }) {
  const navigate = useNavigate()
  const Icon = step.icon
  return (
    <li className="grid min-w-0 gap-3 border-b border-of-border-subtle px-3 py-3 last:border-b-0 last:pr-16 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center sm:px-4 sm:last:pr-4">
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-of border',
          step.complete
            ? 'border-of-success/25 bg-of-success-soft text-of-success'
            : 'border-of-border bg-of-surface-2 text-of-muted',
        )}
      >
        {step.complete ? <Check size={15} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{step.title}</h2>
          <span className={cn('text-[11px] font-medium', step.complete ? 'text-of-success' : 'text-of-muted')}>
            {step.complete ? '완료' : '할 일'}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-of-muted">{step.description}</p>
      </div>
      <Button
        size="sm"
        variant={step.complete ? 'ghost' : 'outline'}
        className="w-full justify-between sm:w-auto sm:justify-center"
        onClick={() => navigate(step.href)}
      >
        {step.action} <ArrowRight size={13} aria-hidden="true" />
      </Button>
    </li>
  )
}

export function GetStartedPage() {
  const me = useMe()
  const projects = useProjects()
  const workItems = useWorkspaceWorkItems({
    q: '',
    scope: 'all',
    state: 'all',
    sort: 'updated',
    priority: null,
    pql: null,
    limit: 1,
    offset: 0,
  })
  const isAdmin = me.data?.is_admin === true
  const users = useUsers(isAdmin)

  const pending = me.isPending || projects.isPending || workItems.isPending || (isAdmin && users.isPending)
  const failed = me.isError || projects.isError || workItems.isError || (isAdmin && users.isError)
  const error = me.error ?? projects.error ?? workItems.error ?? users.error

  if (pending) {
    return (
      <div className="flex min-h-full flex-col bg-of-surface">
        <PageHeader icon={<Rocket />} title="시작하기" eyebrow="워크스페이스" description="현재 설정 상태를 확인합니다." />
        <ChecklistSkeleton />
      </div>
    )
  }

  if (failed) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void me.refetch()
          void projects.refetch()
          void workItems.refetch()
          if (isAdmin) void users.refetch()
        }}
      />
    )
  }

  const projectItems = projects.data?.items ?? []
  const firstProject = projectItems.find((project) => !project.archived_at) ?? projectItems[0]
  const writableProject = projectItems.find(
    (project) => !project.archived_at && project.current_user_role !== 'viewer',
  )
  const hasProjects = (projects.data?.total ?? 0) > 0
  const hasWorkItems = (workItems.data?.total ?? 0) > 0

  const steps: OnboardingStep[] = [
    {
      key: 'project',
      title: '첫 프로젝트 준비',
      description: hasProjects
        ? '팀의 작업과 문서를 담을 프로젝트 공간이 준비되어 있습니다.'
        : '업무 범위와 팀이 함께 사용할 첫 프로젝트를 만드세요.',
      complete: hasProjects,
      href: firstProject ? `/projects/${firstProject.id}/overview` : '/projects?new=1',
      action: hasProjects ? '프로젝트 열기' : '프로젝트 만들기',
      icon: FolderKanban,
    },
    {
      key: 'work-item',
      title: '첫 작업 등록',
      description: hasWorkItems
        ? '실행할 작업이 등록되어 팀이 진행 상태를 추적할 수 있습니다.'
        : writableProject
          ? '담당자와 우선순위를 정할 첫 작업을 등록하세요.'
          : '작업을 추가할 수 있는 프로젝트를 먼저 준비하세요.',
      complete: hasWorkItems,
      href: hasWorkItems
        ? '/work-items'
        : writableProject
          ? `/projects/${writableProject.id}/work-packages?new=1`
          : '/projects?new=1',
      action: hasWorkItems ? '전체 작업 보기' : writableProject ? '작업 만들기' : '프로젝트 준비',
      icon: ListChecks,
    },
  ]

  if (isAdmin) {
    const activeUserCount = users.data?.items.filter((user) => user.is_active).length ?? 0
    const teamReady = activeUserCount > 1
    steps.push({
      key: 'team',
      title: '팀 구성',
      description: teamReady
        ? '둘 이상의 계정이 준비되어 역할과 프로젝트 멤버십을 관리할 수 있습니다.'
        : '함께 일할 사용자를 추가하고 프로젝트 역할을 배정하세요.',
      complete: teamReady,
      href: '/admin/users',
      action: teamReady ? '사용자 관리' : '사용자 추가',
      icon: UsersRound,
    })
  }

  const completeCount = steps.filter((step) => step.complete).length
  const progress = Math.round((completeCount / steps.length) * 100)
  const allComplete = completeCount === steps.length

  return (
    <div className="flex min-h-full flex-col bg-of-surface">
      <PageHeader
        icon={<Rocket />}
        title="시작하기"
        eyebrow="워크스페이스"
        description="실제 워크스페이스 상태를 기준으로 다음 설정을 안내합니다."
      />

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-5 sm:px-6 sm:py-7">
        <section aria-labelledby="onboarding-progress-title" className="border-b border-of-border pb-5">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-of-accent">
                {allComplete ? <Check size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                {allComplete ? '초기 설정 완료' : '워크스페이스 설정'}
              </p>
              <h1 id="onboarding-progress-title" className="mt-1 text-xl font-semibold">
                {allComplete ? '업무를 시작할 준비가 되었습니다' : '팀의 첫 업무 흐름을 준비하세요'}
              </h1>
              <p className="mt-1 text-xs leading-5 text-of-muted">
                완료 상태는 현재 데이터에서 계산되며 이 화면에서 임의로 변경되지 않습니다.
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums" aria-live="polite">
              {completeCount}/{steps.length} 완료
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="시작하기 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-of-surface-3"
          >
            <span className="block h-full rounded-full bg-of-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <section aria-labelledby="onboarding-checklist-title" className="pt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="onboarding-checklist-title" className="text-xs font-semibold text-of-secondary">체크리스트</h2>
            <span className="text-[11px] text-of-muted">권한에 따라 필요한 항목만 표시됩니다.</span>
          </div>
          <ul className="overflow-hidden rounded-of border border-of-border bg-of-surface-raised">
            {steps.map((step) => <ChecklistRow key={step.key} step={step} />)}
          </ul>
        </section>
      </main>
    </div>
  )
}
