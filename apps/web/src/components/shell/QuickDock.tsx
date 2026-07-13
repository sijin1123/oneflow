import * as Dialog from '@radix-ui/react-dialog'
import { Layers3, Plus, Search, StickyNote, X } from 'lucide-react'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import {
  type PersonalNote,
  type PersonalNoteUpdate,
  useCreatePersonalNote,
  useDeletePersonalNote,
  usePersonalNotes,
  useUpdatePersonalNote,
} from '@/features/personal-notes/api'
import { StickyNoteCard } from '@/features/personal-notes/StickyNoteCard'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type NotePanel = 'none' | 'compact' | 'expanded' | 'all'
type DockIconPhase = 'closed' | 'opening' | 'open' | 'closing'
type DockMotionSnapshot = CSSProperties

const DOCK_COLORS: Record<PersonalNote['color'], string> = {
  lavender: 'bg-[#e8e0ff] text-[#67558f]',
  mint: 'bg-[#c9f2e3] text-[#397562]',
  yellow: 'bg-[#fff0b8] text-[#806c25]',
  rose: 'bg-[#ffd9df] text-[#8d4b58]',
  blue: 'bg-[#d8ecff] text-[#3f6f98]',
  gray: 'bg-[#e7e8ea] text-[#5e6268]',
}

function DockToggleIcon({ phase }: { phase: DockIconPhase }) {
  return (
    <span
      aria-hidden="true"
      data-testid="quick-dock-toggle-icon"
      data-phase={phase}
      className={cn('of-dock-toggle-icon', `of-dock-toggle-icon-${phase}`)}
    >
      <StickyNote data-icon="note" size={20} />
      <X data-icon="close" size={20} />
    </span>
  )
}

export function QuickDock({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const location = useLocation()
  const restoreTriggerFocusRef = useRef(false)
  const dockRootRef = useRef<HTMLDivElement>(null)
  const dockNavRef = useRef<HTMLDivElement>(null)
  const dockActionsRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const firstActionRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [collisionOffset, setCollisionOffset] = useState(0)
  const [dockPhase, setDockPhase] = useState<DockIconPhase>(open ? 'open' : 'closed')
  const [motionSnapshot, setMotionSnapshot] = useState<DockMotionSnapshot>()
  const renderedDockPhase = open && dockPhase === 'closed' ? 'opening' : dockPhase
  const dockMounted = open || dockPhase !== 'closed'
  const dockOpening = renderedDockPhase === 'opening'
  const dockClosing = renderedDockPhase === 'closing'
  const [panel, setPanel] = useState<NotePanel>('none')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const notes = usePersonalNotes('', 200)
  const searchedNotes = usePersonalNotes(search, 200)
  const create = useCreatePersonalNote()
  const update = useUpdatePersonalNote()
  const remove = useDeletePersonalNote()
  const activeNote = notes.data?.items.find((note) => note.id === selectedId) ?? notes.data?.items[0]

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    const scrollRegion = main?.querySelector<HTMLElement>('[data-shell-scroll-region]')
    if (!main || !scrollRegion) return
    let frame = 0
    const measure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const root = dockRootRef.current
        if (!root) return
        const rootRect = root.getBoundingClientRect()
        const mobile = window.innerWidth < 768
        const baseBottom = window.innerHeight - (mobile ? 12 : 20)
        const baseRight = window.innerWidth - (mobile ? 12 : 20)
        const actions = Array.from(
          main.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"], [role="menuitem"]',
          ),
        )
          .filter((element) => !element.closest('[data-quick-dock]'))
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)

        const overlaps = (offset: number) => {
          const candidate = {
            left: baseRight - rootRect.width,
            right: baseRight,
            top: baseBottom - rootRect.height - offset,
            bottom: baseBottom - offset,
          }
          return actions.some(
            (rect) =>
              candidate.left < rect.right + 6 &&
              candidate.right > rect.left - 6 &&
              candidate.top < rect.bottom + 6 &&
              candidate.bottom > rect.top - 6,
          )
        }

        const maxOffset = Math.max(0, baseBottom - rootRect.height - 52)
        let nextOffset = 0
        while (overlaps(nextOffset) && nextOffset + 52 <= maxOffset) nextOffset += 52
        setCollisionOffset((current) => (current === nextOffset ? current : nextOffset))
      })
    }

    measure()
    const observer = new MutationObserver(measure)
    observer.observe(main, { childList: true, subtree: true })
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(main)
    if (dockRootRef.current) resizeObserver.observe(dockRootRef.current)
    scrollRegion.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      scrollRegion.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [dockMounted, location.pathname, location.search, open])

  const snapshotMotion = (): DockMotionSnapshot => {
    const nav = dockNavRef.current
    const actions = dockActionsRef.current
    const icon = nav?.querySelector<HTMLElement>('[data-testid="quick-dock-toggle-icon"]')
    const note = icon?.querySelector<HTMLElement>('[data-icon="note"]')
    const closeIcon = icon?.querySelector<HTMLElement>('[data-icon="close"]')
    if (!nav || !actions || !icon || !note || !closeIcon) return {}
    const navStyle = window.getComputedStyle(nav)
    const actionsStyle = window.getComputedStyle(actions)
    const iconStyle = window.getComputedStyle(icon)
    const noteStyle = window.getComputedStyle(note)
    const closeStyle = window.getComputedStyle(closeIcon)
    return {
      '--of-dock-current-opacity': navStyle.opacity,
      '--of-dock-current-transform': navStyle.transform,
      '--of-dock-current-clip-path': navStyle.clipPath,
      '--of-dock-actions-current-opacity': actionsStyle.opacity,
      '--of-dock-actions-current-transform': actionsStyle.transform,
      '--of-dock-toggle-current-transform': iconStyle.transform,
      '--of-dock-note-current-opacity': noteStyle.opacity,
      '--of-dock-note-current-transform': noteStyle.transform,
      '--of-dock-close-current-opacity': closeStyle.opacity,
      '--of-dock-close-current-transform': closeStyle.transform,
    } as DockMotionSnapshot
  }

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (open) {
      if (dockPhase === 'closed') {
        setMotionSnapshot(undefined)
        setDockPhase(reducedMotion ? 'open' : 'opening')
      } else if (dockPhase === 'closing') {
        setMotionSnapshot(snapshotMotion())
        setDockPhase(reducedMotion ? 'open' : 'opening')
      }
      return
    }
    if (dockPhase === 'open' || dockPhase === 'opening') {
      restoreTriggerFocusRef.current = true
      setMotionSnapshot(snapshotMotion())
      setDockPhase(reducedMotion ? 'closed' : 'closing')
    }
  }, [dockPhase, open])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const settleMotion = (event: MediaQueryListEvent) => {
      if (!event.matches) return
      setMotionSnapshot(undefined)
      setDockPhase((current) => {
        if (current === 'opening') return 'open'
        if (current === 'closing') return 'closed'
        return current
      })
    }
    media.addEventListener('change', settleMotion)
    return () => media.removeEventListener('change', settleMotion)
  }, [])

  useLayoutEffect(() => {
    if (dockPhase === 'opening') toggleRef.current?.focus()
    if (dockPhase === 'open') firstActionRef.current?.focus()
    if (dockPhase === 'closed' && restoreTriggerFocusRef.current) {
      restoreTriggerFocusRef.current = false
      toggleRef.current?.focus()
    }
  }, [dockPhase])

  useEffect(() => {
    if (!open) {
      setPanel('none')
      return
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      if (panel !== 'none') {
        setPanel('none')
        return
      }
      onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onOpenChange, open, panel])

  const close = () => {
    if (dockOpening || dockClosing) return
    setPanel('none')
    restoreTriggerFocusRef.current = true
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setMotionSnapshot(snapshotMotion())
    setDockPhase(reducedMotion ? 'closed' : 'closing')
    onOpenChange(false)
  }

  const openDock = () => {
    if (open || dockOpening || dockClosing) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setMotionSnapshot(undefined)
    setDockPhase(reducedMotion ? 'open' : 'opening')
    onOpenChange(true)
  }

  const patchNote = (
    note: PersonalNote,
    patch: Omit<PersonalNoteUpdate, 'expected_version'>,
  ) => {
    update.mutate(
      { id: note.id, expected_version: note.version, ...patch },
      { onError: () => setNotice('메모를 저장하지 못했습니다. 최신 내용을 확인해 주세요.') },
    )
  }

  const deleteNote = (note: PersonalNote) => {
    if (!window.confirm(`'${note.title || '제목 없는 메모'}' 메모를 삭제할까요?`)) return
    remove.mutate(
      { id: note.id, expectedVersion: note.version },
      {
        onSuccess: () => {
          if (selectedId === note.id) setSelectedId(null)
          if (panel !== 'all') setPanel('none')
        },
        onError: () => setNotice('메모를 삭제하지 못했습니다.'),
      },
    )
  }

  const createBlank = async () => {
    const blank = notes.data?.items.find((note) => !note.title.trim() && !note.body.trim())
    if (blank) {
      setSelectedId(blank.id)
      setPanel('expanded')
      setNotice('내용이 없는 개인 메모가 이미 있습니다.')
      return
    }
    setNotice('')
    try {
      const note = await create.mutateAsync({ title: '', body: '', color: 'mint' })
      setSelectedId(note.id)
      setPanel('expanded')
    } catch (error) {
      setNotice(error instanceof ApiError && error.status === 409
        ? '내용이 없는 개인 메모가 이미 있습니다.'
        : '메모를 만들지 못했습니다.')
    }
  }

  const dockButton =
    'flex h-9 w-9 items-center justify-center rounded-full text-of-muted transition-[transform,background-color,color] duration-150 hover:scale-[1.04] hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus motion-reduce:transform-none motion-reduce:transition-none'

  const finishDockMotion = (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (dockPhase === 'opening') {
      setMotionSnapshot(undefined)
      setDockPhase('open')
    }
    if (dockPhase === 'closing') {
      setMotionSnapshot(undefined)
      setDockPhase('closed')
    }
  }

  return (
    <>
      <div
        ref={dockRootRef}
        data-quick-dock
        className="fixed bottom-3 right-3 z-40 transition-transform duration-[var(--of-duration-default)] motion-reduce:transition-none md:bottom-5 md:right-5"
        style={{ transform: `translateY(-${collisionOffset}px)` }}
      >
        {activeNote && dockMounted && (panel === 'compact' || panel === 'expanded') ? (
          <div className="of-panel-enter absolute bottom-0 right-14">
            <StickyNoteCard
              note={activeNote}
              variant={panel === 'compact' ? 'compact' : 'expanded'}
              autoFocus={panel === 'expanded'}
              pending={update.isPending || remove.isPending}
              onExpand={() => setPanel('expanded')}
              onUpdate={patchNote}
              onDelete={deleteNote}
            />
          </div>
        ) : null}
        <div
          ref={dockNavRef}
          role={dockMounted ? 'navigation' : undefined}
          aria-label={dockMounted ? '빠른 도구' : undefined}
          data-quick-dock-surface
          data-testid={dockMounted ? 'quick-dock-expanded' : undefined}
          data-phase={renderedDockPhase}
          onAnimationEnd={finishDockMotion}
          style={motionSnapshot}
          className={cn(
            'flex w-12 flex-col items-center gap-1 rounded-full border border-of-border bg-of-surface p-1 shadow-[var(--of-shadow-popover)]',
            dockOpening && 'of-dock-enter of-dock-opening',
            dockClosing && 'of-dock-exit',
          )}
        >
          {dockMounted ? (
            <div
              key="actions"
              ref={dockActionsRef}
              data-testid="quick-dock-actions"
              className={cn(
                'of-dock-actions flex flex-col items-center gap-1',
                dockOpening && 'of-dock-actions-enter',
                dockClosing && 'of-dock-actions-exit',
              )}
            >
              <button
                ref={firstActionRef}
                type="button"
                aria-label="모든 메모 열기"
                title="모든 메모"
                disabled={dockOpening}
                className={dockButton}
                onClick={() => setPanel('all')}
              >
                <Layers3 size={17} />
              </button>
              {activeNote ? (
                <button
                  type="button"
                  aria-label="현재 메모 열기"
                  title="현재 메모"
                  aria-pressed={panel === 'compact' || panel === 'expanded'}
                  disabled={dockOpening}
                  className={cn(dockButton, DOCK_COLORS[activeNote.color])}
                  onClick={() => setPanel((value) => value === 'compact' || value === 'expanded' ? 'none' : 'compact')}
                >
                  <StickyNote size={17} />
                </button>
              ) : null}
              <button
                type="button"
                aria-label="새 메모 만들기"
                title="새 메모"
                disabled={dockOpening || create.isPending}
                className={dockButton}
                onClick={() => void createBlank()}
              >
                <Plus size={18} />
              </button>
            </div>
          ) : null}
          <button
            key="toggle"
            ref={toggleRef}
            type="button"
            data-testid="quick-dock-toggle"
            aria-label={dockMounted ? '빠른 도구 닫기' : '빠른 도구 열기'}
            title={dockMounted ? '닫기' : '빠른 메모'}
            aria-expanded={open}
            aria-busy={dockOpening || dockClosing}
            aria-disabled={dockOpening || dockClosing}
            className={cn(
              dockButton,
              'h-[38px] w-[38px]',
              !dockMounted && 'text-of-accent',
            )}
            onClick={() => {
              if (dockOpening || dockClosing) return
              if (open) close()
              else openDock()
            }}
          >
            <DockToggleIcon phase={renderedDockPhase} />
          </button>
        </div>
      </div>

      <Dialog.Root open={open && panel === 'all'} onOpenChange={(next) => { if (!next) setPanel('none') }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 flex h-[min(42rem,calc(100vh-2rem))] w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface shadow-[var(--of-shadow-dialog)] focus:outline-none"
          >
            <header className="flex min-h-16 items-center gap-3 border-b border-of-border px-5">
              <Layers3 size={19} />
              <Dialog.Title className="text-lg font-semibold">내 개인 메모</Dialog.Title>
              <div className="ml-auto flex min-w-0 items-center gap-2">
                {searchOpen ? (
                  <div className="relative w-[min(18rem,42vw)]">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 text-of-muted" size={14} />
                    <input
                      ref={searchRef}
                      aria-label="모든 메모 제목 검색"
                      value={search}
                      placeholder="제목으로 검색"
                      className="h-9 w-full rounded-of border border-of-border bg-of-surface pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-of-focus"
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <button type="button" aria-label="모든 메모 검색 닫기" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover" onClick={() => { setSearch(''); setSearchOpen(false) }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" aria-label="모든 메모 검색" className={dockButton} onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()) }}>
                    <Search size={17} />
                  </button>
                )}
                <button type="button" disabled={create.isPending} className="flex h-9 items-center gap-1 rounded-of px-2 text-sm font-medium text-of-accent hover:bg-of-surface-hover disabled:opacity-40" onClick={() => void createBlank()}>
                  <Plus size={17} /> 새 메모
                </button>
                <Dialog.Close asChild>
                  <button type="button" aria-label="모든 메모 닫기" className={dockButton}><X size={17} /></button>
                </Dialog.Close>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {searchedNotes.isPending ? (
                <p className="text-sm text-of-muted">메모를 불러오는 중입니다.</p>
              ) : searchedNotes.isError ? (
                <p role="alert" className="text-sm text-of-danger">메모를 불러오지 못했습니다.</p>
              ) : searchedNotes.data?.items.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
                  {searchedNotes.data.items.map((note) => (
                    <StickyNoteCard key={note.id} note={note} pending={update.isPending || remove.isPending} onUpdate={patchNote} onDelete={deleteNote} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-56 items-center justify-center text-sm text-of-muted">
                  {search ? '일치하는 메모가 없습니다.' : '첫 개인 메모를 만들어 보세요.'}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {notice ? (
        <div role="alert" className="fixed bottom-5 right-20 z-[60] flex max-w-sm items-start gap-3 rounded-of border border-of-border bg-of-surface p-4 text-sm shadow-[var(--of-shadow-popover)]">
          <span>{notice}</span>
          <button type="button" aria-label="빠른 메모 알림 닫기" onClick={() => setNotice('')}><X size={15} /></button>
        </div>
      ) : null}
    </>
  )
}
