import {
  Activity,
  ArrowDown,
  ArrowUp,
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
  PanelLeftClose,
  PanelLeftOpen,
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
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAuthConfig } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { useWorkspaceProfile } from '@/features/workspace-profile/api'
import { cn } from '@/lib/utils'

import type { SidebarNavKey, SidebarPreferences } from './sidebar-preferences'

type WorkspaceNavItem = {
  to: SidebarNavKey
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

function orderedNav(items: WorkspaceNavItem[], preferences: SidebarPreferences) {
  return [...items].sort(
    (left, right) => preferences.order.indexOf(left.to) - preferences.order.indexOf(right.to),
  )
}

function visibleNav(items: WorkspaceNavItem[], preferences: SidebarPreferences) {
  return orderedNav(items, preferences).filter((item) => !preferences.hidden.includes(item.to))
}

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

function NavigationCustomizer({
  groups,
  preferences,
  onNavVisibleChange,
  onMoveNav,
  onReset,
}: {
  groups: Array<{ label: string; items: WorkspaceNavItem[] }>
  preferences: SidebarPreferences
  onNavVisibleChange: (key: SidebarNavKey, visible: boolean) => void
  onMoveNav: (key: SidebarNavKey, direction: -1 | 1, groupKeys: SidebarNavKey[]) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    const dialog = dialogRef.current
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )
    focusable?.[0]?.focus()
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleDialogKey)
    return () => window.removeEventListener('keydown', handleDialogKey)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="내비게이션 사용자 지정"
        aria-expanded={open}
        title="내비게이션 사용자 지정"
        className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="내비게이션 사용자 지정 닫기"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-label="내비게이션 사용자 지정"
            aria-modal="true"
            className="of-floating-surface absolute right-0 top-9 z-50 w-72 max-w-[calc(100vw-1.5rem)] p-2 md:left-0 md:right-auto"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-xs font-semibold">내비게이션</p>
              <button
                type="button"
                className="rounded-of px-1.5 py-1 text-[11px] text-of-muted hover:bg-of-surface-hover hover:text-of-text"
                onClick={onReset}
              >
                기본값 복원
              </button>
            </div>
            <div className="of-scrollbar max-h-[min(32rem,calc(100vh-8rem))] space-y-3 overflow-y-auto">
              {groups.map((group) => {
                const orderedItems = orderedNav(group.items, preferences)
                const groupKeys = group.items.map((item) => item.to)
                return (
                  <section key={group.label} aria-label={group.label}>
                    <SectionLabel>{group.label}</SectionLabel>
                    <div className="space-y-0.5">
                      {orderedItems.map((item, index) => {
                        const Icon = item.icon
                        const visible = !preferences.hidden.includes(item.to)
                        return (
                          <div
                            key={item.to}
                            className="grid min-h-8 grid-cols-[minmax(0,1fr)_28px_28px] items-center rounded-of hover:bg-of-surface-hover"
                          >
                            <label className="flex min-w-0 cursor-pointer items-center gap-2 px-2 text-xs">
                              <input
                                type="checkbox"
                                aria-label={`${item.label} 표시`}
                                checked={visible}
                                onChange={(event) => onNavVisibleChange(item.to, event.target.checked)}
                              />
                              <Icon size={13} className="shrink-0 text-of-muted" aria-hidden="true" />
                              <span className="truncate">{item.label}</span>
                            </label>
                            <button
                              type="button"
                              aria-label={`${item.label} 위로 이동`}
                              title="위로 이동"
                              disabled={index === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 disabled:opacity-30"
                              onClick={() => onMoveNav(item.to, -1, groupKeys)}
                            >
                              <ArrowUp size={12} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`${item.label} 아래로 이동`}
                              title="아래로 이동"
                              disabled={index === orderedItems.length - 1}
                              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 disabled:opacity-30"
                              onClick={() => onMoveNav(item.to, 1, groupKeys)}
                            >
                              <ArrowDown size={12} aria-hidden="true" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function GlobalRail({
  settingsHref,
  onNavigate,
  collapsed,
  onExpand,
}: {
  settingsHref: string
  onNavigate?: () => void
  collapsed?: boolean
  onExpand?: () => void
}) {
  const location = useLocation()
  const wikiActive = location.pathname === '/wiki' || location.pathname.includes('/documents')
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
    {
      href: '/wiki',
      label: 'Wiki',
      icon: BookOpenText,
      active: wikiActive,
    },
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
      {collapsed ? (
        <button
          type="button"
          aria-label="사이드바 펼치기"
          title="사이드바 펼치기"
          className="mt-auto flex h-10 w-full items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={onExpand}
        >
          <PanelLeftOpen size={16} aria-hidden="true" />
        </button>
      ) : null}
      <Link
        to={settingsHref}
        aria-current={settingsActive ? 'page' : undefined}
        className={cn(
          'flex h-12 w-full flex-col items-center justify-center gap-1 rounded-of text-[10px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
          !collapsed && 'mt-auto',
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
  collapsed = false,
  preferences,
  onCollapsedChange,
  onNavVisibleChange,
  onMoveNav,
  onResetNavigation,
}: {
  onNavigate?: () => void
  onClose?: () => void
  showClose?: boolean
  collapsed?: boolean
  preferences: SidebarPreferences
  onCollapsedChange?: (collapsed: boolean) => void
  onNavVisibleChange: (key: SidebarNavKey, visible: boolean) => void
  onMoveNav: (key: SidebarNavKey, direction: -1 | 1, groupKeys: SidebarNavKey[]) => void
  onResetNavigation: () => void
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
  const visiblePrimaryNav = visibleNav(primaryNav, preferences)
  const visibleWorkspaceNav = visibleNav(workspaceNav, preferences)
  const visibleMoreItems = visibleNav(moreItems, preferences)
  const selectedProject = data?.items.find((project) => project.id === projectId) ?? data?.items[0]
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const settingsHref = me.data?.is_admin ? '/admin' : '/settings'
  const location = useLocation()
  const wikiMode = location.pathname === '/wiki' || location.pathname.includes('/documents')
  const wikiProjectId = projectId ?? selectedProject?.id
  const aiMode = location.pathname === '/ai'
  const settingsMode = location.pathname === '/settings' || location.pathname.startsWith('/admin')
  const rawWikiBucket = new URLSearchParams(location.search).get('bucket')
  const wikiBucket = rawWikiBucket === 'private' || rawWikiBucket === 'archived'
    ? rawWikiBucket
    : 'shared'
  const myWorkTab = new URLSearchParams(location.search).get('tab')
  const profileWorkMode =
    location.pathname === '/my' && myWorkTab !== null && myWorkTab !== 'overview'
  const moreRoute = visibleMoreItems.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )
  const [moreOpen, setMoreOpen] = useState(moreRoute)

  useEffect(() => {
    if (moreRoute) setMoreOpen(true)
  }, [moreRoute])

  return (
    <div className="flex min-h-0 flex-1">
      <GlobalRail
        settingsHref={settingsHref}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onExpand={() => onCollapsedChange?.(false)}
      />
      {!collapsed ? (
      <div className="flex min-w-0 flex-1 flex-col bg-of-surface-raised md:mb-2 md:rounded-l-[var(--of-radius-lg)] md:border-y md:border-l md:border-of-border-subtle md:shadow-[var(--of-shadow-sm)]">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold leading-4">
              {wikiMode ? 'Wiki' : aiMode ? 'AI' : settingsMode ? 'Settings' : 'Projects'}
            </h2>
            <p className="truncate text-[10px] leading-3 text-of-muted">
              {workspaceProfile.data?.name ?? 'OneFlow'}
            </p>
          </div>
          {!wikiMode && !aiMode && !settingsMode ? (
            <NavigationCustomizer
              groups={[
                { label: '개인', items: primaryNav },
                { label: '워크스페이스', items: workspaceNav },
                { label: '더 보기', items: moreItems },
              ]}
              preferences={preferences}
              onNavVisibleChange={onNavVisibleChange}
              onMoveNav={onMoveNav}
              onReset={onResetNavigation}
            />
          ) : null}
          {onCollapsedChange ? (
            <button
              type="button"
              aria-label="사이드바 접기"
              title="사이드바 접기"
              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={() => onCollapsedChange(true)}
            >
              <PanelLeftClose size={14} aria-hidden="true" />
            </button>
          ) : null}
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
        ) : wikiMode ? (
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
                    const wikiRoot = location.pathname === '/wiki'
                    const href = wikiRoot
                      ? item.key === 'shared' ? '/wiki' : `/wiki?bucket=${item.key}`
                      : item.key === 'shared'
                        ? `/projects/${wikiProjectId}/documents`
                        : `/projects/${wikiProjectId}/documents?bucket=${item.key}`
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
                    const active = project.id === projectId
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
                  {data?.items.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-of-muted">접근 가능한 프로젝트가 없습니다.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </nav>
        ) : (
        <nav className="of-scrollbar flex-1 overflow-y-auto px-2 pb-3" aria-label="Projects 컨텍스트 내비게이션">
          <div className="space-y-4">
            <div className="space-y-0.5">
              {visiblePrimaryNav.map((item) => {
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

            {visibleWorkspaceNav.length > 0 ? (
            <div>
              <SectionLabel>워크스페이스</SectionLabel>
              <div className="space-y-0.5">
                {visibleWorkspaceNav.map((item) => {
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
            ) : null}

            {visibleMoreItems.length > 0 ? (
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
                {visibleMoreItems.map((item) => {
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
            ) : null}

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
      ) : null}
    </div>
  )
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
  preferences,
  onCollapsedChange,
  onNavVisibleChange,
  onMoveNav,
  onResetNavigation,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
  preferences: SidebarPreferences
  onCollapsedChange: (collapsed: boolean) => void
  onNavVisibleChange: (key: SidebarNavKey, visible: boolean) => void
  onMoveNav: (key: SidebarNavKey, direction: -1 | 1, groupKeys: SidebarNavKey[]) => void
  onResetNavigation: () => void
}) {
  useEffect(() => {
    if (!mobileOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented) return
      const activeDialog =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest('[role="dialog"]')
          : null
      if (activeDialog && !activeDialog.hasAttribute('data-mobile-navigation-dialog')) return
      event.preventDefault()
      onMobileClose?.()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen, onMobileClose])

  return (
    <>
      <aside
        className="hidden shrink-0 border-r border-of-border-subtle transition-[width] duration-[var(--of-duration-default)] md:flex"
        style={{
          width: preferences.collapsed
            ? 'var(--of-global-nav-width)'
            : 'var(--of-navigation-width)',
        }}
      >
        <SidebarContent
          collapsed={preferences.collapsed}
          preferences={preferences}
          onCollapsedChange={onCollapsedChange}
          onNavVisibleChange={onNavVisibleChange}
          onMoveNav={onMoveNav}
          onResetNavigation={onResetNavigation}
        />
      </aside>

      {mobileOpen ? (
        <div
          role="dialog"
          aria-label="모바일 내비게이션"
          aria-modal="true"
          data-mobile-navigation-dialog
          className="fixed inset-0 z-40 md:hidden"
        >
          <button
            type="button"
            aria-label="사이드바 닫기"
            className="absolute inset-0 bg-of-overlay"
            onClick={onMobileClose}
          />
          <aside className="relative flex h-full w-[min(22rem,calc(100vw-1rem))] border-r border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]">
            <SidebarContent
              showClose
              onClose={onMobileClose}
              onNavigate={onMobileClose}
              preferences={preferences}
              onNavVisibleChange={onNavVisibleChange}
              onMoveNav={onMoveNav}
              onResetNavigation={onResetNavigation}
            />
          </aside>
        </div>
      ) : null}
    </>
  )
}
