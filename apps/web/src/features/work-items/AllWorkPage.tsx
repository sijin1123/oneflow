import { ListChecks, RefreshCw, Search, X } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataGrid, DataGridFrame, DensityControl, type GridDensity } from '@/components/ui/data-grid'
import { Input } from '@/components/ui/input'
import { PageHeader, Toolbar } from '@/components/ui/surface'
import { useWorkspaceWorkItems } from '@/features/search/api'
import { PriorityChip, StatusChip, TypeChip } from '@/features/work-packages/chips'

export function AllWorkPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [density, setDensity] = useState<GridDensity>('comfortable')
  const { data, isPending, isFetching, isError, error, refetch } = useWorkspaceWorkItems(q)

  useEffect(() => {
    setInput(q)
  }, [q])

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

  const openWorkItem = (projectId: string, workPackageId: string) => {
    navigate(`/projects/${projectId}/work-packages/${workPackageId}`)
  }

  const countText = data
    ? data.items.length < data.total
      ? `${data.total}건 중 ${data.items.length}건`
      : `${data.total}건`
    : ' '

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <PageHeader
        icon={<ListChecks />}
        title="전체 작업"
        eyebrow="워크스페이스"
        description={<span aria-live="polite">{countText}{isFetching && !isPending ? ' · 업데이트 중' : ''}</span>}
      />
      <Toolbar className="justify-between">
        <form onSubmit={submit} className="flex w-full min-w-0 gap-2 sm:max-w-xl sm:flex-1">
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
            {input ? (
              <button
                type="button"
                aria-label="입력 지우기"
                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={clearSearch}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
          <Button type="submit" size="sm">
            <Search size={13} /> 검색
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="전체 작업 새로고침"
            className="h-7 w-7"
            onClick={() => refetch()}
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : undefined} />
          </Button>
        </form>
        <div className="hidden lg:block">
          <DensityControl value={density} onChange={setDensity} />
        </div>
      </Toolbar>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={q ? '검색 결과가 없습니다' : '작업이 없습니다'}
          hint={q ? '검색어를 지우거나 다른 단어로 다시 찾아보세요.' : undefined}
          visual="illustration"
        />
      ) : (
        <DataGridFrame density={density} className="flex-1" aria-label="전체 작업 표 스크롤 영역">
          <DataGrid className="min-w-[1040px] table-fixed text-left">
            <thead className="sticky top-0 z-10 bg-of-surface/95 backdrop-blur">
              <tr className="border-b border-of-border text-[11px] font-medium text-of-muted">
                <th className="h-9 w-[24%] px-4">작업</th>
                <th className="h-9 w-[15%] px-3">프로젝트</th>
                <th className="h-9 w-[9%] px-3">상태</th>
                <th className="h-9 w-[9%] px-3">우선순위</th>
                <th className="h-9 w-[8%] px-3">타입</th>
                <th className="h-9 w-[8%] px-3">담당자</th>
                <th className="h-9 w-[9%] whitespace-nowrap px-2">시작일</th>
                <th className="h-9 w-[9%] whitespace-nowrap px-2">기한</th>
                <th className="h-9 w-[9%] whitespace-nowrap px-2">수정일</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  className="group border-b border-of-border transition-colors hover:bg-of-surface-hover focus-within:bg-of-surface-hover"
                >
                  <td className="h-10 px-4">
                    <button
                      type="button"
                      className="block w-full truncate rounded-of text-left text-[13px] font-medium text-of-text transition-colors hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface"
                      onClick={() => openWorkItem(item.project_id, item.id)}
                    >
                      {item.subject}
                    </button>
                  </td>
                  <td className="h-10 px-3">
                    <span className="flex min-w-0 items-center gap-1.5">
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
                  <td className="h-10 truncate px-3 text-of-muted">
                    {item.assignee_name ?? '—'}
                  </td>
                  <td className="h-10 whitespace-nowrap px-2 text-of-muted">
                    {dateOnly(item.start_date)}
                  </td>
                  <td className="h-10 whitespace-nowrap px-2 text-of-muted">
                    {dateOnly(item.due_date)}
                  </td>
                  <td className="h-10 whitespace-nowrap px-2 text-of-muted">
                    {dateOnly(item.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataGrid>
        </DataGridFrame>
      )}
    </div>
  )
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '—'
}
