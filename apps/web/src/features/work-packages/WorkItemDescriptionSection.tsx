import { Check, Pencil, X } from 'lucide-react'
import { Suspense, lazy, useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((module) => ({
    default: module.RichTextEditor,
  })),
)

type Props = {
  value: string | null
  canWrite: boolean
  saving: boolean
  onSave: (value: string | null) => Promise<void>
}

function normalizedDescription(value: string) {
  const text = value
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, '')
    .trim()
  return text ? value : null
}

function comparableDescription(value: string | null) {
  if (value === null) return null
  const normalized = normalizedDescription(value)
  if (normalized === null) return null
  if (/<[a-z][^>]*>/i.test(normalized)) return normalized.trim()
  const escaped = normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>${escaped}</p>`
}

function EditorFallback({ plain = false }: { plain?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={plain
        ? 'h-16 animate-pulse rounded-of bg-of-surface-2/50'
        : 'h-28 animate-pulse rounded-of border border-of-border bg-of-surface-2/50'}
    />
  )
}

export function WorkItemDescriptionSection({ value, canWrite, saving, onSave }: Props) {
  const headingId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [editing, value])

  const storedDraft = normalizedDescription(draft)
  const dirty = comparableDescription(storedDraft) !== comparableDescription(value)

  const beginEditing = () => {
    setDraft(value ?? '')
    setError(null)
    setEditing(true)
  }

  const cancelEditing = () => {
    if (saving) return
    setDraft(value ?? '')
    setError(null)
    setEditing(false)
  }

  const save = async () => {
    if (!dirty || saving) return
    setError(null)
    try {
      await onSave(storedDraft)
      setEditing(false)
    } catch {
      setError('설명을 저장하지 못했습니다. 작성 중인 내용은 그대로 유지됩니다.')
    }
  }

  return (
    <section aria-labelledby={headingId} className="group/description border-b border-of-border-subtle pb-4">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 id={headingId} className="text-xs font-semibold text-of-secondary">설명</h3>
        {canWrite && !editing ? (
          <IconButton
            label="설명 편집"
            size="sm"
            className="opacity-70 transition-opacity group-hover/description:opacity-100 focus-visible:opacity-100"
            onClick={beginEditing}
          >
            <Pencil size={14} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {editing ? (
        <div
          className="space-y-2"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEditing()
            }
          }}
        >
          <Suspense fallback={<EditorFallback />}>
            <RichTextEditor
              key="description-edit"
              editable
              saveOnBlur={false}
              value={draft}
              ariaLabel="설명"
              onChange={setDraft}
              onSave={() => undefined}
            />
          </Suspense>
          <div className="flex items-center justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={cancelEditing}>
              <X size={13} aria-hidden="true" />
              취소
            </Button>
            <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              <Check size={13} aria-hidden="true" />
              {saving ? '저장 중' : '저장'}
            </Button>
          </div>
          {error ? <p role="alert" className="text-xs text-of-danger">{error}</p> : null}
        </div>
      ) : value ? (
        <Suspense fallback={<EditorFallback plain />}>
          <RichTextEditor
            key="description-read"
            appearance="plain"
            editable={false}
            value={value}
            ariaLabel="설명"
            onSave={() => undefined}
          />
        </Suspense>
      ) : (
        <div className="flex min-h-16 items-center px-1 py-2 text-sm text-of-muted">
          {canWrite ? '설명을 추가해 작업의 배경과 완료 기준을 공유하세요.' : '등록된 설명이 없습니다.'}
        </div>
      )}
    </section>
  )
}
