import {
  Check,
  ChevronDown,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive } from '@/lib/guards'

import {
  type ProjectDocument,
  conflictOf,
  useDocumentRevision,
  useDocumentRevisions,
  useRestoreDocumentRevision,
} from './api'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((module) => ({
    default: module.RichTextEditor,
  })),
)

const FIELD_LABELS = { title: '제목', body: '본문' } as const

function VersionSkeleton() {
  return (
    <div role="status" aria-label="문서 버전 불러오는 중" className="grid gap-2 py-3">
      {[0, 1, 2].map((row) => (
        <span key={row} className="h-16 animate-pulse rounded-of bg-of-surface-hover" />
      ))}
    </div>
  )
}

type Props = {
  doc: ProjectDocument
  projectId: string
  canRestore: boolean
}

export function DocumentVersionPanel({ doc, projectId, canRestore }: Props) {
  const revisions = useDocumentRevisions(doc.id)
  const items = revisions.data?.pages.flatMap((page) => page.items) ?? []
  const total = revisions.data?.pages[0]?.total ?? 0
  const currentRevisionId = revisions.data?.pages[0]?.current_revision_id ?? null
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [restoredVersion, setRestoredVersion] = useState<number | null>(null)
  const initializedSelection = useRef(false)
  const selected = items.find((item) => item.id === selectedRevisionId) ?? null
  const revision = useDocumentRevision(doc.id, selectedRevisionId)
  const restore = useRestoreDocumentRevision(projectId, doc.id)

  useEffect(() => {
    if (initializedSelection.current || !currentRevisionId) return
    initializedSelection.current = true
    setSelectedRevisionId(currentRevisionId)
  }, [currentRevisionId])

  const restoreSelected = async () => {
    if (!selected || selected.id === currentRevisionId || restore.isPending) return
    if (
      !confirmDestructive(
        `버전 ${selected.document_version}의 제목과 본문으로 복원하시겠습니까? 현재 내용은 새 버전으로 보존됩니다.`,
      )
    ) {
      return
    }
    setRestoredVersion(null)
    try {
      const document = await restore.mutateAsync({
        revisionId: selected.id,
        expectedVersion: doc.version,
      })
      setRestoredVersion(document.version)
    } catch {
      // The mutation exposes its actionable error below without discarding the selection.
    }
  }

  const conflict = conflictOf(restore.error)

  return (
    <section
      className="border-t border-of-border pb-16 pt-4 lg:pb-0"
      aria-labelledby="document-version-heading"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="document-version-heading" className="flex items-center gap-1.5 text-sm font-semibold">
            <History size={15} className="text-of-muted" aria-hidden="true" /> 버전
          </h2>
          <p className="mt-0.5 text-[11px] text-of-muted">
            제목과 본문의 변경 기록을 확인하고 이전 내용으로 복원합니다.
          </p>
        </div>
        {!revisions.isPending && !revisions.isError ? (
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">{total}개</span>
        ) : null}
      </div>

      {revisions.isPending ? <VersionSkeleton /> : null}

      {revisions.isError && items.length === 0 ? (
        <div
          role="alert"
          className="mt-3 flex min-h-24 flex-col items-center justify-center gap-2 border-y border-of-border-subtle px-4 py-5 text-center"
        >
          <p className="text-xs text-of-danger">버전 이력을 불러오지 못했습니다.</p>
          <Button size="sm" variant="outline" onClick={() => void revisions.refetch()}>
            <RefreshCw size={13} /> 재시도
          </Button>
        </div>
      ) : null}

      {!revisions.isError && !revisions.isPending && items.length === 0 ? (
        <div className="mt-3 border-y border-of-border-subtle py-7 text-center">
          <Clock3 size={18} className="mx-auto text-of-muted" aria-hidden="true" />
          <p className="mt-2 text-xs font-medium">아직 저장된 버전이 없습니다</p>
          <p className="mt-1 text-[11px] text-of-muted">다음 제목 또는 본문 변경부터 기록됩니다.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <ol className="divide-y divide-of-border-subtle border-y border-of-border-subtle">
              {items.map((item) => {
                const isCurrent = item.id === currentRevisionId
                const isSelected = item.id === selectedRevisionId
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`grid w-full min-w-0 gap-1 px-2 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus ${
                        isSelected ? 'bg-of-surface-2' : 'hover:bg-of-surface-hover'
                      }`}
                      onClick={() => {
                        setSelectedRevisionId(item.id)
                        setRestoredVersion(null)
                        restore.reset()
                      }}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">버전 {item.document_version}</span>
                        {isCurrent ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-of bg-of-success-soft px-1.5 py-0.5 text-[10px] font-medium text-of-success">
                            <Check size={10} aria-hidden="true" /> 현재
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-[11px] text-of-muted">{item.title}</span>
                      <span className="flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-of-muted">
                        <span className="truncate">{item.actor_name ?? '이전 구성원'}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={item.created_at} className="tabular-nums">
                          {formatDateTime(item.created_at)}
                        </time>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            {revisions.isFetchNextPageError ? (
              <div role="alert" className="mt-2 grid gap-1.5">
                <span className="text-[11px] text-of-danger">다음 버전을 불러오지 못했습니다.</span>
                <Button size="sm" variant="outline" onClick={() => void revisions.fetchNextPage()}>
                  <RefreshCw size={13} /> 재시도
                </Button>
              </div>
            ) : null}

            {revisions.hasNextPage && !revisions.isFetchNextPageError ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 w-full"
                disabled={revisions.isFetchingNextPage}
                onClick={() => void revisions.fetchNextPage()}
              >
                {revisions.isFetchingNextPage ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ChevronDown />
                )}
                버전 더 보기
              </Button>
            ) : null}
          </div>

          <div className="min-w-0 rounded-of border border-of-border bg-of-surface">
            {!selectedRevisionId ? (
              <div className="flex min-h-40 items-center justify-center px-4 text-center text-xs text-of-muted">
                확인할 버전을 선택하세요.
              </div>
            ) : null}

            {revision.isPending ? (
              <div role="status" className="grid min-h-40 place-items-center text-xs text-of-muted">
                <Loader2 className="animate-spin" aria-hidden="true" />
                <span className="sr-only">버전 내용 불러오는 중</span>
              </div>
            ) : null}

            {revision.isError ? (
              <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="text-xs text-of-danger">이 버전의 내용을 불러오지 못했습니다.</p>
                <Button size="sm" variant="outline" onClick={() => void revision.refetch()}>
                  <RefreshCw size={13} /> 재시도
                </Button>
              </div>
            ) : null}

            {revision.data ? (
              <div className="min-w-0">
                <header className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-of-border-subtle px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase text-of-muted">
                      버전 {revision.data.document_version}
                    </p>
                    <h3 className="mt-0.5 break-words text-sm font-semibold">{revision.data.title}</h3>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                      {revision.data.changed_fields.map((field) => (
                        <span
                          key={field}
                          className="rounded-of border border-of-border-subtle bg-of-surface-2 px-1.5 py-0.5 text-[10px] text-of-muted"
                        >
                          {FIELD_LABELS[field]}
                        </span>
                      ))}
                      {revision.data.restored_from_revision_id ? (
                        <span className="rounded-of border border-of-border-subtle bg-of-surface-2 px-1.5 py-0.5 text-[10px] text-of-muted">
                          복원으로 생성됨
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {canRestore && revision.data.id !== currentRevisionId ? (
                    <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => void restoreSelected()}>
                      {restore.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      이 버전 복원
                    </Button>
                  ) : null}
                </header>

                <div className="min-w-0 p-3">
                  <Suspense
                    fallback={
                      <div role="status" className="h-24 animate-pulse rounded-of bg-of-surface-hover" />
                    }
                  >
                    <RichTextEditor
                      value={revision.data.body ?? ''}
                      editable={false}
                      onSave={() => undefined}
                      ariaLabel={`문서 버전 ${revision.data.document_version} 본문 미리보기`}
                    />
                  </Suspense>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-5 pt-2" aria-live="polite">
        {restoredVersion !== null ? (
          <p role="status" className="text-[11px] text-of-success">
            선택한 내용을 새 버전 {restoredVersion}로 복원했습니다.
          </p>
        ) : null}
        {conflict ? (
          <p role="alert" className="text-[11px] text-of-danger">
            다른 변경이 먼저 저장되었습니다. 현재 문서를 확인한 뒤 다시 복원하세요.
          </p>
        ) : null}
        {restore.isError && !conflict ? (
          <p role="alert" className="text-[11px] text-of-danger">
            이 버전을 복원하지 못했습니다. 권한과 문서 상태를 확인해 주세요.
          </p>
        ) : null}
      </div>
    </section>
  )
}
