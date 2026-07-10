import { ArrowDown, ArrowUp, Pin, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import {
  type PersonalNote,
  useCreatePersonalNote,
  useDeletePersonalNote,
  useOrderPersonalNotes,
  usePersonalNotes,
  useUpdatePersonalNote,
} from './api'

type Draft = { title: string; body: string; is_pinned: boolean }

const blankDraft = (): Draft => ({ title: '', body: '', is_pinned: false })

function draftOf(note: PersonalNote): Draft {
  return { title: note.title, body: note.body, is_pinned: note.is_pinned }
}

function conflictCurrent(error: unknown): PersonalNote | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  return (error.payload as { current?: PersonalNote })?.current ?? null
}

export function PersonalNotesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [editing, setEditing] = useState<PersonalNote | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [conflict, setConflict] = useState<PersonalNote | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const notes = usePersonalNotes(search, 200)
  const create = useCreatePersonalNote()
  const update = useUpdatePersonalNote()
  const remove = useDeletePersonalNote()
  const order = useOrderPersonalNotes()
  const fullListLoaded = !search && (notes.data?.total ?? -1) === (notes.data?.items.length ?? -2)

  const resetEditor = () => {
    setEditing(null)
    setDraft(blankDraft())
    setConflict(null)
  }

  const startCreate = () => {
    resetEditor()
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  useEffect(() => {
    if (params.get('new') !== '1') return
    startCreate()
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('new')
      return next
    }, { replace: true })
  }, [params, setParams])

  const startEdit = (note: PersonalNote) => {
    setEditing(note)
    setDraft(draftOf(note))
    setConflict(null)
  }

  const finishSave = () => {
    resetEditor()
  }

  const save = () => {
    const input = { ...draft, title: draft.title.trim() }
    if (!input.title) return
    if (!editing) {
      create.mutate(input, { onSuccess: resetEditor })
      return
    }
    update.mutate(
      { id: editing.id, expected_version: editing.version, ...input },
      {
        onSuccess: finishSave,
        onError: (error) => setConflict(conflictCurrent(error)),
      },
    )
  }

  const overwriteConflict = () => {
    if (!conflict) return
    const latest = conflict
    setConflict(null)
    update.mutate(
      {
        id: latest.id,
        expected_version: latest.version,
        ...draft,
        title: draft.title.trim(),
      },
      {
        onSuccess: finishSave,
        onError: (error) => setConflict(conflictCurrent(error)),
      },
    )
  }

  const refreshLatest = () => {
    if (!conflict) return
    setEditing(conflict)
    setDraft(draftOf(conflict))
    setConflict(null)
  }

  const move = (note: PersonalNote, direction: -1 | 1) => {
    if (!notes.data || !fullListLoaded) return
    const items = [...notes.data.items]
    const index = items.findIndex((item) => item.id === note.id)
    const other = items[index + direction]
    if (!other || other.is_pinned !== note.is_pinned) return
    ;[items[index], items[index + direction]] = [items[index + direction], items[index]]
    order.mutate(items.map((item) => ({ id: item.id, expected_version: item.version })))
  }

  const mutationError = create.isError || update.isError || remove.isError || order.isError

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-of-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase text-of-muted">Personal space</p>
          <h1 className="mt-1 text-base font-semibold">개인 메모</h1>
        </div>
        <Button size="sm" onClick={startCreate}>
          <Plus /> 새 메모
        </Button>
      </header>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-2.5 top-2.5 text-of-muted"
          size={14}
        />
        <Input
          aria-label="메모 제목 검색"
          value={search}
          onChange={(event) => {
            const q = event.target.value
            setSearch(q)
            setParams(q ? { q } : {}, { replace: true })
          }}
          className="pl-8"
          placeholder="제목 검색"
        />
      </div>

      <section
        aria-label={editing ? '메모 편집기' : '새 메모 작성'}
        className="rounded-of border border-of-border bg-of-surface p-3"
      >
        <div className="flex gap-2">
          <Input
            ref={titleRef}
            id="personal-note-title"
            aria-label="메모 제목"
            value={draft.title}
            maxLength={120}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder="메모 제목"
          />
          <button
            type="button"
            aria-label="고정 전환"
            aria-pressed={draft.is_pinned}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-of-border hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => setDraft({ ...draft, is_pinned: !draft.is_pinned })}
          >
            <Pin
              size={14}
              className={draft.is_pinned ? 'fill-of-accent text-of-accent' : ''}
            />
          </button>
        </div>
        <textarea
          aria-label="메모 내용"
          value={draft.body}
          maxLength={4000}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          className="mt-2 min-h-28 w-full resize-y rounded-of border border-of-border bg-transparent p-2 text-sm outline-none focus:ring-2 focus:ring-of-focus"
          placeholder="메모 내용"
        />

        {conflict ? (
          <div
            role="alert"
            className="mt-2 rounded-of bg-of-danger/10 p-2 text-xs text-of-danger"
          >
            다른 곳에서 변경된 메모입니다. 작성 중인 내용은 유지됩니다.
            <div className="mt-2 flex flex-wrap gap-3">
              <button type="button" className="underline" onClick={refreshLatest}>
                최신 내용 불러오기
              </button>
              <button type="button" className="underline" onClick={overwriteConflict}>
                내 내용으로 다시 저장
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-of-muted">{draft.body.length}/4000</span>
          {editing ? (
            <button type="button" className="text-xs text-of-muted" onClick={startCreate}>
              취소
            </button>
          ) : null}
          <Button
            size="sm"
            disabled={!draft.title.trim() || create.isPending || update.isPending}
            onClick={save}
          >
            {editing ? '저장' : '추가'}
          </Button>
        </div>
      </section>

      {notes.isPending ? (
        <ListSkeleton />
      ) : notes.isError ? (
        <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
      ) : notes.data?.items.length === 0 ? (
        <div className="rounded-of border border-dashed border-of-border px-3 py-10 text-center text-sm text-of-muted">
          {search ? '일치하는 메모가 없습니다.' : '첫 개인 메모를 남겨보세요.'}
        </div>
      ) : (
        <ul className="space-y-2" aria-label="개인 메모 목록">
          {notes.data?.items.map((note, index, items) => (
            <li key={note.id} className="rounded-of border border-of-border bg-of-surface p-3">
              <div className="flex min-w-0 items-start gap-2">
                <button
                  type="button"
                  aria-label={note.is_pinned ? '고정 해제' : '고정'}
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: note.id,
                      expected_version: note.version,
                      is_pinned: !note.is_pinned,
                    })
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-of-muted hover:bg-of-surface-2 hover:text-of-accent disabled:opacity-40"
                >
                  <Pin
                    size={14}
                    className={note.is_pinned ? 'fill-of-accent text-of-accent' : ''}
                  />
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => startEdit(note)}
                >
                  <span className="block truncate text-sm font-medium">{note.title}</span>
                  {note.body ? (
                    <span className="mt-1 block line-clamp-2 whitespace-pre-wrap text-xs text-of-muted">
                      {note.body}
                    </span>
                  ) : null}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="위로 이동"
                    disabled={
                      !fullListLoaded ||
                      index === 0 ||
                      items[index - 1]?.is_pinned !== note.is_pinned ||
                      order.isPending
                    }
                    onClick={() => move(note, -1)}
                    className="flex h-11 w-11 items-center justify-center rounded hover:bg-of-surface-2 disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="아래로 이동"
                    disabled={
                      !fullListLoaded ||
                      index === items.length - 1 ||
                      items[index + 1]?.is_pinned !== note.is_pinned ||
                      order.isPending
                    }
                    onClick={() => move(note, 1)}
                    className="flex h-11 w-11 items-center justify-center rounded hover:bg-of-surface-2 disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="메모 삭제"
                    disabled={remove.isPending}
                    className="flex h-11 w-11 items-center justify-center rounded text-of-muted hover:bg-of-danger/10 hover:text-of-danger disabled:opacity-40"
                    onClick={() => {
                      if (window.confirm(`'${note.title}' 메모를 삭제할까요?`)) {
                        remove.mutate({ id: note.id, expectedVersion: note.version })
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!fullListLoaded && notes.data ? (
        <p className="text-xs text-of-muted">검색 중에는 순서를 바꿀 수 없습니다.</p>
      ) : null}
      {mutationError && !conflict ? (
        <p role="alert" className="text-xs text-of-danger">
          저장하지 못했습니다.{' '}
          <button type="button" onClick={() => notes.refetch()} className="underline">
            다시 불러오기 <RefreshCw className="inline" size={12} />
          </button>
        </p>
      ) : null}
    </div>
  )
}
