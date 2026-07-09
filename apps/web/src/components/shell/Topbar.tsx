import { LogOut, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLogout } from '@/features/auth/api'
import { useMe } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useProjects } from '@/features/projects/api'

import { CommandPalette } from './CommandPalette'

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

export function Topbar() {
  const { projectId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data } = useProjects()

  const project = data?.items.find((p) => p.id === projectId)
  const section = location.pathname.endsWith('/board')
    ? 'Board'
    : location.pathname.endsWith('/timeline')
      ? 'Timeline'
      : location.pathname.endsWith('/settings')
        ? 'Settings'
        : location.pathname.endsWith('/dashboard')
          ? 'Dashboard'
          : projectId
            ? 'Work Packages'
            : '프로젝트'
  // Search (?q=) and inline creation (?new=1) are consumed by the list view
  // only — showing them on Board/Timeline would be dead controls (finding #6).
  const onListView = Boolean(projectId) && location.pathname.endsWith('/work-packages')

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
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-of-border bg-of-surface px-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="현재 위치">
        {project ? (
          <>
            <span className="truncate text-of-muted">{project.name}</span>
            <span className="text-of-muted">/</span>
          </>
        ) : null}
        <span className="truncate font-medium">{section}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />
        {onListView ? (
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
            />
            <Input
              defaultValue={searchParams.get('q') ?? ''}
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
        ) : null}
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  )
}
