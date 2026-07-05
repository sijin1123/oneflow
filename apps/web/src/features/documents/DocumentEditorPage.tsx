import { ArrowLeft, Trash2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import { conflictOf, useDeleteDocument, useDocument, useUpdateDocument } from './api'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
)

export function DocumentEditorPage() {
  const { projectId, docId } = useParams() as { projectId: string; docId: string }
  const navigate = useNavigate()
  const { data: doc, isPending, isError, error, refetch } = useDocument(docId)
  const update = useUpdateDocument(projectId)
  const del = useDeleteDocument(projectId)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  // Resync when the server doc changes (load / save / 409 reload). react-query's
  // structural sharing keeps `doc`'s reference stable, so local edits aren't
  // clobbered until the cached document actually changes.
  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setBody(doc.body ?? '')
    }
  }, [doc])

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const conflict = conflictOf(update.error)

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed || update.isPending) return
    // After a conflict, retry against the server's current version so the user's
    // (preserved) draft overwrites it; otherwise the normal optimistic token.
    update.mutate({
      docId: doc.id,
      expected_version: conflict ? conflict.current.version : doc.version,
      title: trimmed,
      body: body === '' ? null : body,
    })
  }

  const remove = () => {
    del.mutate(doc.id, {
      onSuccess: () => navigate(`/projects/${projectId}/documents`),
    })
  }

  const otherError =
    update.error instanceof ApiError && update.error.status !== 409 ? update.error.message : null

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="문서 목록"
          className="rounded-of p-1 text-of-muted hover:bg-of-surface-2"
          onClick={() => navigate(`/projects/${projectId}/documents`)}
        >
          <ArrowLeft size={16} />
        </button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="문서 제목"
          className="flex-1 text-sm font-medium"
        />
        <Button size="sm" disabled={!title.trim() || update.isPending} onClick={save}>
          저장
        </Button>
        <button
          type="button"
          aria-label="문서 삭제"
          className="rounded-of p-1.5 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
          onClick={remove}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {conflict ? (
        <p role="alert" className="mb-2 text-xs text-of-danger">
          다른 사용자가 먼저 수정했습니다. 작성 중인 내용은 유지했으니, 다시 저장하면 최신 내용
          위에 덮어씁니다.
        </p>
      ) : null}
      {otherError ? (
        <p role="alert" className="mb-2 text-xs text-of-danger">
          저장하지 못했습니다: {otherError}
        </p>
      ) : null}

      <Suspense
        fallback={<div className="h-64 rounded-of border border-of-border bg-of-surface-2/40" />}
      >
        <RichTextEditor value={doc.body ?? ''} ariaLabel="문서 본문" onSave={setBody} />
      </Suspense>

      <p className="mt-2 text-right text-[11px] text-of-muted">v{doc.version}</p>
    </div>
  )
}
