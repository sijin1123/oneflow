import { Search } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PriorityChip, StatusChip, TypeChip } from '@/features/work-packages/chips'

import { type SearchResultItem, useSearch } from './api'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)
  const navigate = useNavigate()

  const { data, isFetching, isError, error, refetch } = useSearch(q)

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

  const open = (item: SearchResultItem) => {
    navigate(`/projects/${item.project_id}/work-packages?wp=${item.id}`)
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <h1 className="mb-1 text-base font-semibold">전체 검색</h1>
      <p className="mb-4 text-xs text-of-muted">내가 속한 모든 프로젝트의 작업을 제목으로 검색합니다.</p>

      <form onSubmit={submit} className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
          />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="작업 제목 검색"
            aria-label="전체 검색어"
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm">
          검색
        </Button>
      </form>

      {!q ? (
        <EmptyState title="검색어를 입력하세요" hint="여러 프로젝트에 걸쳐 작업을 찾을 수 있습니다." />
      ) : isFetching ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.total === 0 ? (
        <EmptyState title={`'${q}' 결과가 없습니다`} />
      ) : (
        <>
          <p className="mb-2 text-xs text-of-muted">{data.total}건</p>
          <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-of-surface-2"
                >
                  <Badge variant="neutral" className="shrink-0 font-mono">
                    {item.project_key}
                  </Badge>
                  <TypeChip type={item.type} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.subject}</span>
                  <StatusChip status={item.status} />
                  <PriorityChip priority={item.priority} />
                  <span className="w-24 shrink-0 text-right text-xs text-of-muted">
                    {item.due_date ?? '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
