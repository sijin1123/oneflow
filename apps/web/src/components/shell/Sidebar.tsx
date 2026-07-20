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
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  Cable,
  ChevronsLeftRight,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Compass,
  Copy,
  FilePenLine,
  FileText,
  Flag,
  FolderKanban,
  GripVertical,
  House,
  IterationCcw,
  LayoutDashboard,
  LifeBuoy,
  List,
  ListChecks,
  ListTree,
  Link as LinkIcon,
  LockKeyhole,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareActivity,
  SquareKanban,
  Star,
  StickyNote,
  Users,
  Webhook,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type AnimationEvent as ReactAnimationEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAuthConfig } from '@/features/auth/api'
import { useMe, useMembers } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useArchiveProject, useProjects } from '@/features/projects/api'
import type { ProjectListItem } from '@/features/projects/types'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { useWorkspaceProfile } from '@/features/workspace-profile/api'
import { WorkspaceLogo } from '@/features/workspace-profile/WorkspaceLogo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type SidebarNavKey,
  type SidebarPreferences,
} from './sidebar-preferences'

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

type OverlayPhase = 'closed' | 'opening' | 'open' | 'closing'

function useOverlayPresence() {
  const [phase, setPhase] = useState<OverlayPhase>('closed')

  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => setPhase((current) => {
        if (current === 'opening') return 'open'
        if (current === 'closing') return 'closed'
        return current
      }),
      reducedMotion ? 0 : 260,
    )
    return () => window.clearTimeout(timer)
  }, [phase])

  const open = useCallback(() => {
    setPhase((current) => current === 'open' || current === 'opening' ? current : 'opening')
  }, [])
  const close = useCallback(() => {
    setPhase((current) => current === 'closed' || current === 'closing' ? current : 'closing')
  }, [])
  const toggle = useCallback(() => {
    setPhase((current) => current === 'open' || current === 'opening' ? 'closing' : 'opening')
  }, [])
  const onAnimationEnd = useCallback((event: ReactAnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    setPhase((current) => {
      if (current === 'opening') return 'open'
      if (current === 'closing') return 'closed'
      return current
    })
  }, [])

  return {
    phase,
    present: phase !== 'closed',
    expanded: phase === 'opening' || phase === 'open',
    open,
    close,
    toggle,
    onAnimationEnd,
  }
}

const primaryNav: WorkspaceNavItem[] = [
  { to: '/my', label: '홈', icon: House, end: true },
  { to: '/drafts', label: '초안', icon: FilePenLine },
  { to: '/my?tab=assigned', label: '내 작업', icon: ListChecks },
  { to: '/notes', label: '개인 메모', icon: StickyNote },
]

const workspaceNav: WorkspaceNavItem[] = [
  { to: '/projects', label: '프로젝트', icon: FolderKanban, end: true },
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

const workspacePanelNav: WorkspaceNavItem[] = [
  { to: '/work-items', label: 'Views', icon: ListChecks },
  ...moreNav,
]

function orderedNav(items: WorkspaceNavItem[], preferences: SidebarPreferences) {
  return [...items].sort(
    (left, right) => preferences.order.indexOf(left.to) - preferences.order.indexOf(right.to),
  )
}

function visibleNav(items: WorkspaceNavItem[], preferences: SidebarPreferences) {
  return orderedNav(items, preferences).filter((item) => !preferences.hidden.includes(item.to))
}

export const projectNavSections: Array<{ label: string; items: ProjectNavItem[] }> = [
  {
    label: '프로젝트',
    items: [{ path: 'overview', label: 'Overview', icon: House }],
  },
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

function ProjectActions({
  project,
  meId,
  favorite,
  onFavoriteChange,
  onNavigate,
  onMessage,
}: {
  project: ProjectListItem
  meId?: string
  favorite: boolean
  onFavoriteChange: (projectId: string, favorite: boolean) => void
  onNavigate?: () => void
  onMessage: (message: string) => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuId = `project-actions-${project.id}`
  const members = useMembers(project.id, open)
  const archive = useArchiveProject(project.id)
  const isOwner = members.data?.items.some(
    (member) => member.user_id === meId && member.role === 'owner',
  ) === true

  const copyLink = async () => {
    const href = `${window.location.origin}/projects/${project.id}/overview`
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(href)
      onMessage(`'${project.name}' 링크를 복사했습니다.`)
    } catch {
      onMessage(`복사할 링크: ${href}`)
    }
  }

  const archiveProject = () => {
    if (!confirmDestructive(`'${project.name}' 프로젝트를 보관할까요?\n보관 중에는 모든 변경이 차단됩니다(복원 가능).`)) return
    archive.mutate(true, {
      onSuccess: () => {
        onMessage(`'${project.name}' 프로젝트를 보관했습니다.`)
      },
      onError: () => onMessage(`'${project.name}' 프로젝트를 보관하지 못했습니다.`),
    })
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${project.name} 프로젝트 작업`}
            aria-controls={menuId}
            aria-expanded={open}
            className="flex h-8 w-7 shrink-0 items-center justify-center rounded-of text-of-muted opacity-100 transition-[opacity,color,background-color] hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:opacity-0 sm:group-hover/project:opacity-100 sm:group-focus-within/project:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          id={menuId}
          align="start"
          side="right"
          className="w-52"
        >
          <DropdownMenuLabel>{project.name}</DropdownMenuLabel>
          <DropdownMenuItem
            className="flex items-center gap-2 text-xs"
            onSelect={() => onFavoriteChange(project.id, !favorite)}
          >
            <Star size={13} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
            {favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
          </DropdownMenuItem>
          <DropdownMenuItem className="flex items-center gap-2 text-xs" onSelect={() => void copyLink()}>
            <LinkIcon size={13} aria-hidden="true" /> 링크 복사
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 text-xs"
            onSelect={() => {
              navigate(`/projects/${project.id}/settings`)
              onNavigate?.()
            }}
          >
            <Settings size={13} aria-hidden="true" /> 설정
          </DropdownMenuItem>
          {members.isPending ? (
            <DropdownMenuLabel className="text-xs normal-case">권한 확인 중…</DropdownMenuLabel>
          ) : null}
          {members.isError ? (
            <DropdownMenuLabel className="text-xs normal-case text-of-danger">권한을 확인할 수 없습니다.</DropdownMenuLabel>
          ) : null}
          {isOwner ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 text-xs text-of-danger"
                disabled={archive.isPending}
                onSelect={archiveProject}
              >
                <Archive size={13} aria-hidden="true" />
                {archive.isPending ? '보관 중…' : '프로젝트 보관'}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function NavigationCustomizer({
  groups,
  preferences,
  onNavVisibleChange,
  onMoveNav,
  onMoveNavTo,
  onProjectNavigationChange,
  onLimitProjectsChange,
  onProjectLimitChange,
  onReset,
}: {
  groups: Array<{ label: string; items: WorkspaceNavItem[] }>
  preferences: SidebarPreferences
  onNavVisibleChange: (key: SidebarNavKey, visible: boolean) => void
  onMoveNav: (key: SidebarNavKey, direction: -1 | 1, groupKeys: SidebarNavKey[]) => void
  onMoveNavTo: (key: SidebarNavKey, targetKey: SidebarNavKey, groupKeys: SidebarNavKey[]) => void
  onProjectNavigationChange: (value: 'accordion' | 'tabs') => void
  onLimitProjectsChange: (value: boolean) => void
  onProjectLimitChange: (value: number) => void
  onReset: () => void
}) {
  const overlay = useOverlayPresence()
  const closeOverlay = overlay.close
  const overlayPhase = overlay.phase
  const [draggedKey, setDraggedKey] = useState<SidebarNavKey | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (overlayPhase === 'closed') {
      if (wasOpen.current) triggerRef.current?.focus()
      wasOpen.current = false
      return
    }
    if (overlayPhase === 'closing') return
    wasOpen.current = true
    const dialog = dialogRef.current
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )
    focusable?.[0]?.focus()
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeOverlay()
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
  }, [closeOverlay, overlayPhase])

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-label="내비게이션 사용자 지정"
        aria-expanded={overlay.expanded}
        title="내비게이션 사용자 지정"
        className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        onClick={overlay.toggle}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
      </button>
      {overlay.present ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="내비게이션 사용자 지정 닫기"
            data-phase={overlay.phase}
            className="of-navigation-customizer-backdrop fixed inset-0 z-[var(--of-z-modal)] cursor-default bg-of-overlay"
            onClick={overlay.close}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-label="내비게이션 사용자 지정"
            aria-modal="true"
            data-phase={overlay.phase}
            className="of-navigation-customizer-dialog fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] flex max-h-[min(50rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
            onAnimationEnd={overlay.onAnimationEnd}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-of-border-subtle px-5 py-4">
              <h2 className="text-base font-semibold">내비게이션 사용자 지정</h2>
              <button
                type="button"
                aria-label="내비게이션 사용자 지정 닫기"
                className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={overlay.close}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="of-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {groups.map((group) => {
                const orderedItems = orderedNav(group.items, preferences)
                const groupKeys = group.items.map((item) => item.to)
                return (
                  <section key={group.label} aria-label={group.label}>
                    <SectionLabel>{group.label}</SectionLabel>
                    <div className="overflow-hidden rounded-of border border-of-border-subtle bg-of-surface">
                      {orderedItems.map((item, index) => {
                        const Icon = item.icon
                        const visible = !preferences.hidden.includes(item.to)
                        return (
                          <div
                            key={item.to}
                            data-testid={`nav-row-${item.to}`}
                            data-drag-target={draggedKey && draggedKey !== item.to ? true : undefined}
                            className="group grid min-h-9 grid-cols-[28px_minmax(0,1fr)_28px_28px] items-center border-b border-of-border-subtle last:border-b-0 hover:bg-of-surface-hover data-[drag-target]:border-t-of-info"
                            onDragOver={(event) => {
                              if (draggedKey && draggedKey !== item.to) event.preventDefault()
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              if (draggedKey) onMoveNavTo(draggedKey, item.to, groupKeys)
                              setDraggedKey(null)
                            }}
                          >
                            <span
                              draggable
                              data-testid={`nav-drag-${item.to}`}
                              className="flex cursor-grab items-center justify-center text-of-faint active:cursor-grabbing"
                              aria-hidden="true"
                              onDragStart={(event) => {
                                setDraggedKey(item.to)
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', item.to)
                              }}
                              onDragEnd={() => setDraggedKey(null)}
                            >
                              <GripVertical size={13} />
                            </span>
                            <label className="flex min-w-0 cursor-pointer items-center gap-2 pr-2 text-xs">
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
                              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted opacity-60 hover:bg-of-surface-2 group-hover:opacity-100 disabled:opacity-20"
                              onClick={() => onMoveNav(item.to, -1, groupKeys)}
                            >
                              <ArrowUp size={12} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`${item.label} 아래로 이동`}
                              title="아래로 이동"
                              disabled={index === orderedItems.length - 1}
                              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted opacity-60 hover:bg-of-surface-2 group-hover:opacity-100 disabled:opacity-20"
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

              <section aria-label="프로젝트 탐색">
                <SectionLabel>프로젝트 탐색</SectionLabel>
                <div className="space-y-3 rounded-of border border-of-border-subtle bg-of-surface p-3">
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input
                      type="radio"
                      name="project-navigation"
                      value="accordion"
                      checked={preferences.projectNavigation === 'accordion'}
                      onChange={() => onProjectNavigationChange('accordion')}
                    />
                    <span className="font-medium">사이드바 아코디언</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input
                      type="radio"
                      name="project-navigation"
                      value="tabs"
                      checked={preferences.projectNavigation === 'tabs'}
                      onChange={() => onProjectNavigationChange('tabs')}
                    />
                    <span className="font-medium">상단 탭</span>
                  </label>
                  <div className="border-t border-of-border-subtle pt-3">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        aria-label="사이드바 프로젝트 수 제한"
                        checked={preferences.limitProjects}
                        onChange={(event) => onLimitProjectsChange(event.target.checked)}
                      />
                      사이드바 프로젝트 수 제한
                    </label>
                    {preferences.limitProjects ? (
                      <label className="mt-2 grid max-w-48 gap-1 pl-5 text-[11px] text-of-muted">
                        표시할 프로젝트 수
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={preferences.projectLimit}
                          className="h-8 rounded-of border border-of-border bg-of-surface px-2 text-xs text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                          onChange={(event) => onProjectLimitChange(Number(event.target.value))}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
            <div className="flex shrink-0 justify-end border-t border-of-border-subtle px-5 py-3">
              <button
                type="button"
                className="h-8 rounded-of border border-of-border bg-of-surface px-3 text-xs font-medium text-of-secondary hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={onReset}
              >
                기본값 복원
              </button>
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
}: {
  settingsHref: string
  onNavigate?: () => void
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
      <Link
        to={settingsHref}
        aria-current={settingsActive ? 'page' : undefined}
        className={cn(
          'flex h-12 w-full flex-col items-center justify-center gap-1 rounded-of text-[10px] font-medium text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
          'mt-auto',
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
  onMoveNavTo,
  onProjectNavigationChange,
  onLimitProjectsChange,
  onProjectLimitChange,
  onResetNavigation,
  onWorkspaceExpandedChange,
  onProjectsExpandedChange,
  onProjectExpandedChange,
  onPinnedChange,
  onFavoriteProjectChange,
}: {
  onNavigate?: () => void
  onClose?: () => void
  showClose?: boolean
  collapsed?: boolean
  preferences: SidebarPreferences
  onCollapsedChange?: (collapsed: boolean) => void
  onNavVisibleChange: (key: SidebarNavKey, visible: boolean) => void
  onMoveNav: (key: SidebarNavKey, direction: -1 | 1, groupKeys: SidebarNavKey[]) => void
  onMoveNavTo: (key: SidebarNavKey, targetKey: SidebarNavKey, groupKeys: SidebarNavKey[]) => void
  onProjectNavigationChange: (value: 'accordion' | 'tabs') => void
  onLimitProjectsChange: (value: boolean) => void
  onProjectLimitChange: (value: number) => void
  onResetNavigation: () => void
  onWorkspaceExpandedChange: (value: boolean) => void
  onProjectsExpandedChange: (value: boolean) => void
  onProjectExpandedChange: (projectId: string, expanded: boolean, preserveProjectId?: string) => void
  onPinnedChange: (key: SidebarNavKey, pinned: boolean) => void
  onFavoriteProjectChange: (projectId: string, favorite: boolean) => void
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
  const availableWorkspaceItems = [workspacePanelNav[0], ...moreItems]
  const visibleWorkspacePanelItems = visibleNav(availableWorkspaceItems, preferences)
  const visibleWorkspaceNav = [workspaceNav[0], ...visibleWorkspacePanelItems.filter((item) => preferences.pinned.includes(item.to))]
  const selectedProject = data?.items.find((project) => project.id === projectId) ?? data?.items[0]
  const activeSidebarProject = projectId
    ? data?.items.find((project) => project.id === projectId)
    : undefined
  const favoriteOrderedProjects = [...(data?.items ?? [])].sort((left, right) =>
    Number(preferences.favoriteProjectIds.includes(right.id)) -
    Number(preferences.favoriteProjectIds.includes(left.id)),
  )
  const limitedProjects = preferences.limitProjects
    ? favoriteOrderedProjects.slice(0, preferences.projectLimit)
    : favoriteOrderedProjects
  const sidebarProjects = activeSidebarProject && !limitedProjects.some((project) => project.id === activeSidebarProject.id)
    ? [activeSidebarProject, ...limitedProjects.slice(0, Math.max(0, preferences.projectLimit - 1))]
    : limitedProjects
  const orderedSidebarProjects = [...sidebarProjects].sort((left, right) =>
    Number(preferences.favoriteProjectIds.includes(right.id)) -
    Number(preferences.favoriteProjectIds.includes(left.id)),
  )
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
  const moreOverlay = useOverlayPresence()
  const closeMoreOverlay = moreOverlay.close
  const moreOverlayPhase = moreOverlay.phase
  const [projectActionMessage, setProjectActionMessage] = useState<string | null>(null)
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const morePanelRef = useRef<HTMLDivElement>(null)
  const wasMoreOpen = useRef(false)

  useEffect(() => {
    if (!projectActionMessage) return
    const timer = window.setTimeout(() => setProjectActionMessage(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [projectActionMessage])

  useEffect(() => {
    if (moreOverlayPhase === 'closed') {
      if (wasMoreOpen.current) moreTriggerRef.current?.focus()
      wasMoreOpen.current = false
      return
    }
    if (moreOverlayPhase === 'closing') return
    wasMoreOpen.current = true
    morePanelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const closePanel = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Tab') {
          const focusable = morePanelRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )
          if (!focusable?.length) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
          return
        }
        if (event.key !== 'Escape') return
        event.preventDefault()
      } else if (
        morePanelRef.current?.contains(event.target as Node) ||
        moreTriggerRef.current?.contains(event.target as Node)
      ) return
      closeMoreOverlay()
    }
    window.addEventListener('keydown', closePanel)
    window.addEventListener('pointerdown', closePanel)
    return () => {
      window.removeEventListener('keydown', closePanel)
      window.removeEventListener('pointerdown', closePanel)
    }
  }, [closeMoreOverlay, moreOverlayPhase])

  return (
    <div className="relative flex min-h-0 flex-1">
      <GlobalRail
        settingsHref={settingsHref}
        onNavigate={onNavigate}
      />
      {!collapsed ? (
      <div className="flex min-w-0 flex-1 flex-col bg-of-surface-raised md:mb-2 md:rounded-l-[var(--of-radius-lg)] md:border-y md:border-l md:border-of-border-subtle md:shadow-[var(--of-shadow-sm)]">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <WorkspaceLogo
            profile={workspaceProfile.data ?? {
              name: 'OneFlow',
              revision: 1,
              logo_url: null,
              logo_content_type: null,
              logo_filename: null,
              logo_width: null,
              logo_height: null,
              logo_byte_size: null,
            }}
          />
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
                { label: '워크스페이스', items: availableWorkspaceItems },
              ]}
              preferences={preferences}
              onNavVisibleChange={onNavVisibleChange}
              onMoveNav={onMoveNav}
              onMoveNavTo={onMoveNavTo}
              onProjectNavigationChange={onProjectNavigationChange}
              onLimitProjectsChange={onLimitProjectsChange}
              onProjectLimitChange={onProjectLimitChange}
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
                      <NavLink to="/admin/overview" className={navLinkClass} onClick={onNavigate}><LayoutDashboard /><span>개요</span></NavLink>
                      <NavLink to="/admin/general" className={navLinkClass} onClick={onNavigate}><Settings /><span>일반</span></NavLink>
                      <NavLink to="/admin/calendar" className={navLinkClass} onClick={onNavigate}><CalendarCheck2 /><span>근무 일정</span></NavLink>
                      <NavLink to="/admin/project-phases" className={navLinkClass} onClick={onNavigate}><Workflow /><span>프로젝트 단계</span></NavLink>
                      <NavLink to="/admin/project-roles" className={navLinkClass} onClick={onNavigate}><ShieldCheck /><span>프로젝트 역할</span></NavLink>
                      <NavLink to="/admin/users" className={navLinkClass} onClick={onNavigate}><Users /><span>사용자</span></NavLink>
                      <NavLink to="/admin/auth-assistance" className={navLinkClass} onClick={onNavigate}><LifeBuoy /><span>로그인 지원</span></NavLink>
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
                    <div className="space-y-0.5">
                      <NavLink to="/admin/integrations" className={navLinkClass} onClick={onNavigate}><Cable /><span>연결 및 통합</span></NavLink>
                      <NavLink to="/admin/webhooks" className={navLinkClass} onClick={onNavigate}><Webhook /><span>Webhooks</span></NavLink>
                    </div>
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
                  <Link to="/ai" aria-current="page" className={projectLinkClass(true)} onClick={onNavigate}><Sparkles size={14} aria-hidden="true" /><span>OneFlow AI</span></Link>
                  <Link to="/ai?new=1" className={projectLinkClass(false)} onClick={onNavigate}><Plus size={14} aria-hidden="true" /><span>새 대화</span></Link>
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
                  {orderedSidebarProjects.map((project) => {
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

            <div>
              <button
                type="button"
                aria-expanded={preferences.workspaceExpanded}
                className="flex min-h-8 w-full items-center gap-2 rounded-of px-2 text-left text-[13px] font-medium text-of-secondary transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => {
                  if (preferences.workspaceExpanded) moreOverlay.close()
                  onWorkspaceExpandedChange(!preferences.workspaceExpanded)
                }}
              >
                <ChevronRight size={14} className={cn('shrink-0 transition-transform duration-[var(--of-duration-fast)] motion-reduce:transition-none', preferences.workspaceExpanded && 'rotate-90')} aria-hidden="true" />
                워크스페이스
              </button>
              {preferences.workspaceExpanded ? (
                <div className="mt-0.5 space-y-0.5">
                  {visibleWorkspaceNav.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={onNavigate}>
                        <Icon />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    )
                  })}
                  {visibleWorkspacePanelItems.length > 0 ? (
                    <button
                      ref={moreTriggerRef}
                      type="button"
                      aria-expanded={moreOverlay.expanded}
                      aria-controls="workspace-more-panel"
                      className="flex min-h-8 w-full items-center gap-2 rounded-of px-2 text-left text-[13px] text-of-secondary transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={moreOverlay.toggle}
                    >
                      <ChevronRight size={14} className={cn('shrink-0 transition-transform duration-[var(--of-duration-fast)] motion-reduce:transition-none', moreOverlay.expanded && 'rotate-90')} aria-hidden="true" />
                      {moreOverlay.expanded ? 'Hide' : 'More'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                aria-expanded={preferences.projectsExpanded}
                className="flex min-h-8 w-full items-center gap-2 rounded-of px-2 text-left text-[13px] font-medium text-of-secondary transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => onProjectsExpandedChange(!preferences.projectsExpanded)}
              >
                <ChevronRight size={14} className={cn('shrink-0 transition-transform duration-[var(--of-duration-fast)] motion-reduce:transition-none', preferences.projectsExpanded && 'rotate-90')} aria-hidden="true" />
                프로젝트
              </button>
              {preferences.projectsExpanded ? <div className="mt-1 space-y-2">
                {orderedSidebarProjects.map((project) => {
                  const activeProject = project.id === projectId
                  const favorite = preferences.favoriteProjectIds.includes(project.id)
                  const expanded = preferences.expandedProjectIds.includes(project.id) || (
                    activeProject && !preferences.projectDisclosureInitialized
                  )
                  return (
                    <div key={project.id} data-project-row={project.id}>
                      <div className="group/project flex items-center gap-0.5">
                        <NavLink
                          to={`/projects/${project.id}/overview`}
                          className={() => cn(projectLinkClass(activeProject), 'min-w-0 flex-1')}
                          onClick={onNavigate}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-of-border-subtle bg-of-surface text-[10px] font-semibold text-of-muted">
                            {project.key.slice(0, 2)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          {favorite ? <Star size={11} fill="currentColor" aria-label="즐겨찾기" /> : null}
                        </NavLink>
                        <ProjectActions
                          project={project}
                          meId={me.data?.id}
                          favorite={favorite}
                          onFavoriteChange={onFavoriteProjectChange}
                          onNavigate={onNavigate}
                          onMessage={setProjectActionMessage}
                        />
                        <button
                          type="button"
                          aria-label={`${project.name} 하위 내비게이션`}
                          aria-expanded={expanded}
                          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                          onClick={() => onProjectExpandedChange(
                            project.id,
                            !expanded,
                            activeProject ? undefined : projectId,
                          )}
                        >
                          <ChevronDown size={14} className={cn('transition-transform duration-[var(--of-duration-fast)] motion-reduce:transition-none', !expanded && '-rotate-90')} aria-hidden="true" />
                        </button>
                      </div>
                      {expanded && preferences.projectNavigation === 'accordion' ? (
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
              </div> : null}
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
      {moreOverlay.present && !wikiMode && !aiMode && !settingsMode ? (
        <div
          ref={morePanelRef}
          id="workspace-more-panel"
          role="dialog"
          aria-label="워크스페이스 더 보기"
          data-phase={moreOverlay.phase}
          className="of-sidebar-panel-motion fixed inset-x-2 top-2 bottom-2 z-50 flex min-w-0 flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)] md:absolute md:inset-x-auto md:left-full md:top-2 md:bottom-2 md:w-72"
          onAnimationEnd={moreOverlay.onAnimationEnd}
        >
          <div className="flex items-center justify-between border-b border-of-border-subtle px-3 py-2">
            <h3 className="text-sm font-semibold">Workspace</h3>
            <button
              type="button"
              aria-label="More 닫기"
              className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              onClick={moreOverlay.close}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="of-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {visibleWorkspacePanelItems.map((item) => {
              const Icon = item.icon
              const pinned = preferences.pinned.includes(item.to)
              return (
                <div key={item.to} className="flex items-center gap-1">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => cn(navLinkClass({ isActive }), 'min-w-0 flex-1')}
                    onClick={() => {
                      moreOverlay.close()
                      onNavigate?.()
                    }}
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                  <button
                    type="button"
                    aria-label={`${item.label} ${pinned ? '고정 해제' : '고정'}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                    onClick={() => onPinnedChange(item.to, !pinned)}
                  >
                    <Bookmark size={14} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {projectActionMessage ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-of border border-of-border bg-of-surface-raised px-3 py-2 text-xs text-of-text shadow-[var(--of-shadow-popover)]"
        >
          {projectActionMessage}
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
  onMoveNavTo,
  onWidthChange,
  onProjectNavigationChange,
  onLimitProjectsChange,
  onProjectLimitChange,
  onResetNavigation,
  onWorkspaceExpandedChange,
  onProjectsExpandedChange,
  onProjectExpandedChange,
  onPinnedChange,
  onFavoriteProjectChange,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
  preferences: SidebarPreferences
  onCollapsedChange: (collapsed: boolean) => void
  onNavVisibleChange: (key: SidebarNavKey, visible: boolean) => void
  onMoveNav: (key: SidebarNavKey, direction: -1 | 1, groupKeys: SidebarNavKey[]) => void
  onMoveNavTo: (key: SidebarNavKey, targetKey: SidebarNavKey, groupKeys: SidebarNavKey[]) => void
  onWidthChange: (width: number) => void
  onProjectNavigationChange: (value: 'accordion' | 'tabs') => void
  onLimitProjectsChange: (value: boolean) => void
  onProjectLimitChange: (value: number) => void
  onResetNavigation: () => void
  onWorkspaceExpandedChange: (value: boolean) => void
  onProjectsExpandedChange: (value: boolean) => void
  onProjectExpandedChange: (projectId: string, expanded: boolean, preserveProjectId?: string) => void
  onPinnedChange: (key: SidebarNavKey, pinned: boolean) => void
  onFavoriteProjectChange: (projectId: string, favorite: boolean) => void
}) {
  const [resizing, setResizing] = useState(false)
  const resizeStart = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    if (!resizing) return
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeStart.current) return
      onWidthChange(resizeStart.current.width + event.clientX - resizeStart.current.x)
    }
    const stopResizing = () => {
      resizeStart.current = null
      setResizing(false)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing, { once: true })
    window.addEventListener('pointercancel', stopResizing, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [onWidthChange, resizing])

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
        className={cn(
          'relative hidden shrink-0 border-r border-of-border-subtle md:flex',
          !resizing && 'transition-[width] duration-[var(--of-duration-default)] motion-reduce:transition-none',
        )}
        style={{
          width: preferences.collapsed
            ? 'var(--of-global-nav-width)'
            : `calc(var(--of-global-nav-width) + ${preferences.width}px)`,
        }}
      >
        <SidebarContent
          collapsed={preferences.collapsed}
          preferences={preferences}
          onCollapsedChange={onCollapsedChange}
          onNavVisibleChange={onNavVisibleChange}
          onMoveNav={onMoveNav}
          onMoveNavTo={onMoveNavTo}
          onProjectNavigationChange={onProjectNavigationChange}
          onLimitProjectsChange={onLimitProjectsChange}
          onProjectLimitChange={onProjectLimitChange}
          onResetNavigation={onResetNavigation}
          onWorkspaceExpandedChange={onWorkspaceExpandedChange}
          onProjectsExpandedChange={onProjectsExpandedChange}
          onProjectExpandedChange={onProjectExpandedChange}
          onPinnedChange={onPinnedChange}
          onFavoriteProjectChange={onFavoriteProjectChange}
        />
        {!preferences.collapsed ? (
          <div
            role="separator"
            aria-label="사이드바 너비 조절"
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={preferences.width}
            tabIndex={0}
            data-resizing={resizing || undefined}
            className="group absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none focus-visible:outline-none"
            onPointerDown={(event) => {
              event.preventDefault()
              resizeStart.current = { x: event.clientX, width: preferences.width }
              setResizing(true)
            }}
            onDoubleClick={() => onWidthChange(DEFAULT_SIDEBAR_WIDTH)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 24 : 8
              if (event.key === 'ArrowLeft') onWidthChange(preferences.width - step)
              else if (event.key === 'ArrowRight') onWidthChange(preferences.width + step)
              else if (event.key === 'Home') onWidthChange(MIN_SIDEBAR_WIDTH)
              else if (event.key === 'End') onWidthChange(MAX_SIDEBAR_WIDTH)
              else return
              event.preventDefault()
            }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-[var(--of-duration-fast)] group-hover:bg-of-info group-focus-visible:bg-of-info group-data-[resizing]:bg-of-info motion-reduce:transition-none" />
            <span className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-of-border bg-of-surface text-of-muted opacity-0 shadow-[var(--of-shadow-xs)] transition-opacity duration-[var(--of-duration-fast)] group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[resizing]:opacity-100 motion-reduce:transition-none">
              <ChevronsLeftRight size={11} aria-hidden="true" />
            </span>
          </div>
        ) : null}
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
              onMoveNavTo={onMoveNavTo}
              onProjectNavigationChange={onProjectNavigationChange}
              onLimitProjectsChange={onLimitProjectsChange}
              onProjectLimitChange={onProjectLimitChange}
              onResetNavigation={onResetNavigation}
              onWorkspaceExpandedChange={onWorkspaceExpandedChange}
              onProjectsExpandedChange={onProjectsExpandedChange}
              onProjectExpandedChange={onProjectExpandedChange}
              onPinnedChange={onPinnedChange}
              onFavoriteProjectChange={onFavoriteProjectChange}
            />
          </aside>
        </div>
      ) : null}
    </>
  )
}
