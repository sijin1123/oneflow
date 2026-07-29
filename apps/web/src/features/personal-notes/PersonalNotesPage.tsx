import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import {
  type PersonalNote,
  type PersonalNoteInput,
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

type OrderItem = { id: string; expected_version: number }

type FailedAction =
  | { kind: 'create'; input: PersonalNoteInput }
  | {
      kind: 'update'
      note: PersonalNote
      patch: Omit<PersonalNoteUpdate, 'expected_version'>
    }
  | {
      kind: 'delete'
      id: string
      expectedVersion: number
      title: string
    }
  | { kind: 'order'; items: OrderItem[] }

function conflictCurrent(error: unknown): PersonalNote | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  return (error.payload as { current?: PersonalNote })?.current ?? null
}

function failureCopy(action: FailedAction) {
  if (action.kind === 'create') return '새 메모를 만들지 못했습니다.'
  if (action.kind === 'update') {
    const title = typeof action.patch.title === 'string' ? action.patch.title : action.note.title
    return `'${title || '제목 없는 메모'}' 변경을 저장하지 못했습니다.`
  }
  if (action.kind === 'delete')
    return `'${action.title || '제목 없는 메모'}' 메모를 삭제하지 못했습니다.`
  return '메모 순서를 저장하지 못했습니다.'
}

export function PersonalNotesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [searchOpen, setSearchOpen] = useState(Boolean(params.get('q')))
  const [notice, setNotice] = useState('')
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [failedAction, setFailedAction] = useState<FailedAction | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const notes = usePersonalNotes(search, 200)
  const allNotes = usePersonalNotes('', 200)
  const create = useCreatePersonalNote()
  const update = useUpdatePersonalNote()
  const remove = useDeletePersonalNote()
  const order = useOrderPersonalNotes()
  const fullListLoaded = !search && (notes.data?.total ?? -1) === (notes.data?.items.length ?? -2)
  const total = notes.data?.total ?? 0

  const runCreate = useCallback(
    async (input: PersonalNoteInput) => {
      setFailedAction(null)
      create.reset()
      try {
        const note = await create.mutateAsync(input)
        setAutoFocusId(note.id)
        setNotice('')
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setNotice('내용이 없는 개인 메모가 이미 있습니다.')
          return
        }
        setFailedAction({ kind: 'create', input })
      }
    },
    [create],
  )

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
    await runCreate({ title: '', body: '', color: 'mint' })
  }, [allNotes.data?.items, runCreate, search, setParams])

  useEffect(() => {
    if (params.get('new') !== '1') return
    void createBlank()
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [createBlank, params, setParams])

  const runUpdate = (note: PersonalNote, patch: Omit<PersonalNoteUpdate, 'expected_version'>) => {
    setFailedAction(null)
    update.reset()
    update.mutate(
      { id: note.id, expected_version: note.version, ...patch },
      {
        onSuccess: () => {
          setConflict(null)
          setNotice('')
        },
        onError: (error) => {
          const current = conflictCurrent(error)
          if (current) {
            setConflict({ current, patch })
            return
          }
          setFailedAction({ kind: 'update', note, patch })
        },
      },
    )
  }

  const runDelete = (action: Extract<FailedAction, { kind: 'delete' }>) => {
    setFailedAction(null)
    remove.reset()
    remove.mutate(
      { id: action.id, expectedVersion: action.expectedVersion },
      {
        onSuccess: () => setNotice(''),
        onError: () => setFailedAction(action),
      },
    )
  }

  const deleteNote = (note: PersonalNote) => {
    if (!window.confirm(`'${note.title || '제목 없는 메모'}' 메모를 삭제할까요?`)) return
    runDelete({
      kind: 'delete',
      id: note.id,
      expectedVersion: note.version,
      title: note.title,
    })
  }

  const runOrder = (items: OrderItem[]) => {
    setFailedAction(null)
    order.reset()
    order.mutate(items, {
      onSuccess: () => setNotice(''),
      onError: () => setFailedAction({ kind: 'order', items }),
    })
  }

  const move = (note: PersonalNote, direction: -1 | 1) => {
    if (!notes.data || !fullListLoaded) return
    const items = [...notes.data.items]
    const index = items.findIndex((item) => item.id === note.id)
    const other = items[index + direction]
    if (!other || other.is_pinned !== note.is_pinned) return
    ;[items[index], items[index + direction]] = [items[index + direction], items[index]]
    runOrder(
      items.map((item) => ({
        id: item.id,
        expected_version: item.version,
      })),
    )
  }

  const retryFailedAction = () => {
    if (!failedAction) return
    if (failedAction.kind === 'create') {
      void runCreate(failedAction.input)
      return
    }
    if (failedAction.kind === 'update') {
      runUpdate(failedAction.note, failedAction.patch)
      return
    }
    if (failedAction.kind === 'delete') {
      runDelete(failedAction)
      return
    }
    runOrder(failedAction.items)
  }

  const actionPending = create.isPending || update.isPending || remove.isPending || order.isPending

  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl min-w-0 flex-col px-4 sm:px-6">
      <FrameContextActions>
        <div className="flex h-full min-w-0 items-center gap-1">
          <Badge variant="outline" className="max-w-20 truncate">
            {notes.isPending ? '불러오는 중' : `${total}개`}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label={searchOpen ? '검색 닫기' : '메모 검색'}
            title={searchOpen ? '검색 닫기' : '메모 검색'}
            onClick={() => {
              if (searchOpen) {
                setSearch('')
                setSearchOpen(false)
                setParams({}, { replace: true })
                return
              }
              setSearchOpen(true)
              requestAnimationFrame(() => searchRef.current?.focus())
            }}
          >
            {searchOpen ? <X size={14} /> : <Search size={14} />}
          </Button>
          <Button
            size="sm"
            aria-label="새 메모"
            disabled={create.isPending}
            onClick={() => void createBlank()}
          >
            {create.isPending ? (
              <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus size={14} />
            )}
            <span className="hidden sm:inline">{create.isPending ? '만드는 중' : '새 메모'}</span>
          </Button>
        </div>
      </FrameContextActions>

      <header className="flex min-h-14 min-w-0 items-center gap-2 border-b border-of-border">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <StickyNote size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-of-muted">나만 볼 수 있는 빠른 기록</p>
          <h1 className="truncate text-sm font-semibold">개인 메모</h1>
        </div>
      </header>

      {searchOpen ? (
        <div className="border-b border-of-border py-2">
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 text-of-muted"
              size={14}
            />
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
            {search ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover"
                onClick={() => {
                  setSearch('')
                  setParams({}, { replace: true })
                  searchRef.current?.focus()
                }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {conflict ? (
        <div
          role="alert"
          className="mt-3 border-y border-of-danger/20 bg-of-danger/5 px-2 py-2 text-xs text-of-danger"
        >
          다른 곳에서 변경된 메모입니다. 작성 중인 내용은 유지됩니다.
          <div className="mt-2 flex flex-wrap gap-4">
            <button
              type="button"
              className="underline"
              onClick={() => {
                setConflict(null)
                void notes.refetch()
              }}
            >
              최신 내용 불러오기
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => {
                const { current, patch } = conflict
                setConflict(null)
                runUpdate(current, patch)
              }}
            >
              내 내용으로 다시 저장
            </button>
          </div>
        </div>
      ) : null}

      {failedAction ? (
        <div
          role="alert"
          className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-of-danger/20 bg-of-danger/5 px-2 py-2 text-xs text-of-danger"
        >
          <span>
            <span className="block font-medium">{failureCopy(failedAction)}</span>
            <span className="mt-0.5 block text-[11px]">
              편집 내용과 요청 대상은 그대로 유지했습니다.
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={actionPending}
              onClick={retryFailedAction}
            >
              <RefreshCw size={13} /> 같은 요청 다시 시도
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={actionPending}
              onClick={() => setFailedAction(null)}
            >
              취소
            </Button>
          </span>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="mt-3 flex min-w-0 items-center justify-between gap-2 border-y border-of-border bg-of-surface-2 px-2 py-2 text-xs"
        >
          <span>{notice}</span>
          <button
            type="button"
            aria-label="알림 닫기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover"
            onClick={() => setNotice('')}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <section className="min-h-0 flex-1 overflow-auto py-4 pb-24">
        {notes.isPending ? (
          <ListSkeleton className="px-0 py-0" />
        ) : notes.isError ? (
          <ErrorState error={notes.error} onRetry={() => notes.refetch()} className="min-h-64" />
        ) : notes.data?.items.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-of border border-dashed border-of-border px-4 text-center text-sm text-of-muted">
            <StickyNote size={24} className="mb-3" />
            <p>{search ? '일치하는 메모가 없습니다.' : '첫 개인 메모를 남겨보세요.'}</p>
            {!search ? (
              <Button
                className="mt-4"
                size="sm"
                onClick={() => void createBlank()}
                disabled={create.isPending}
              >
                <Plus /> 새 메모
              </Button>
            ) : null}
          </div>
        ) : (
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3 sm:gap-4"
            aria-label="개인 메모 목록"
          >
            {notes.data?.items.map((note, index, items) => {
              const notePending =
                (update.isPending && update.variables?.id === note.id) ||
                (remove.isPending && remove.variables?.id === note.id) ||
                order.isPending
              return (
                <li key={note.id} className="group relative min-w-0">
                  <StickyNoteCard
                    note={note}
                    autoFocus={autoFocusId === note.id}
                    pending={notePending}
                    onUpdate={runUpdate}
                    onDelete={deleteNote}
                  />
                  <div className="absolute right-2 top-2 flex opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label="위로 이동"
                      disabled={
                        !fullListLoaded ||
                        index === 0 ||
                        items[index - 1]?.is_pinned !== note.is_pinned ||
                        actionPending
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-of bg-white/65 disabled:opacity-30"
                      onClick={() => move(note, -1)}
                    >
                      <ArrowLeft size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="아래로 이동"
                      disabled={
                        !fullListLoaded ||
                        index === items.length - 1 ||
                        items[index + 1]?.is_pinned !== note.is_pinned ||
                        actionPending
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-of bg-white/65 disabled:opacity-30"
                      onClick={() => move(note, 1)}
                    >
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {!fullListLoaded && notes.data ? (
          <p className="mt-3 text-xs text-of-muted">검색 중에는 순서를 바꿀 수 없습니다.</p>
        ) : null}
      </section>
    </main>
  )
}
