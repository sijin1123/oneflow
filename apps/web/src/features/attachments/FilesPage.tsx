import {
  Database,
  Download,
  ExternalLink,
  FileUp,
  FileSearch,
  HardDrive,
  Link2,
  Loader2,
  type LucideIcon,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState, type RefObject } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocuments } from '@/features/documents/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { useWorkPackages } from '@/features/work-packages/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

import {
  downloadUrl,
  type Attachment,
  type AttachmentDirectoryScope,
  useAttachmentDirectory,
  useCreateAttachment,
  useDeleteAttachment,
  useRebuildAttachmentSearchIndex,
  useUploadAttachment,
} from './api'

const HTTP_URL_RE = /^https?:\/\/.+/i
const DIRECTORY_SCOPES: AttachmentDirectoryScope[] = [
  'all',
  'files',
  'links',
  'linked',
  'pending',
]

const COMPACT_ERROR_STATE_CLASS =
  'min-h-0 justify-start px-0 py-0 text-left sm:px-0 [&>div]:grid [&>div]:w-full [&>div]:max-w-none [&>div]:grid-cols-[2rem_minmax(0,1fr)_auto] [&>div]:items-center [&>div]:gap-x-2 [&>div]:gap-y-0.5 [&>div]:px-3 [&>div]:py-3 [&>div]:text-left [&>div>span]:row-span-2 [&>div>span]:h-8 [&>div>span]:w-8 [&>div>p]:col-start-2 [&_button]:col-start-3 [&_button]:row-span-2 [&_button]:row-start-1 [&_button]:ml-auto [&_button]:mt-0'

type UploadIntent = {
  file: File
  workPackageId?: string
  documentId?: string
}

function fmtSize(bytes: number | null): string {
  if (bytes === null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value))
}

export function FilesPage() {
  const { projectId } = useParams() as { projectId: string }
  return <FilesSurface key={projectId} projectId={projectId} />
}

function FilesSurface({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const scopeValue = searchParams.get('scope')
  const scope = DIRECTORY_SCOPES.includes(scopeValue as AttachmentDirectoryScope)
    ? (scopeValue as AttachmentDirectoryScope)
    : 'all'
  const highlightedFileId = searchParams.get('file')
  const deferredQuery = useDeferredValue(query.trim())
  const directory = useAttachmentDirectory({
    projectId,
    q: deferredQuery,
    scope,
    highlightId: highlightedFileId,
  })
  const project = useProject(projectId)
  const create = useCreateAttachment(projectId)
  const del = useDeleteAttachment(projectId)
  const uploadFile = useUploadAttachment(projectId)
  const rebuildSearch = useRebuildAttachmentSearchIndex(projectId)
  const canWrite = useCanWrite(projectId)
  const capabilities = useWorkspaceCapabilities()
  const fileInput = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLElement>(null)

  const [filename, setFilename] = useState('')
  const [url, setUrl] = useState('')
  const [anchor, setAnchor] = useState('')
  const [failedUpload, setFailedUpload] = useState<UploadIntent | null>(null)
  const [failedDelete, setFailedDelete] = useState<{ id: string; name: string } | null>(null)
  const [notice, setNotice] = useState('')
  const workPackages = useWorkPackages(projectId, {})
  const wps = workPackages.data
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const documentsQuery = useDocuments(projectId, 'shared', wikiEnabled)
  const docs = documentsQuery.data

  const workItems = wps?.items ?? []
  const documents = docs?.items ?? []
  const anchorWp = anchor.startsWith('wp:') ? anchor.slice(3) : ''
  const anchorDoc = anchor.startsWith('doc:') ? anchor.slice(4) : ''
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined
  const canMutate = canWrite && !archived

  const pages = directory.data?.pages ?? []
  const pageItems = Array.from(
    new Map(pages.flatMap((page) => page.items).map((item) => [item.id, item])).values(),
  )
  const highlightedItem = pages[0]?.highlight_item ?? null
  const items = highlightedItem
    ? [highlightedItem, ...pageItems.filter((item) => item.id !== highlightedItem.id)]
    : pageItems
  const summary = pages[0]?.summary ?? {
    total: 0,
    file_count: 0,
    link_count: 0,
    linked_count: 0,
    indexed_file_count: 0,
    pending_index_count: 0,
    used_bytes: 0,
  }
  const filteredTotal = pages[0]?.total ?? 0

  const err = create.error instanceof ApiError ? create.error.message : null
  const urlTrimmed = url.trim()
  const urlValid = urlTrimmed === '' || HTTP_URL_RE.test(urlTrimmed)

  useEffect(() => {
    if (!highlightedFileId || directory.isPending) return
    requestAnimationFrame(() => {
      document
        .getElementById(`attachment-${highlightedFileId}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [directory.isPending, highlightedFileId, items.length])

  const setDirectoryParam = (key: 'q' | 'scope', value: string | null) => {
    const next = new URLSearchParams(searchParams)
    next.delete('file')
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const refreshPending =
    directory.isFetching ||
    project.isFetching ||
    workPackages.isFetching ||
    capabilities.isFetching ||
    documentsQuery.isFetching

  const refreshAll = async () => {
    setNotice('')
    await Promise.allSettled([
      directory.refetch(),
      project.refetch(),
      workPackages.refetch(),
      capabilities.refetch(),
      ...(wikiEnabled ? [documentsQuery.refetch()] : []),
    ])
  }

  const add = async () => {
    if (!filename.trim() || !urlValid || urlTrimmed === '' || create.isPending) return
    create.reset()
    setNotice('')
    try {
      await create.mutateAsync({
        filename: filename.trim(),
        url: urlTrimmed,
        work_package_id: anchorWp || null,
        document_id: anchorDoc || null,
      })
      setFilename('')
      setUrl('')
      setNotice('외부 링크를 추가했습니다.')
    } catch {
      // The current fields intentionally preserve the exact failed link intent.
    }
  }

  const runDelete = async (intent: { id: string; name: string }) => {
    del.reset()
    setFailedDelete(null)
    setNotice('')
    try {
      await del.mutateAsync(intent.id)
      setNotice(`${intent.name}을(를) 삭제했습니다.`)
    } catch {
      setFailedDelete(intent)
    }
  }

  const remove = (id: string, name: string) => {
    if (confirmDestructive(`'${name}' 파일 링크를 삭제할까요?`)) {
      void runDelete({ id, name })
    }
  }

  const runUpload = async (intent: UploadIntent) => {
    uploadFile.reset()
    setFailedUpload(null)
    setNotice('')
    try {
      await uploadFile.mutateAsync(intent)
      setNotice(`${intent.file.name} 업로드를 완료했습니다.`)
    } catch {
      setFailedUpload(intent)
    }
  }

  const hasDirectory = Boolean(directory.data)
  const initialPending = directory.isPending && !hasDirectory
  const retainedDataError =
    hasDirectory &&
    ((directory.isError && !directory.isFetchNextPageError) ||
      project.isError ||
      workPackages.isError ||
      capabilities.isError ||
      (wikiEnabled && documentsQuery.isError))

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <h1 className="sr-only">파일</h1>
      <FrameContextActions>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="파일 디렉터리 새로고침"
          title="새로고침"
          disabled={refreshPending}
          onClick={() => void refreshAll()}
        >
          <RefreshCw
            size={13}
            className={refreshPending ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
        </Button>
        {canMutate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              composerRef.current?.scrollIntoView({ block: 'nearest' })
              composerRef.current?.focus()
            }}
          >
            <FileUp size={13} aria-hidden="true" />
            업로드/링크
          </Button>
        ) : null}
      </FrameContextActions>

      <section
        aria-label="파일 디렉터리 상태"
        className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-of-border-subtle bg-of-surface-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <HardDrive size={13} aria-hidden="true" />
            파일 디렉터리
          </span>
          <span className="h-4 w-px bg-of-border" aria-hidden="true" />
          <span className="text-[11px] text-of-muted">
            파일 {summary.total} · {fmtSize(summary.used_bytes)}
          </span>
          {project.data ? (
            <span className="rounded-full border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted">
              {project.data.key}
            </span>
          ) : null}
          {archived ? (
            <span className="rounded-full border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted">
              보관됨
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-of-muted">
          {project.data?.name ?? '프로젝트'}
          {canMutate ? ' · 자료 관리' : ' · 읽기 전용'}
        </span>
      </section>

      {retainedDataError ? (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"
        >
          <span>마지막으로 불러온 파일을 유지하고 있습니다. 최신 상태를 다시 확인하세요.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshPending}
            onClick={() => void refreshAll()}
          >
            <RefreshCw
              size={13}
              className={refreshPending ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            다시 시도
          </Button>
        </div>
      ) : null}

      <div data-testid="project-files-scroll" className="of-scrollbar min-h-0 flex-1 overflow-y-auto">
        {initialPending ? (
          <FilesDirectorySkeleton />
        ) : directory.isError && !hasDirectory ? (
          <div className="mx-auto grid w-full max-w-6xl content-start px-3 py-4 sm:px-5">
            <ErrorState
              error={directory.error}
              onRetry={() => void refreshAll()}
              className={COMPACT_ERROR_STATE_CLASS}
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5">
            <section
              aria-label="파일 요약"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
            >
              <SummaryTile icon={HardDrive} label="전체 파일" value={String(summary.total)} />
              <SummaryTile icon={FileUp} label="업로드" value={String(summary.file_count)} />
              <SummaryTile
                icon={FileSearch}
                label="본문 검색"
                value={`${summary.indexed_file_count}/${summary.file_count}`}
              />
              <SummaryTile icon={Link2} label="외부 링크" value={String(summary.link_count)} />
              <SummaryTile icon={Paperclip} label="연결됨" value={String(summary.linked_count)} />
              <SummaryTile icon={Database} label="사용량" value={fmtSize(summary.used_bytes)} />
            </section>

            {!canWrite ? <ReadOnlyNotice /> : null}

            {canMutate ? (
              <FileComposer
                sectionRef={composerRef}
                anchor={anchor}
                canSubmit={filename.trim() !== '' && urlTrimmed !== '' && urlValid}
                createPending={create.isPending}
                documents={documents}
                err={err}
                filename={filename}
                fileInput={fileInput}
                onAdd={add}
                onAnchorChange={(value) => {
                  setAnchor(value)
                  setFailedUpload(null)
                }}
                onFilenameChange={(value) => {
                  setFilename(value)
                  create.reset()
                }}
                onFilePicked={(file) =>
                  void runUpload({
                    file,
                    workPackageId: anchorWp || undefined,
                    documentId: anchorDoc || undefined,
                  })
                }
                onPickFile={() => fileInput.current?.click()}
                onUrlChange={(value) => {
                  setUrl(value)
                  create.reset()
                }}
                uploadError={uploadFile.error}
                uploadPending={uploadFile.isPending}
                url={url}
                urlValid={urlValid}
                wikiEnabled={wikiEnabled}
                workItems={workItems}
              />
            ) : null}

            {failedUpload ? (
              <ActionFailure
                message={`${failedUpload.file.name} 업로드에 실패했습니다. 파일과 연결 대상을 유지했습니다.`}
                pending={uploadFile.isPending}
                onRetry={() => void runUpload(failedUpload)}
              />
            ) : failedDelete ? (
              <ActionFailure
                message={`${failedDelete.name} 삭제에 실패했습니다. 같은 파일 삭제를 다시 시도할 수 있습니다.`}
                pending={del.isPending}
                onRetry={() => void runDelete(failedDelete)}
              />
            ) : notice ? (
              <p role="status" className="text-[11px] text-of-accent">
                {notice}
              </p>
            ) : null}

            <section aria-label="파일 목록" className="min-w-0 space-y-3">
              <div className="grid min-w-0 gap-2 border-y border-of-border py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
                <label className="relative block min-w-0 flex-1">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(event) => setDirectoryParam('q', event.target.value || null)}
                    placeholder="파일 이름 또는 연결 대상 검색"
                    aria-label="파일 검색"
                    className="pl-8"
                  />
                </label>
                <Select
                  aria-label="파일 범위"
                  value={scope}
                  onChange={(event) =>
                    setDirectoryParam(
                      'scope',
                      event.target.value === 'all' ? null : event.target.value,
                    )
                  }
                  className="h-8 min-w-0 text-xs"
                >
                  <option value="all">전체</option>
                  <option value="files">업로드</option>
                  <option value="links">외부 링크</option>
                  <option value="linked">연결됨</option>
                  <option value="pending">검색 준비 필요</option>
                </Select>
                {canMutate && summary.pending_index_count > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={rebuildSearch.isPending}
                    onClick={() => {
                      rebuildSearch.reset()
                      rebuildSearch.mutate()
                    }}
                  >
                    {rebuildSearch.isPending ? (
                      <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                    ) : (
                      <FileSearch size={13} aria-hidden="true" />
                    )}
                    {rebuildSearch.isPending
                      ? '본문 검색 준비 중'
                      : rebuildSearch.isError
                        ? '본문 검색 다시 시도'
                        : `본문 검색 준비 ${summary.pending_index_count}건`}
                  </Button>
                ) : null}
              </div>

              {query.trim() !== deferredQuery ? (
                <p role="status" className="text-xs text-of-muted">
                  검색 반영 중
                </p>
              ) : directory.isFetching && !directory.isFetchingNextPage ? (
                <p role="status" className="text-xs text-of-muted">
                  목록 갱신 중
                </p>
              ) : null}
              {rebuildSearch.isError ? (
                <p role="alert" className="text-xs text-of-danger">
                  파일 본문 검색 준비에 실패했습니다. 같은 작업을 다시 시도할 수 있습니다.
                </p>
              ) : rebuildSearch.data ? (
                <p role="status" className="text-xs text-of-muted">
                  {rebuildSearch.data.processed}건 확인 · {rebuildSearch.data.indexed}건 검색 가능
                  {rebuildSearch.data.remaining > 0
                    ? ` · ${rebuildSearch.data.remaining}건 남음`
                    : ''}
                </p>
              ) : null}

              {items.length === 0 ? (
                <EmptyState
                  title={
                    summary.total === 0
                      ? '등록된 파일이 없습니다'
                      : '조건에 맞는 파일이 없습니다'
                  }
                  hint={
                    summary.total === 0
                      ? canMutate
                        ? '위에서 파일을 업로드하거나 외부 링크를 추가하세요.'
                        : '표시할 프로젝트 자료가 없습니다.'
                      : '검색어나 파일 범위를 조정해 다시 찾아보세요.'
                  }
                  className="min-h-[220px] border-y border-of-border"
                />
              ) : (
                <>
                  <ul className="min-w-0 divide-y divide-of-border border-y border-of-border">
                    {items.map((att) => (
                      <li
                        id={`attachment-${att.id}`}
                        key={att.id}
                        tabIndex={highlightedFileId === att.id ? -1 : undefined}
                        aria-current={highlightedFileId === att.id ? 'true' : undefined}
                        className={cn(
                          'min-w-0 scroll-mt-3 px-3 py-3 transition-colors hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
                          highlightedFileId === att.id &&
                            'bg-of-accent-soft ring-1 ring-inset ring-of-accent',
                        )}
                      >
                        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted">
                              {att.has_file ? <FileUp size={15} /> : <Link2 size={15} />}
                            </span>
                            <div className="min-w-0">
                              <AttachmentLink attachment={att} />
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-of-muted">
                                {highlightedItem?.id === att.id ? (
                                  <Badge variant="accent">직접 연 파일</Badge>
                                ) : null}
                                <span>{att.has_file ? '업로드 파일' : '외부 링크'}</span>
                                <span>{fmtSize(att.size_bytes)}</span>
                                <span>{fmtDate(att.created_at)}</span>
                                <span className="min-w-0 truncate">
                                  {anchorLabel(att, workItems, documents)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                            {att.has_file ? (
                              <SearchIndexBadge status={att.search_index_status} />
                            ) : (
                              <Badge variant="outline">링크</Badge>
                            )}
                            {canMutate ? (
                              <button
                                type="button"
                                aria-label={`${att.filename} 삭제`}
                                disabled={del.isPending}
                                className="rounded-of p-1.5 text-of-muted hover:bg-of-surface hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-50"
                                onClick={() => remove(att.id, att.filename)}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <footer className="flex min-w-0 flex-col items-center gap-2 py-2 sm:flex-row sm:justify-between">
                    <p className="text-xs text-of-muted" aria-live="polite">
                      {pageItems.length} / {filteredTotal}개 표시
                      {highlightedItem ? ' · 직접 연 파일 1개' : ''}
                    </p>
                    <div className="flex min-w-0 flex-col items-center gap-2 sm:items-end">
                      {directory.hasNextPage ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={directory.isFetchingNextPage}
                          aria-describedby={
                            directory.isFetchNextPageError
                              ? 'files-directory-load-more-error'
                              : undefined
                          }
                          onClick={() => void directory.fetchNextPage()}
                        >
                          {directory.isFetchingNextPage ? (
                            <Loader2 className="animate-spin" size={13} aria-hidden="true" />
                          ) : null}
                          {directory.isFetchingNextPage ? '불러오는 중...' : '더 불러오기'}
                        </Button>
                      ) : null}
                      {directory.isFetchNextPageError ? (
                        <p
                          id="files-directory-load-more-error"
                          role="alert"
                          className="text-xs text-of-danger"
                        >
                          추가 파일을 불러오지 못했습니다. 같은 위치에서 다시 시도하세요.
                        </p>
                      ) : null}
                    </div>
                  </footer>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function FilesDirectorySkeleton() {
  return (
    <div
      data-testid="project-files-skeleton"
      className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="border border-of-border px-3 py-2.5 -ml-px -mt-px">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-2 h-5 w-10" />
          </div>
        ))}
      </div>
      <div className="grid gap-2 border-y border-of-border py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="divide-y divide-of-border border-y border-of-border">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ActionFailure({
  message,
  pending,
  onRetry,
}: {
  message: string
  pending: boolean
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-l-2 border-of-danger bg-of-danger-soft px-2.5 py-2 text-[11px] text-of-danger"
    >
      <span>{message}</span>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onRetry}>
        <RefreshCw size={13} className={pending ? 'animate-spin' : undefined} aria-hidden="true" />
        다시 시도
      </Button>
    </div>
  )
}

function SearchIndexBadge({
  status,
}: {
  status: Attachment['search_index_status'] | undefined
}) {
  const view = {
    indexed: { label: '검색 가능', variant: 'accent' as const },
    pending: { label: '준비 필요', variant: 'warning' as const },
    unsupported: { label: '형식 제외', variant: 'outline' as const },
    too_large: { label: '용량 제외', variant: 'outline' as const },
    invalid_text: { label: '텍스트 오류', variant: 'danger' as const },
    missing_blob: { label: '파일 누락', variant: 'danger' as const },
    not_applicable: { label: '해당 없음', variant: 'outline' as const },
  }[status ?? 'pending']
  return <Badge variant={view.variant}>{view.label}</Badge>
}

function FileComposer({
  sectionRef,
  anchor,
  canSubmit,
  createPending,
  documents,
  err,
  filename,
  fileInput,
  onAdd,
  onAnchorChange,
  onFilenameChange,
  onFilePicked,
  onPickFile,
  onUrlChange,
  uploadError,
  uploadPending,
  url,
  urlValid,
  wikiEnabled,
  workItems,
}: {
  sectionRef: RefObject<HTMLElement | null>
  anchor: string
  canSubmit: boolean
  createPending: boolean
  documents: Array<{ id: string; title: string }>
  err: string | null
  filename: string
  fileInput: RefObject<HTMLInputElement | null>
  onAdd: () => void
  onAnchorChange: (value: string) => void
  onFilenameChange: (value: string) => void
  onFilePicked: (file: File) => void
  onPickFile: () => void
  onUrlChange: (value: string) => void
  uploadError: Error | null
  uploadPending: boolean
  url: string
  urlValid: boolean
  wikiEnabled: boolean
  workItems: Array<{ id: string; subject: string }>
}) {
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="파일 추가"
      className="grid min-w-0 scroll-mt-3 gap-3 border-y border-of-border py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
    >
      <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className="text-xs font-medium">파일 추가</p>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            업로드와 외부 링크 모두 선택한 작업
            {wikiEnabled ? ' 또는 문서' : ''}에 바로 연결할 수 있습니다.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            aria-label="업로드할 파일"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFilePicked(f)
              e.target.value = ''
            }}
          />
          <Button size="sm" disabled={uploadPending} onClick={onPickFile}>
            {uploadPending ? (
              <Loader2 className="animate-spin" size={13} aria-hidden="true" />
            ) : (
              <Upload size={13} aria-hidden="true" />
            )}
            파일 업로드
          </Button>
          {uploadPending ? <span className="text-xs text-of-muted">업로드 중...</span> : null}
        </div>
      </div>

      <Select
        aria-label="연결 대상"
        className="h-8 min-w-0 text-xs"
        value={anchor}
        onChange={(e) => onAnchorChange(e.target.value)}
      >
        <option value="">연결 안 함</option>
        <optgroup label="작업">
          {workItems.map((w) => (
            <option key={w.id} value={`wp:${w.id}`}>
              {w.subject}
            </option>
          ))}
        </optgroup>
        {wikiEnabled ? (
          <optgroup label="문서">
            {documents.map((d) => (
              <option key={d.id} value={`doc:${d.id}`}>
                {d.title}
              </option>
            ))}
          </optgroup>
        ) : null}
      </Select>

      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
        <Input
          value={filename}
          onChange={(e) => onFilenameChange(e.target.value)}
          placeholder="파일 이름"
          aria-label="파일 이름"
        />
        <Input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://..."
          aria-label="파일 URL"
          aria-invalid={!urlValid}
        />
        <Button size="sm" disabled={!canSubmit || createPending} onClick={onAdd}>
          {createPending ? (
            <Loader2 className="animate-spin" size={13} aria-hidden="true" />
          ) : (
            <Link2 size={13} aria-hidden="true" />
          )}
          {err ? '링크 다시 시도' : '링크 추가'}
        </Button>
      </div>

      {!urlValid ? (
        <p className="text-xs text-of-danger">URL은 http:// 또는 https:// 로 시작해야 합니다.</p>
      ) : null}
      {err ? <p className="text-xs text-of-danger">{err}</p> : null}
      {uploadError instanceof ApiError ? (
        <p className="text-xs text-of-danger">업로드 실패: {uploadError.message}</p>
      ) : null}
    </section>
  )
}

function AttachmentLink({ attachment }: { attachment: Attachment }) {
  if (attachment.has_file) {
    return (
      <a
        href={downloadUrl(attachment.id)}
        className="inline-flex max-w-full min-w-0 items-center gap-1 text-sm font-medium hover:text-of-accent"
      >
        <span className="min-w-0 truncate">{attachment.filename}</span>
        <Download size={12} className="shrink-0 text-of-muted" />
      </a>
    )
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full min-w-0 items-center gap-1 text-sm font-medium hover:text-of-accent"
    >
      <span className="min-w-0 truncate">{attachment.filename}</span>
      <ExternalLink size={12} className="shrink-0 text-of-muted" />
    </a>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 border border-of-border bg-of-surface px-3 py-2.5 -ml-px -mt-px">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-of-muted">
        <Icon size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-0.5 block truncate text-base font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function anchorLabel(
  attachment: Attachment & {
    work_package_subject?: string | null
    document_title?: string | null
  },
  workItems: Array<{ id: string; subject: string }>,
  documents: Array<{ id: string; title: string }>,
): string {
  if (attachment.work_package_id) {
    if (attachment.work_package_subject) return `작업: ${attachment.work_package_subject}`
    const wp = workItems.find((w) => w.id === attachment.work_package_id)
    return wp ? `작업: ${wp.subject}` : '작업에 연결됨'
  }
  if (attachment.document_id) {
    if (attachment.document_title) return `문서: ${attachment.document_title}`
    const doc = documents.find((d) => d.id === attachment.document_id)
    return doc ? `문서: ${doc.title}` : '문서에 연결됨'
  }
  return '프로젝트 파일'
}
