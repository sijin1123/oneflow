import { type ReactNode, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function FrameContextActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    setTarget(document.querySelector<HTMLElement>('[data-frame-context-actions]'))
  }, [])

  return target
    ? createPortal(
        <div className="of-scrollbar flex h-full w-full min-w-0 items-center justify-start gap-1.5 overflow-x-auto overflow-y-hidden px-2 [&>*]:min-w-max [&>*]:shrink-0 [&>*]:flex-nowrap md:justify-end md:px-3">
          {children}
        </div>,
        target,
      )
    : null
}
