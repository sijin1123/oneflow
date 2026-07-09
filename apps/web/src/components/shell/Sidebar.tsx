import {
  Activity,
  BarChart3,
  BellRing,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Compass,
  FileText,
  FolderKanban,
  Inbox,
  IterationCcw,
  LayoutDashboard,
  List,
  ListChecks,
  ListTree,
  Paperclip,
  Search,
  Settings,
  SlidersHorizontal,
  SquareActivity,
  SquareKanban,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useParams } from 'react-router-dom'

import { useAuthConfig } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { useProjects } from '@/features/projects/api'
import { cn } from '@/lib/utils'

type WorkspaceNavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

type ProjectNavItem = {
  path: string
  label: string
  icon: LucideIcon
}

const workspaceNav: WorkspaceNavItem[] = [
  { to: '/my', label: '내 작업', icon: Inbox },
  { to: '/inbox', label: '인박스', icon: BellRing },
  { to: '/work-items', label: '전체 작업', icon: ListChecks },
  { to: '/projects', label: '프로젝트', icon: FolderKanban, end: true },
  { to: '/initiatives', label: '이니셔티브', icon: Compass },
  { to: '/search', label: '검색', icon: Search },
  { to: '/reports', label: '리포트', icon: BarChart3 },
]

const operationsNav: WorkspaceNavItem[] = [
  { to: '/operations', label: '운영 허브', icon: SquareActivity },
  { to: '/settings', label: '개인 설정', icon: SlidersHorizontal },
  { to: '/status', label: '시스템 상태', icon: Activity },
]

const projectNavSections: Array<{ label: string; items: ProjectNavItem[] }> = [
  {
    label: '작업',
    items: [
      { path: 'work-packages', label: 'Work Packages', icon: List },
      { path: 'board', label: 'Board', icon: SquareKanban },
      { path: 'backlog', label: 'Backlog', icon: ClipboardList },
      { path: 'tree', label: 'Hierarchy', icon: ListTree },
    ],
  },
  {
    label: '계획',
    items: [
      { path: 'timeline', label: 'Timeline', icon: CalendarRange },
      { path: 'calendar', label: 'Calendar', icon: CalendarDays },
      { path: 'cycles', label: 'Cycles', icon: IterationCcw },
      { path: 'modules', label: 'Modules', icon: Boxes },
      { path: 'intake', label: 'Intake', icon: ClipboardList },
    ],
  },
  {
    label: '협업',
    items: [
      { path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: 'documents', label: 'Documents', icon: FileText },
      { path: 'meetings', label: 'Meetings', icon: CalendarClock },
      { path: 'files', label: 'Files', icon: Paperclip },
    ],
  },
  {
    label: '운영',
    items: [{ path: 'settings', label: 'Settings', icon: Settings }],
  },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group flex min-h-8 items-center gap-2 rounded-of px-2 text-[13px] transition-colors hover:bg-of-surface-2 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-of-muted',
    isActive && 'bg-of-accent-soft font-medium text-of-accent [&_svg]:text-of-accent',
  )

const projectLinkClass = (isActive: boolean) =>
  cn(
    'flex min-h-8 items-center gap-2 rounded-of px-2 text-[13px] transition-colors hover:bg-of-surface-2',
    isActive && 'bg-of-surface-2 font-medium text-of-text',
  )

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-2 pb-1 text-[11px] font-medium uppercase text-of-muted">
      {children}
    </p>
  )
}

function SidebarContent({
  onNavigate,
  onClose,
  showClose,
}: {
  onNavigate?: () => void
  onClose?: () => void
  showClose?: boolean
}) {
  const { projectId } = useParams()
  const { data } = useProjects()
  const auth = useAuthConfig()
  const me = useMe()

  const operationItems: WorkspaceNavItem[] = me.data?.is_admin
    ? [...operationsNav, { to: '/admin/users', label: '사용자 관리', icon: UsersRound }]
    : operationsNav

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-of bg-of-accent text-xs font-bold text-white">
          OF
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-4">OneFlow</p>
          <p className="truncate text-[11px] text-of-muted">Workspace</p>
        </div>
        {showClose ? (
          <button
            type="button"
            aria-label="사이드바 닫기"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="주 메뉴">
        <div className="space-y-4">
          <div>
            <SectionLabel>워크스페이스</SectionLabel>
            <div className="space-y-0.5">
              {workspaceNav.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={navLinkClass}
                    onClick={onNavigate}
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>

          <div>
            <SectionLabel>운영</SectionLabel>
            <div className="space-y-0.5">
              {operationItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={navLinkClass}
                    onClick={onNavigate}
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>

          <div>
            <SectionLabel>프로젝트</SectionLabel>
            <div className="space-y-2">
              {data?.items.map((project, index) => {
                const activeProject = project.id === projectId
                const expanded = activeProject || (!projectId && index === 0)
                return (
                  <div key={project.id}>
                    <NavLink
                      to={`/projects/${project.id}/work-packages`}
                      className={() => projectLinkClass(expanded)}
                      onClick={onNavigate}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-of-surface-2 text-[10px] font-semibold text-of-muted">
                        {project.key.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    </NavLink>
                    {expanded ? (
                      <div className="mt-1 space-y-2 border-l border-of-border pl-2">
                        {projectNavSections.map((section) => (
                          <div key={section.label}>
                            <p className="px-2 pb-1 text-[10px] font-medium uppercase text-of-muted">
                              {section.label}
                            </p>
                            <div className="space-y-0.5">
                              {section.items.map((item) => {
                                const Icon = item.icon
                                return (
                                  <NavLink
                                    key={item.path}
                                    to={`/projects/${project.id}/${item.path}`}
                                    className={navLinkClass}
                                    onClick={onNavigate}
                                  >
                                    <Icon />
                                    <span className="truncate">{item.label}</span>
                                  </NavLink>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {projectId && !data ? <div className="px-2 text-xs text-of-muted">…</div> : null}
            </div>
          </div>
        </div>
      </nav>

      <div className="border-t border-of-border px-3 py-2 text-[11px] text-of-muted">
        {auth.data?.auth_mode === 'oidc'
          ? `OIDC · ${auth.data.oidc_issuer ? new URL(auth.data.oidc_issuer).host : '구성됨'}`
          : 'dev 모드 · 로컬 전용'}
      </div>
    </>
  )
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
}) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-of-border bg-of-surface md:flex">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div
          role="dialog"
          aria-label="모바일 내비게이션"
          aria-modal="true"
          className="fixed inset-0 z-40 md:hidden"
        >
          <button
            type="button"
            aria-label="사이드바 닫기"
            className="absolute inset-0 bg-black/20"
            onClick={onMobileClose}
          />
          <aside className="relative flex h-full w-[min(18rem,calc(100vw-3rem))] flex-col border-r border-of-border bg-of-surface shadow-xl">
            <SidebarContent
              showClose
              onClose={onMobileClose}
              onNavigate={onMobileClose}
            />
          </aside>
        </div>
      ) : null}
    </>
  )
}
