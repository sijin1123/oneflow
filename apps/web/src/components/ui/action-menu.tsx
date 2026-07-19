import { MoreHorizontal, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'

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
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const restoreFocusOnClose = useRef(false)

  const closeMenu = useCallback((restoreFocus: boolean) => {
    restoreFocusOnClose.current = restoreFocus
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) {
      if (restoreFocusOnClose.current) triggerRef.current?.focus()
      restoreFocusOnClose.current = false
      return
    }

    const enabledItems = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not([disabled])',
        ) ?? [],
      )
    const focusFrame = requestAnimationFrame(() => enabledItems()[0]?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu(true)
        return
      }
      if (event.key === 'Tab') {
        closeMenu(false)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      if (!menuRef.current?.contains(document.activeElement)) return

      const items = enabledItems()
      if (!items.length) return
      event.preventDefault()
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
      let nextIndex = 0
      if (event.key === 'End') nextIndex = items.length - 1
      else if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
      else if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1
      items[nextIndex]?.focus()
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      closeMenu(false)
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [closeMenu, open])

  const itemClass =
    'flex w-full items-center gap-2 rounded-of px-2 py-1.5 text-left text-xs text-of-text hover:bg-of-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-of-accent'

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="inline-flex h-8 w-8 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-of-accent"
        onClick={() => {
          if (open) closeMenu(true)
          else {
            restoreFocusOnClose.current = false
            setOpen(true)
          }
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
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
                restoreFocusOnClose.current = false
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
            className="mt-1 flex w-full items-center gap-2 rounded-of px-2 py-1.5 text-left text-xs text-of-muted hover:bg-of-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-of-accent"
            onClick={() => closeMenu(true)}
          >
            <X size={14} />
            닫기
          </button>
        </div>
      ) : null}
    </div>
  )
}
