import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { GlobalShortcutLayer } from './GlobalShortcutLayer'
import { Sidebar } from './Sidebar'
import { useSidebarPreferences } from './sidebar-preferences'
import { Topbar } from './Topbar'

/* Plane-like workspace shell (clean-room): compact sidebar + thin topbar +
   dense content area. Layout is original OneFlow code. */
export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const sidebar = useSidebarPreferences()

  return (
    <div className="of-shell flex h-screen flex-col overflow-hidden">
      <GlobalShortcutLayer />
      <Topbar
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        sidebarCollapsed={sidebar.preferences.collapsed}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          preferences={sidebar.preferences}
          onCollapsedChange={sidebar.setCollapsed}
          onNavVisibleChange={sidebar.setNavVisible}
          onMoveNav={sidebar.moveNav}
          onResetNavigation={sidebar.resetNavigation}
        />
        <main className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
