import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  HEALTH_LABELS,
  type ProjectHealth,
  type ProjectListItem,
} from '@/features/projects/types'

import {
  countWorkspaceRiskProjects,
  rankWorkspaceRiskProjects,
} from './workspaceRisk'

function healthBadgeVariant(
  health: ProjectHealth | null,
): 'success' | 'warning' | 'danger' | 'outline' {
  if (health === 'off_track') return 'danger'
  if (health === 'at_risk') return 'warning'
  if (health === 'on_track') return 'success'
  return 'outline'
}

export function WorkspaceRiskSummary({
  projects,
  isPending,
  isError,
  onRetry,
}: {
  projects: ProjectListItem[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
}) {
  const rankedProjects = rankWorkspaceRiskProjects(projects)
  const riskProjectCount = countWorkspaceRiskProjects(projects)
  const overdueWorkCount = projects.reduce(
    (total, project) => total + (project.archived_at ? 0 : project.overdue_count),
    0,
  )

  return (
    <section aria-label="프로젝트 위험 요약" className="min-w-0 border-y border-of-border py-4">
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle size={14} className="text-of-warning" aria-hidden="true" />
              프로젝트 위험
            </h2>
            {!isPending && !isError ? (
              <>
                <Badge variant={riskProjectCount > 0 ? 'danger' : 'outline'}>
                  주의 필요 {riskProjectCount}
                </Badge>
                <Badge variant={overdueWorkCount > 0 ? 'warning' : 'outline'}>
                  기한 초과 작업 {overdueWorkCount}
                </Badge>
              </>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            프로젝트 헬스와 기한 초과 작업을 기준으로 먼저 확인할 활성 프로젝트입니다.
          </p>
        </div>
        <Link
          to="/projects"
          className="w-fit shrink-0 rounded-of px-1.5 py-1 text-xs text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        >
          전체 프로젝트
        </Link>
      </div>

      {isPending ? (
        <p
          role="status"
          className="rounded-of border border-of-border bg-of-surface px-3 py-3 text-xs text-of-muted"
        >
          프로젝트 위험 정보를 불러오는 중입니다.
        </p>
      ) : isError ? (
        <div
          role="alert"
          className="flex min-w-0 flex-col gap-3 rounded-of border border-of-danger/20 bg-of-danger-soft px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-of-danger">
              프로젝트 위험 정보를 불러오지 못했습니다.
            </p>
            <p className="mt-1 text-[11px] text-of-muted">목록을 다시 요청해 현재 상태를 확인하세요.</p>
          </div>
          <Button variant="outline" size="sm" className="w-fit shrink-0" onClick={onRetry}>
            <RefreshCw size={13} aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      ) : rankedProjects.length === 0 ? (
        <p
          role="status"
          className="rounded-of border border-of-border bg-of-surface px-3 py-3 text-xs text-of-muted"
        >
          현재 주의가 필요한 활성 프로젝트가 없습니다.
        </p>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface">
          <ul className="min-w-0 divide-y divide-of-border-subtle">
            {rankedProjects.map((project) => (
              <li key={project.id} className="min-w-0">
                <Link
                  to={`/projects/${project.id}/overview`}
                  aria-label={`${project.name} 프로젝트 개요`}
                  className="grid min-w-0 gap-2 px-3 py-3 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{project.name}</span>
                      <span className="shrink-0 text-[11px] text-of-muted">{project.key}</span>
                    </span>
                    {project.health_note ? (
                      <span className="mt-0.5 block truncate text-[11px] text-of-muted">
                        {project.health_note}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
                    <Badge variant={healthBadgeVariant(project.health)}>
                      {project.health ? HEALTH_LABELS[project.health] : '헬스 미설정'}
                    </Badge>
                    <Badge variant={project.overdue_count > 0 ? 'warning' : 'outline'}>
                      기한 초과 {project.overdue_count}
                    </Badge>
                    <Badge variant="outline">열린 작업 {project.open_work_package_count}</Badge>
                    <ChevronRight size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {riskProjectCount > rankedProjects.length ? (
            <p className="border-t border-of-border-subtle px-3 py-2 text-[11px] text-of-muted">
              주의가 필요한 {riskProjectCount}개 중 우선순위 상위 {rankedProjects.length}개를 표시합니다.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
