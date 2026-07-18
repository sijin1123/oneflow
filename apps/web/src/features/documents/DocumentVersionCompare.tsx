import {
  ArrowLeftRight,
  Columns2,
  GitCompareArrows,
  Highlighter,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import { Suspense, lazy, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/controls'
import { Select } from '@/components/ui/select'
import { formatDateTime } from '@/lib/datetime'

import {
  type DocumentRevision,
  type DocumentRevisionSummary,
  useDocumentRevision,
} from './api'
import {
  type RevisionDiffPart,
  diffRevisionText,
  revisionBodyText,
} from './documentRevisionDiff'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((module) => ({
    default: module.RichTextEditor,
  })),
)

type CompareMode = 'inline' | 'side-by-side'

type Props = {
  docId: string
  items: DocumentRevisionSummary[]
  initialBaseRevisionId: string
  initialTargetRevisionId: string
  onClose: () => void
}

function DiffText({ parts, label }: { parts: RevisionDiffPart[]; label: string }) {
  const hasChanges = parts.some((part) => part.kind !== 'equal')
  const replacementOnly =
    parts.length === 2 && parts[0].kind === 'removed' && parts[1].kind === 'added'
  return (
    <div
      aria-label={label}
      className="min-h-14 whitespace-pre-wrap break-words rounded-of border border-of-border-subtle bg-of-surface px-3 py-2.5 text-sm leading-6"
    >
      {!hasChanges ? <span className="text-of-muted">변경 없음</span> : null}
      {hasChanges
        ? parts.map((part, index) => {
            if (part.kind === 'added') {
              return (
                <ins
                  key={`${part.kind}-${index}`}
                  className={`${replacementOnly ? 'block px-1.5 py-1' : ''} bg-of-success-soft text-of-success no-underline`}
                >
                  {part.value}
                </ins>
              )
            }
            if (part.kind === 'removed') {
              return (
                <del
                  key={`${part.kind}-${index}`}
                  className={`${replacementOnly ? 'mb-1 block px-1.5 py-1' : ''} bg-of-danger-soft text-of-danger decoration-of-danger`}
                >
                  {part.value}
                </del>
              )
            }
            return <span key={`${part.kind}-${index}`}>{part.value}</span>
          })
        : null}
    </div>
  )
}

function RevisionSurface({ revision, side }: { revision: DocumentRevision; side: 'base' | 'target' }) {
  return (
    <article className="min-w-0 border border-of-border-subtle bg-of-surface">
      <header className="border-b border-of-border-subtle px-3 py-2.5">
        <p className="text-[10px] font-medium uppercase text-of-muted">
          {side === 'base' ? '기준' : '비교'} · 버전 {revision.document_version}
        </p>
        <h4 className="mt-0.5 break-words text-sm font-semibold">{revision.title}</h4>
        <p className="mt-1 text-[10px] text-of-muted">
          {revision.actor_name ?? '이전 구성원'} ·{' '}
          <time dateTime={revision.created_at}>{formatDateTime(revision.created_at)}</time>
        </p>
      </header>
      <div className="min-w-0 p-3">
        <Suspense
          fallback={<div role="status" className="h-24 animate-pulse rounded-of bg-of-surface-hover" />}
        >
          <RichTextEditor
            value={revision.body ?? ''}
            editable={false}
            onSave={() => undefined}
            ariaLabel={`${side === 'base' ? '기준' : '비교'} 버전 ${revision.document_version} 본문`}
          />
        </Suspense>
      </div>
    </article>
  )
}

export function DocumentVersionCompare({
  docId,
  items,
  initialBaseRevisionId,
  initialTargetRevisionId,
  onClose,
}: Props) {
  const [baseRevisionId, setBaseRevisionId] = useState(initialBaseRevisionId)
  const [targetRevisionId, setTargetRevisionId] = useState(initialTargetRevisionId)
  const [mode, setMode] = useState<CompareMode>('inline')
  const baseRevision = useDocumentRevision(docId, baseRevisionId)
  const targetRevision = useDocumentRevision(docId, targetRevisionId)

  const comparison = useMemo(() => {
    if (!baseRevision.data || !targetRevision.data) return null
    const baseBodyText = revisionBodyText(baseRevision.data.body)
    const targetBodyText = revisionBodyText(targetRevision.data.body)
    const title = diffRevisionText(baseRevision.data.title, targetRevision.data.title)
    const body = diffRevisionText(baseBodyText, targetBodyText)
    const added = [...title, ...body]
      .filter((part) => part.kind === 'added')
      .reduce((total, part) => total + part.value.length, 0)
    const removed = [...title, ...body]
      .filter((part) => part.kind === 'removed')
      .reduce((total, part) => total + part.value.length, 0)
    return {
      title,
      body,
      added,
      removed,
      formattingOnly:
        baseRevision.data.body !== targetRevision.data.body && baseBodyText === targetBodyText,
    }
  }, [baseRevision.data, targetRevision.data])

  const loading = baseRevision.isPending || targetRevision.isPending
  const failed = baseRevision.isError || targetRevision.isError

  return (
    <section
      id="document-version-compare"
      aria-labelledby="document-version-compare-heading"
      className="mt-4 min-w-0 border-y border-of-border bg-of-surface-subtle py-3"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3">
        <div className="min-w-0">
          <h3
            id="document-version-compare-heading"
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <GitCompareArrows size={14} className="text-of-muted" aria-hidden="true" /> 버전 비교
          </h3>
          <p className="mt-0.5 text-[10px] text-of-muted">
            기준 버전에서 비교 버전으로 달라진 제목과 본문을 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            value={mode}
            label="버전 비교 보기"
            options={[
              { value: 'inline', label: '변경 강조', icon: <Highlighter aria-hidden="true" /> },
              { value: 'side-by-side', label: '나란히', icon: <Columns2 aria-hidden="true" /> },
            ]}
            onChange={setMode}
          />
          <Button size="icon" variant="ghost" aria-label="버전 비교 닫기" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="mt-3 grid min-w-0 items-end gap-2 border-y border-of-border-subtle bg-of-surface px-3 py-3 sm:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)]">
        <label className="grid min-w-0 gap-1 text-[10px] font-medium text-of-muted">
          기준 버전
          <Select
            aria-label="기준 버전"
            value={baseRevisionId}
            onChange={(event) => setBaseRevisionId(event.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id} disabled={item.id === targetRevisionId}>
                버전 {item.document_version} · {item.title}
              </option>
            ))}
          </Select>
        </label>
        <Button
          size="icon"
          variant="ghost"
          className="justify-self-center"
          aria-label="기준과 비교 버전 바꾸기"
          title="기준과 비교 버전 바꾸기"
          onClick={() => {
            setBaseRevisionId(targetRevisionId)
            setTargetRevisionId(baseRevisionId)
          }}
        >
          <ArrowLeftRight aria-hidden="true" />
        </Button>
        <label className="grid min-w-0 gap-1 text-[10px] font-medium text-of-muted">
          비교 버전
          <Select
            aria-label="비교 버전"
            value={targetRevisionId}
            onChange={(event) => setTargetRevisionId(event.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id} disabled={item.id === baseRevisionId}>
                버전 {item.document_version} · {item.title}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {loading ? (
        <div role="status" className="grid min-h-36 place-items-center text-xs text-of-muted">
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span className="sr-only">비교할 버전 불러오는 중</span>
        </div>
      ) : null}

      {failed ? (
        <div role="alert" className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-xs text-of-danger">비교할 버전 내용을 불러오지 못했습니다.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (baseRevision.isError) void baseRevision.refetch()
              if (targetRevision.isError) void targetRevision.refetch()
            }}
          >
            <RefreshCw aria-hidden="true" /> 재시도
          </Button>
        </div>
      ) : null}

      {!loading && !failed && baseRevision.data && targetRevision.data && comparison ? (
        <div className="min-w-0 px-3 pt-3">
          {mode === 'side-by-side' ? (
            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              <RevisionSurface revision={baseRevision.data} side="base" />
              <RevisionSurface revision={targetRevision.data} side="target" />
            </div>
          ) : (
            <div className="grid min-w-0 gap-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[10px] text-of-muted">
                <div className="flex flex-wrap gap-3" aria-label="변경 강조 범례">
                  <span className="bg-of-success-soft px-1.5 py-0.5 text-of-success">추가</span>
                  <span className="bg-of-danger-soft px-1.5 py-0.5 text-of-danger line-through">삭제</span>
                </div>
                <span className="tabular-nums">
                  추가 {comparison.added}자 · 삭제 {comparison.removed}자
                </span>
              </div>
              <div>
                <h4 className="mb-1 text-[10px] font-medium text-of-muted">제목</h4>
                <DiffText parts={comparison.title} label="제목 변경 비교" />
              </div>
              <div>
                <h4 className="mb-1 text-[10px] font-medium text-of-muted">본문</h4>
                <DiffText parts={comparison.body} label="본문 변경 비교" />
                {comparison.formattingOnly ? (
                  <p className="mt-1.5 text-[10px] text-of-muted">
                    텍스트 내용은 같지만 서식 또는 문서 구조가 변경되었습니다.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
