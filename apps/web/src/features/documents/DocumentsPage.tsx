import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileText,
  LockKeyhole,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { type DocumentBucket, useCreateDocument, useDocuments } from './api'
import type { DocTreeNode } from './tree'
import { buildDocTree } from './tree'

type DocumentSort = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc'

const BUCKETS: Array<{
  key: DocumentBucket
  label: string
  icon: typeof Users
}> = [
  { key: 'shared', label: '공개', icon: Users },
  { key: 'private', label: '비공개', icon: LockKeyhole },
  { key: 'archived', label: '보관됨', icon: Archive },
]

function documentSortFrom(value: string | null): DocumentSort {
  return value === 'updated_asc' || value === 'title_asc' || value === 'title_desc'
    ? value
    : 'updated_desc'
}

export function DocumentsPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawBucket = params.get('bucket')
  const bucket: DocumentBucket =
    rawBucket === 'private' || rawBucket === 'archived' ? rawBucket : 'shared'
  const query = params.get('q')?.trim() ?? ''
  const sort = documentSortFrom(params.get('sort'))
  const { data, isPending, isError, error, refetch } = useDocuments(projectId, bucket)
  const project = useProject(projectId)
  const create = useCreateDocument(projectId)
  const canWrite = useCanWrite(projectId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined
  const bucketLabel = BUCKETS.find((item) => item.key === bucket)?.label ?? '공개'
  const items = data?.items ?? []
  const normalizedQuery = query.toLocaleLowerCase()
  const searching = normalizedQuery.length > 0
  const visible = items
    .filter((document) => document.title.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === 'title_asc') return left.title.localeCompare(right.title, 'ko')
      if (sort === 'title_desc') return right.title.localeCompare(left.title, 'ko')
      if (sort === 'updated_asc') return left.updated_at.localeCompare(right.updated_at)
      return right.updated_at.localeCompare(left.updated_at)
    })
  const forest = buildDocTree(visible)

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setParams(next, { replace: true })
  }

  const newPage = () => {
    if (bucket === 'archived' || archived || create.isPending) return
    create.mutate(
      { title: '제목 없는 페이지', visibility: bucket },
      { onSuccess: (document) => navigate(`/projects/${projectId}/documents/${document.id}`) },
    )
  }

  const toggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rows: DocTreeNode[] = []
  const flatten = (nodes: DocTreeNode[]) => {
    for (const node of nodes) {
      rows.push(node)
      if (!collapsed.has(node.doc.id)) flatten(node.children)
    }
  }
  flatten(forest)

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">Pages</h1>
      <FrameContextActions>
        {canWrite && bucket !== 'archived' ? (
          <Button
            type="button"
            size="sm"
            disabled={create.isPending || archived}
            aria-busy={create.isPending}
            onClick={newPage}
          >
            <Plus size={14} />
            {create.isPending ? '추가 중' : '페이지 추가'}
          </Button>
        ) : null}
      </FrameContextActions>

      <div className="flex min-w-0 shrink-0 flex-col border-b border-of-border bg-of-surface">
        <div className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-2 px-3">
          <nav aria-label="페이지 범위" className="flex min-w-0 items-stretch gap-1 overflow-x-auto">
            {BUCKETS.map((item) => {
              const Icon = item.icon
              const active = bucket === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex h-10 shrink-0 items-center gap-1.5 px-2 text-xs font-medium text-of-muted transition-colors hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
                    active && 'text-of-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-of-accent',
                  )}
                  onClick={() => {
                    setCollapsed(new Set())
                    updateParams({
                      bucket: item.key === 'shared' ? null : item.key,
                      q: null,
                    })
                  }}
                >
                  <Icon size={13} aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted" aria-live="polite">
            {rows.length}/{data?.total ?? 0}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-of-border-subtle px-3 py-1.5">
          <label className="relative min-w-40 flex-1 sm:max-w-64">
            <span className="sr-only">페이지 검색</span>
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-of-muted"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => updateParams({ q: event.target.value || null })}
              placeholder="페이지 검색"
              aria-label="페이지 검색"
              className="h-7 pl-7 pr-7 text-xs"
            />
            {query ? (
              <button
                type="button"
                aria-label="페이지 검색 지우기"
                className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover"
                onClick={() => updateParams({ q: null })}
              >
                <X size={12} />
              </button>
            ) : null}
          </label>
          <Select
            aria-label="페이지 정렬"
            value={sort}
            className="h-7 w-32 text-xs"
            onChange={(event) =>
              updateParams({
                sort: event.target.value === 'updated_desc' ? null : event.target.value,
              })
            }
          >
            <option value="updated_desc">최근 수정</option>
            <option value="updated_asc">오래된 수정</option>
            <option value="title_asc">제목 오름차순</option>
            <option value="title_desc">제목 내림차순</option>
          </Select>
        </div>
      </div>

      <main
        data-testid="pages-scroll"
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg"
      >
        {!canWrite ? <ReadOnlyNotice className="mx-3 mt-3" /> : null}
        {create.isError ? (
          <p role="alert" className="mx-3 mt-3 text-xs text-of-danger">
            페이지를 만들지 못했습니다. 잠시 후 다시 시도하세요.
          </p>
        ) : null}

        {isPending ? (
          <div className="p-3 sm:p-5">
            <ListSkeleton />
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : data.total === 0 ? (
          <EmptyState
            title={`${bucketLabel} 페이지가 없습니다`}
            hint={
              bucket === 'archived'
                ? '보관한 페이지가 여기에 표시됩니다.'
                : canWrite
                  ? '페이지 추가에서 첫 프로젝트 문서를 만들어 보세요.'
                  : '프로젝트 작성자가 페이지를 만들 수 있습니다.'
            }
          >
            {canWrite && !archived && bucket !== 'archived' ? (
              <Button type="button" size="sm" disabled={create.isPending} onClick={newPage}>
                <Plus size={14} />
                페이지 추가
              </Button>
            ) : null}
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState
            title="조건에 맞는 페이지가 없습니다"
            hint="다른 페이지 제목으로 다시 검색하세요."
          >
            <Button type="button" variant="outline" size="sm" onClick={() => updateParams({ q: null })}>
              검색 지우기
            </Button>
          </EmptyState>
        ) : (
          <section aria-label={`${bucketLabel} 페이지`} className="min-w-0 py-2">
            <ul className="min-w-0 divide-y divide-of-border border-y border-of-border bg-of-surface">
              {rows.map(({ doc, depth, children }) => (
                <li key={doc.id}>
                  <div
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 px-3 py-2 hover:bg-of-surface-hover"
                    style={{ paddingLeft: `${12 + Math.min(depth, 4) * 18}px` }}
                  >
                    {children.length > 0 && !searching ? (
                      <button
                        type="button"
                        aria-label={collapsed.has(doc.id) ? '펼치기' : '접기'}
                        className="grid size-6 shrink-0 place-items-center rounded-of text-of-muted hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                        onClick={() => toggle(doc.id)}
                      >
                        {collapsed.has(doc.id) ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    ) : (
                      <span className="size-6 shrink-0" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectId}/documents/${doc.id}`)}
                      className="grid min-w-0 gap-1 rounded-of text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText size={15} className="shrink-0 text-of-muted" />
                        <span className="min-w-0 truncate text-sm font-medium">{doc.title}</span>
                        {doc.visibility === 'private' ? (
                          <LockKeyhole
                            size={12}
                            className="shrink-0 text-of-muted"
                            aria-label="비공개"
                          />
                        ) : null}
                        {doc.archived_at ? <Badge variant="outline">보관됨</Badge> : null}
                        {children.length > 0 && !searching ? (
                          <span className="shrink-0 text-[11px] text-of-muted">
                            하위 {children.length}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-[11px] text-of-muted sm:justify-end">
                        <span>{doc.parent_id ? '하위 페이지' : '최상위'}</span>
                        <span>{formatDateTime(doc.updated_at)}</span>
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
