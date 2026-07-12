import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { GlobalShortcutLayer } from './GlobalShortcutLayer'
import { FrameContextBar } from './FrameContextBar'
import { QuickDock } from './QuickDock'
import { ProjectNavigationTabs } from './ProjectNavigationTabs'
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
      />
      <div className="flex min-h-0 min-w-0 flex-1 bg-of-surface-2">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          preferences={sidebar.preferences}
          onCollapsedChange={sidebar.setCollapsed}
          onNavVisibleChange={sidebar.setNavVisible}
          onMoveNav={sidebar.moveNav}
          onMoveNavTo={sidebar.moveNavTo}
          onWidthChange={sidebar.setWidth}
          onProjectNavigationChange={sidebar.setProjectNavigation}
          onLimitProjectsChange={sidebar.setLimitProjects}
          onProjectLimitChange={sidebar.setProjectLimit}
          onResetNavigation={sidebar.resetNavigation}
        />
        <main
          className={cn(
            'min-h-0 flex flex-1 flex-col overflow-hidden bg-of-bg md:mb-2 md:mr-2 md:rounded-r-[var(--of-radius-lg)] md:border-y md:border-r md:border-of-border-subtle md:shadow-[var(--of-shadow-sm)]',
            sidebar.preferences.collapsed &&
              'md:rounded-l-[var(--of-radius-lg)] md:border-l',
          )}
        >
          <FrameContextBar sidebarCollapsed={sidebar.preferences.collapsed} onExpandSidebar={() => sidebar.setCollapsed(false)} />
          <ProjectNavigationTabs enabled={sidebar.preferences.projectNavigation === 'tabs'} />
          <div data-shell-scroll-region className="of-scrollbar min-h-0 flex-1 overflow-y-auto">
            <Outlet />
            <div
              aria-hidden="true"
              data-testid="quick-dock-safe-area"
              className={cn(
                'pointer-events-none w-full transition-[height] duration-[var(--of-duration-default)] motion-reduce:transition-none',
                quickDockOpen ? 'h-64' : 'h-16',
              )}
            />
          </div>
        </main>
        {!mobileSidebarOpen ? (
          <QuickDock open={quickDockOpen} onOpenChange={setQuickDockOpen} />
        ) : null}
      </div>
    </div>
  )
}
