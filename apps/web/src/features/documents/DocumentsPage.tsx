import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileSearch,
  FileText,
  FolderTree,
  Archive,
  LockKeyhole,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { type DocumentBucket, useCreateDocument, useDocuments } from './api'
import type { DocTreeNode } from './tree'
import { buildDocTree } from './tree'

export function DocumentsPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawBucket = params.get('bucket')
  const bucket: DocumentBucket =
    rawBucket === 'private' || rawBucket === 'archived' ? rawBucket : 'shared'
  const { data, isPending, isError, error, refetch } = useDocuments(projectId, bucket)
  const project = useProject(projectId)
  const create = useCreateDocument(projectId)
  const canWrite = useCanWrite(projectId)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const newDoc = () => {
    if (bucket === 'archived') return
    create.mutate(
      { title: '제목 없는 문서', visibility: bucket },
      { onSuccess: (doc) => navigate(`/projects/${projectId}/documents/${doc.id}`) },
    )
  }

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const items = data?.items ?? []
  const visible = items.filter((d) => d.title.toLowerCase().includes(q))
  const forest = buildDocTree(searching ? visible : items)
  const rootCount = items.filter((d) => d.parent_id === null).length
  const nestedCount = Math.max(0, items.length - rootCount)
  const lastUpdated = items[0]?.updated_at ?? null
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined
  const bucketLabel = { shared: '공유', private: '비공개', archived: '보관됨' }[bucket]

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
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
    <div className="flex h-full w-full min-w-0 flex-col bg-of-bg">
      <header className="border-b border-of-border bg-of-surface px-4 py-2">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Wiki</h1>
            <p className="mt-0.5 truncate text-[11px] text-of-muted">
              {project.data?.name ?? '프로젝트'} · {bucketLabel}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {project.data ? <Badge variant="outline">{project.data.key}</Badge> : null}
            <Badge variant={archived ? 'outline' : 'accent'}>{archived ? '보관됨' : '활성'}</Badge>
            <Badge variant="outline">{bucketLabel} {data?.total ?? 0}</Badge>
            {canWrite && bucket !== 'archived' ? (
              <Button size="sm" disabled={create.isPending || archived} onClick={newDoc}>
                <Plus size={14} /> 새 문서
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      {!canWrite ? <ReadOnlyNotice className="mx-4 mt-3" /> : null}

      <nav aria-label="문서 범위" className="flex min-w-0 gap-1 overflow-x-auto border-b border-of-border bg-of-surface px-4 py-2">
        {[
          { key: 'shared', label: '공유', icon: Users },
          { key: 'private', label: '비공개', icon: LockKeyhole },
          { key: 'archived', label: '보관됨', icon: Archive },
        ].map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              aria-current={bucket === item.key ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-of px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                bucket === item.key
                  ? 'bg-of-accent-soft text-of-accent'
                  : 'text-of-muted hover:bg-of-surface-2 hover:text-of-text',
              )}
              onClick={() => {
                setQuery('')
                setCollapsed(new Set())
                setParams(item.key === 'shared' ? {} : { bucket: item.key })
              }}
            >
              <Icon size={13} aria-hidden="true" /> {item.label}
            </button>
          )
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-2 border-b border-of-border bg-of-surface px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Wiki 검색"
            aria-label="문서 제목 검색"
            className="h-7 pl-8 text-xs"
          />
        </label>
        <span className="shrink-0 text-xs text-of-muted" aria-live="polite">
          {searching ? `검색 결과 ${rows.length}` : `${data?.total ?? 0}개 페이지`}
        </span>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState
          title={`${bucketLabel} 문서가 없습니다`}
          hint={bucket === 'archived' ? '보관한 문서가 여기에 표시됩니다.' : '새 문서를 만들어 회의록·위키·정책을 정리하세요.'}
        >
          {canWrite && !archived && bucket !== 'archived' ? (
            <Button size="sm" disabled={create.isPending} onClick={newDoc}>
              <Plus size={14} /> 새 문서
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="grid min-w-0 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-label="문서 트리" className="min-w-0">
            {rows.length === 0 ? (
              <EmptyState
                title="검색 결과가 없습니다"
                hint="다른 문서 제목이나 키워드로 다시 검색하세요."
                className="min-h-[220px] rounded-of border border-of-border bg-of-surface"
              />
            ) : (
              <ul className="min-w-0 divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                {rows.map(({ doc, depth, children }) => (
                  <li key={doc.id}>
                    <div
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 px-3 py-2.5 hover:bg-of-surface-2"
                      style={{ paddingLeft: `${12 + Math.min(depth, 4) * 18}px` }}
                    >
                      {children.length > 0 && !searching ? (
                        <button
                          type="button"
                          aria-label={collapsed.has(doc.id) ? '펼치기' : '접기'}
                          className="shrink-0 rounded-of p-0.5 text-of-muted hover:bg-of-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                          onClick={() => toggle(doc.id)}
                        >
                          {collapsed.has(doc.id) ? (
                            <ChevronRight size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                      ) : (
                        <span className="w-[19px] shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${projectId}/documents/${doc.id}`)}
                        className="grid min-w-0 gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText size={15} className="shrink-0 text-of-muted" />
                          <span className="min-w-0 truncate text-sm font-medium">{doc.title}</span>
                          {doc.visibility === 'private' ? <LockKeyhole size={12} className="shrink-0 text-of-muted" aria-label="비공개" /> : null}
                          {doc.archived_at ? <Badge variant="outline">보관됨</Badge> : null}
                          {children.length > 0 && !searching ? (
                            <span className="shrink-0 text-[11px] text-of-muted">
                              하위 {children.length}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-of-muted sm:justify-end">
                          <span>{doc.parent_id ? '하위 문서' : '최상위'}</span>
                          <span>{formatDateTime(doc.updated_at)}</span>
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside aria-label="문서 요약" className="grid min-w-0 gap-2 self-start">
            {[
              { label: '전체 문서', value: String(data.total), icon: FileText },
              { label: '최상위', value: String(rootCount), icon: FolderTree },
              { label: '하위 문서', value: String(nestedCount), icon: FileSearch },
              {
                label: '최근 수정',
                value: lastUpdated ? formatDateTime(lastUpdated) : '-',
                icon: Clock3,
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className={cn(
                    'flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3',
                    item.label === '최근 수정' && 'sm:items-start',
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-of-muted">{item.label}</span>
                    <span className="block truncate text-sm font-medium">{item.value}</span>
                  </span>
                </div>
              )
            })}
          </aside>
        </div>
      )}
    </div>
  )
}
