import { Search } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspaceWorkItems } from '@/features/search/api'
import { PriorityChip, StatusChip, TypeChip } from '@/features/work-packages/chips'

export function AllWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)
  const { data, isFetching, isError, error, refetch } = useWorkspaceWorkItems(q)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const trimmed = input.trim()
      if (trimmed) next.set('q', trimmed)
      else next.delete('q')
      return next
    })
  }

  const openWorkItem = (projectId: string, workPackageId: string) => {
    navigate(`/projects/${projectId}/work-packages?wp=${workPackageId}`)
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-of-border px-4 py-2">
        <div className="min-w-0 sm:flex-1">
          <h1 className="truncate text-sm font-semibold">전체 작업</h1>
          <p className="text-xs text-of-muted">
            {data ? `${data.total}건` : ' '}
            {data && data.items.length < data.total ? ` 중 ${data.items.length}건 표시` : ''}
          </p>
        </div>
        <form onSubmit={submit} className="flex w-full min-w-0 gap-2 sm:max-w-md sm:flex-1">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
            />
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="작업 검색"
              aria-label="전체 작업 검색어"
              className="h-7 pl-8 text-xs"
            />
          </div>
          <Button type="submit" size="sm">
            검색
          </Button>
        </form>
      </div>

      {isFetching ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <div className="p-6 text-sm text-of-muted">작업이 없습니다.</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[980px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-of-surface">
              <tr className="border-b border-of-border text-[11px] font-medium text-of-muted">
                <th className="w-[34%] px-4 py-2">작업</th>
                <th className="px-3 py-2">프로젝트</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">우선순위</th>
                <th className="px-3 py-2">타입</th>
                <th className="px-3 py-2">담당자</th>
                <th className="px-3 py-2">시작일</th>
                <th className="px-3 py-2">기한</th>
                <th className="px-3 py-2">수정일</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-of-border hover:bg-of-surface-2/70">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="block max-w-full truncate text-left font-medium hover:text-of-accent"
                      onClick={() => openWorkItem(item.project_id, item.id)}
                    >
                      {item.subject}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex max-w-44 items-center gap-1.5">
                      <Badge variant="neutral" className="shrink-0 font-mono">
                        {item.project_key}
                      </Badge>
                      <span className="truncate text-of-muted">{item.project_name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={item.status} />
                  </td>
                  <td className="px-3 py-2">
                    <PriorityChip priority={item.priority} />
                  </td>
                  <td className="px-3 py-2">
                    <TypeChip type={item.type} />
                  </td>
                  <td className="max-w-36 truncate px-3 py-2 text-of-muted">
                    {item.assignee_name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-of-muted">{dateOnly(item.start_date)}</td>
                  <td className="px-3 py-2 text-of-muted">{dateOnly(item.due_date)}</td>
                  <td className="px-3 py-2 text-of-muted">{dateOnly(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '—'
}
