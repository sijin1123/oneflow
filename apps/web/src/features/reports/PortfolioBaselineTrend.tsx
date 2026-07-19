import { ArrowUpRight, History, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

type PortfolioScheduleTrendPoint = {
  baseline_id: string
  name: string
  captured_at: string
  snapshot_count: number
  comparison_count: number
  changed_count: number
  risk_count: number
}

type PortfolioScheduleTrendProject = {
  project_id: string
  points: PortfolioScheduleTrendPoint[]
}

type PortfolioScheduleTrendRead = {
  items: PortfolioScheduleTrendProject[]
  total: number
  history_limit: number
}

export type PortfolioTrendProjectRef = {
  project_id: string
  key: string
  name: string
  archived: boolean
}

function usePortfolioScheduleTrends(includeArchived: boolean) {
  return useQuery({
    queryKey: ['portfolio-schedule-baseline-trends', includeArchived],
    queryFn: () =>
      api<PortfolioScheduleTrendRead>(
        `/api/v1/reports/portfolio/schedule-baseline-trends?include_archived=${includeArchived}&history_limit=5`,
      ),
    retry: false,
  })
}

const capturedDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value))

function TrendPoint({
  project,
  point,
  latest,
  onOpen,
}: {
  project: PortfolioTrendProjectRef
  point: PortfolioScheduleTrendPoint
  latest: boolean
  onOpen: (projectId: string, baselineId: string) => void
}) {
  const denominator = Math.max(1, point.comparison_count)
  const changedWidth = Math.min(100, (point.changed_count / denominator) * 100)
  const riskWidth = Math.min(100, (point.risk_count / denominator) * 100)

  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-label={`${project.name} ${point.name} 기준선 상세, 변경 ${point.changed_count}개, 주의 ${point.risk_count}개`}
        onClick={() => onOpen(project.project_id, point.baseline_id)}
        className="group flex h-full w-full min-w-0 flex-col border border-of-border bg-of-surface px-3 py-3 text-left transition-colors hover:border-of-accent/35 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
      >
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-of-text group-hover:text-of-accent">
              {point.name}
            </span>
            <span className="mt-0.5 block text-[10px] tabular-nums text-of-muted">
              {capturedDate(point.captured_at)}
            </span>
          </span>
          {latest ? <Badge variant="neutral">최신</Badge> : <ArrowUpRight size={13} className="shrink-0 text-of-muted" />}
        </span>
        <span className="relative mt-3 block h-1.5 w-full overflow-hidden bg-of-surface-raised" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 bg-of-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${changedWidth}%` }} />
          <span className="absolute inset-y-0 left-0 bg-of-danger transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${riskWidth}%` }} />
        </span>
        <span className="mt-2 flex w-full min-w-0 items-center justify-between gap-2 text-[10px] tabular-nums text-of-muted">
          <span>{point.snapshot_count}개 저장</span>
          <span className="whitespace-nowrap">
            <strong className="font-semibold text-of-text">{point.changed_count}</strong> 변경 ·{' '}
            <strong className={point.risk_count > 0 ? 'font-semibold text-of-danger' : 'font-semibold text-of-text'}>
              {point.risk_count}
            </strong>{' '}
            주의
          </span>
        </span>
      </button>
    </li>
  )
}

export function PortfolioBaselineTrend({
  projects,
  includeArchived,
  onOpen,
}: {
  projects: PortfolioTrendProjectRef[]
  includeArchived: boolean
  onOpen: (projectId: string, baselineId: string) => void
}) {
  const trend = usePortfolioScheduleTrends(includeArchived)

  if (trend.isPending) return <ListSkeleton rows={Math.max(3, Math.min(6, projects.length))} className="px-0" />
  if (trend.isError) return <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />

  const byProject = new Map(trend.data.items.map((item) => [item.project_id, item.points]))
  const covered = projects.filter((project) => (byProject.get(project.project_id)?.length ?? 0) > 0)

  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-col gap-2 border-y border-of-border bg-of-surface-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 items-start gap-2 text-[11px] leading-5 text-of-muted">
          <TrendingUp size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          최근 최대 {trend.data.history_limit}개 기준선을 각각 현재 일정과 비교합니다. 과거 상태를 재구성한 값은 아닙니다.
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-of-muted">
          이력 있음 {covered.length}/{projects.length}
        </span>
      </div>
      <ul aria-label="프로젝트별 최근 기준선 추세" className="divide-y divide-of-border border-y border-of-border">
        {projects.map((project) => {
          const newestFirst = byProject.get(project.project_id) ?? []
          const chronological = [...newestFirst].reverse()
          return (
            <li key={project.project_id} className="min-w-0 py-4">
              <div className="mb-3 flex min-w-0 items-start justify-between gap-3 px-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-of-text">{project.name}</p>
                  <p className="mt-0.5 text-[10px] text-of-muted">
                    {project.key}{project.archived ? ' · 아카이브' : ''}
                  </p>
                </div>
                {chronological.length > 0 ? (
                  <Badge variant="outline">{chronological.length}개 이력</Badge>
                ) : (
                  <Badge variant="outline">이력 없음</Badge>
                )}
              </div>
              {chronological.length === 0 ? (
                <div className="flex min-h-20 items-center justify-center gap-2 border-y border-of-border-subtle px-3 text-xs text-of-muted">
                  <History size={14} aria-hidden="true" /> 저장된 일정 기준선이 없습니다.
                </div>
              ) : (
                <ol className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {chronological.map((point, index) => (
                    <TrendPoint
                      key={point.baseline_id}
                      project={project}
                      point={point}
                      latest={index === chronological.length - 1}
                      onOpen={onOpen}
                    />
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
