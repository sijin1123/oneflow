import { LogOut, Menu, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLogout } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useProjects } from '@/features/projects/api'

import { CommandPalette } from './CommandPalette'

const workspaceRouteLabels: Array<{ path: string; title: string; parent: string }> = [
  { path: '/my', title: '내 작업', parent: '워크스페이스' },
  { path: '/work-items', title: '전체 작업', parent: '워크스페이스' },
  { path: '/projects', title: '프로젝트', parent: '워크스페이스' },
  { path: '/initiatives', title: '이니셔티브', parent: '워크스페이스' },
  { path: '/search', title: '검색', parent: '워크스페이스' },
  { path: '/reports', title: '리포트', parent: '워크스페이스' },
  { path: '/status', title: '시스템 상태', parent: '운영' },
  { path: '/admin/users', title: '사용자 관리', parent: '운영' },
  { path: '/settings', title: '개인 설정', parent: '설정' },
]

const projectRouteLabels: Array<{ suffix: string; title: string; parent: string }> = [
  { suffix: '/work-packages', title: 'Work Packages', parent: '작업' },
  { suffix: '/board', title: 'Board', parent: '작업' },
  { suffix: '/backlog', title: 'Backlog', parent: '작업' },
  { suffix: '/tree', title: 'Hierarchy', parent: '작업' },
  { suffix: '/timeline', title: 'Timeline', parent: '계획' },
  { suffix: '/calendar', title: 'Calendar', parent: '계획' },
  { suffix: '/cycles', title: 'Cycles', parent: '계획' },
  { suffix: '/modules', title: 'Modules', parent: '계획' },
  { suffix: '/intake', title: 'Intake', parent: '계획' },
  { suffix: '/dashboard', title: 'Dashboard', parent: '협업' },
  { suffix: '/documents', title: 'Documents', parent: '협업' },
  { suffix: '/meetings', title: 'Meetings', parent: '협업' },
  { suffix: '/files', title: 'Files', parent: '협업' },
  { suffix: '/settings', title: 'Settings', parent: '운영' },
]

function getShellContext(pathname: string, projectName?: string) {
  if (projectName) {
    const projectRoute = projectRouteLabels.find((item) => pathname.endsWith(item.suffix))
    let nestedRoute: { title: string; parent: string } | null = null
    if (pathname.includes('/work-packages/')) {
      nestedRoute = { title: 'Work Package', parent: '작업' }
    } else if (pathname.includes('/documents/')) {
      nestedRoute = { title: 'Document', parent: '협업' }
    } else if (pathname.includes('/meetings/')) {
      nestedRoute = { title: 'Meeting', parent: '협업' }
    }

    const route = nestedRoute ?? projectRoute ?? { title: 'Work Packages', parent: '작업' }
    return {
      parent: route.parent,
      scope: projectName,
      title: route.title,
    }
  }

  const workspaceRoute = workspaceRouteLabels.find((item) => pathname === item.path)
  return {
    parent: workspaceRoute?.parent ?? '워크스페이스',
    scope: 'OneFlow',
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
        className="flex h-7 w-7 items-center justify-center rounded-full bg-of-accent-soft text-xs font-semibold text-of-accent hover:ring-2 hover:ring-of-accent/30"
        onClick={() => setOpen((v) => !v)}
      >
        {me.data.display_name.slice(0, 1)}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="계정"
          className="absolute right-0 top-9 z-30 w-56 rounded-of border border-of-border bg-of-surface p-1 shadow-md"
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

/** Gated behind write access — a viewer never sees the create button
    (Pass 76). Own component so useCanWrite only runs with a real projectId. */
function NewWorkPackageButton({ projectId, onClick }: { projectId: string; onClick: () => void }) {
  const canWrite = useCanWrite(projectId)
  if (!canWrite) return null
  return (
    <Button size="sm" onClick={onClick}>
      <Plus /> 새 작업
    </Button>
  )
}

export function Topbar({ onOpenMobileSidebar }: { onOpenMobileSidebar?: () => void }) {
  const { projectId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data } = useProjects()

  const project = data?.items.find((p) => p.id === projectId)
  const shellContext = getShellContext(location.pathname, project?.name)
  // Search (?q=) and inline creation (?new=1) are consumed by the list view
  // only — showing them on Board/Timeline would be dead controls (finding #6).
  const onListView = Boolean(projectId) && location.pathname.endsWith('/work-packages')
  const query = searchParams.get('q') ?? ''
  const [searchDraft, setSearchDraft] = useState(query)

  useEffect(() => {
    setSearchDraft(query)
  }, [query])

  const onSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set('q', value)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-of-border bg-of-surface px-3 md:px-4">
      <button
        type="button"
        aria-label="사이드바 열기"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 md:hidden"
        onClick={onOpenMobileSidebar}
      >
        <Menu size={16} />
      </button>

      <div className="min-w-0">
        <nav className="flex min-w-0 items-center gap-1.5 text-[11px] text-of-muted" aria-label="현재 위치">
          <span className="truncate">{shellContext.scope}</span>
          <span>/</span>
          <span className="truncate">{shellContext.parent}</span>
        </nav>
        <p className="truncate text-sm font-semibold leading-5">{shellContext.title}</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />
        {onListView ? (
          <div className="relative hidden sm:block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
            />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch(e.currentTarget.value)
              }}
              placeholder="제목 검색 (Enter)"
              aria-label="워크패키지 검색"
              className="w-56 pl-8"
            />
          </div>
        ) : null}
        {onListView && projectId ? (
          <div className="hidden md:block">
            <NewWorkPackageButton
              projectId={projectId}
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('new', '1')
                  return next
                })
              }
            />
          </div>
        ) : null}
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  )
}
