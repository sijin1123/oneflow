import { ArrowUpRight, ListChecks, Settings, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { useMe } from '@/features/members/api'
import { type MyWorkPackage, useMyWork } from '@/features/my-work/api'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'

import { useCapabilities } from './api'

function uniqueCandidates(items: MyWorkPackage[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

export function AiWorkspacePage() {
  const capabilities = useCapabilities()
  const myWork = useMyWork()
  const me = useMe()

  if (myWork.isPending) return <div className="p-5 sm:p-6"><ListSkeleton rows={6} /></div>
  if (myWork.isError) {
    return <div className="p-5 sm:p-6"><ErrorState error={myWork.error} onRetry={() => myWork.refetch()} /></div>
  }

  const candidates = uniqueCandidates([
    ...myWork.data.due_soon,
    ...myWork.data.assigned_to_me,
    ...myWork.data.created_by_me,
  ])
  const enabled = capabilities.data?.ai_summary_enabled === true

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-col gap-3 border-b border-of-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium uppercase text-of-muted">AI workspace</p>
          <h1 className="text-base font-semibold">작업 요약</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            내가 접근할 수 있는 열린 작업을 골라 상세 화면에서 현재 내용의 요약을 생성합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capabilities.isPending ? <Badge variant="outline">기능 확인 중</Badge> : enabled ? <Badge variant="accent">AI 요약 사용 가능</Badge> : <Badge variant="outline">AI 요약 꺼짐</Badge>}
          {me.data?.is_admin ? (
            <Link to="/admin/ai" className="inline-flex h-8 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2.5 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
              <Settings size={13} aria-hidden="true" /> AI 설정
            </Link>
          ) : null}
        </div>
      </header>

      <section aria-label="AI 요약 범위" className="grid min-w-0 grid-cols-3 border-b border-of-border py-4">
        {[
          ['배정됨', myWork.data.assigned_to_me.length],
          ['기한 임박', myWork.data.due_soon.length],
          ['요약 후보', candidates.length],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 border-r border-of-border px-3 first:pl-0 last:border-r-0 last:pr-0">
            <p className="truncate text-[11px] text-of-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      {capabilities.isError ? (
        <section aria-label="AI 기능 오류" className="border-b border-of-border py-4">
          <ErrorState error={capabilities.error} onRetry={() => capabilities.refetch()} />
        </section>
      ) : !capabilities.isPending && !enabled ? (
        <section aria-label="AI 기능 비활성" className="flex min-w-0 flex-col gap-3 border-b border-of-border py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">AI 요약이 비활성화되어 있습니다</h2>
            <p className="mt-1 text-xs leading-5 text-of-muted">기능이 켜질 때까지 작업 데이터는 외부 AI 제공자에게 전송되지 않습니다.</p>
          </div>
          <Link to={me.data?.is_admin ? '/admin/ai' : '/status'} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-of border border-of-border bg-of-surface px-3 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
            {me.data?.is_admin ? 'AI 설정 확인' : '시스템 상태'} <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      <section id="summary-candidates" aria-label="AI 요약 후보" className="min-w-0 py-5">
        <div className="mb-3 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">요약할 작업</h2>
            <p className="mt-1 text-xs text-of-muted">기한 임박, 배정, 생성 작업 순으로 중복 없이 표시합니다.</p>
          </div>
          <Link to="/work-items" className="inline-flex items-center gap-1 text-xs text-of-accent hover:underline"><ListChecks size={13} aria-hidden="true" /> 전체 작업</Link>
        </div>

        {candidates.length === 0 ? (
          <div className="flex min-w-0 flex-col items-start gap-3 border-y border-of-border py-8">
            <span className="flex h-9 w-9 items-center justify-center rounded-of bg-of-surface-2 text-of-muted"><Sparkles size={16} aria-hidden="true" /></span>
            <div><p className="text-sm font-medium">요약할 열린 작업이 없습니다</p><p className="mt-1 text-xs text-of-muted">전체 작업에서 접근 가능한 항목을 확인해 보세요.</p></div>
            <Link to="/work-items" className="text-xs font-medium text-of-accent hover:underline">전체 작업 열기</Link>
          </div>
        ) : (
          <ul className="divide-y divide-of-border border-y border-of-border">
            {candidates.map((item) => (
              <li key={item.id}>
                <Link to={`/projects/${item.project_id}/work-packages?wp=${item.id}`} className="grid min-w-0 gap-2 px-2 py-3 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <span className="min-w-0"><span className="block truncate text-[11px] text-of-muted">{item.project_name}</span><span className="mt-0.5 block truncate text-sm font-medium">{item.subject}</span></span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end"><StatusChip status={item.status} /><PriorityChip priority={item.priority} /><span className="text-[11px] text-of-muted">{item.due_date ?? '기한 없음'}</span>{enabled ? <span className="text-xs font-medium text-of-accent">요약 열기</span> : null}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
