import { Archive, ArrowLeft, Clock3, FileText, FolderTree, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useUploadAttachment } from '@/features/attachments/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'
import { useProject } from '@/features/projects/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive, useUnsavedChangesPrompt } from '@/lib/guards'

import {
  conflictOf,
  useCreateDocumentComment,
  useDeleteDocument,
  useDeleteDocumentComment,
  useDocument,
  useDocumentComments,
  useDocuments,
  useDocumentLifecycle,
  useUpdateDocument,
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
  const bucket = doc?.archived_at ? 'archived' : (doc?.visibility ?? 'shared')
  const siblings = useDocuments(projectId, bucket)
  const project = useProject(projectId)
  const update = useUpdateDocument(projectId)
  const del = useDeleteDocument(projectId)
  const lifecycle = useDocumentLifecycle(projectId)
  const me = useMe()
  const members = useMembers(projectId)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'shared' | 'private'>('shared')
  const upload = useUploadAttachment(projectId)
  const canWrite = useCanWrite(projectId)

  useEffect(() => {
    if (doc) {
      setTitle(doc.title)
      setBody(doc.body ?? '')
      setParentId(doc.parent_id)
      setVisibility(doc.visibility ?? 'shared')
    }
  }, [doc])

  const dirty =
    !!doc &&
    !update.isPending &&
    !del.isPending &&
    (title !== doc.title ||
      body !== (doc.body ?? '') ||
      parentId !== doc.parent_id ||
      visibility !== doc.visibility)
  useUnsavedChangesPrompt(dirty, '저장되지 않은 변경이 있습니다. 나가시겠습니까?')

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const conflict = conflictOf(update.error)
  const lifecycleConflict = conflictOf(lifecycle.error)

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed || update.isPending) return
    update.mutate({
      docId: doc.id,
      expected_version: conflict ? conflict.current.version : doc.version,
      title: trimmed,
      body: body === '' ? null : body,
      parent_id: parentId,
      ...(visibility !== doc.visibility ? { visibility } : {}),
    })
  }

  const excluded = subtreeIds(siblings.data?.items ?? [], doc.id)
  const parentOptions = (siblings.data?.items ?? []).filter((d) => !excluded.has(d.id))
  const parentTitle =
    parentId === null
      ? '최상위'
      : siblings.data?.items.find((d) => d.id === parentId)?.title ?? '상위 문서'
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined
  const documentArchived = Boolean(doc.archived_at)
  const editable = canWrite && !documentArchived
  const myRole = members.data?.items.find((member) => member.user_id === me.data?.id)?.role
  const canManageLifecycle = canWrite && (doc.author_id === me.data?.id || myRole === 'owner')
  const lifecycleVersion = lifecycleConflict?.current.version ?? doc.version

  const remove = () => {
    if (!confirmDestructive('이 문서를 삭제할까요? 되돌릴 수 없습니다.')) return
    del.mutate(doc.id, {
      onSuccess: () => navigate(`/projects/${projectId}/documents`),
    })
  }

  const otherError =
    update.error instanceof ApiError && update.error.status !== 409 ? update.error.message : null

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="border-b border-of-border pb-4">
        <div className="mb-3 flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="문서 목록"
            className="rounded-of p-1.5 text-of-muted hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => navigate(`/projects/${projectId}/documents`)}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase text-of-muted">Document detail</p>
            <p className="truncate text-xs text-of-muted">{project.data?.name ?? '프로젝트'}</p>
          </div>
          <div className="hidden shrink-0 flex-wrap items-center gap-2 sm:flex">
            <Badge variant={editable ? 'accent' : 'outline'}>
              {editable ? '편집 가능' : '읽기 전용'}
            </Badge>
            <Badge variant={documentArchived || archived ? 'outline' : 'neutral'}>
              {documentArchived ? '문서 보관됨' : archived ? '프로젝트 보관됨' : `v${doc.version}`}
            </Badge>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!editable}
            aria-label="문서 제목"
            className="h-10 min-w-0 text-base font-semibold"
          />
          {editable ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button size="sm" disabled={!title.trim() || update.isPending} onClick={save}>
                <Save size={14} /> 저장
              </Button>
              <button
                type="button"
                aria-label="문서 삭제"
                className="rounded-of p-1.5 text-of-muted hover:bg-of-surface-2 hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={remove}
              >
                <Trash2 size={15} />
              </button>
              {canManageLifecycle ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={lifecycle.isPending}
                  onClick={() => lifecycle.mutate({ docId: doc.id, expectedVersion: lifecycleVersion, archived: true })}
                >
                  <Archive size={14} /> 보관
                </Button>
              ) : null}
            </div>
          ) : documentArchived && canManageLifecycle ? (
            <Button
              variant="outline"
              size="sm"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate({ docId: doc.id, expectedVersion: lifecycleVersion, archived: false })}
            >
              <RotateCcw size={14} /> 복원
            </Button>
          ) : null}
        </div>
      </header>

      {!editable ? <ReadOnlyNotice /> : null}

      {conflict ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          다른 사용자가 먼저 수정했습니다. 작성 중인 내용은 유지했으니, 다시 저장하면 최신 내용 위에 덮어씁니다.
        </p>
      ) : null}
      {otherError ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          저장하지 못했습니다: {otherError}
        </p>
      ) : null}
      {lifecycleConflict ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          문서 상태가 먼저 변경되었습니다. 같은 작업을 다시 실행하면 최신 버전을 기준으로 처리합니다.
        </p>
      ) : lifecycle.error instanceof ApiError ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          문서 상태를 변경하지 못했습니다: {lifecycle.error.message}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-4">
          <section aria-label="문서 내용" className="min-w-0">
            <Suspense
              fallback={<div className="h-64 rounded-of border border-of-border bg-of-surface-2/40" />}
            >
              <RichTextEditor
                value={doc.body ?? ''}
                ariaLabel="문서 본문"
                editable={editable}
                onSave={setBody}
                onImageUpload={
                  editable
                    ? async (file) => {
                        const att = await upload.mutateAsync({ file, documentId: doc.id })
                        return `/api/v1/attachments/${att.id}/download`
                      }
                    : undefined
                }
              />
            </Suspense>
          </section>

          <DocumentComments docId={doc.id} projectId={projectId} canWrite={editable} />
        </main>

        <aside aria-label="문서 속성" className="grid min-w-0 gap-3 self-start">
          <section aria-label="문서 메타" className="rounded-of border border-of-border bg-of-surface p-3">
            <div className="mb-3 flex items-center gap-2">
              <FileText size={15} className="text-of-muted" aria-hidden="true" />
              <h2 className="text-sm font-semibold">속성</h2>
            </div>
            <div className="grid gap-3 text-xs">
              <label className="grid gap-1">
                <span className="font-medium text-of-muted">상위 페이지</span>
                <Select
                  id="doc-parent"
                  className="h-8 min-w-0 text-xs"
                  value={parentId ?? ''}
                  disabled={!editable}
                  onChange={(e) => setParentId(e.target.value === '' ? null : e.target.value)}
                  aria-label="상위 페이지"
                >
                  <option value="">(없음 — 최상위)</option>
                  {parentOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="font-medium text-of-muted">공개 범위</span>
                <Select
                  value={visibility}
                  disabled={!editable || doc.author_id !== me.data?.id}
                  onChange={(event) => setVisibility(event.target.value as 'shared' | 'private')}
                  aria-label="문서 공개 범위"
                >
                  <option value="shared">프로젝트 공유</option>
                  <option value="private">나만 보기</option>
                </Select>
              </label>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-of-muted">
                <FolderTree size={14} aria-hidden="true" />
                <span className="truncate">{parentTitle}</span>
              </div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-of-muted">
                <Clock3 size={14} aria-hidden="true" />
                <span className="truncate">{formatDateTime(doc.updated_at)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">버전 {doc.version}</Badge>
                {doc.author_id ? <Badge variant="outline">작성자 있음</Badge> : null}
              </div>
            </div>
          </section>

          <LinkedWorkPackagesSection docId={doc.id} projectId={projectId} canWrite={editable} />
          <DocumentAttachments docId={doc.id} projectId={projectId} />
        </aside>
      </div>
    </div>
  )
}

/* Flat plain-text margin notes (Pass 43): bodies render as TEXT NODES only —
   never as HTML. Delete shows for my own comments (the server also lets the
   project owner clean up; a failed delete just surfaces the error). */
function DocumentComments({
  docId,
  projectId,
  canWrite,
}: {
  docId: string
  projectId: string
  canWrite: boolean
}) {
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
    <section aria-label="문서 코멘트" className="space-y-3 rounded-of border border-of-border bg-of-surface p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">코멘트{data ? ` ${data.total}건` : ''}</h2>
        <Badge variant="outline">plain text</Badge>
      </div>
      {data && data.items.length > 0 ? (
        <ul className="space-y-2">
          {data.items.map((c) => (
            <li
              key={c.id}
              className="grid min-w-0 gap-1 rounded-of border border-of-border px-3 py-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-baseline"
            >
              <span className="font-medium text-of-muted">{authorLabel(c.author_id)}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words">{c.body}</span>
              <span className="text-[11px] text-of-muted">{c.created_at.slice(0, 10)}</span>
              {canWrite && c.author_id === me.data?.id ? (
                <button
                  type="button"
                  aria-label="코멘트 삭제"
                  className="justify-self-start rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger sm:justify-self-auto"
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
      {canWrite ? (
        <>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="코멘트 남기기 (plain text)"
              aria-label="새 코멘트"
              className="h-8 min-w-0 text-xs"
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
        </>
      ) : null}
    </section>
  )
}
