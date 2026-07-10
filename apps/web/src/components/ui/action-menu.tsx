import { MoreHorizontal, X } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

export type InlineActionMenuItem = {
  label: string
  ariaLabel?: string
  icon?: ReactNode
  disabled?: boolean
  tone?: 'default' | 'danger'
  onSelect: () => void
}

export function InlineActionMenu({
  label,
  menuLabel,
  items,
  note,
}: {
  label: string
  menuLabel: string
  items: InlineActionMenuItem[]
  note?: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const itemClass =
    'flex w-full items-center gap-2 rounded-of px-2 py-1.5 text-left text-xs text-of-text hover:bg-of-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-of-accent'

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-of-accent"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={menuLabel}
          className="absolute right-0 top-9 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-of border border-of-border bg-of-surface p-1 shadow-of-lg"
        >
          {items.map((item) => (
            <button
              key={item.ariaLabel ?? item.label}
              type="button"
              role="menuitem"
              aria-label={item.ariaLabel ?? item.label}
              disabled={item.disabled}
              className={`${itemClass} ${item.tone === 'danger' ? 'text-of-danger hover:text-of-danger' : ''}`}
              onClick={() => {
                if (item.disabled) return
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          {note ? <div className="rounded-of px-2 py-1.5 text-xs text-of-muted">{note}</div> : null}
          <button
            type="button"
            role="menuitem"
            className="mt-1 flex w-full items-center gap-2 rounded-of px-2 py-1.5 text-left text-xs text-of-muted hover:bg-of-surface-2"
            onClick={() => setOpen(false)}
          >
            <X size={14} />
            닫기
          </button>
        </div>
      ) : null}
    </div>
  )
}
