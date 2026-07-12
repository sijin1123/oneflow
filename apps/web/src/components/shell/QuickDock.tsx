import { BellRing, Plus, Sparkles, StickyNote, X, Zap } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

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
  const { projectId } = useParams()
  const projects = useProjects()
  const firstActiveProject = projects.data?.items.find((project) => !project.archived_at)
  const targetProjectId = projectId ?? firstActiveProject?.id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstActionRef = useRef<HTMLAnchorElement>(null)
  const wasOpen = useRef(false)

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
    <div className="fixed bottom-3 right-3 z-30 md:bottom-5 md:right-5">
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
