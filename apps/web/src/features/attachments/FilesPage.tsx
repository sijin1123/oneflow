import {
  Database,
  Download,
  ExternalLink,
  FileUp,
  HardDrive,
  Link2,
  type LucideIcon,
  Paperclip,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { useParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useDocuments } from '@/features/documents/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { useWorkPackages } from '@/features/work-packages/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { confirmDestructive } from '@/lib/guards'

import {
  downloadUrl,
  type Attachment,
  useAttachments,
  useCreateAttachment,
  useDeleteAttachment,
  useUploadAttachment,
} from './api'

const HTTP_URL_RE = /^https?:\/\/.+/i

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
  const { data, isPending, isError, error, refetch } = useAttachments(projectId)
  const project = useProject(projectId)
  const create = useCreateAttachment(projectId)
  const del = useDeleteAttachment(projectId)
  const uploadFile = useUploadAttachment(projectId)
  const canWrite = useCanWrite(projectId)
  const capabilities = useWorkspaceCapabilities()
  const fileInput = useRef<HTMLInputElement>(null)

  const [filename, setFilename] = useState('')
  const [url, setUrl] = useState('')
  const [anchor, setAnchor] = useState('')
  const [query, setQuery] = useState('')
  const { data: wps } = useWorkPackages(projectId, {})
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const { data: docs } = useDocuments(projectId, wikiEnabled)

  const workItems = wps?.items ?? []
  const documents = docs?.items ?? []
  const anchorWp = anchor.startsWith('wp:') ? anchor.slice(3) : ''
  const anchorDoc = anchor.startsWith('doc:') ? anchor.slice(4) : ''
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined
  const canMutate = canWrite && !archived

  const items = data?.items ?? []
  const fileCount = items.filter((a) => a.has_file).length
  const linkCount = items.length - fileCount
  const linkedCount = items.filter((a) => a.work_package_id || a.document_id).length
  const usedBytes = items.reduce((total, a) => total + (a.size_bytes ?? 0), 0)
  const q = query.trim().toLowerCase()
  const visible = items.filter((a) => {
    if (!q) return true
    return `${a.filename} ${anchorLabel(a, workItems, documents)}`.toLowerCase().includes(q)
  })

  const err = create.error instanceof ApiError ? create.error.message : null
  const urlTrimmed = url.trim()
  const urlValid = urlTrimmed === '' || HTTP_URL_RE.test(urlTrimmed)

  const add = () => {
    if (!filename.trim() || !urlValid || urlTrimmed === '' || create.isPending) return
    create.mutate(
      {
        filename: filename.trim(),
        url: urlTrimmed,
        work_package_id: anchorWp || null,
        document_id: anchorDoc || null,
      },
      {
        onSuccess: () => {
          setFilename('')
          setUrl('')
        },
      },
    )
  }

  const remove = (id: string, name: string) => {
    if (confirmDestructive(`'${name}' 파일 링크를 삭제할까요?`)) del.mutate(id)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="border-b border-of-border pb-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">Storage surface</p>
            <h1 className="mt-1 text-base font-semibold">파일</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
              {project.data?.name ?? '프로젝트'}의 업로드 파일, 외부 링크, 작업·문서 첨부를 한 곳에서 봅니다.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {project.data ? <Badge variant="outline">{project.data.key}</Badge> : null}
            <Badge variant={archived ? 'outline' : 'accent'}>{archived ? '보관됨' : '활성'}</Badge>
            <Badge variant="outline">파일 {data?.total ?? 0}</Badge>
          </div>
        </div>
      </header>

      {!canWrite ? <ReadOnlyNotice /> : null}

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-label="파일 목록" className="min-w-0 space-y-3">
            {canMutate ? (
              <FileComposer
                anchor={anchor}
                canSubmit={filename.trim() !== '' && urlTrimmed !== '' && urlValid}
                createPending={create.isPending}
                documents={documents}
                err={err}
                filename={filename}
                fileInput={fileInput}
                onAdd={add}
                onAnchorChange={setAnchor}
                onFilenameChange={setFilename}
                onFilePicked={(file) =>
                  uploadFile.mutate({
                    file,
                    workPackageId: anchorWp || undefined,
                    documentId: anchorDoc || undefined,
                  })
                }
                onPickFile={() => fileInput.current?.click()}
                onUrlChange={setUrl}
                uploadError={uploadFile.error}
                uploadPending={uploadFile.isPending}
                url={url}
                urlValid={urlValid}
                wikiEnabled={wikiEnabled}
                workItems={workItems}
              />
            ) : null}

            {data.total === 0 ? (
              <EmptyState
                title="등록된 파일이 없습니다"
                hint="파일 링크를 추가하거나 업로드해 프로젝트 자료를 모아 보세요."
                className="rounded-of border border-of-border bg-of-surface"
              />
            ) : (
              <>
                <label className="relative block min-w-0">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="파일 이름 또는 연결 대상 검색"
                    aria-label="파일 검색"
                    className="pl-8"
                  />
                </label>

                {visible.length === 0 ? (
                  <EmptyState
                    title="검색 결과가 없습니다"
                    hint="다른 파일명이나 연결 대상으로 다시 검색하세요."
                    className="min-h-[220px] rounded-of border border-of-border bg-of-surface"
                  />
                ) : (
                  <ul className="min-w-0 divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                    {visible.map((att) => (
                      <li key={att.id} className="min-w-0 px-3 py-3 hover:bg-of-surface-2">
                        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted">
                              {att.has_file ? <FileUp size={15} /> : <Link2 size={15} />}
                            </span>
                            <div className="min-w-0">
                              <AttachmentLink attachment={att} />
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-of-muted">
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
                            <Badge variant="outline">{att.has_file ? 'file' : 'link'}</Badge>
                            {canMutate ? (
                              <button
                                type="button"
                                aria-label={`${att.filename} 삭제`}
                                className="rounded-of p-1.5 text-of-muted hover:bg-of-surface hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
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
                )}
              </>
            )}
          </section>

          <aside aria-label="파일 요약" className="grid min-w-0 gap-2 self-start">
            <SummaryTile icon={HardDrive} label="전체 파일" value={String(data.total)} />
            <SummaryTile icon={FileUp} label="업로드" value={String(fileCount)} />
            <SummaryTile icon={Link2} label="외부 링크" value={String(linkCount)} />
            <SummaryTile icon={Paperclip} label="연결됨" value={String(linkedCount)} />
            <SummaryTile icon={Database} label="사용량" value={fmtSize(usedBytes)} />
          </aside>
        </div>
      )}
    </div>
  )
}

function FileComposer({
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
      aria-label="파일 추가"
      className="grid min-w-0 gap-3 rounded-of border border-of-border bg-of-surface p-3"
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
            <Upload size={13} /> 파일 업로드
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
          추가
        </Button>
      </div>

      {!urlValid ? (
        <p className="text-xs text-of-danger">URL은 http:// 또는 https:// 로 시작해야 합니다.</p>
      ) : null}
      {err ? <p className="text-xs text-of-danger">{err}</p> : null}
      {uploadError instanceof ApiError ? (
        <p role="alert" className="text-xs text-of-danger">
          업로드 실패: {uploadError.message}
        </p>
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
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </div>
  )
}

function anchorLabel(
  attachment: Attachment,
  workItems: Array<{ id: string; subject: string }>,
  documents: Array<{ id: string; title: string }>,
): string {
  if (attachment.work_package_id) {
    const wp = workItems.find((w) => w.id === attachment.work_package_id)
    return wp ? `작업: ${wp.subject}` : '작업에 연결됨'
  }
  if (attachment.document_id) {
    const doc = documents.find((d) => d.id === attachment.document_id)
    return doc ? `문서: ${doc.title}` : '문서에 연결됨'
  }
  return '프로젝트 파일'
}
