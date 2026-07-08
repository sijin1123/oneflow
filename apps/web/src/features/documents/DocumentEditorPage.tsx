import { ArrowLeft, Trash2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { useUploadAttachment } from '@/features/attachments/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { confirmDestructive, useUnsavedChangesPrompt } from '@/lib/guards'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'

import {
  conflictOf,
  useDeleteDocument,
  useDocument,
  useDocuments,
  useUpdateDocument,
  useCreateDocumentComment,
  useDeleteDocumentComment,
  useDocumentComments,
} from './api'
import { DocumentAttachments } from './DocumentAttachments'
import { LinkedWorkPackagesSection } from './LinkedWorkPackagesSection'
import { subtreeIds } from './tree'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
)

export function DocumentEditorPage() {
  const { projectId, docId } = useParams() as { projectId: string; docId: string }
  const navigate = useNavigate()
  const { data: doc, isPending, isError, error, refetch } = useDocument(docId)
  const siblings = useDocuments(projectId)
  const update = useUpdateDocument(projectId)
  const del = useDeleteDocument(projectId)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const upload = useUploadAttachment(projectId)
  // Resync when the server doc changes (load / save / 409 reload). react-query's
  // structural sharing keeps `doc`'s reference stable, so local edits aren't
  // clobbered until the cached document actually changes.
  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setBody(doc.body ?? '')
      setParentId(doc.parent_id)
    }
  }, [doc])

  // Warn before navigating away with an unsaved draft (save-on-click editor).
  const dirty =
    !!doc &&
    !update.isPending &&
    !del.isPending &&
    (title !== doc.title || body !== (doc.body ?? '') || parentId !== doc.parent_id)
  useUnsavedChangesPrompt(dirty, '저장되지 않은 변경이 있습니다. 나가시겠습니까?')

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
      parent_id: parentId,
    })
  }

  // A page cannot nest under itself or its own subtree (server enforces; the
  // select simply doesn't offer those).
  const excluded = subtreeIds(siblings.data?.items ?? [], doc.id)
  const parentOptions = (siblings.data?.items ?? []).filter((d) => !excluded.has(d.id))

  const remove = () => {
    if (!confirmDestructive('이 문서를 삭제할까요? 되돌릴 수 없습니다.')) return
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

      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="doc-parent" className="shrink-0 text-xs font-medium text-of-muted">
          상위 페이지
        </label>
        <Select
          id="doc-parent"
          className="h-7 max-w-xs text-xs"
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">(없음 — 최상위)</option>
          {parentOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </Select>
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
        <RichTextEditor
          value={doc.body ?? ''}
          ariaLabel="문서 본문"
          onSave={setBody}
          // Inline image (Pass 68): upload anchored to THIS document, then
          // insert the canonical download URL — the server re-validates
          // ownership + content type on save (v68.1 R1-①).
          onImageUpload={async (file) => {
            const att = await upload.mutateAsync({ file, documentId: doc.id })
            return `/api/v1/attachments/${att.id}/download`
          }}
        />
      </Suspense>

      <p className="mt-2 text-right text-[11px] text-of-muted">v{doc.version}</p>

      <LinkedWorkPackagesSection docId={doc.id} projectId={projectId} />

      <DocumentAttachments docId={doc.id} projectId={projectId} />

      <DocumentComments docId={doc.id} projectId={projectId} />
    </div>
  )
}

/* Flat plain-text margin notes (Pass 43): bodies render as TEXT NODES only —
   never as HTML. Delete shows for my own comments (the server also lets the
   project owner clean up; a failed delete just surfaces the error). */
function DocumentComments({ docId, projectId }: { docId: string; projectId: string }) {
  const me = useMe()
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const { data } = useDocumentComments(docId)
  const create = useCreateDocumentComment(docId)
  const del = useDeleteDocumentComment(docId)
  const [draft, setDraft] = useState('')

  const authorLabel = (authorId: string | null) => {
    if (authorId === null) return '삭제된 사용자'
    if (members.data?.items.some((m) => m.user_id === authorId)) return memberName(authorId)
    return '이전 구성원'
  }

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    create.mutate(body, { onSuccess: () => setDraft('') })
  }

  return (
    <div className="mt-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">코멘트{data ? ` ${data.total}건` : ''}</p>
      {data && data.items.length > 0 ? (
        <ul className="space-y-1.5">
          {data.items.map((c) => (
            <li key={c.id} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 font-medium text-of-muted">{authorLabel(c.author_id)}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{c.body}</span>
              <span className="shrink-0 text-[11px] text-of-muted">{c.created_at.slice(0, 10)}</span>
              {c.author_id === me.data?.id ? (
                <button
                  type="button"
                  aria-label="코멘트 삭제"
                  className="shrink-0 text-of-muted hover:text-of-danger"
                  disabled={del.isPending}
                  onClick={() => del.mutate(c.id)}
                >
                  <Trash2 size={12} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-of-muted">아직 코멘트가 없습니다.</p>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="코멘트 남기기 (plain text)"
          aria-label="새 코멘트"
          className="h-8 flex-1 text-xs"
          maxLength={4000}
        />
        <Button size="sm" disabled={!draft.trim() || create.isPending} onClick={submit}>
          등록
        </Button>
      </div>
      {create.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          코멘트를 등록하지 못했습니다.
        </p>
      ) : null}
    </div>
  )
}
