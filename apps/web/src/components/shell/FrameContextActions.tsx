import { type ReactNode, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function FrameContextActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    setTarget(document.querySelector<HTMLElement>('[data-frame-context-actions]'))
  }, [])

  return target ? createPortal(children, target) : null
}
