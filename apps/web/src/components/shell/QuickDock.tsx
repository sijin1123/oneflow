import { BellRing, Plus, Sparkles, StickyNote, X, Zap } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import { cn } from '@/lib/utils'

function DockLink({
  to,
  label,
  onNavigate,
  children,
}: {
  to: string
  label: string
  onNavigate: () => void
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
      onClick={onNavigate}
    >
      {children}
    </Link>
  )
}

function NewWorkDockLink({ projectId, onNavigate }: { projectId: string; onNavigate: () => void }) {
  const canWrite = useCanWrite(projectId)
  if (!canWrite) return null
  return (
    <DockLink
      to={`/projects/${projectId}/work-packages?new=1`}
      label="빠른 작업 만들기"
      onNavigate={onNavigate}
    >
      <Plus size={17} aria-hidden="true" />
    </DockLink>
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
  const { projectId } = useParams()
  const projects = useProjects()
  const firstActiveProject = projects.data?.items.find((project) => !project.archived_at)
  const targetProjectId = projectId ?? firstActiveProject?.id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dockRootRef = useRef<HTMLDivElement>(null)
  const firstActionRef = useRef<HTMLAnchorElement>(null)
  const wasOpen = useRef(false)
  const [collisionOffset, setCollisionOffset] = useState(0)

  useLayoutEffect(() => {
    if (open) {
      setCollisionOffset(0)
      return
    }
    const main = document.querySelector('main')
    if (!main) return
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
    main.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      resizeObserver.disconnect()
      main.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [location.pathname, location.search, open])

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    firstActionRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onOpenChange, open])

  const close = () => onOpenChange(false)

  return (
    <div
      ref={dockRootRef}
      data-quick-dock
      className="fixed bottom-3 right-3 z-30 transition-transform duration-[var(--of-duration-default)] motion-reduce:transition-none md:bottom-5 md:right-5"
      style={{ transform: `translateY(-${collisionOffset}px)` }}
    >
      {open ? (
        <nav
          aria-label="빠른 도구"
          className="flex w-11 flex-col items-center gap-0.5 rounded-of-lg border border-of-border bg-of-surface p-1 shadow-[var(--of-shadow-popover)]"
        >
          <Link
            ref={firstActionRef}
            to="/inbox"
            aria-label="인박스 열기"
            title="인박스 열기"
            className="flex h-9 w-9 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={close}
          >
            <BellRing size={16} aria-hidden="true" />
          </Link>
          <DockLink to="/ai" label="AI workspace 열기" onNavigate={close}>
            <Sparkles size={16} aria-hidden="true" />
          </DockLink>
          <DockLink to="/notes" label="개인 메모 열기" onNavigate={close}>
            <StickyNote size={16} aria-hidden="true" />
          </DockLink>
          {targetProjectId ? (
            <NewWorkDockLink projectId={targetProjectId} onNavigate={close} />
          ) : null}
          <span className="my-0.5 h-px w-6 bg-of-border-subtle" aria-hidden="true" />
          <button
            type="button"
            aria-label="빠른 도구 닫기"
            title="빠른 도구 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </nav>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-label="빠른 도구 열기"
          title="빠른 도구 열기"
          aria-expanded="false"
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full border border-of-border bg-of-surface text-of-accent shadow-[var(--of-shadow-popover)]',
            'transition-[transform,background-color] duration-[var(--of-duration-default)] hover:scale-[1.03] hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus motion-reduce:transform-none motion-reduce:transition-none',
          )}
          onClick={() => onOpenChange(true)}
        >
          <Zap size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
