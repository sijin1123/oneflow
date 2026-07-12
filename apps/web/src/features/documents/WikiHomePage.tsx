import { Archive, FileText, FolderKanban, LockKeyhole, Search, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useProjects } from '@/features/projects/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { type DocumentBucket, type DocumentListItem, useWorkspaceDocuments } from './api'

type WorkspaceDocument = DocumentListItem & {
  projectName: string
}

const buckets: Array<{ key: DocumentBucket; label: string; icon: typeof Users }> = [
  { key: 'shared', label: '공유', icon: Users },
  { key: 'private', label: '비공개', icon: LockKeyhole },
  { key: 'archived', label: '보관됨', icon: Archive },
]

export function WikiHomePage() {
  const projects = useProjects()
  const [params, setParams] = useSearchParams()
  const rawBucket = params.get('bucket')
  const bucket: DocumentBucket =
    rawBucket === 'private' || rawBucket === 'archived' ? rawBucket : 'shared'
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const projectItems = projects.data?.items ?? []
  const workspaceDocuments = useWorkspaceDocuments(bucket)
  const projectNames = new Map(projectItems.map((project) => [project.id, project.name]))
  const loading = projects.isPending || workspaceDocuments.isPending
  const documents: WorkspaceDocument[] = (workspaceDocuments.data?.items ?? []).map((document) => ({
    ...document,
    projectName: projectNames.get(document.project_id) ?? '프로젝트',
  }))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleDocuments = documents.filter((document) => {
    const matchesProject = projectFilter === 'all' || document.project_id === projectFilter
    const matchesQuery =
      normalizedQuery.length === 0 ||
      document.title.toLocaleLowerCase().includes(normalizedQuery) ||
      document.projectName.toLocaleLowerCase().includes(normalizedQuery)
    return matchesProject && matchesQuery
  })
  const bucketLabel = buckets.find((item) => item.key === bucket)?.label ?? '공유'

  useEffect(() => {
    setQuery('')
    setProjectFilter('all')
  }, [bucket])

  if (projects.isError) {
    return <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
  }
  if (workspaceDocuments.isError) {
    return <ErrorState error={workspaceDocuments.error} onRetry={() => workspaceDocuments.refetch()} />
  }

  return (
    <section aria-label="Wiki 홈" className="flex min-h-full min-w-0 flex-col bg-of-bg">
      <header className="border-b border-of-border bg-of-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold">Wiki</h1>
            <p className="mt-0.5 text-xs text-of-muted">
              프로젝트 지식과 문서를 한곳에서 탐색합니다.
            </p>
          </div>
          <Badge variant="outline">{projectItems.length}개 프로젝트 공간</Badge>
        </div>
      </header>

      <nav aria-label="Wiki 문서 범위" className="flex min-w-0 gap-1 overflow-x-auto border-b border-of-border bg-of-surface px-4 py-2 sm:px-6">
        {buckets.map((item) => {
          const Icon = item.icon
          const active = bucket === item.key
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-of px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                active
                  ? 'bg-of-accent-soft text-of-accent'
                  : 'text-of-muted hover:bg-of-surface-2 hover:text-of-text',
              )}
              onClick={() => {
                setParams(item.key === 'shared' ? {} : { bucket: item.key })
              }}
            >
              <Icon size={13} aria-hidden="true" /> {item.label}
            </button>
          )
        })}
      </nav>

      <div className="grid min-w-0 gap-2 border-b border-of-border bg-of-surface px-4 py-2 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-6">
        <label className="relative min-w-0">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="문서 또는 프로젝트 검색"
            aria-label="Wiki 검색"
            className="h-8 pl-8 text-xs"
          />
        </label>
        <Select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          aria-label="Wiki 프로젝트 필터"
          className="text-xs"
        >
          <option value="all">전체 프로젝트</option>
          {projectItems.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : projectItems.length === 0 ? (
        <EmptyState
          title="접근 가능한 Wiki 공간이 없습니다"
          hint="프로젝트를 만들거나 프로젝트 멤버로 참여하면 Wiki 공간이 여기에 표시됩니다."
        >
          <Link to="/projects" className="text-xs font-medium text-of-accent hover:underline">
            프로젝트로 이동
          </Link>
        </EmptyState>
      ) : (
        <div className="grid min-w-0 gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-label={`${bucketLabel} Wiki 문서`} className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{bucketLabel} 문서</h2>
              <span className="text-xs text-of-muted">{visibleDocuments.length}개</span>
            </div>
            {visibleDocuments.length === 0 ? (
              <EmptyState
                title={normalizedQuery || projectFilter !== 'all' ? '검색 결과가 없습니다' : `${bucketLabel} 문서가 없습니다`}
                hint={bucket === 'archived' ? '보관한 문서가 여기에 표시됩니다.' : '프로젝트 Wiki 공간에서 새 문서를 만들 수 있습니다.'}
                className="min-h-[260px] rounded-of border border-of-border bg-of-surface"
              />
            ) : (
              <ul className="min-w-0 divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                {visibleDocuments.map((document) => (
                  <li key={document.id}>
                    <Link
                      to={`/projects/${document.project_id}/documents/${document.id}`}
                      className="grid min-w-0 gap-1 px-3 py-2.5 hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
                        <span className="truncate text-sm font-medium">{document.title}</span>
                        {document.visibility === 'private' ? <LockKeyhole size={12} className="shrink-0 text-of-muted" aria-label="비공개" /> : null}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-xs text-of-muted">
                        <span className="truncate">{document.projectName}</span>
                        <span className="shrink-0">{formatDateTime(document.updated_at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside aria-label="프로젝트 Wiki 공간" className="min-w-0 self-start">
            <h2 className="mb-2 text-sm font-semibold">프로젝트 공간</h2>
            <div className="space-y-1.5">
              {projectItems.map((project) => {
                const count = documents.filter((document) => document.project_id === project.id).length
                const href = `/projects/${project.id}/documents${bucket === 'shared' ? '' : `?bucket=${bucket}`}`
                return (
                  <Link
                    key={project.id}
                    to={href}
                    className="flex min-w-0 items-center gap-2 rounded-of border border-of-border bg-of-surface px-3 py-2.5 hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-[10px] font-semibold text-of-muted">
                      {project.key.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{project.name}</span>
                      <span className="block text-[11px] text-of-muted">{bucketLabel} {count}개</span>
                    </span>
                    <FolderKanban size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
