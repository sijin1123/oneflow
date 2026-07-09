import { Search } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriorityChip, StatusChip, TypeChip } from '@/features/work-packages/chips'

import { useUnifiedSearch } from './api'

/* Unified workspace search (Pass 14 PR-AE): grouped results across work
   packages, documents, meetings, cycles, modules and initiatives. Route
   contract per group is fixed in PLAN v14.1 R1-③. */
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)
  const navigate = useNavigate()

  const { data, isFetching, isError, error, refetch } = useUnifiedSearch(q)

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

  const empty =
    data &&
    data.work_packages.returned === 0 &&
    data.documents.returned === 0 &&
    data.meetings.returned === 0 &&
    data.cycles.returned === 0 &&
    data.modules.returned === 0 &&
    data.initiatives.returned === 0

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col overflow-y-auto p-6">
      <h1 className="mb-1 text-base font-semibold">전체 검색</h1>
      <p className="mb-4 text-xs text-of-muted">
        내가 속한 프로젝트의 작업·문서·회의·사이클·모듈·이니셔티브를 검색합니다. 문서·회의는
        제목만 검색됩니다(2자 이상).
      </p>

      <form onSubmit={submit} className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
          />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="검색어 (2자 이상)"
            aria-label="전체 검색어"
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm">
          검색
        </Button>
      </form>

      {q.trim().length < 2 ? (
        <EmptyState title="검색어를 입력하세요" hint="2자 이상 입력하면 전체 워크스페이스를 검색합니다." />
      ) : isFetching ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || empty ? (
        <EmptyState title={`'${q}' 결과가 없습니다`} />
      ) : (
        <div className="space-y-5">
          <GroupSection
            title="작업"
            returned={data.work_packages.returned}
            truncated={data.work_packages.truncated}
          >
            {data.work_packages.items.map((item) => (
              <ResultRow
                key={item.id}
                projectKey={item.project_key}
                onClick={() => navigate(`/projects/${item.project_id}/work-packages/${item.id}`)}
              >
                <TypeChip type={item.type} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.subject}</span>
                <ContentMatch item={item} />
                <StatusChip status={item.status} />
                <PriorityChip priority={item.priority} />
              </ResultRow>
            ))}
          </GroupSection>

          <GroupSection
            title="문서"
            returned={data.documents.returned}
            truncated={data.documents.truncated}
          >
            {data.documents.items.map((item) => (
              <ResultRow
                key={item.id}
                projectKey={item.project_key}
                onClick={() => navigate(`/projects/${item.project_id}/documents/${item.id}`)}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                <ContentMatch item={item} />
              </ResultRow>
            ))}
          </GroupSection>

          <GroupSection
            title="회의"
            returned={data.meetings.returned}
            truncated={data.meetings.truncated}
          >
            {data.meetings.items.map((item) => (
              <ResultRow
                key={item.id}
                projectKey={item.project_key}
                onClick={() => navigate(`/projects/${item.project_id}/meetings/${item.id}`)}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                <ContentMatch item={item as { matched_in?: string; snippet?: string | null }} />
                <span className="shrink-0 text-xs text-of-muted">{item.scheduled_on ?? ''}</span>
              </ResultRow>
            ))}
          </GroupSection>

          <GroupSection
            title="사이클"
            returned={data.cycles.returned}
            truncated={data.cycles.truncated}
          >
            {data.cycles.items.map((item) => (
              <ResultRow
                key={item.id}
                projectKey={item.project_key}
                onClick={() => navigate(`/projects/${item.project_id}/cycles`)}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
              </ResultRow>
            ))}
          </GroupSection>

          <GroupSection
            title="모듈"
            returned={data.modules.returned}
            truncated={data.modules.truncated}
          >
            {data.modules.items.map((item) => (
              <ResultRow
                key={item.id}
                projectKey={item.project_key}
                onClick={() => navigate(`/projects/${item.project_id}/modules`)}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
              </ResultRow>
            ))}
          </GroupSection>

          <GroupSection
            title="이니셔티브"
            returned={data.initiatives.returned}
            truncated={data.initiatives.truncated}
          >
            {data.initiatives.items.map((item) => (
              <ResultRow key={item.id} onClick={() => navigate('/initiatives')}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                <span className="shrink-0 text-xs text-of-muted">{item.state}</span>
              </ResultRow>
            ))}
          </GroupSection>
        </div>
      )}
    </div>
  )
}

function ContentMatch({ item }: { item: { matched_in?: string; snippet?: string | null } }) {
  if (item.matched_in !== 'content') return null
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
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
  title,
  returned,
  truncated,
  children,
}: {
  title: string
  returned: number
  truncated: boolean
  children: ReactNode
}) {
  if (returned === 0) return null
  return (
    <section aria-label={`${title} 결과`}>
      <p className="mb-1.5 text-xs font-semibold text-of-muted">
        {title} {returned}건
        {truncated ? (
          <span className="ml-1.5 font-normal">더 있음 — 검색어를 좁혀 주세요</span>
        ) : null}
      </p>
      <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
        {children}
      </ul>
    </section>
  )
}

function ResultRow({
  projectKey,
  onClick,
  children,
}: {
  projectKey?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-of-surface-2"
      >
        {projectKey ? (
          <Badge variant="neutral" className="shrink-0 font-mono">
            {projectKey}
          </Badge>
        ) : null}
        {children}
      </button>
    </li>
  )
}
