import * as Dialog from '@radix-ui/react-dialog'
import {
  Archive,
  FileText,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMe } from '@/features/members/api'
import { useProjects } from '@/features/projects/api'
import { formatDateTime } from '@/lib/datetime'

import {
  type DocumentBucket,
  type DocumentListItem,
  useCreateDocument,
  useDocumentLifecycle,
  useWorkspaceDocuments,
} from './api'

type WorkspaceDocument = DocumentListItem & {
  projectName: string
}

type WikiSort = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc'

const BUCKETS: Array<{ key: DocumentBucket; label: string; icon: typeof Users }> = [
  { key: 'shared', label: '공유', icon: Users },
  { key: 'private', label: '비공개', icon: LockKeyhole },
  { key: 'archived', label: '보관됨', icon: Archive },
]

function wikiSortFrom(value: string | null): WikiSort {
  return value === 'updated_asc' || value === 'title_asc' || value === 'title_desc'
    ? value
    : 'updated_desc'
}

function bucketHref(bucket: DocumentBucket, params: URLSearchParams) {
  const next = new URLSearchParams(params)
  if (bucket === 'shared') next.delete('bucket')
  else next.set('bucket', bucket)
  const search = next.toString()
  return search ? `/wiki?${search}` : '/wiki'
}

function WikiDocumentRow({
  document,
  canManageLifecycle,
}: {
  document: WorkspaceDocument
  canManageLifecycle: boolean
}) {
  const lifecycle = useDocumentLifecycle(document.project_id)
  const archived = document.archived_at !== null
  const actionLabel = archived ? '복원' : '보관'

  const runLifecycle = () => {
    lifecycle.mutate({
      docId: document.id,
      expectedVersion: document.version,
      archived: !archived,
    })
  }

  return (
    <li className="relative min-w-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-stretch">
        <Link
          to={`/projects/${document.project_id}/documents/${document.id}`}
          className="grid min-h-14 min-w-0 gap-1 px-4 py-2.5 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_11rem_8rem] sm:items-center sm:px-6"
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileText size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
            <span className="truncate text-sm font-medium">{document.title}</span>
            {document.visibility === 'private' ? (
              <LockKeyhole
                size={12}
                className="shrink-0 text-of-muted"
                aria-label="비공개"
              />
            ) : null}
          </span>
          <span className="min-w-0 truncate pl-6 text-xs text-of-muted sm:pl-0">
            {document.projectName}
          </span>
          <span className="pl-6 text-xs text-of-muted sm:pl-0 sm:text-right">
            {formatDateTime(document.updated_at)}
          </span>
        </Link>
        {canManageLifecycle ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${document.title} 페이지 작업`}
                disabled={lifecycle.isPending}
                className="my-2 mr-2 grid min-h-9 min-w-9 place-items-center self-start rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-50"
              >
                {lifecycle.isPending ? (
                  <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                ) : (
                  <MoreHorizontal size={15} aria-hidden="true" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={runLifecycle} className="flex items-center gap-2">
                {archived ? (
                  <RotateCcw size={14} aria-hidden="true" />
                ) : (
                  <Archive size={14} aria-hidden="true" />
                )}
                {actionLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {lifecycle.isError ? (
        <div
          role="alert"
          className="flex min-h-8 items-center justify-between gap-2 border-t border-of-danger/20 bg-of-danger/5 px-4 py-1.5 text-xs text-of-danger sm:px-6"
        >
          <span>페이지를 {actionLabel}하지 못했습니다.</span>
          <button
            type="button"
            className="shrink-0 font-medium underline underline-offset-2"
            onClick={runLifecycle}
          >
            다시 시도
          </button>
        </div>
      ) : null}
    </li>
  )
}

export function WikiHomePage() {
  const navigate = useNavigate()
  const me = useMe()
  const projects = useProjects()
  const [params, setParams] = useSearchParams()
  const rawBucket = params.get('bucket')
  const bucket: DocumentBucket =
    rawBucket === 'private' || rawBucket === 'archived' ? rawBucket : 'shared'
  const query = params.get('q')?.trim() ?? ''
  const projectFilter = params.get('project') ?? 'all'
  const sort = wikiSortFrom(params.get('sort'))
  const projectItems = useMemo(() => projects.data?.items ?? [], [projects.data])
  const writableProjects = projectItems.filter(
    (project) => project.current_user_role !== 'viewer' && project.archived_at === null,
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [createProjectId, setCreateProjectId] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createVisibility, setCreateVisibility] = useState<'shared' | 'private'>(
    bucket === 'private' ? 'private' : 'shared',
  )
  const createTriggerRef = useRef<HTMLElement | null>(null)
  const create = useCreateDocument(createProjectId)
  const workspaceDocuments = useWorkspaceDocuments(bucket)
  const projectNames = new Map(projectItems.map((project) => [project.id, project.name]))
  const projectRoles = new Map(
    projectItems.map((project) => [project.id, project.current_user_role]),
  )
  const archivedProjects = new Set(
    projectItems.filter((project) => project.archived_at !== null).map((project) => project.id),
  )
  const loading = projects.isPending || workspaceDocuments.isPending || me.isPending
  const documents: WorkspaceDocument[] = (workspaceDocuments.data?.items ?? []).map(
    (document) => ({
      ...document,
      projectName: projectNames.get(document.project_id) ?? '프로젝트',
    }),
  )
  const normalizedQuery = query.toLocaleLowerCase()
  const visibleDocuments = documents
    .filter((document) => {
      const matchesProject =
        projectFilter === 'all' || document.project_id === projectFilter
      const matchesQuery =
        normalizedQuery.length === 0 ||
        document.title.toLocaleLowerCase().includes(normalizedQuery) ||
        document.projectName.toLocaleLowerCase().includes(normalizedQuery)
      return matchesProject && matchesQuery
    })
    .sort((left, right) => {
      if (sort === 'title_asc') return left.title.localeCompare(right.title, 'ko')
      if (sort === 'title_desc') return right.title.localeCompare(left.title, 'ko')
      if (sort === 'updated_asc') return left.updated_at.localeCompare(right.updated_at)
      return right.updated_at.localeCompare(left.updated_at)
    })
  const bucketLabel = BUCKETS.find((item) => item.key === bucket)?.label ?? '공유'
  const activeFilters = Number(query.length > 0) + Number(projectFilter !== 'all')

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search)
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value)
        else next.delete(key)
      })
      setParams(next, { replace: true })
    },
    [setParams],
  )

  const openCreate = () => {
    if (bucket === 'archived' || writableProjects.length === 0) return
    createTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    create.reset()
    setCreateProjectId(writableProjects[0]?.id ?? '')
    setCreateTitle('')
    setCreateVisibility(bucket === 'private' ? 'private' : 'shared')
    setCreateOpen(true)
  }

  const submitCreate = () => {
    const title = createTitle.trim()
    if (!createProjectId || !title || create.isPending) return
    create.mutate(
      { title, visibility: createVisibility },
      {
        onSuccess: (document) => {
          setCreateOpen(false)
          navigate(`/projects/${document.project_id}/documents/${document.id}`)
        },
      },
    )
  }

  useEffect(() => {
    if (!projects.data) return
    if (projectFilter !== 'all' && !projectItems.some((project) => project.id === projectFilter)) {
      updateParams({ project: null })
    }
  }, [projectFilter, projectItems, projects.data, updateParams])

  if (projects.isError) {
    return <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
  }
  if (workspaceDocuments.isError) {
    return <ErrorState error={workspaceDocuments.error} onRetry={() => workspaceDocuments.refetch()} />
  }
  if (me.isError) {
    return <ErrorState error={me.error} onRetry={() => me.refetch()} />
  }

  return (
    <section aria-label="Wiki 홈" className="flex min-h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">{bucketLabel} Wiki 문서</h1>
      <FrameContextActions>
        <div role="toolbar" aria-label="Wiki 화면 제어" className="flex items-center gap-1.5">
          <span className="px-1 text-xs tabular-nums text-of-muted">
            {visibleDocuments.length}/{workspaceDocuments.data?.total ?? 0}
          </span>
          {bucket !== 'archived' && writableProjects.length > 0 ? (
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus size={14} aria-hidden="true" />
              페이지 추가
            </Button>
          ) : null}
        </div>
      </FrameContextActions>

      <nav
        aria-label="Wiki 문서 범위"
        className="grid min-w-0 shrink-0 grid-cols-3 border-b border-of-border-subtle bg-of-surface px-2 pt-1 sm:flex sm:px-3"
      >
        {BUCKETS.map((item) => {
          const Icon = item.icon
          const active = item.key === bucket
          return (
            <Link
              key={item.key}
              to={bucketHref(item.key, params)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-9 min-w-0 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:min-w-24 ${
                active
                  ? 'border-of-accent text-of-text'
                  : 'border-transparent text-of-muted hover:border-of-border hover:text-of-text'
              }`}
            >
              <Icon size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
              {active ? (
                <span className="rounded-of bg-of-surface-muted px-1 text-[10px] tabular-nums text-of-muted">
                  {workspaceDocuments.data?.total ?? 0}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="grid min-w-0 shrink-0 grid-cols-2 items-center gap-2 border-b border-of-border-subtle px-3 py-2 sm:flex">
        <label className="relative col-span-2 min-w-0 flex-1 sm:max-w-72">
          <span className="sr-only">Wiki 검색</span>
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-of-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => updateParams({ q: event.target.value || null })}
            placeholder={`${bucketLabel} 문서 검색`}
            aria-label="Wiki 검색"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {query ? (
            <button
              type="button"
              aria-label="Wiki 검색 지우기"
              className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover"
              onClick={() => updateParams({ q: null })}
            >
              <X size={12} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <Select
          value={projectFilter}
          onChange={(event) =>
            updateParams({ project: event.target.value === 'all' ? null : event.target.value })
          }
          aria-label="Wiki 프로젝트 필터"
          className="h-7 min-w-0 w-full text-xs sm:w-44 sm:flex-none"
        >
          <option value="all">전체 프로젝트</option>
          {projectItems.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(event) =>
            updateParams({
              sort: event.target.value === 'updated_desc' ? null : event.target.value,
            })
          }
          aria-label="Wiki 정렬"
          className="h-7 min-w-0 w-full text-xs sm:w-36 sm:flex-none"
        >
          <option value="updated_desc">최근 수정</option>
          <option value="updated_asc">오래된 수정</option>
          <option value="title_asc">제목 오름차순</option>
          <option value="title_desc">제목 내림차순</option>
        </Select>
        {activeFilters > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="col-span-2 justify-self-end sm:col-auto"
            onClick={() => updateParams({ q: null, project: null })}
          >
            필터 초기화 {activeFilters}
          </Button>
        ) : null}
      </div>

      <main className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg">
        {loading ? (
          <ListSkeleton rows={7} />
        ) : projectItems.length === 0 ? (
          <EmptyState
            title="접근 가능한 Wiki 공간이 없습니다"
            hint="프로젝트를 만들거나 프로젝트 멤버로 참여하면 Wiki 공간이 여기에 표시됩니다."
          >
            <Link to="/projects" className="text-xs font-medium text-of-accent hover:underline">
              프로젝트로 이동
            </Link>
          </EmptyState>
        ) : visibleDocuments.length === 0 ? (
          <EmptyState
            title={
              activeFilters > 0 ? '검색 결과가 없습니다' : `${bucketLabel} 문서가 없습니다`
            }
            hint={
              bucket === 'archived'
                ? '보관한 문서가 여기에 표시됩니다.'
                : '새 페이지를 만들어 프로젝트 지식을 정리해 보세요.'
            }
            className="min-h-full"
          >
            {bucket !== 'archived' && writableProjects.length > 0 && activeFilters === 0 ? (
              <Button type="button" size="sm" onClick={openCreate}>
                첫 페이지 만들기
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <ul
            aria-label={`${bucketLabel} Wiki 문서`}
            className="min-w-0 divide-y divide-of-border-subtle border-b border-of-border-subtle bg-of-surface"
          >
            {visibleDocuments.map((document) => {
              const role = projectRoles.get(document.project_id)
              const canManageLifecycle =
                !archivedProjects.has(document.project_id) &&
                role !== 'viewer' &&
                (document.author_id === me.data?.id || role === 'owner')
              return (
                <WikiDocumentRow
                  key={document.id}
                  document={document}
                  canManageLifecycle={canManageLifecycle}
                />
              )
            })}
          </ul>
        )}
      </main>

      <Dialog.Root
        open={createOpen}
        onOpenChange={(open) => {
          if (create.isPending) return
          setCreateOpen(open)
          if (!open) create.reset()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-81 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              createTriggerRef.current?.focus()
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submitCreate()
              }}
            >
              <div className="border-b border-of-border px-5 py-4">
                <Dialog.Title className="text-base font-semibold">페이지 추가</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                  페이지를 만들 프로젝트와 공개 범위를 선택하세요.
                </Dialog.Description>
              </div>
              <div className="space-y-4 px-5 py-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">제목</span>
                  <Input
                    autoFocus
                    value={createTitle}
                    maxLength={255}
                    onChange={(event) => setCreateTitle(event.target.value)}
                    placeholder="페이지 제목"
                    aria-label="새 페이지 제목"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">프로젝트</span>
                  <Select
                    value={createProjectId}
                    onChange={(event) => setCreateProjectId(event.target.value)}
                    aria-label="새 페이지 프로젝트"
                  >
                    {writableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">공개 범위</span>
                  <Select
                    value={createVisibility}
                    onChange={(event) =>
                      setCreateVisibility(event.target.value === 'private' ? 'private' : 'shared')
                    }
                    aria-label="새 페이지 공개 범위"
                  >
                    <option value="shared">프로젝트 공유</option>
                    <option value="private">나만 보기</option>
                  </Select>
                </label>
                {create.isError ? (
                  <p role="alert" className="text-xs text-of-danger">
                    페이지를 만들지 못했습니다. 입력과 권한을 확인한 뒤 다시 시도하세요.
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-of-border px-5 py-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => setCreateOpen(false)}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={!createProjectId || !createTitle.trim() || create.isPending}
                  aria-busy={create.isPending}
                >
                  {create.isPending ? '추가 중' : '페이지 추가'}
                </Button>
              </div>
            </form>
            <button
              type="button"
              aria-label="페이지 추가 창 닫기"
              disabled={create.isPending}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => setCreateOpen(false)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
