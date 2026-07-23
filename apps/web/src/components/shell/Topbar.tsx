import { Check, ChevronDown, LogOut, MailPlus, Menu, RefreshCw, Rocket, Settings, SlidersHorizontal, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLogout } from '@/features/auth/api'
import { profileImageSrc, useMe } from '@/features/members/api'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useWorkspaceProfile, type WorkspaceIdentity } from '@/features/workspace-profile/api'
import { WorkspaceLogo } from '@/features/workspace-profile/WorkspaceLogo'

import { CommandPalette } from './CommandPalette'
import { TopbarHelp } from './TopbarHelp'

function WorkspaceMenu({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceIdentity
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    const focusable = menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
    const focusFrame = requestAnimationFrame(() => focusable?.[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
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
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onOpenChange, open])

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }
  const isAdmin = me.data?.is_admin === true
  return (
    <div className="relative">
      <button ref={triggerRef} type="button" aria-label="워크스페이스 전환" aria-expanded={open} className="flex min-w-0 items-center gap-2 rounded-of px-1.5 py-1 text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" onClick={() => onOpenChange(!open)}>
        <WorkspaceLogo profile={workspace} />
        <span className="max-w-40 truncate text-sm font-semibold">{workspace.name}</span>
        <ChevronDown
          size={14}
          data-testid="workspace-menu-chevron"
          className={`shrink-0 text-of-muted transition-transform duration-150 ease-[var(--of-ease-standard)] motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <>
          <button type="button" tabIndex={-1} aria-label="워크스페이스 메뉴 닫기" className="fixed inset-0 z-40 cursor-default" onClick={() => onOpenChange(false)} />
          <div ref={menuRef} role="menu" aria-label="워크스페이스" className="of-floating-surface of-menu-enter absolute left-0 top-10 z-50 w-72 p-1">
            <div className="border-b border-of-border px-2.5 py-2">
              <p className="truncate text-[11px] text-of-muted">{me.data?.email ?? '계정 정보를 불러오는 중'}</p>
              <div aria-label="현재 워크스페이스" className="mt-2 flex items-center gap-2 rounded-of bg-of-surface-2 px-2 py-2">
                <WorkspaceLogo profile={workspace} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{workspace.name}</span>
                  <span className="block text-[11px] text-of-muted">{isAdmin ? '관리자' : '멤버'}</span>
                </span>
                <Check size={14} className="shrink-0 text-of-accent" aria-label="선택됨" />
              </div>
            </div>
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs hover:bg-of-surface-2" onClick={() => go(isAdmin ? '/admin/general' : '/settings')}>
              <Settings size={13} /> {isAdmin ? '워크스페이스 설정' : '개인 설정'}
            </button>
            {isAdmin ? (
              <>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs hover:bg-of-surface-2" onClick={() => go('/admin/users?view=invites&new=1')}>
                  <MailPlus size={13} /> 멤버 초대
                </button>
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs hover:bg-of-surface-2" onClick={() => go('/admin/users?view=invites')}>
                  <Users size={13} /> 워크스페이스 초대 관리
                </button>
              </>
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={logout.isPending}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-of-danger hover:bg-of-surface-2 disabled:opacity-50"
              onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.assign('/login') })}
            >
              <LogOut size={13} /> 로그아웃
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function AccountMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    const focusable = menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
    const focusFrame = requestAnimationFrame(() => focusable?.[0]?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
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
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onOpenChange, open])

  if (me.isPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="계정 정보 불러오는 중"
        className="flex h-7 w-7 shrink-0 items-center justify-center"
      >
        <Skeleton aria-hidden="true" className="h-7 w-7 rounded-full motion-reduce:animate-none" />
      </div>
    )
  }
  if (me.isError) {
    return (
      <IconButton
        label="계정 정보 다시 시도"
        className="shrink-0 text-of-danger"
        onClick={() => void me.refetch()}
      >
        <RefreshCw size={14} aria-hidden="true" />
      </IconButton>
    )
  }
  if (!me.data) return null
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="계정 메뉴"
        aria-expanded={open}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-2"
        onClick={() => onOpenChange(!open)}
      >
        <Avatar name={me.data.display_name} src={profileImageSrc(me.data)} size="md" />
      </button>
      {open ? (
        <>
        <button type="button" tabIndex={-1} aria-label="계정 메뉴 닫기" className="fixed inset-0 z-40 cursor-default" onClick={() => onOpenChange(false)} />
        <div ref={menuRef} role="menu" aria-label="계정" className="of-floating-surface absolute right-0 top-10 z-50 w-60 p-1">
          <div className="border-b border-of-border px-2.5 py-2">
            <p className="truncate text-xs font-medium">{me.data.display_name}</p>
            <p className="truncate text-[11px] text-of-muted">{me.data.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs hover:bg-of-surface-2"
            onClick={() => {
              onOpenChange(false)
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
        </>
      ) : null}
    </div>
  )
}

export function Topbar({
  onOpenMobileSidebar,
}: {
  onOpenMobileSidebar?: () => void
}) {
  const workspaceProfile = useWorkspaceProfile()
  const workspace = workspaceProfile.data ?? {
    name: 'OneFlow',
    revision: 1,
    logo_url: null,
    logo_content_type: null,
    logo_filename: null,
    logo_width: null,
    logo_height: null,
    logo_byte_size: null,
  }
  const location = useLocation()
  const [openMenu, setOpenMenu] = useState<'workspace' | 'help' | 'account' | null>(null)
  const setWorkspaceOpen = useCallback((open: boolean) => setOpenMenu(open ? 'workspace' : null), [])
  const setHelpOpen = useCallback((open: boolean) => setOpenMenu(open ? 'help' : null), [])
  const setAccountOpen = useCallback((open: boolean) => setOpenMenu(open ? 'account' : null), [])
  return (
    <header className="flex h-[var(--of-topbar-height)] shrink-0 items-center border-b border-of-border-subtle bg-of-surface-2 px-2 md:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:grid md:grid-cols-[minmax(15rem,1fr)_minmax(14rem,30rem)_minmax(15rem,1fr)] md:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="사이드바 열기" className="shrink-0 md:hidden" onClick={onOpenMobileSidebar}><Menu size={16} /></IconButton>
          <WorkspaceLogo profile={workspace} className="md:hidden" />
          <div className="hidden md:block">
            <WorkspaceMenu
              workspace={workspace}
              open={openMenu === 'workspace'}
              onOpenChange={setWorkspaceOpen}
            />
          </div>
        </div>
        <div className="ml-auto min-w-0 sm:ml-0">
          <CommandPalette prominent />
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5 md:gap-2">
          <Link
            to="/get-started"
            aria-label="시작하기"
            aria-current={location.pathname === '/get-started' ? 'page' : undefined}
            className={`flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-of border px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:px-2.5 ${
              location.pathname === '/get-started'
                ? 'border-of-accent bg-of-accent-soft text-of-accent'
                : 'border-of-border bg-of-surface text-of-secondary hover:bg-of-surface-hover hover:text-of-text'
            }`}
          >
            <Rocket size={13} aria-hidden="true" />
            <span className="hidden sm:inline">시작하기</span>
          </Link>
          <NotificationBell />
          <TopbarHelp open={openMenu === 'help'} onOpenChange={setHelpOpen} />
          <AccountMenu
            open={openMenu === 'account'}
            onOpenChange={setAccountOpen}
          />
        </div>
      </div>
    </header>
  )
}
