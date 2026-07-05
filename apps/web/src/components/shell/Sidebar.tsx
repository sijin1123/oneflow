import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  FileText,
  FolderKanban,
  LayoutDashboard,
  List,
  ListTree,
  Paperclip,
  Search,
  Settings,
  SquareKanban,
} from 'lucide-react'
import { NavLink, useParams } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { useProjects } from '@/features/projects/api'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-of px-2 py-1.5 text-[13px] hover:bg-of-surface-2 [&_svg]:size-3.5 [&_svg]:text-of-muted',
    isActive && 'bg-of-accent-soft font-medium text-of-accent [&_svg]:text-of-accent',
  )

export function Sidebar() {
  const { projectId } = useParams()
  const { data } = useProjects()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-of-border bg-of-surface">
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-of bg-of-accent text-xs font-bold text-white">
          O
        </div>
        <span className="text-sm font-semibold">OneFlow</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4" aria-label="주 메뉴">
        <div>
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-of-muted">
            워크스페이스
          </p>
          <NavLink to="/projects" end className={navLinkClass}>
            <FolderKanban /> 프로젝트
          </NavLink>
          <NavLink to="/search" className={navLinkClass}>
            <Search /> 검색
          </NavLink>
        </div>

        {data?.items.map((p) => (
          <div key={p.id}>
            <p className="truncate px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-of-muted">
              {p.key} · {p.name}
            </p>
            <div className="space-y-0.5">
              <NavLink to={`/projects/${p.id}/work-packages`} className={navLinkClass}>
                <List /> Work Packages
              </NavLink>
              <NavLink to={`/projects/${p.id}/board`} className={navLinkClass}>
                <SquareKanban /> Board
              </NavLink>
              <NavLink to={`/projects/${p.id}/tree`} className={navLinkClass}>
                <ListTree /> Hierarchy
              </NavLink>
              <NavLink to={`/projects/${p.id}/timeline`} className={navLinkClass}>
                <CalendarRange /> Timeline
              </NavLink>
              <NavLink to={`/projects/${p.id}/calendar`} className={navLinkClass}>
                <CalendarDays /> Calendar
              </NavLink>
              <NavLink to={`/projects/${p.id}/dashboard`} className={navLinkClass}>
                <LayoutDashboard /> Dashboard
              </NavLink>
              <NavLink to={`/projects/${p.id}/documents`} className={navLinkClass}>
                <FileText /> Documents
              </NavLink>
              <NavLink to={`/projects/${p.id}/meetings`} className={navLinkClass}>
                <CalendarClock /> Meetings
              </NavLink>
              <NavLink to={`/projects/${p.id}/files`} className={navLinkClass}>
                <Paperclip /> Files
              </NavLink>
              <NavLink to={`/projects/${p.id}/settings`} className={navLinkClass}>
                <Settings /> Settings
              </NavLink>
            </div>
          </div>
        ))}
        {projectId && !data ? <div className="px-2 text-xs text-of-muted">…</div> : null}
      </nav>

      <div className="border-t border-of-border px-3 py-2 text-[11px] text-of-muted">
        dev 모드 · 로컬 전용
      </div>
    </aside>
  )
}
