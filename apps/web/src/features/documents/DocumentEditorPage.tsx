import {
  Archive,
  ArrowLeft,
  Clock3,
  FileText,
  FolderTree,
  MessageSquareText,
  Quote,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommentReactionBar } from '@/components/ui/comment-reactions'
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
  type DocumentComment,
  type DocumentCommentList,
  type ProjectDocument,
  conflictOf,
  useCreateDocumentComment,
  useCreateInlineDocumentComment,
  useDeleteDocument,
  useDeleteDocumentComment,
  useDocument,
  useDocumentComments,
  useDocuments,
  useDocumentLifecycle,
  useToggleDocumentCommentReaction,
  useUpdateDocument,
} from './api'
import { DocumentAttachments } from './DocumentAttachments'
import { LinkedWorkPackagesSection } from './LinkedWorkPackagesSection'
import { subtreeIds } from './tree'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
)

const normalizeAnchorQuote = (value: string) => value.replace(/\s+/g, ' ').trim()

function bodyAnchorQuote(body: string | null | undefined, anchorId: string): string | null {
  if (!body || typeof DOMParser === 'undefined') return null
  const parsed = new DOMParser().parseFromString(body, 'text/html')
  const nodes = parsed.querySelectorAll<HTMLElement>(
    `[data-comment-anchor="${anchorId}"]`,
  )
  if (nodes.length === 0) return null
  return normalizeAnchorQuote(Array.from(nodes).map((node) => node.textContent ?? '').join(''))
}

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
  const comments = useDocumentComments(docId)
  const createInlineComment = useCreateInlineDocumentComment(docId, projectId)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'shared' | 'private'>('shared')
  const [activeCommentAnchorId, setActiveCommentAnchorId] = useState<string | null>(null)
  const upload = useUploadAttachment(projectId)
  const canWrite = useCanWrite(projectId)
  const activeCommentAnchorIds = useMemo(
    () =>
      Array.from(
        new Set(
          (comments.data?.items ?? [])
            .filter(
              (comment) =>
                comment.anchor_id !== null &&
                comment.anchor_quote !== null &&
                bodyAnchorQuote(doc?.body, comment.anchor_id) === comment.anchor_quote,
            )
            .map((comment) => comment.anchor_id as string),
        ),
      ),
    [comments.data?.items, doc?.body],
  )

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
  const inlineCommentConflict = conflictOf(createInlineComment.error)

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
  const activateThread = (anchorId: string) => {
    setActiveCommentAnchorId(anchorId)
    requestAnimationFrame(() => {
      document.getElementById(`document-comment-thread-${anchorId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  }
  const activateBodyAnchor = (anchorId: string) => {
    setActiveCommentAnchorId(anchorId)
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-comment-anchor="${anchorId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

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
                activeCommentAnchorIds={activeCommentAnchorIds}
                activeCommentAnchorId={activeCommentAnchorId}
                onCommentAnchorActivate={activateThread}
                onCreateInlineComment={
                  editable
                    ? async ({ anchorId, anchorQuote, commentBody, documentBody }) => {
                        await createInlineComment.mutateAsync({
                          body: commentBody,
                          anchor_id: anchorId,
                          anchor_quote: anchorQuote,
                          expected_document_version:
                            inlineCommentConflict?.current.version ?? doc.version,
                          document_body: documentBody,
                        })
                        setActiveCommentAnchorId(anchorId)
                      }
                    : undefined
                }
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

          <DocumentComments
            doc={doc}
            projectId={projectId}
            canWrite={editable}
            data={comments.data}
            isPending={comments.isPending}
            isError={comments.isError}
            onRetry={() => comments.refetch()}
            activeAnchorId={activeCommentAnchorId}
            onActivateAnchor={activateBodyAnchor}
          />
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

function DocumentComments({
  doc,
  projectId,
  canWrite,
  data,
  isPending,
  isError,
  onRetry,
  activeAnchorId,
  onActivateAnchor,
}: {
  doc: ProjectDocument
  projectId: string
  canWrite: boolean
  data: DocumentCommentList | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => unknown
  activeAnchorId: string | null
  onActivateAnchor: (anchorId: string) => void
}) {
  const me = useMe()
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const create = useCreateDocumentComment(doc.id)
  const createInline = useCreateInlineDocumentComment(doc.id, projectId)
  const del = useDeleteDocumentComment(doc.id)
  const toggleReaction = useToggleDocumentCommentReaction(doc.id)
  const [draft, setDraft] = useState('')
  const [replyAnchorId, setReplyAnchorId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  const anchoredThreads = useMemo(() => {
    const threads = new Map<
      string,
      { anchorId: string; quote: string; comments: DocumentComment[] }
    >()
    for (const comment of data?.items ?? []) {
      if (!comment.anchor_id || !comment.anchor_quote) continue
      const existing = threads.get(comment.anchor_id)
      if (existing) existing.comments.push(comment)
      else {
        threads.set(comment.anchor_id, {
          anchorId: comment.anchor_id,
          quote: comment.anchor_quote,
          comments: [comment],
        })
      }
    }
    return Array.from(threads.values())
  }, [data?.items])
  const generalComments = useMemo(
    () => (data?.items ?? []).filter((comment) => comment.anchor_id === null),
    [data?.items],
  )

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

  const submitReply = (anchorId: string, quote: string) => {
    const body = replyDraft.trim()
    if (!body || createInline.isPending) return
    createInline.mutate(
      { body, anchor_id: anchorId, anchor_quote: quote },
      {
        onSuccess: () => {
          setReplyAnchorId(null)
          setReplyDraft('')
        },
      },
    )
  }

  const anchorExists = (anchorId: string, quote: string) =>
    bodyAnchorQuote(doc.body, anchorId) === quote

  const commentLine = (comment: DocumentComment) => (
    <li
      key={comment.id}
      className="min-w-0 border-t border-of-border-subtle py-2 text-xs first:border-t-0"
    >
      <div className="grid min-w-0 gap-1 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-baseline">
        <span className="font-medium text-of-muted">{authorLabel(comment.author_id)}</span>
        <span className="min-w-0 whitespace-pre-wrap break-words">{comment.body}</span>
        <span className="text-[11px] text-of-muted">{comment.created_at.slice(0, 10)}</span>
        {canWrite && comment.author_id === me.data?.id ? (
          <button
            type="button"
            aria-label="코멘트 삭제"
            className="justify-self-start rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger sm:justify-self-auto"
            disabled={del.isPending}
            onClick={() => del.mutate(comment.id)}
          >
            <Trash2 size={12} />
          </button>
        ) : null}
      </div>
      <CommentReactionBar
        reactions={comment.reactions ?? []}
        canReact={canWrite}
        pending={toggleReaction.isPending}
        label={`${authorLabel(comment.author_id)} 코멘트 리액션`}
        onToggle={({ key, on }) =>
          toggleReaction.mutate({ commentId: comment.id, key, on })
        }
      />
    </li>
  )

  return (
    <section
      aria-label="문서 코멘트"
      className="space-y-4 border-t border-of-border pb-16 pt-4 lg:pb-0"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareText size={15} className="text-of-muted" aria-hidden="true" />
          <h2 className="text-sm font-semibold">코멘트{data ? ` ${data.total}건` : ''}</h2>
        </div>
        <Badge variant="outline">본문 앵커 + 일반</Badge>
      </div>

      {isPending ? <div className="h-20 animate-pulse rounded-of bg-of-surface-2/60" /> : null}
      {isError ? (
        <div className="flex items-center justify-between gap-2 text-xs text-of-danger">
          <span>코멘트를 불러오지 못했습니다.</span>
          <Button size="sm" variant="outline" onClick={() => void onRetry()}>
            다시 시도
          </Button>
        </div>
      ) : null}

      {anchoredThreads.length > 0 ? (
        <div className="grid gap-3">
          <h3 className="text-xs font-semibold text-of-muted">본문 스레드</h3>
          {anchoredThreads.map((thread) => {
            const exists = anchorExists(thread.anchorId, thread.quote)
            const active = activeAnchorId === thread.anchorId
            return (
              <article
                id={`document-comment-thread-${thread.anchorId}`}
                key={thread.anchorId}
                className={`border-l-2 pl-3 ${active ? 'border-of-focus' : 'border-of-border'}`}
              >
                <button
                  type="button"
                  className="flex w-full min-w-0 items-start gap-2 text-left disabled:cursor-default"
                  disabled={!exists}
                  onClick={() => onActivateAnchor(thread.anchorId)}
                >
                  <Quote size={13} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium">
                    {thread.quote}
                  </span>
                  <Badge variant={exists ? 'accent' : 'outline'}>
                    {exists ? `${thread.comments.length}건` : '본문 변경됨'}
                  </Badge>
                </button>
                <ul className="mt-2">{thread.comments.map(commentLine)}</ul>
                {canWrite && exists ? (
                  replyAnchorId === thread.anchorId ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            submitReply(thread.anchorId, thread.quote)
                          }
                        }}
                        aria-label="인라인 답글"
                        placeholder="이 문구에 답글"
                        maxLength={4000}
                        className="h-8 min-w-0 text-xs"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={!replyDraft.trim() || createInline.isPending}
                        onClick={() => submitReply(thread.anchorId, thread.quote)}
                      >
                        <Send size={12} /> 답글
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-of-accent hover:underline"
                      onClick={() => {
                        setReplyAnchorId(thread.anchorId)
                        setReplyDraft('')
                      }}
                    >
                      답글 남기기
                    </button>
                  )
                ) : null}
              </article>
            )
          })}
          {createInline.isError ? (
            <p role="alert" className="text-xs text-of-danger">
              답글을 등록하지 못했습니다. 본문 앵커가 변경되었는지 확인해 주세요.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2">
        <h3 className="text-xs font-semibold text-of-muted">일반 코멘트</h3>
        {generalComments.length > 0 ? (
          <ul>{generalComments.map(commentLine)}</ul>
        ) : !isPending && !isError ? (
          <p className="text-xs text-of-muted">
            일반 코멘트가 없습니다. 본문을 선택하면 위치가 연결된 스레드를 만들 수 있습니다.
          </p>
        ) : null}
      </div>
      {canWrite ? (
        <>
          <div className="grid min-w-0 gap-2 pr-12 sm:grid-cols-[minmax(0,1fr)_auto] sm:pr-0">
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
      {toggleReaction.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          리액션을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
    </section>
  )
}
