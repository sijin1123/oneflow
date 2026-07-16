import { SmilePlus } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

export type CommentReaction = {
  key: string
  count: number
  me: boolean
}

const QUICK_REACTIONS = ['👍', '👎', '🎉', '❤️', '😄', '😕'] as const

function FreeReactionInput({
  disabled,
  onAdd,
}: {
  disabled: boolean
  onAdd: (emoji: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const submit = () => {
    const emoji = value.trim()
    if (!emoji || disabled) return
    onAdd(emoji)
    setValue('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="이모지 추가"
        className="inline-flex h-6 items-center gap-1 rounded-full border border-of-border px-1.5 text-[11px] text-of-muted hover:bg-of-surface"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <SmilePlus size={12} aria-hidden="true" />
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') {
            setValue('')
            setOpen(false)
          }
        }}
        placeholder="😀"
        aria-label="자유 이모지 입력"
        className="h-6 w-14 rounded-of border border-of-border bg-of-surface px-1 text-center text-[12px]"
        maxLength={16}
        autoFocus
      />
      <button
        type="button"
        aria-label="이모지 등록"
        disabled={disabled || !value.trim()}
        className="rounded-of border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted hover:bg-of-surface-2 disabled:opacity-50"
        onClick={submit}
      >
        추가
      </button>
    </span>
  )
}

export function CommentReactionBar({
  reactions,
  canReact,
  pending,
  onToggle,
  label = '코멘트 리액션',
}: {
  reactions: CommentReaction[]
  canReact: boolean
  pending: boolean
  onToggle: (reaction: { key: string; on: boolean }) => void
  label?: string
}) {
  if (!canReact && reactions.length === 0) return null

  const items = canReact
    ? [
        ...reactions,
        ...QUICK_REACTIONS.filter(
          (emoji) => !reactions.some((reaction) => reaction.key === emoji),
        ).map((emoji) => ({ key: emoji, count: 0, me: false })),
      ]
    : reactions

  return (
    <div aria-label={label} className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
      {items.map(({ key, count, me }) =>
        canReact ? (
          <button
            key={key}
            type="button"
            aria-label={`${key} 리액션`}
            aria-pressed={me}
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[11px]',
              me
                ? 'border-of-accent bg-of-accent-soft text-of-accent'
                : 'border-of-border text-of-muted hover:bg-of-surface-2',
              count === 0 && !me ? 'opacity-60' : '',
            )}
            disabled={pending}
            onClick={() => onToggle({ key, on: !me })}
          >
            {key}
            {count > 0 ? ` ${count}` : ''}
          </button>
        ) : (
          <span
            key={key}
            aria-label={`${key} 리액션 ${count}개`}
            className="rounded-full border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted"
          >
            {key} {count}
          </span>
        ),
      )}
      {canReact ? (
        <FreeReactionInput
          disabled={pending}
          onAdd={(emoji) => onToggle({ key: emoji, on: true })}
        />
      ) : null}
    </div>
  )
}
