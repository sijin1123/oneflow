import { Download, ExternalLink, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { confirmDestructive } from '@/lib/guards'

import { downloadUrl, useAttachments, useCreateAttachment, useDeleteAttachment, useUploadAttachment } from './api'

// Client-side scheme allowlist mirrors the server's http(s)-only rule, so a
// javascript:/data: link is rejected before it can be stored and rendered.
const HTTP_URL_RE = /^https?:\/\/.+/i

function fmtSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesPage() {
  const { projectId } = useParams() as { projectId: string }
  const { data, isPending, isError, error, refetch } = useAttachments(projectId)
  const create = useCreateAttachment(projectId)
  const del = useDeleteAttachment(projectId)
  const uploadFile = useUploadAttachment(projectId)
  const fileInput = useRef<HTMLInputElement>(null)

  const [filename, setFilename] = useState('')
  const [url, setUrl] = useState('')
  const err = create.error instanceof ApiError ? create.error.message : null

  const urlTrimmed = url.trim()
  const urlValid = urlTrimmed === '' || HTTP_URL_RE.test(urlTrimmed)

  const add = () => {
    if (!filename.trim() || !urlValid || urlTrimmed === '' || create.isPending) return
    create.mutate(
      { filename: filename.trim(), url: urlTrimmed },
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
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <h1 className="mb-1 text-base font-semibold">파일</h1>
      <p className="mb-4 text-xs text-of-muted">
        파일을 직접 업로드하거나, 외부에 저장된 파일의 링크를 등록합니다.
      </p>

      <div className="mb-3 flex items-center gap-2 rounded-of border border-of-border bg-of-surface p-3">
        <input
          ref={fileInput}
          type="file"
          aria-label="업로드할 파일"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) uploadFile.mutate(f)
            e.target.value = ''
          }}
        />
        <Button size="sm" disabled={uploadFile.isPending} onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> 파일 업로드
        </Button>
        {uploadFile.isPending ? <span className="text-xs text-of-muted">업로드 중…</span> : null}
        {uploadFile.isError && uploadFile.error instanceof ApiError ? (
          <p role="alert" className="text-xs text-of-danger">
            업로드 실패: {uploadFile.error.message}
          </p>
        ) : null}
      </div>

      <div className="mb-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
        <p className="text-xs font-medium">파일 링크 추가</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="파일 이름"
            aria-label="파일 이름"
            className="min-w-32 flex-1"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            aria-label="파일 URL"
            aria-invalid={!urlValid}
            className="min-w-48 flex-[2]"
          />
          <Button
            size="sm"
            disabled={!filename.trim() || urlTrimmed === '' || !urlValid || create.isPending}
            onClick={add}
          >
            추가
          </Button>
        </div>
        {!urlValid ? (
          <p className="text-xs text-of-danger">URL은 http:// 또는 https:// 로 시작해야 합니다.</p>
        ) : null}
        {err ? <p className="text-xs text-of-danger">{err}</p> : null}
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState title="등록된 파일이 없습니다" hint="파일 링크를 추가해 프로젝트 자료를 모아 보세요." />
      ) : (
        <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
          {data.items.map((att) => (
            <li key={att.id} className="flex items-center gap-3 px-4 py-2.5">
              <Paperclip size={15} className="shrink-0 text-of-muted" />
              {att.has_file ? (
                <a
                  href={downloadUrl(att.id)}
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm font-medium hover:text-of-accent"
                >
                  <span className="truncate">{att.filename}</span>
                  <Download size={12} className="shrink-0 text-of-muted" />
                </a>
              ) : (
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm font-medium hover:text-of-accent"
                >
                  <span className="truncate">{att.filename}</span>
                  <ExternalLink size={12} className="shrink-0 text-of-muted" />
                </a>
              )}
              {att.size_bytes !== null ? (
                <span className="shrink-0 text-xs text-of-muted">{fmtSize(att.size_bytes)}</span>
              ) : null}
              <button
                type="button"
                aria-label={`${att.filename} 삭제`}
                className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                onClick={() => remove(att.id, att.filename)}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
