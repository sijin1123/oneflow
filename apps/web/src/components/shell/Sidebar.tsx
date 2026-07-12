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
  ChevronRight,
  ClipboardList,
  Clock3,
  Compass,
  Copy,
  FilePenLine,
  FileText,
  Flag,
  FolderKanban,
  House,
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
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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

const primaryNav: WorkspaceNavItem[] = [
  { to: '/my', label: '홈', icon: House, end: true },
  { to: '/drafts', label: '초안', icon: FilePenLine },
  { to: '/my?tab=assigned', label: '내 작업', icon: ListChecks },
  { to: '/notes', label: '개인 메모', icon: StickyNote },
]

const workspaceNav: WorkspaceNavItem[] = [
  { to: '/projects', label: '프로젝트', icon: FolderKanban, end: true },
  { to: '/work-items', label: '전체 작업', icon: ListChecks },
]

const moreNav: WorkspaceNavItem[] = [
  { to: '/inbox', label: '인박스', icon: BellRing },
  { to: '/customers', label: '고객', icon: Building2 },
  { to: '/templates', label: '템플릿', icon: Copy },
  { to: '/initiatives', label: '이니셔티브', icon: Compass },
  { to: '/search', label: '검색', icon: Search },
  { to: '/reports', label: '리포트', icon: BarChart3 },
  { to: '/operations', label: '운영 허브', icon: SquareActivity },
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
    'flex min-h-8 items-center gap-2 rounded-of px-2 text-[13px] text-of-secondary transition-colors duration-[var(--of-duration-fast)] hover:bg-of-surface-hover hover:text-of-text [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-of-muted',
    isActive && 'bg-of-surface-selected font-medium text-of-accent [&_svg]:text-of-accent',
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
  const wikiActive = location.pathname.includes('/documents')
  const aiActive = location.pathname === '/ai'
  const settingsActive =
    location.pathname === '/settings' || location.pathname.startsWith('/admin')
  const items = [
    {
      href: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      active: !wikiActive && !aiActive && !settingsActive,
    },
    ...(wikiEnabled && wikiHref
      ? [{
          href: wikiHref,
          label: 'Wiki',
          icon: BookOpenText,
          active: wikiActive,
        }]
      : []),
    {
      href: '/ai',
      label: 'AI',
      icon: Sparkles,
      active: aiActive,
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
        aria-current={settingsActive ? 'page' : undefined}
        className={cn(
          'mt-auto flex h-12 w-full flex-col items-center justify-center gap-1 rounded-of text-[10px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
          settingsActive && 'bg-of-surface-selected text-of-accent',
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
  const moreItems = moreNav.filter(
    (item) =>
      (item.to !== '/initiatives' || initiativesEnabled) &&
      (item.to !== '/customers' || customersEnabled),
  )
  const selectedProject = data?.items.find((project) => project.id === projectId) ?? data?.items[0]
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const wikiHref = selectedProject ? `/projects/${selectedProject.id}/documents` : undefined
  const settingsHref = me.data?.is_admin ? '/admin' : '/settings'
  const location = useLocation()
  const wikiMode = location.pathname.includes('/documents')
  const aiMode = location.pathname === '/ai'
  const settingsMode = location.pathname === '/settings' || location.pathname.startsWith('/admin')
  const wikiBucket = new URLSearchParams(location.search).get('bucket') ?? 'shared'
  const myWorkTab = new URLSearchParams(location.search).get('tab')
  const profileWorkMode =
    location.pathname === '/my' && myWorkTab !== null && myWorkTab !== 'overview'
  const moreRoute = moreItems.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )
  const [moreOpen, setMoreOpen] = useState(moreRoute)

  useEffect(() => {
    if (moreRoute) setMoreOpen(true)
  }, [moreRoute])

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
            <h2 className="truncate text-sm font-semibold leading-4">
              {wikiMode ? 'Wiki' : aiMode ? 'AI' : settingsMode ? 'Settings' : 'Projects'}
            </h2>
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

        {selectedProject && !wikiMode && !aiMode && !settingsMode ? (
          <NewWorkItemButton projectId={selectedProject.id} onNavigate={onNavigate} />
        ) : null}

        {settingsMode ? (
          <nav className="of-scrollbar flex-1 overflow-y-auto px-2 pb-3" aria-label="설정 컨텍스트 내비게이션">
            <div className="space-y-4">
              <div>
                <SectionLabel>개인</SectionLabel>
                <NavLink to="/settings" end className={navLinkClass} onClick={onNavigate}>
                  <SlidersHorizontal />
                  <span>내 계정</span>
                </NavLink>
              </div>
              {me.data?.is_admin ? (
                <>
                  <div>
                    <SectionLabel>워크스페이스</SectionLabel>
                    <div className="space-y-0.5">
                      <NavLink to="/admin/general" className={navLinkClass} onClick={onNavigate}><Settings /><span>일반</span></NavLink>
                      <NavLink to="/admin/users" className={navLinkClass} onClick={onNavigate}><Users /><span>사용자</span></NavLink>
                      <NavLink to="/admin/worklogs" className={navLinkClass} onClick={onNavigate}><Clock3 /><span>Worklogs</span></NavLink>
                    </div>
                  </div>
                  <div>
                    <SectionLabel>기능</SectionLabel>
                    <div className="space-y-0.5">
                      <NavLink to="/admin/wiki" className={navLinkClass} onClick={onNavigate}><BookOpenText /><span>Wiki</span></NavLink>
                      <NavLink to="/admin/ai" className={navLinkClass} onClick={onNavigate}><Sparkles /><span>AI</span></NavLink>
                      <NavLink to="/admin/initiatives" className={navLinkClass} onClick={onNavigate}><Compass /><span>Initiatives</span></NavLink>
                      <NavLink to="/admin/releases" className={navLinkClass} onClick={onNavigate}><Flag /><span>Releases</span></NavLink>
                      <NavLink to="/admin/customers" className={navLinkClass} onClick={onNavigate}><Building2 /><span>Customers</span></NavLink>
                    </div>
                  </div>
                  <div>
                    <SectionLabel>개발자 도구</SectionLabel>
                    <NavLink to="/admin/webhooks" className={navLinkClass} onClick={onNavigate}><Webhook /><span>Webhooks</span></NavLink>
                  </div>
                </>
              ) : null}
            </div>
          </nav>
        ) : aiMode ? (
          <nav className="of-scrollbar flex-1 overflow-y-auto px-2 pb-3" aria-label="AI 컨텍스트 내비게이션">
            <div className="space-y-4">
              <div>
                <SectionLabel>AI workspace</SectionLabel>
                <div className="space-y-0.5">
                  <Link to="/ai" aria-current="page" className={projectLinkClass(true)} onClick={onNavigate}><Sparkles size={14} aria-hidden="true" /><span>작업 요약</span></Link>
                  <Link to="/ai#summary-candidates" className={projectLinkClass(false)} onClick={onNavigate}><ListChecks size={14} aria-hidden="true" /><span>요약 후보</span></Link>
                  <Link to="/work-items" className={projectLinkClass(false)} onClick={onNavigate}><List size={14} aria-hidden="true" /><span>전체 작업</span></Link>
                </div>
              </div>
              {me.data?.is_admin ? (
                <div><SectionLabel>관리</SectionLabel><Link to="/admin/ai" className={projectLinkClass(false)} onClick={onNavigate}><Settings size={14} aria-hidden="true" /><span>AI 설정</span></Link></div>
              ) : null}
            </div>
          </nav>
        ) : wikiMode && selectedProject ? (
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
              {primaryNav.map((item) => {
                const Icon = item.icon
                const active = item.to === '/my'
                  ? location.pathname === '/my' && !profileWorkMode
                  : item.to === '/my?tab=assigned'
                    ? profileWorkMode
                    : location.pathname === item.to
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={projectLinkClass(active)}
                    onClick={onNavigate}
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>

            <div>
              <SectionLabel>워크스페이스</SectionLabel>
              <div className="space-y-0.5">
                {workspaceNav.map((item) => {
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

            <details
              open={moreOpen}
              className="group"
              onToggle={(event) => setMoreOpen(event.currentTarget.open)}
            >
              <summary className="flex min-h-8 cursor-pointer list-none items-center rounded-of px-2 text-[13px] text-of-secondary transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus [&::-webkit-details-marker]:hidden">
                <ChevronRight size={14} className="mr-2 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                더 보기
              </summary>
              <div className="mt-0.5 space-y-0.5">
                {moreItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={onNavigate}>
                      <Icon />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </details>

            <div>
              <SectionLabel>프로젝트</SectionLabel>
              <div className="space-y-2">
                {data?.items.map((project) => {
                  const activeProject = project.id === projectId
                  const expanded = activeProject
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
