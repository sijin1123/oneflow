import { ArrowUpRight, Download, Table2, Timeline, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { PortfolioBaselineTrend } from './PortfolioBaselineTrend'
import { PortfolioTimelineChart, usePortfolioTimeline } from './PortfolioTimeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HEALTH_LABELS, HEALTH_STYLES, type ProjectHealth } from '@/features/projects/types'
import { api } from '@/lib/api'
import {
  ReportingMetricCard,
  ReportingSection,
  ReportingSegmentedControl,
  ReportingSummaryGrid,
  ReportingSurface,
} from './ReportingSurface'

type PortfolioItem = {
  project_id: string
  key: string
  name: string
  archived: boolean
  health: string | null
  member_count: number
  work_package_count: number
  open_work_package_count: number
  overdue_count: number
  budget: number | null
  cost_total: number
  hours_total: number
  schedule_baseline_id: string | null
  schedule_baseline_name: string | null
  schedule_baseline_captured_at: string | null
  schedule_baseline_snapshot_count: number
  schedule_changed_count: number
  schedule_risk_count: number
}

type PortfolioTotals = {
  projects: number
  work_packages: number
  open: number
  overdue: number
  budget: number
  cost_total: number
  hours_total: number
  schedule_baseline_projects: number
  schedule_changed_projects: number
  schedule_at_risk_projects: number
  schedule_risk_items: number
}

type PortfolioReport = { items: PortfolioItem[]; totals: PortfolioTotals; total: number }

function usePortfolio(includeArchived: boolean) {
  return useQuery({
    queryKey: ['portfolio-report', includeArchived],
    queryFn: () =>
      api<PortfolioReport>(`/api/v1/reports/portfolio?include_archived=${includeArchived}`),
  })
}

const num = (v: number) => v.toLocaleString('ko-KR')
type ScheduleFilter = 'all' | 'risk' | 'changed' | 'missing'

const capturedDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value))
    : '저장 이력 없음'

function ScheduleBadge({ item }: { item: PortfolioItem }) {
  if (!item.schedule_baseline_id) return <Badge variant="outline">기준선 없음</Badge>
  if (item.schedule_risk_count > 0) {
    return <Badge variant="danger">주의 {item.schedule_risk_count}</Badge>
  }
  if (item.schedule_changed_count > 0) {
    return <Badge variant="warning">변경 {item.schedule_changed_count}</Badge>
  }
  return <Badge variant="success">변동 없음</Badge>
}

/* Fixed cross-project comparison (Pass 63 PR-CC): one row per member project,
   totals computed by the SERVER over the same rows — the archived toggle is a
   server parameter, so totals always match what is on screen (v63.1 R1-⑤). */
export function ReportsPage() {
  const [includeArchived, setIncludeArchived] = useState(false)
  const [view, setView] = useState<'table' | 'timeline' | 'trend'>('table')
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all')
  const report = usePortfolio(includeArchived)
  // Single shared filter state across both views (v75.1 R1-⑥).
  const timeline = usePortfolioTimeline(includeArchived)
  const navigate = useNavigate()

  if (report.isPending) return <ListSkeleton />
  if (report.isError) return <ErrorState error={report.error} onRetry={() => report.refetch()} />

  const { items, totals } = report.data
  const budgetRatio = (i: PortfolioItem) =>
    i.budget && i.budget > 0 ? `${Math.round((i.cost_total / i.budget) * 100)}%` : '—'
  const overdueTone = totals.overdue > 0 ? 'danger' : 'neutral'
  const filteredItems = items.filter((item) => {
    if (scheduleFilter === 'risk') return item.schedule_risk_count > 0
    if (scheduleFilter === 'changed') return item.schedule_changed_count > 0
    if (scheduleFilter === 'missing') return !item.schedule_baseline_id
    return true
  })
  const openBaseline = (projectId: string, baselineId?: string | null) =>
    navigate(
      `/projects/${projectId}/overview${baselineId ? `?baseline=${encodeURIComponent(baselineId)}` : ''}#schedule-baseline`,
    )

  return (
    <ReportingSurface
      title="포트폴리오 리포트"
      description="내가 속한 프로젝트 전체를 같은 기준으로 비교합니다. 합계는 현재 표시 범위 기준입니다."
      actions={
        <>
          <ReportingSegmentedControl
            ariaLabel="포트폴리오 보기"
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: '요약 표', icon: Table2 },
              { value: 'timeline', label: '타임라인', icon: Timeline },
              { value: 'trend', label: '기준선 추세', icon: TrendingUp },
            ]}
          />
          <label className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2.5 text-xs font-medium text-of-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-3.5 w-3.5 accent-of-accent"
            />
            아카이브 포함
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = `/api/v1/reports/portfolio/export.csv?include_archived=${includeArchived}`
            }}
          >
            <Download size={14} /> CSV
          </Button>
        </>
      }
    >
      <ReportingSummaryGrid className="grid-cols-2 xl:grid-cols-6">
        <ReportingMetricCard label="프로젝트" value={`${totals.projects}개`} detail="표시 범위" />
        <ReportingMetricCard
          label="미완료 작업"
          value={num(totals.open)}
          detail={`${num(totals.work_packages)}개 중`}
          tone={totals.open > 0 ? 'accent' : 'neutral'}
        />
        <ReportingMetricCard
          label="기준선 적용"
          value={`${totals.schedule_baseline_projects}/${totals.projects}`}
          detail="최신 일정 기준선이 있는 프로젝트"
          tone={totals.schedule_baseline_projects > 0 ? 'accent' : 'neutral'}
        />
        <ReportingMetricCard
          label="일정 주의"
          value={`${totals.schedule_at_risk_projects}개`}
          detail={`${num(totals.schedule_risk_items)}개 작업 점검 필요`}
          tone={totals.schedule_at_risk_projects > 0 ? 'danger' : 'neutral'}
        />
        <ReportingMetricCard
          label="지연"
          value={num(totals.overdue)}
          detail="기한을 지난 미완료 작업"
          tone={overdueTone}
        />
        <ReportingMetricCard
          label="비용 / 예산"
          value={`${num(totals.cost_total)} / ${num(totals.budget)}`}
          detail={`${num(totals.hours_total)}h 기록`}
        />
      </ReportingSummaryGrid>

      {view === 'timeline' ? (
        <ReportingSection title="포트폴리오 타임라인">
          {timeline.isPending ? (
            <ListSkeleton rows={5} className="px-0" />
          ) : timeline.isError ? (
            <ErrorState error={timeline.error} onRetry={() => timeline.refetch()} />
          ) : (timeline.data?.items ?? []).some((p) => !p.start_date) ? (
            <p className="mb-2 text-[11px] text-of-muted">
              일정 없음{' '}
              {(timeline.data?.items ?? []).filter((p) => !p.start_date).length}건 — 작업에
              시작일/기한이 생기면 표시됩니다.
            </p>
          ) : null}
          {!timeline.isPending && !timeline.isError && timeline.data && timeline.data.items.every((p) => !p.start_date) ? (
            <EmptyState
              title="일정이 있는 프로젝트가 없습니다"
              hint="작업에 시작일/기한을 지정하면 프로젝트 기간이 집계됩니다."
            />
          ) : !timeline.isPending && !timeline.isError ? (
            <PortfolioTimelineChart items={timeline.data?.items ?? []} />
          ) : null}
        </ReportingSection>
      ) : items.length === 0 ? (
        <EmptyState
          title="표시할 프로젝트가 없습니다"
          hint="프로젝트 멤버가 되면 여기에 집계됩니다."
        />
      ) : (
        <ReportingSection
          title={view === 'trend' ? '최근 기준선 추세' : '프로젝트 비교'}
          actions={
            <ReportingSegmentedControl
              ariaLabel="일정 기준선 필터"
              value={scheduleFilter}
              onChange={setScheduleFilter}
              options={[
                { value: 'all', label: `전체 ${items.length}` },
                { value: 'risk', label: `주의 ${totals.schedule_at_risk_projects}` },
                { value: 'changed', label: `변경 ${totals.schedule_changed_projects}` },
                { value: 'missing', label: `미설정 ${totals.projects - totals.schedule_baseline_projects}` },
              ]}
            />
          }
        >
        {filteredItems.length === 0 ? (
          <EmptyState title="조건에 맞는 프로젝트가 없습니다" hint="일정 기준선 필터를 바꿔 확인하세요.">
            <Button type="button" size="sm" variant="outline" onClick={() => setScheduleFilter('all')}>
              전체 프로젝트 보기
            </Button>
          </EmptyState>
        ) : view === 'trend' ? (
          <PortfolioBaselineTrend
            projects={filteredItems}
            includeArchived={includeArchived}
            onOpen={openBaseline}
          />
        ) : (
          <>
          <ul className="divide-y divide-of-border border-y border-of-border md:hidden">
            {filteredItems.map((item) => (
              <li key={item.project_id} className="min-w-0 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" className="max-w-full truncate text-left text-sm font-medium hover:text-of-accent hover:underline" onClick={() => openBaseline(item.project_id, item.schedule_baseline_id)}>
                      {item.name}
                    </button>
                    <p className="mt-0.5 text-[10px] text-of-muted">{item.key}{item.archived ? ' · 아카이브' : ''}</p>
                  </div>
                  <ScheduleBadge item={item} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                  <div><dt className="text-of-muted">최신 기준선</dt><dd className="mt-0.5 truncate font-medium">{item.schedule_baseline_name ?? '미설정'}</dd></div>
                  <div><dt className="text-of-muted">저장일</dt><dd className="mt-0.5 tabular-nums">{capturedDate(item.schedule_baseline_captured_at)}</dd></div>
                  <div><dt className="text-of-muted">작업</dt><dd className="mt-0.5 tabular-nums">{item.open_work_package_count} 미완료 · {item.overdue_count} 지연</dd></div>
                  <div><dt className="text-of-muted">기준선 변화</dt><dd className="mt-0.5 tabular-nums">{item.schedule_changed_count} 변경 · {item.schedule_risk_count} 주의</dd></div>
                </dl>
                <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => openBaseline(item.project_id, item.schedule_baseline_id)}>
                  기준선 상세 <ArrowUpRight size={13} />
                </Button>
              </li>
            ))}
          </ul>
        <div className="hidden max-w-full overflow-x-auto rounded-of border border-of-border bg-of-surface md:block">
          <table className="w-full min-w-[66rem] bg-of-surface text-xs">
            <thead>
              <tr className="border-b border-of-border text-left text-[11px] text-of-muted">
                <th className="px-3 py-2 font-medium">프로젝트</th>
                <th className="w-16 px-2 py-2 font-medium">상태</th>
                <th className="w-14 px-2 py-2 text-right font-medium">멤버</th>
                <th className="w-16 px-2 py-2 text-right font-medium">작업</th>
                <th className="w-16 px-2 py-2 text-right font-medium">미완료</th>
                <th className="w-16 px-2 py-2 text-right font-medium">지연</th>
                <th className="w-40 px-2 py-2 font-medium">최신 기준선</th>
                <th className="w-24 px-2 py-2 font-medium">일정 변화</th>
                <th className="w-24 px-2 py-2 text-right font-medium">예산</th>
                <th className="w-24 px-2 py-2 text-right font-medium">비용</th>
                <th className="w-20 px-2 py-2 text-right font-medium">예산 대비</th>
                <th className="w-16 px-3 py-2 text-right font-medium">시간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-of-border">
              {filteredItems.map((i) => {
                const health = i.health as ProjectHealth | null
                return (
                  <tr key={i.project_id}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-medium hover:text-of-accent hover:underline"
                        onClick={() => openBaseline(i.project_id, i.schedule_baseline_id)}
                      >
                        {i.name}
                      </button>
                      <span className="ml-1.5 text-[11px] text-of-muted">{i.key}</span>
                      {i.archived ? (
                        <span className="ml-1.5 text-[10px] text-of-muted">(아카이브)</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {health ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${HEALTH_STYLES[health]}`}
                        >
                          {HEALTH_LABELS[health]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{i.member_count}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{i.work_package_count}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.open_work_package_count}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.overdue_count > 0 ? (
                        <span className="text-of-danger">{i.overdue_count}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {i.schedule_baseline_id ? (
                        <button type="button" className="max-w-[9rem] text-left hover:text-of-accent" onClick={() => openBaseline(i.project_id, i.schedule_baseline_id)}>
                          <span className="block truncate font-medium">{i.schedule_baseline_name}</span>
                          <span className="mt-0.5 block text-[10px] tabular-nums text-of-muted">{capturedDate(i.schedule_baseline_captured_at)} · {i.schedule_baseline_snapshot_count}개</span>
                        </button>
                      ) : <span className="text-of-muted">미설정</span>}
                    </td>
                    <td className="px-2 py-2"><ScheduleBadge item={i} /></td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {i.budget !== null ? num(i.budget) : '미설정'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{num(i.cost_total)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{budgetRatio(i)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(i.hours_total)}h</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-of-border bg-of-surface-2/60 font-medium">
                <td className="px-3 py-2">합계 · {totals.projects}개 프로젝트</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right tabular-nums">{totals.work_packages}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totals.open}</td>
                <td className="px-2 py-2 text-right tabular-nums">{totals.overdue}</td>
                <td className="px-2 py-2 text-[11px] text-of-muted">{totals.schedule_baseline_projects}개 적용</td>
                <td className="px-2 py-2"><span className={totals.schedule_at_risk_projects > 0 ? 'text-of-danger' : undefined}>{totals.schedule_at_risk_projects}개 주의</span></td>
                <td className="px-2 py-2 text-right tabular-nums" title="예산 미설정 프로젝트 제외">
                  {num(totals.budget)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{num(totals.cost_total)}</td>
                <td className="px-2 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{num(totals.hours_total)}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
        </>
        )}
        </ReportingSection>
      )}
    </ReportingSurface>
  )
}
