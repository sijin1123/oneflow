import {
  Boxes,
  CalendarClock,
  CalendarDays,
  Compass,
  FileText,
  ListChecks,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriorityChip, StatusChip, TypeChip } from '@/features/work-packages/chips'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { cn } from '@/lib/utils'

import { useUnifiedSearch, type UnifiedSearchResults } from './api'

/* Unified workspace search (Pass 14 PR-AE): grouped results across work
   packages, documents, meetings, cycles, modules and initiatives. Route
   contract per group is fixed in PLAN v14.1 R1-③. */
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)
  const navigate = useNavigate()
  const capabilities = useWorkspaceCapabilities()
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true

  const { data, isFetching, isError, error, refetch } = useUnifiedSearch(q)

  useEffect(() => {
    setInput(q)
  }, [q])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const trimmed = input.trim()
      if (trimmed) next.set('q', trimmed)
      else next.delete('q')
      return next
    })
  }

  const clearSearch = () => {
    setInput('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      },
      { replace: true },
    )
  }

  const trimmedQuery = q.trim()
  const summaries = useMemo(
    () => groupSummaries(data, wikiEnabled, initiativesEnabled),
    [data, initiativesEnabled, wikiEnabled],
  )
  const totalReturned = summaries.reduce((sum, group) => sum + group.returned, 0)
  const empty = data ? totalReturned === 0 : false
  const waitingForQuery = trimmedQuery.length < 2
  const loading = trimmedQuery.length >= 2 && isFetching && !data
  const resultText = waitingForQuery
    ? '검색 대기'
    : data
      ? `${totalReturned}건`
      : isFetching
        ? '검색 중'
        : ' '

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
      <header className="border-b border-of-border pb-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">Workspace search</p>
            <h1 className="mt-1 text-base font-semibold">전체 검색</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-of-muted">
              권한이 있는 작업, 문서, 회의, 사이클, 모듈, 이니셔티브를 한 화면에서 찾습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{resultText}</Badge>
            {isFetching && data ? <Badge variant="accent">업데이트 중</Badge> : null}
          </div>
        </div>
      </header>

      <section
        aria-label="검색어 입력"
        className="rounded-of border border-of-border bg-of-surface p-3 shadow-[var(--of-shadow-card)]"
      >
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
              aria-hidden="true"
            />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="검색어 (2자 이상)"
              aria-label="전체 검색어"
              className="h-8 pl-8 pr-8"
            />
            {input ? (
              <button
                type="button"
                aria-label="입력 지우기"
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={clearSearch}
              >
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              <Search size={13} /> 검색
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="새로고침"
              className="h-7 w-7"
              disabled={waitingForQuery}
              onClick={() => refetch()}
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </form>
      </section>

      {summaries.length > 0 ? (
        <section aria-label="검색 결과 요약" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {summaries.map((group) => (
            <SummaryCard
              key={group.key}
              label={group.label}
              returned={group.returned}
              icon={group.icon}
            />
          ))}
        </section>
      ) : null}

      {waitingForQuery ? (
        <EmptyState
          title="검색어를 입력하세요"
          hint="2자 이상 입력하면 전체 워크스페이스를 검색합니다."
        />
      ) : loading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || empty ? (
        <EmptyState title={`'${q}' 결과가 없습니다`} hint="검색어를 줄이거나 다른 단어로 다시 찾아보세요." />
      ) : (
        <div className="space-y-4">
          <GroupSection
            icon={ListChecks}
            title="작업"
            returned={data.work_packages.returned}
            truncated={data.work_packages.truncated}
          >
            {data.work_packages.items.map((item) => (
              <ResultRow
                key={item.id}
                icon={ListChecks}
                projectKey={item.project_key}
                projectName={item.project_name}
                title={item.subject}
                onClick={() => navigate(`/projects/${item.project_id}/work-packages/${item.id}`)}
              >
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  <TypeChip type={item.type} />
                  <StatusChip status={item.status} />
                  <PriorityChip priority={item.priority} />
                  <ContentMatch item={item} />
                </div>
              </ResultRow>
            ))}
          </GroupSection>

          {wikiEnabled ? (
            <GroupSection
              icon={FileText}
              title="문서"
              returned={data.documents.returned}
              truncated={data.documents.truncated}
            >
              {data.documents.items.map((item) => (
                <ResultRow
                  key={item.id}
                  icon={FileText}
                  projectKey={item.project_key}
                  projectName={item.project_name}
                  title={item.title}
                  onClick={() => navigate(`/projects/${item.project_id}/documents/${item.id}`)}
                >
                  <ContentMatch item={item} className="mt-2" />
                </ResultRow>
              ))}
            </GroupSection>
          ) : null}

          <GroupSection
            icon={CalendarClock}
            title="회의"
            returned={data.meetings.returned}
            truncated={data.meetings.truncated}
          >
            {data.meetings.items.map((item) => (
              <ResultRow
                key={item.id}
                icon={CalendarClock}
                projectKey={item.project_key}
                projectName={item.project_name}
                title={item.title}
                meta={item.scheduled_on ?? undefined}
                onClick={() => navigate(`/projects/${item.project_id}/meetings/${item.id}`)}
              >
                <ContentMatch
                  item={item as { matched_in?: string; snippet?: string | null }}
                  className="mt-2"
                />
              </ResultRow>
            ))}
          </GroupSection>

          <GroupSection
            icon={CalendarDays}
            title="사이클"
            returned={data.cycles.returned}
            truncated={data.cycles.truncated}
          >
            {data.cycles.items.map((item) => (
              <ResultRow
                key={item.id}
                icon={CalendarDays}
                projectKey={item.project_key}
                projectName={item.project_name}
                title={item.name}
                onClick={() => navigate(`/projects/${item.project_id}/cycles`)}
              />
            ))}
          </GroupSection>

          <GroupSection
            icon={Boxes}
            title="모듈"
            returned={data.modules.returned}
            truncated={data.modules.truncated}
          >
            {data.modules.items.map((item) => (
              <ResultRow
                key={item.id}
                icon={Boxes}
                projectKey={item.project_key}
                projectName={item.project_name}
                title={item.name}
                onClick={() => navigate(`/projects/${item.project_id}/modules`)}
              />
            ))}
          </GroupSection>

          {initiativesEnabled ? (
            <GroupSection
              icon={Compass}
              title="이니셔티브"
              returned={data.initiatives.returned}
              truncated={data.initiatives.truncated}
            >
              {data.initiatives.items.map((item) => (
                <ResultRow
                  key={item.id}
                  icon={Compass}
                  title={item.name}
                  meta={item.state}
                  onClick={() => navigate(`/initiatives?highlight=${item.id}`)}
                />
              ))}
            </GroupSection>
          ) : null}
        </div>
      )}
    </div>
  )
}

function groupSummaries(
  data: UnifiedSearchResults | undefined,
  includeDocuments: boolean,
  includeInitiatives: boolean,
) {
  if (!data) return []
  return [
    { key: 'work', label: '작업', returned: data.work_packages.returned, icon: ListChecks },
    ...(includeDocuments
      ? [{ key: 'docs', label: '문서', returned: data.documents.returned, icon: FileText }]
      : []),
    { key: 'meetings', label: '회의', returned: data.meetings.returned, icon: CalendarClock },
    { key: 'cycles', label: '사이클', returned: data.cycles.returned, icon: CalendarDays },
    { key: 'modules', label: '모듈', returned: data.modules.returned, icon: Boxes },
    ...(includeInitiatives
      ? [
          {
            key: 'initiatives',
            label: '이니셔티브',
            returned: data.initiatives.returned,
            icon: Compass,
          },
        ]
      : []),
  ].filter((group) => group.returned > 0)
}

function SummaryCard({
  label,
  returned,
  icon: Icon,
}: {
  label: string
  returned: number
  icon: LucideIcon
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-of border border-of-border bg-of-surface px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
        <Icon size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium text-of-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums text-of-text">{returned}건</span>
      </span>
    </div>
  )
}

function ContentMatch({
  item,
  className,
}: {
  item: { matched_in?: string; snippet?: string | null }
  className?: string
}) {
  if (item.matched_in !== 'content') return null
  return (
    <span className={cn('flex min-w-0 items-baseline gap-1.5', className)}>
      <span className="shrink-0 rounded-of bg-of-surface-2 px-1 py-0.5 text-[10px] text-of-muted">
        본문
      </span>
      {item.snippet ? (
        <span className="min-w-0 truncate text-xs text-of-muted">{item.snippet}</span>
      ) : null}
    </span>
  )
}

function GroupSection({
  icon: Icon,
  title,
  returned,
  truncated,
  children,
}: {
  icon: LucideIcon
  title: string
  returned: number
  truncated: boolean
  children: ReactNode
}) {
  if (returned === 0) return null
  return (
    <section aria-label={`${title} 결과`} className="rounded-of border border-of-border bg-of-surface">
      <div className="flex min-w-0 flex-col gap-1 border-b border-of-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted">
            <Icon size={14} aria-hidden="true" />
          </span>
          <p className="truncate text-xs font-semibold text-of-muted">
            {title} {returned}건
          </p>
        </div>
        {truncated ? (
          <span className="text-xs text-of-muted">더 있음 — 검색어를 좁혀 주세요</span>
        ) : null}
      </div>
      <ul className="divide-y divide-of-border">{children}</ul>
    </section>
  )
}

function ResultRow({
  icon: Icon,
  projectKey,
  projectName,
  title,
  meta,
  onClick,
  children,
}: {
  icon: LucideIcon
  projectKey?: string
  projectName?: string
  title: string
  meta?: string
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full min-w-0 gap-3 px-3 py-3 text-left transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted transition-colors group-hover:text-of-accent">
          <Icon size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {projectKey ? (
              <Badge variant="neutral" className="shrink-0 font-mono">
                {projectKey}
              </Badge>
            ) : null}
            {projectName ? (
              <span className="truncate text-xs text-of-muted">{projectName}</span>
            ) : null}
            {meta ? <span className="shrink-0 text-xs text-of-muted">{meta}</span> : null}
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-of-text">{title}</span>
          {children}
        </span>
      </button>
    </li>
  )
}
