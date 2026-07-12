import { ChevronRight, FolderKanban, House, PanelLeftOpen, Settings, StickyNote } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { useProjects } from '@/features/projects/api'
import { useWorkspaceProfile } from '@/features/workspace-profile/api'

import { getShellContext } from './shell-context'

export function FrameContextBar({
  sidebarCollapsed,
  onExpandSidebar,
}: {
  sidebarCollapsed: boolean
  onExpandSidebar: () => void
}) {
  const { projectId } = useParams()
  const location = useLocation()
  const { data } = useProjects()
  const workspaceProfile = useWorkspaceProfile()
  const project = data?.items.find((item) => item.id === projectId)
  const context = getShellContext(
    location.pathname,
    location.search,
    workspaceProfile.data?.name ?? 'OneFlow',
    projectId,
    project?.name,
  )
  const PageIcon = location.pathname === '/my'
    ? House
    : location.pathname === '/notes'
      ? StickyNote
      : location.pathname === '/settings' || location.pathname.startsWith('/admin')
        ? Settings
        : FolderKanban

  return (
    <div data-testid="frame-context-bar" className="flex h-11 shrink-0 items-center border-b border-of-border-subtle bg-of-surface-raised">
      {sidebarCollapsed ? (
        <div data-testid="collapsed-sidebar-slot" className="hidden h-full w-11 shrink-0 items-center justify-center border-r border-of-border-subtle md:flex">
          <button type="button" aria-label="사이드바 펼치기" title="사이드바 펼치기" className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" onClick={onExpandSidebar}>
            <PanelLeftOpen size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 px-2 md:px-3">
        <PageIcon size={15} className="shrink-0 text-of-muted" aria-label="현재 페이지 아이콘" />
        <div className="min-w-0">
          <nav className="hidden min-w-0 items-center gap-1 text-[10px] text-of-muted sm:flex" aria-label="현재 위치">
            <Link to={context.scopeHref} className="truncate rounded-[2px] hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">{context.scope}</Link>
            <ChevronRight size={10} className="shrink-0" aria-hidden="true" />
            <Link to={context.parentHref} className="truncate rounded-[2px] hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">{context.parent}</Link>
          </nav>
          <p aria-current="page" className="truncate text-sm font-semibold leading-5">{context.title}</p>
        </div>
      </div>
    </div>
  )
}
