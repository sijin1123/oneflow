import { ArrowLeft, ArrowRight, Plus, RefreshCw, Search, StickyNote, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import {
  type PersonalNote,
  type PersonalNoteUpdate,
  useCreatePersonalNote,
  useDeletePersonalNote,
  useOrderPersonalNotes,
  usePersonalNotes,
  useUpdatePersonalNote,
} from './api'
import { StickyNoteCard } from './StickyNoteCard'

type Conflict = {
  current: PersonalNote
  patch: Omit<PersonalNoteUpdate, 'expected_version'>
}

function conflictCurrent(error: unknown): PersonalNote | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  return (error.payload as { current?: PersonalNote })?.current ?? null
}

export function PersonalNotesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [searchOpen, setSearchOpen] = useState(Boolean(params.get('q')))
  const [notice, setNotice] = useState('')
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const notes = usePersonalNotes(search, 200)
  const allNotes = usePersonalNotes('', 200)
  const create = useCreatePersonalNote()
  const update = useUpdatePersonalNote()
  const remove = useDeletePersonalNote()
  const order = useOrderPersonalNotes()
  const fullListLoaded = !search && (notes.data?.total ?? -1) === (notes.data?.items.length ?? -2)

  const createBlank = useCallback(async () => {
    const existing = allNotes.data?.items.find((note) => !note.title.trim() && !note.body.trim())
    if (existing) {
      if (search) {
        setSearch('')
        setParams({}, { replace: true })
      }
      setAutoFocusId(existing.id)
      setNotice('내용이 없는 개인 메모가 이미 있습니다.')
      return
    }
    setNotice('')
    try {
      const note = await create.mutateAsync({ title: '', body: '', color: 'mint' })
      setAutoFocusId(note.id)
    } catch (error) {
      setNotice(error instanceof ApiError && error.status === 409
        ? '내용이 없는 개인 메모가 이미 있습니다.'
        : '메모를 만들지 못했습니다.')
    }
  }, [allNotes.data?.items, create, search, setParams])

  useEffect(() => {
    if (params.get('new') !== '1') return
    void createBlank()
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('new')
      return next
    }, { replace: true })
  }, [createBlank, params, setParams])

  const patchNote = (
    note: PersonalNote,
    patch: Omit<PersonalNoteUpdate, 'expected_version'>,
  ) => {
    update.mutate(
      { id: note.id, expected_version: note.version, ...patch },
      {
        onSuccess: () => {
          setConflict(null)
          setNotice('')
        },
        onError: (error) => {
          const current = conflictCurrent(error)
          if (current) setConflict({ current, patch })
          else setNotice('메모를 저장하지 못했습니다.')
        },
      },
    )
  }

  const deleteNote = (note: PersonalNote) => {
    if (!window.confirm(`'${note.title || '제목 없는 메모'}' 메모를 삭제할까요?`)) return
    remove.mutate(
      { id: note.id, expectedVersion: note.version },
      { onError: () => setNotice('메모를 삭제하지 못했습니다.') },
    )
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

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <header className="flex min-h-14 items-center gap-3 border-b border-of-border px-4 sm:px-6">
        <StickyNote size={18} aria-hidden="true" />
        <h1 className="text-base font-semibold">개인 메모</h1>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {searchOpen ? (
            <div className="relative w-[min(18rem,45vw)]">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 text-of-muted" size={14} />
              <input
                ref={searchRef}
                aria-label="메모 제목 검색"
                value={search}
                placeholder="제목으로 검색"
                className="h-9 w-full rounded-of border border-of-border bg-of-surface pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-of-focus"
                onChange={(event) => {
                  const q = event.target.value
                  setSearch(q)
                  setParams(q ? { q } : {}, { replace: true })
                }}
              />
              <button
                type="button"
                aria-label="검색 닫기"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover"
                onClick={() => {
                  setSearch('')
                  setSearchOpen(false)
                  setParams({}, { replace: true })
                }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label="메모 검색"
              className="flex h-9 w-9 items-center justify-center rounded-of hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => {
                setSearchOpen(true)
                requestAnimationFrame(() => searchRef.current?.focus())
              }}
            >
              <Search size={17} />
            </button>
          )}
          <Button size="sm" onClick={() => void createBlank()} disabled={create.isPending}>
            <Plus /> 새 메모
          </Button>
        </div>
      </header>

      {conflict ? (
        <div role="alert" className="mx-4 mt-4 rounded-of border border-of-danger/30 bg-of-danger/10 p-3 text-xs text-of-danger sm:mx-6">
          다른 곳에서 변경된 메모입니다. 작성 중인 내용은 유지됩니다.
          <div className="mt-2 flex gap-4">
            <button type="button" className="underline" onClick={() => { setConflict(null); void notes.refetch() }}>
              최신 내용 불러오기
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => {
                const { current, patch } = conflict
                setConflict(null)
                update.mutate({ id: current.id, expected_version: current.version, ...patch })
              }}
            >
              내 내용으로 다시 저장
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div role="alert" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-of border border-of-border bg-of-surface p-4 text-sm shadow-[var(--of-shadow-popover)]">
          <span>{notice}</span>
          <button type="button" aria-label="알림 닫기" onClick={() => setNotice('')}><X size={15} /></button>
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {notes.isPending ? (
          <ListSkeleton />
        ) : notes.isError ? (
          <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
        ) : notes.data?.items.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-of border border-dashed border-of-border text-center text-sm text-of-muted">
            <StickyNote size={24} className="mb-3" />
            <p>{search ? '일치하는 메모가 없습니다.' : '첫 개인 메모를 남겨보세요.'}</p>
            {!search ? <Button className="mt-4" size="sm" onClick={() => void createBlank()}><Plus /> 새 메모</Button> : null}
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4" aria-label="개인 메모 목록">
            {notes.data?.items.map((note, index, items) => (
              <li key={note.id} className="group relative min-w-0">
                <StickyNoteCard
                  note={note}
                  autoFocus={autoFocusId === note.id}
                  pending={update.isPending || remove.isPending || order.isPending}
                  onUpdate={patchNote}
                  onDelete={deleteNote}
                />
                <div className="absolute right-2 top-2 flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="위로 이동"
                    disabled={!fullListLoaded || index === 0 || items[index - 1]?.is_pinned !== note.is_pinned || update.isPending || remove.isPending || order.isPending}
                    className="flex h-7 w-7 items-center justify-center rounded-of bg-white/65 disabled:opacity-30"
                    onClick={() => move(note, -1)}
                  ><ArrowLeft size={13} /></button>
                  <button
                    type="button"
                    aria-label="아래로 이동"
                    disabled={!fullListLoaded || index === items.length - 1 || items[index + 1]?.is_pinned !== note.is_pinned || update.isPending || remove.isPending || order.isPending}
                    className="flex h-7 w-7 items-center justify-center rounded-of bg-white/65 disabled:opacity-30"
                    onClick={() => move(note, 1)}
                  ><ArrowRight size={13} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!fullListLoaded && notes.data ? (
          <p className="mt-3 text-xs text-of-muted">검색 중에는 순서를 바꿀 수 없습니다.</p>
        ) : null}
        {(update.isError || remove.isError || order.isError) && !conflict && !notice ? (
          <p role="alert" className="mt-3 text-xs text-of-danger">
            저장하지 못했습니다. <button type="button" onClick={() => notes.refetch()} className="underline">다시 불러오기 <RefreshCw className="inline" size={12} /></button>
          </p>
        ) : null}
      </main>
    </div>
  )
}
