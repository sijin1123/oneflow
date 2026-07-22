import { ChevronRight, FolderKanban, House, PanelLeftOpen, Rocket, Settings, StickyNote } from 'lucide-react'
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
  const isProjectDirectory = location.pathname === '/projects'
  const context = getShellContext(
    location.pathname,
    location.search,
    workspaceProfile.data?.name ?? 'OneFlow',
    projectId,
    project?.name,
  )
  const PageIcon = location.pathname === '/my'
    ? House
    : location.pathname === '/get-started'
      ? Rocket
    : location.pathname === '/notes'
      ? StickyNote
      : location.pathname === '/settings' || location.pathname.startsWith('/admin')
        ? Settings
        : FolderKanban

  return (
    <div
      data-testid="frame-context-bar"
      className="flex min-h-11 shrink-0 flex-col border-b border-of-border-subtle bg-of-surface-raised lg:h-11 lg:flex-row lg:items-center"
    >
      <div className="flex h-11 min-w-0 shrink-0 items-center lg:flex-1">
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
            {isProjectDirectory ? (
              <p className="truncate text-[10px] leading-3 text-of-muted">
                워크스페이스 디렉터리 · {data ? `${data.total}개 프로젝트` : '불러오는 중'}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div
        data-frame-context-actions
        data-testid="frame-context-actions"
        className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 border-t border-of-border-subtle px-2 py-1.5 empty:hidden lg:h-full lg:shrink-0 lg:flex-nowrap lg:border-l lg:border-t-0 lg:px-3 lg:py-0"
      />
    </div>
  )
}
