import { Bold, CheckSquare, Expand, Italic, Palette, Pin, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import type { PersonalNote, PersonalNoteColor, PersonalNoteUpdate } from './api'

const COLOR_STYLES: Record<PersonalNoteColor, string> = {
  lavender: 'bg-[#e8e0ff] text-[#27222f]',
  mint: 'bg-[#c9f2e3] text-[#20302b]',
  yellow: 'bg-[#fff0b8] text-[#342d18]',
  rose: 'bg-[#ffd9df] text-[#392228]',
  blue: 'bg-[#d8ecff] text-[#1d2d3d]',
  gray: 'bg-[#e7e8ea] text-[#26282b]',
}

const PERSONAL_NOTE_COLORS = Object.keys(COLOR_STYLES) as PersonalNoteColor[]

type Props = {
  note: PersonalNote
  variant?: 'grid' | 'compact' | 'expanded'
  pending?: boolean
  autoFocus?: boolean
  onExpand?: () => void
  onUpdate: (note: PersonalNote, patch: Omit<PersonalNoteUpdate, 'expected_version'>) => void
  onDelete: (note: PersonalNote) => void
}

export function StickyNoteCard({
  note,
  variant = 'grid',
  pending = false,
  autoFocus = false,
  onExpand,
  onUpdate,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleDirtyRef = useRef(false)
  const bodyDirtyRef = useRef(false)

  useEffect(() => {
    if (!titleDirtyRef.current) setTitle(note.title)
    if (!bodyDirtyRef.current) setBody(note.body)
  }, [note.body, note.id, note.title, note.version])

  const commitText = () => {
    const nextTitle = title.trim()
    if (nextTitle === note.title && body === note.body) {
      titleDirtyRef.current = false
      bodyDirtyRef.current = false
      return
    }
    onUpdate(note, { title: nextTitle, body })
    titleDirtyRef.current = false
    bodyDirtyRef.current = false
  }

  const format = (kind: 'bold' | 'italic' | 'checklist') => {
    const textarea = bodyRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = body.slice(start, end)
    let inserted = selected
    if (kind === 'bold') inserted = `**${selected || '굵게'}**`
    if (kind === 'italic') inserted = `_${selected || '기울임'}_`
    if (kind === 'checklist') {
      inserted = (selected || '목록 항목')
        .split('\n')
        .map((line) => `- [ ] ${line.replace(/^- \[[ x]\] /, '')}`)
        .join('\n')
    }
    const next = `${body.slice(0, start)}${inserted}${body.slice(end)}`
    setBody(next)
    bodyDirtyRef.current = false
    onUpdate(note, { body: next, title: title.trim() })
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start, start + inserted.length)
    })
  }

  const toolbarButton =
    'flex h-8 w-8 items-center justify-center rounded-of text-current/60 transition-colors hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-40'

  return (
    <article
      aria-label={note.title || '제목 없는 메모'}
      data-note-color={note.color}
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden rounded-of border border-black/5 shadow-sm transition-[width,height,transform,box-shadow] duration-200 motion-reduce:transition-none',
        COLOR_STYLES[note.color],
        variant === 'grid' && 'h-[310px] w-full',
        variant === 'compact' && 'h-48 w-[min(22rem,calc(100vw-6rem))] shadow-[var(--of-shadow-popover)]',
        variant === 'expanded' && 'h-[min(36rem,calc(100vh-7rem))] w-[min(31rem,calc(100vw-6rem))] shadow-[var(--of-shadow-popover)]',
      )}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        commitText()
      }}
    >
      {variant === 'compact' && onExpand ? (
        <button
          type="button"
          aria-label="메모 크게 열기"
          className={cn(toolbarButton, 'absolute right-2 top-2 z-10')}
          onClick={onExpand}
        >
          <Expand size={15} />
        </button>
      ) : null}
      <input
        autoFocus={autoFocus}
        aria-label="메모 제목"
        value={title}
        maxLength={120}
        placeholder="여기를 클릭해 입력"
        className="mx-4 mt-4 min-w-0 bg-transparent text-base font-medium outline-none placeholder:text-current/45"
        onChange={(event) => {
          titleDirtyRef.current = true
          setTitle(event.target.value)
        }}
      />
      <textarea
        ref={bodyRef}
        aria-label="메모 내용"
        value={body}
        maxLength={4000}
        placeholder="설명을 추가하세요"
        className="mx-4 mt-4 min-h-0 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-current/45"
        onChange={(event) => {
          bodyDirtyRef.current = true
          setBody(event.target.value)
        }}
      />
      {variant !== 'compact' ? (
        <footer className="relative flex h-12 shrink-0 items-center gap-1 px-3">
          <button
            type="button"
            aria-label="메모 색상"
            aria-expanded={paletteOpen}
            disabled={pending}
            className={toolbarButton}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPaletteOpen((value) => !value)}
          >
            <Palette size={16} />
          </button>
          {paletteOpen ? (
            <div
              role="group"
              aria-label="메모 색상 선택"
              className="absolute bottom-11 left-3 flex gap-1 rounded-of border border-of-border bg-of-surface p-2 shadow-[var(--of-shadow-popover)]"
            >
              {PERSONAL_NOTE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${color} 색상`}
                  disabled={pending}
                  className={cn('h-6 w-6 rounded-full border border-black/10', COLOR_STYLES[color])}
                  onClick={() => {
                    setPaletteOpen(false)
                    if (color !== note.color) onUpdate(note, { color })
                  }}
                />
              ))}
            </div>
          ) : null}
          <button type="button" aria-label="굵게" disabled={pending} className={toolbarButton} onMouseDown={(event) => event.preventDefault()} onClick={() => format('bold')}>
            <Bold size={16} />
          </button>
          <button type="button" aria-label="기울임" disabled={pending} className={toolbarButton} onMouseDown={(event) => event.preventDefault()} onClick={() => format('italic')}>
            <Italic size={16} />
          </button>
          <button type="button" aria-label="체크리스트" disabled={pending} className={toolbarButton} onMouseDown={(event) => event.preventDefault()} onClick={() => format('checklist')}>
            <CheckSquare size={16} />
          </button>
          <button
            type="button"
            aria-label={note.is_pinned ? '고정 해제' : '고정'}
            aria-pressed={note.is_pinned}
            disabled={pending}
            className={cn(toolbarButton, note.is_pinned && 'text-of-accent')}
            onClick={() => onUpdate(note, { is_pinned: !note.is_pinned })}
          >
            <Pin size={16} className={note.is_pinned ? 'fill-current' : ''} />
          </button>
          <button
            type="button"
            aria-label="메모 삭제"
            disabled={pending}
            className={cn(toolbarButton, 'ml-auto hover:text-of-danger')}
            onClick={() => onDelete(note)}
          >
            <Trash2 size={16} />
          </button>
        </footer>
      ) : null}
    </article>
  )
}
