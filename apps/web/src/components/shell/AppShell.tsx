import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { GlobalShortcutLayer } from './GlobalShortcutLayer'
import { QuickDock } from './QuickDock'
import { Sidebar } from './Sidebar'
import { useSidebarPreferences } from './sidebar-preferences'
import { Topbar } from './Topbar'

/* Plane-like workspace shell (clean-room): compact sidebar + thin topbar +
   dense content area. Layout is original OneFlow code. */
export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [quickDockOpen, setQuickDockOpen] = useState(false)
  const sidebar = useSidebarPreferences()

  return (
    <div className="of-shell flex h-screen flex-col overflow-hidden">
      <GlobalShortcutLayer />
      <Topbar
        onOpenMobileSidebar={() => {
          setQuickDockOpen(false)
          setMobileSidebarOpen(true)
        }}
        sidebarCollapsed={sidebar.preferences.collapsed}
      />
      <div className="flex min-h-0 min-w-0 flex-1 bg-of-surface-2">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          preferences={sidebar.preferences}
          onCollapsedChange={sidebar.setCollapsed}
          onNavVisibleChange={sidebar.setNavVisible}
          onMoveNav={sidebar.moveNav}
          onResetNavigation={sidebar.resetNavigation}
        />
        <main
          className={cn(
            'of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg md:mb-2 md:mr-2 md:rounded-r-[var(--of-radius-lg)] md:border-y md:border-r md:border-of-border-subtle md:shadow-[var(--of-shadow-sm)]',
            sidebar.preferences.collapsed &&
              'md:rounded-l-[var(--of-radius-lg)] md:border-l',
          )}
        >
          <Outlet />
          <div
            aria-hidden="true"
            data-testid="quick-dock-safe-area"
            className={cn(
              'pointer-events-none w-full transition-[height] duration-[var(--of-duration-default)] motion-reduce:transition-none',
              quickDockOpen ? 'h-64' : 'h-16',
            )}
          />
        </main>
        {!mobileSidebarOpen ? (
          <QuickDock open={quickDockOpen} onOpenChange={setQuickDockOpen} />
        ) : null}
      </div>
    </div>
  )
}
