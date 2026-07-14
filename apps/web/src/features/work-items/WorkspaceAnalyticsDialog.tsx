import * as Dialog from '@radix-ui/react-dialog'
import { BarChart3, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type SearchAnalyticsBucket,
  type WorkspaceWorkItemScope,
  type WorkspaceWorkItemState,
  useWorkspaceWorkItemAnalytics,
} from '@/features/search/api'
import type { WpPriority } from '@/features/work-packages/types'

const STATUS_LABELS: Record<string, string> = {
  backlog: '대기열',
  todo: '시작 전',
  in_progress: '진행 중',
  in_review: '검토 중',
  done: '완료',
  cancelled: '취소',
}

const PRIORITY_LABELS: Record<string, string> = {
  none: '없음',
  low: '낮음',
  medium: '보통',
  high: '높음',
  urgent: '긴급',
}

export function WorkspaceAnalyticsDialog({
  q,
  scope,
  state,
  priority,
  pql,
  scopeLabel,
}: {
  q: string
  scope: WorkspaceWorkItemScope
  state: WorkspaceWorkItemState
  priority: WpPriority | null
  pql: string | null
  scopeLabel: string
}) {
  const [open, setOpen] = useState(false)
  const analytics = useWorkspaceWorkItemAnalytics({ q, scope, state, priority, pql, enabled: open })
  const data = analytics.data
  const subtitle = [scopeLabel, q.trim() ? `“${q.trim()}” 검색` : null, pql ? 'PQL 적용' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="작업 분석 열기">
          <BarChart3 size={13} /> 분석
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="workspace-analytics-overlay"
          className="fixed inset-0 z-[var(--of-z-modal)] bg-black/30 of-overlay-enter motion-reduce:animate-none"
        />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] flex max-h-[min(44rem,calc(100dvh-1.5rem))] w-[min(52rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)] focus:outline-none">
          <header className="flex shrink-0 items-start gap-3 border-b border-of-border px-4 py-3 sm:px-5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-secondary">
              <BarChart3 size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold text-of-text">작업 분석</Dialog.Title>
              <Dialog.Description className="mt-0.5 break-words text-xs text-of-muted">
                {subtitle}의 전체 작업 분포입니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="작업 분석 닫기" className="h-8 w-8">
                <X size={14} />
              </Button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {analytics.isPending ? <AnalyticsSkeleton /> : null}
            {analytics.isError ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center" role="alert">
                <p className="text-sm font-medium text-of-text">분석을 불러오지 못했습니다</p>
                <p className="max-w-md break-words text-xs text-of-muted">
                  {analytics.error instanceof Error ? analytics.error.message : '잠시 후 다시 시도해 주세요.'}
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => analytics.refetch()}>
                  <RefreshCw size={13} /> 다시 시도
                </Button>
              </div>
            ) : null}
            {!analytics.isError && data && data.total === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center" aria-live="polite">
                <span className="flex h-9 w-9 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
                  <BarChart3 size={18} aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-of-text">분석할 작업이 없습니다</p>
                <p className="text-xs text-of-muted">현재 범위나 필터를 바꾸면 다른 결과를 확인할 수 있습니다.</p>
              </div>
            ) : null}
            {!analytics.isError && data && data.total > 0 ? (
              <div className="space-y-6">
                <section aria-labelledby="analytics-total">
                  <p id="analytics-total" className="text-xs font-medium text-of-muted">전체 작업</p>
                  <p className="mt-1 text-2xl font-semibold text-of-text" aria-label={`전체 작업 ${data.total}건`}>
                    {data.total.toLocaleString()}<span className="ml-1 text-xs font-normal text-of-muted">건</span>
                  </p>
                </section>

                <div className="grid min-w-0 gap-x-8 gap-y-6 border-t border-of-border pt-5 md:grid-cols-2">
                  <BucketSection title="상태" buckets={data.status_buckets} labels={STATUS_LABELS} />
                  <BucketSection title="우선순위" buckets={data.priority_buckets} labels={PRIORITY_LABELS} />
                </div>

                <div className="grid min-w-0 gap-x-8 gap-y-6 border-t border-of-border pt-5 md:grid-cols-2">
                  <section aria-labelledby="analytics-projects" className="min-w-0">
                    <h3 id="analytics-projects" className="text-xs font-semibold text-of-text">프로젝트</h3>
                    <div className="mt-3 space-y-2.5">
                      {data.top_projects.map((project) => (
                        <CountRow
                          key={project.id}
                          label={`${project.key} · ${project.name}`}
                          count={project.count}
                          maximum={data.top_projects[0]?.count ?? 0}
                        />
                      ))}
                      {data.project_overflow.project_count > 0 ? (
                        <p className="pt-1 text-[11px] text-of-muted">
                          그 외 {data.project_overflow.project_count}개 프로젝트 · {data.project_overflow.item_count}건
                        </p>
                      ) : null}
                    </div>
                  </section>
                  <BucketSection
                    title="일정"
                    buckets={[
                      { key: 'open_overdue', count: data.schedule_buckets.open_overdue },
                      { key: 'open_due_next_7_days', count: data.schedule_buckets.open_due_next_7_days },
                      { key: 'open_later', count: data.schedule_buckets.open_later },
                      { key: 'open_unscheduled', count: data.schedule_buckets.open_unscheduled },
                      { key: 'completed', count: data.schedule_buckets.completed },
                    ]}
                    labels={{
                      open_overdue: '기한 초과',
                      open_due_next_7_days: '7일 이내',
                      open_later: '이후 예정',
                      open_unscheduled: '일정 미정',
                      completed: '완료',
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function BucketSection({
  title,
  buckets,
  labels,
}: {
  title: string
  buckets: SearchAnalyticsBucket[]
  labels: Record<string, string>
}) {
  const maximum = Math.max(0, ...buckets.map((bucket) => bucket.count))
  return (
    <section aria-label={`${title}별 작업`} className="min-w-0">
      <h3 className="text-xs font-semibold text-of-text">{title}</h3>
      <div className="mt-3 space-y-2.5">
        {buckets.map((bucket) => (
          <CountRow
            key={bucket.key}
            label={labels[bucket.key] ?? bucket.key}
            count={bucket.count}
            maximum={maximum}
          />
        ))}
      </div>
    </section>
  )
}

function CountRow({ label, count, maximum }: { label: string; count: number; maximum: number }) {
  const width = count > 0 && maximum > 0 ? Math.max(4, Math.round((count / maximum) * 100)) : 0
  return (
    <div className="min-w-0" aria-label={`${label} ${count}건`}>
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="truncate text-of-secondary" title={label}>{label}</span>
        <span className="shrink-0 tabular-nums text-of-text">{count.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-of-surface-3" aria-hidden="true">
        <div
          className="h-full rounded-full bg-of-accent transition-[width] duration-[var(--of-duration-normal)] ease-[var(--of-ease-standard)] motion-reduce:transition-none"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="작업 분석 불러오는 중" aria-busy="true">
      <span className="sr-only">작업 분석 불러오는 중</span>
      <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-24" /></div>
      <div className="grid gap-6 border-t border-of-border pt-5 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, section) => (
          <div key={section} className="space-y-3">
            <Skeleton className="h-3 w-16" />
            {Array.from({ length: 5 }, (_, row) => <Skeleton key={row} className="h-7 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  )
}
