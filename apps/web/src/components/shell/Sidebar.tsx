import {
  Activity,
  Archive,
  BarChart3,
  BellRing,
  Bookmark,
  BookOpenText,
  Building2,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Compass,
  Copy,
  FilePenLine,
  FileText,
  FolderKanban,
  Inbox,
  IterationCcw,
  LayoutDashboard,
  List,
  ListChecks,
  ListTree,
  LockKeyhole,
  Paperclip,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareActivity,
  SquareKanban,
  StickyNote,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAuthConfig } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { useWorkspaceProfile } from '@/features/workspace-profile/api'
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
  { to: '/notes', label: '개인 메모', icon: StickyNote },
  { to: '/drafts', label: '작업 초안', icon: FilePenLine },
  { to: '/inbox', label: '인박스', icon: BellRing },
  { to: '/work-items', label: '전체 작업', icon: ListChecks },
  { to: '/customers', label: '고객', icon: Building2 },
  { to: '/projects', label: '프로젝트', icon: FolderKanban, end: true },
  { to: '/templates', label: '템플릿', icon: Copy },
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
      { path: 'views', label: 'Views', icon: Bookmark },
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
    'group flex min-h-8 items-center gap-2 rounded-of px-2 text-[13px] text-of-secondary transition-colors duration-[var(--of-duration-fast)] hover:bg-of-surface-hover hover:text-of-text [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-of-muted',
    isActive && 'bg-of-surface-selected font-medium text-of-accent [&_svg]:text-of-accent',
  )

const projectLinkClass = (isActive: boolean) =>
  cn(
    'flex min-h-8 items-center gap-2 rounded-of px-2 text-[13px] text-of-secondary transition-colors duration-[var(--of-duration-fast)] hover:bg-of-surface-hover hover:text-of-text',
    isActive && 'bg-of-surface-selected font-medium text-of-accent',
  )

function SectionLabel({ children }: { children: string }) {
  return <p className="px-2 pb-1 text-[11px] font-medium text-of-muted">{children}</p>
}

function NewWorkItemButton({ projectId, onNavigate }: { projectId: string; onNavigate?: () => void }) {
  const canWrite = useCanWrite(projectId)
  const navigate = useNavigate()
  if (!canWrite) return null
  return (
    <button
      type="button"
      className="mx-3 mb-2 flex h-8 items-center justify-center gap-2 rounded-of border border-of-border bg-of-surface text-xs font-medium text-of-text shadow-[var(--of-shadow-xs)] hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
      onClick={() => {
        navigate(`/projects/${projectId}/work-packages?new=1`)
        onNavigate?.()
      }}
    >
      <Plus size={14} aria-hidden="true" /> 새 작업
    </button>
  )
}

function GlobalRail({
  wikiHref,
  settingsHref,
  wikiEnabled,
  onNavigate,
}: {
  wikiHref?: string
  settingsHref: string
  wikiEnabled: boolean
  onNavigate?: () => void
}) {
  const location = useLocation()
  const items = [
    {
      href: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      active: location.pathname.startsWith('/projects') && !location.pathname.includes('/documents'),
    },
    ...(wikiEnabled && wikiHref
      ? [{
          href: wikiHref,
          label: 'Wiki',
          icon: BookOpenText,
          active: location.pathname.includes('/documents'),
        }]
      : []),
    {
      href: '/my#ai-workspace',
      label: 'AI',
      icon: Sparkles,
      active: location.pathname === '/my' && location.hash === '#ai-workspace',
    },
  ]

  return (
    <nav
      aria-label="글로벌 내비게이션"
      className="flex w-[var(--of-global-nav-width)] shrink-0 flex-col items-center border-r border-of-border-subtle bg-of-surface-2 px-1.5 py-2"
    >
      <div className="flex w-full flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              to={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex h-12 w-full flex-col items-center justify-center gap-1 rounded-of text-[10px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                item.active && 'bg-of-surface-selected text-of-accent',
              )}
              onClick={onNavigate}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
      <Link
        to={settingsHref}
        aria-current={location.pathname.startsWith('/settings') || location.pathname.startsWith('/admin') ? 'page' : undefined}
        className={cn(
          'mt-auto flex h-12 w-full flex-col items-center justify-center gap-1 rounded-of text-[10px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
          (location.pathname.startsWith('/settings') || location.pathname.startsWith('/admin')) && 'bg-of-surface-selected text-of-accent',
        )}
        onClick={onNavigate}
      >
        <Settings size={17} aria-hidden="true" />
        <span>Settings</span>
      </Link>
    </nav>
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
  const capabilities = useWorkspaceCapabilities()
  const workspaceProfile = useWorkspaceProfile()
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true
  const customersEnabled = capabilities.data?.customers.enabled === true
  const workspaceItems = workspaceNav.filter(
    (item) =>
      (item.to !== '/initiatives' || initiativesEnabled) &&
      (item.to !== '/customers' || customersEnabled),
  )
  const operationItems: WorkspaceNavItem[] = me.data?.is_admin
    ? [...operationsNav, { to: '/admin', label: '워크스페이스 설정', icon: Settings }]
    : operationsNav
  const selectedProject = data?.items.find((project) => project.id === projectId) ?? data?.items[0]
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const wikiHref = selectedProject ? `/projects/${selectedProject.id}/documents` : undefined
  const settingsHref = me.data?.is_admin ? '/admin' : '/settings'
  const location = useLocation()
  const wikiMode = location.pathname.includes('/documents')
  const wikiBucket = new URLSearchParams(location.search).get('bucket') ?? 'shared'

  return (
    <div className="flex min-h-0 flex-1">
      <GlobalRail
        wikiHref={wikiHref}
        settingsHref={settingsHref}
        wikiEnabled={wikiEnabled}
        onNavigate={onNavigate}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-of-surface-raised">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold leading-4">{wikiMode ? 'Wiki' : 'Projects'}</h2>
            <p className="truncate text-[10px] leading-3 text-of-muted">
              {workspaceProfile.data?.name ?? 'OneFlow'}
            </p>
          </div>
          {showClose ? (
            <button
              type="button"
              aria-label="사이드바 닫기"
              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>

        {selectedProject && !wikiMode ? (
          <NewWorkItemButton projectId={selectedProject.id} onNavigate={onNavigate} />
        ) : null}

        {wikiMode && selectedProject ? (
          <nav className="of-scrollbar flex-1 overflow-y-auto px-2 pb-3" aria-label="Wiki 컨텍스트 내비게이션">
            <div className="space-y-4">
              <div>
                <SectionLabel>문서 범위</SectionLabel>
                <div className="space-y-0.5">
                  {[
                    { key: 'shared', label: '공유', icon: Users },
                    { key: 'private', label: '비공개', icon: LockKeyhole },
                    { key: 'archived', label: '보관됨', icon: Archive },
                  ].map((item) => {
                    const Icon = item.icon
                    const href =
                      item.key === 'shared'
                        ? `/projects/${selectedProject.id}/documents`
                        : `/projects/${selectedProject.id}/documents?bucket=${item.key}`
                    return (
                      <Link
                        key={item.key}
                        to={href}
                        aria-current={wikiBucket === item.key ? 'page' : undefined}
                        className={projectLinkClass(wikiBucket === item.key)}
                        onClick={onNavigate}
                      >
                        <Icon size={14} aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>

              <div>
                <SectionLabel>프로젝트 공간</SectionLabel>
                <div className="space-y-0.5">
                  {data?.items.map((project) => {
                    const active = project.id === selectedProject.id
                    return (
                      <Link
                        key={project.id}
                        to={`/projects/${project.id}/documents`}
                        className={projectLinkClass(active)}
                        onClick={onNavigate}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-of-border-subtle bg-of-surface text-[10px] font-semibold text-of-muted">
                          {project.key.slice(0, 2)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          </nav>
        ) : (
        <nav className="of-scrollbar flex-1 overflow-y-auto px-2 pb-3" aria-label="컨텍스트 내비게이션">
          <div className="space-y-4">
            <div className="space-y-0.5">
              {workspaceItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={onNavigate}>
                    <Icon />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>

            <div>
              <SectionLabel>운영</SectionLabel>
              <div className="space-y-0.5">
                {operationItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={onNavigate}>
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
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-of-border-subtle bg-of-surface text-[10px] font-semibold text-of-muted">
                          {project.key.slice(0, 2)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      </NavLink>
                      {expanded ? (
                        <div className="mt-1 space-y-2 border-l border-of-border-subtle pl-2">
                          {projectNavSections.map((section) => (
                            <div key={section.label}>
                              <p className="px-2 pb-1 text-[10px] font-medium text-of-muted">{section.label}</p>
                              <div className="space-y-0.5">
                                {section.items
                                  .filter((item) => item.path !== 'documents' || wikiEnabled)
                                  .map((item) => {
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
        )}

        <div className="border-t border-of-border-subtle px-3 py-2 text-[11px] text-of-muted">
          {auth.data?.auth_mode === 'oidc'
            ? `OIDC · ${auth.data.oidc_issuer ? new URL(auth.data.oidc_issuer).host : '구성됨'}`
            : 'dev 모드 · 로컬 전용'}
        </div>
      </div>
    </div>
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
      <aside className="hidden w-[var(--of-navigation-width)] shrink-0 border-r border-of-border-subtle md:flex">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div role="dialog" aria-label="모바일 내비게이션" aria-modal="true" className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="사이드바 닫기"
            className="absolute inset-0 bg-of-overlay"
            onClick={onMobileClose}
          />
          <aside className="relative flex h-full w-[min(22rem,calc(100vw-1rem))] border-r border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]">
            <SidebarContent showClose onClose={onMobileClose} onNavigate={onMobileClose} />
          </aside>
        </div>
      ) : null}
    </>
  )
}
