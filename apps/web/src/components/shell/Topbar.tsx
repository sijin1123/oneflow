import { ChevronRight, LogOut, Menu, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/icon-button'
import { useLogout } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useProjects } from '@/features/projects/api'
import { useWorkspaceProfile } from '@/features/workspace-profile/api'

import { CommandPalette } from './CommandPalette'

const workspaceRouteLabels: Array<{ path: string; title: string; parent: string }> = [
  { path: '/wiki', title: 'Wiki', parent: '워크스페이스' },
  { path: '/my', title: '내 작업', parent: '워크스페이스' },
  { path: '/ai', title: '작업 요약', parent: 'AI workspace' },
  { path: '/notes', title: '개인 메모', parent: '워크스페이스' },
  { path: '/drafts', title: '작업 초안', parent: '워크스페이스' },
  { path: '/inbox', title: '인박스', parent: '워크스페이스' },
  { path: '/work-items', title: '전체 작업', parent: '워크스페이스' },
  { path: '/customers', title: '고객', parent: '워크스페이스' },
  { path: '/projects', title: '프로젝트', parent: '워크스페이스' },
  { path: '/templates', title: '프로젝트 템플릿', parent: '워크스페이스' },
  { path: '/initiatives', title: '이니셔티브', parent: '워크스페이스' },
  { path: '/search', title: '검색', parent: '워크스페이스' },
  { path: '/reports', title: '리포트', parent: '워크스페이스' },
  { path: '/operations', title: '운영 허브', parent: '운영' },
  { path: '/status', title: '시스템 상태', parent: '운영' },
  { path: '/admin/general', title: '일반 설정', parent: '워크스페이스 설정' },
  { path: '/admin/users', title: '사용자 관리', parent: '워크스페이스 설정' },
  { path: '/admin/worklogs', title: 'Worklogs', parent: '워크스페이스 설정' },
  { path: '/admin/wiki', title: 'Wiki 설정', parent: '기능 설정' },
  { path: '/admin/ai', title: 'AI 설정', parent: '기능 설정' },
  { path: '/admin/initiatives', title: 'Initiatives 설정', parent: '기능 설정' },
  { path: '/admin/releases', title: 'Releases 설정', parent: '기능 설정' },
  { path: '/admin/customers', title: 'Customers 설정', parent: '기능 설정' },
  { path: '/admin/webhooks', title: 'Webhooks', parent: '개발자 설정' },
  { path: '/settings', title: '개인 설정', parent: '설정' },
]

const projectRouteLabels: Array<{ suffix: string; title: string; parent: string; parentPath: string }> = [
  { suffix: '/work-packages', title: 'Work Packages', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/board', title: 'Board', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/backlog', title: 'Backlog', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/tree', title: 'Hierarchy', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/views', title: 'Views', parent: '작업', parentPath: 'work-packages' },
  { suffix: '/timeline', title: 'Timeline', parent: '계획', parentPath: 'timeline' },
  { suffix: '/calendar', title: 'Calendar', parent: '계획', parentPath: 'timeline' },
  { suffix: '/cycles', title: 'Cycles', parent: '계획', parentPath: 'timeline' },
  { suffix: '/modules', title: 'Modules', parent: '계획', parentPath: 'timeline' },
  { suffix: '/intake', title: 'Intake', parent: '계획', parentPath: 'timeline' },
  { suffix: '/dashboard', title: 'Dashboard', parent: '협업', parentPath: 'dashboard' },
  { suffix: '/documents', title: 'Wiki', parent: '문서', parentPath: 'documents' },
  { suffix: '/meetings', title: 'Meetings', parent: '협업', parentPath: 'dashboard' },
  { suffix: '/files', title: 'Files', parent: '협업', parentPath: 'dashboard' },
  { suffix: '/settings', title: 'Settings', parent: '운영', parentPath: 'settings' },
]

const myWorkTabTitles: Record<string, string> = {
  assigned: '배정됨',
  created: '생성함',
  subscribed: '구독',
  activity: '활동',
}

const workspaceParentHrefs: Record<string, string> = {
  워크스페이스: '/projects',
  'AI workspace': '/ai',
  운영: '/operations',
  설정: '/settings',
  '워크스페이스 설정': '/admin/general',
  '기능 설정': '/admin/wiki',
  '개발자 설정': '/admin/webhooks',
}

function getShellContext(
  pathname: string,
  search: string,
  workspaceName: string,
  projectId?: string,
  projectName?: string,
) {
  if (projectId && projectName) {
    const projectBase = `/projects/${projectId}`
    const projectRoute = projectRouteLabels.find((item) => pathname.endsWith(item.suffix))
    let nestedRoute: { title: string; parent: string; parentPath: string } | null = null
    if (pathname.includes('/work-packages/')) {
      nestedRoute = { title: 'Work Package', parent: '작업', parentPath: 'work-packages' }
    } else if (pathname.includes('/documents/')) {
      nestedRoute = { title: 'Wiki Page', parent: '문서', parentPath: 'documents' }
    } else if (pathname.includes('/meetings/')) {
      nestedRoute = { title: 'Meeting', parent: '협업', parentPath: 'dashboard' }
    }

    const route = nestedRoute ?? projectRoute ?? {
      title: 'Work Packages',
      parent: '작업',
      parentPath: 'work-packages',
    }
    return {
      parent: route.parent,
      parentHref: `${projectBase}/${route.parentPath}`,
      scope: projectName,
      scopeHref: `${projectBase}/dashboard`,
      title: route.title,
    }
  }

  if (pathname === '/my') {
    const tab = new URLSearchParams(search).get('tab')
    const title = tab ? myWorkTabTitles[tab] : undefined
    return {
      parent: title ? '내 작업' : '워크스페이스',
      parentHref: title ? '/my?tab=assigned' : '/projects',
      scope: workspaceName,
      scopeHref: '/my',
      title: title ?? '홈',
    }
  }

  const workspaceRoute = workspaceRouteLabels.find((item) => pathname === item.path)
  const parent = workspaceRoute?.parent ?? '워크스페이스'
  return {
    parent,
    parentHref: workspaceParentHrefs[parent] ?? '/projects',
    scope: workspaceName,
    scopeHref: '/my',
    title: workspaceRoute?.title ?? '프로젝트',
  }
}

function AccountMenu() {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (!me.data) return null
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="계정 메뉴"
        aria-expanded={open}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={me.data.display_name} size="md" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="계정"
          className="of-floating-surface absolute right-0 top-10 z-30 w-60 p-1"
        >
          <div className="border-b border-of-border px-2.5 py-2">
            <p className="truncate text-xs font-medium">{me.data.display_name}</p>
            <p className="truncate text-[11px] text-of-muted">{me.data.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs hover:bg-of-surface-2"
            onClick={() => {
              setOpen(false)
              navigate('/settings')
            }}
          >
            <SlidersHorizontal size={13} /> 개인 설정
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-of-danger hover:bg-of-surface-2"
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  window.location.assign('/login')
                },
              })
            }
          >
            <LogOut size={13} /> 로그아웃
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Topbar({
  onOpenMobileSidebar,
  sidebarCollapsed = false,
}: {
  onOpenMobileSidebar?: () => void
  sidebarCollapsed?: boolean
}) {
  const { projectId } = useParams()
  const location = useLocation()
  const { data } = useProjects()
  const workspaceProfile = useWorkspaceProfile()

  const project = data?.items.find((p) => p.id === projectId)
  const shellContext = getShellContext(
    location.pathname,
    location.search,
    workspaceProfile.data?.name ?? 'OneFlow',
    projectId,
    project?.name,
  )
  return (
    <header className="flex h-[var(--of-topbar-height)] shrink-0 bg-of-surface-2">
      <div
        className="hidden shrink-0 items-center gap-2 border-r border-of-border-subtle px-3 transition-[width] duration-[var(--of-duration-default)] md:flex"
        style={{
          width: sidebarCollapsed
            ? 'var(--of-global-nav-width)'
            : 'var(--of-navigation-width)',
        }}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-accent text-[11px] font-bold text-white shadow-[var(--of-shadow-xs)]">
          OF
        </span>
        {!sidebarCollapsed ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {workspaceProfile.data?.name ?? 'OneFlow'}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(14rem,30rem)_minmax(0,1fr)] md:gap-3 md:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton
            label="사이드바 열기"
            className="shrink-0 md:hidden"
            onClick={onOpenMobileSidebar}
          >
            <Menu size={16} />
          </IconButton>
          <div className="min-w-0">
            <nav className="hidden min-w-0 items-center gap-1 text-[10px] text-of-muted sm:flex" aria-label="현재 위치">
              <Link
                to={shellContext.scopeHref}
                className="truncate rounded-[2px] hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              >
                {shellContext.scope}
              </Link>
              <ChevronRight size={10} className="shrink-0" aria-hidden="true" />
              <Link
                to={shellContext.parentHref}
                className="truncate rounded-[2px] hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              >
                {shellContext.parent}
              </Link>
            </nav>
            <p aria-current="page" className="truncate text-sm font-semibold leading-5">{shellContext.title}</p>
          </div>
        </div>

        <div className="ml-auto min-w-0 sm:ml-0">
          <CommandPalette prominent />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5 md:gap-2">
        <NotificationBell />
        <AccountMenu />
        </div>
      </div>
    </header>
  )
}
