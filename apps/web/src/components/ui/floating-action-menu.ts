import { useCallback, useEffect, useRef } from 'react'

export function useFloatingActionMenuLifecycle({
  trigger,
  onClose,
}: {
  trigger: HTMLButtonElement
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      onClose()
      if (restoreFocus) requestAnimationFrame(() => trigger.focus())
    },
    [onClose, trigger],
  )

  useEffect(() => {
    const enabledItems = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"]):not([disabled])',
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
      const currentIndex = items.indexOf(document.activeElement as HTMLElement)
      let nextIndex = 0
      if (event.key === 'End') nextIndex = items.length - 1
      else if (event.key === 'ArrowUp')
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
      else if (event.key === 'ArrowDown')
        nextIndex = currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1
      items[nextIndex]?.focus()
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target) || trigger.contains(target)) return
      closeMenu(false)
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [closeMenu, trigger])

  return { menuRef, closeMenu }
}
