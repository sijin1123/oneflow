import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { GlobalShortcutLayer } from './GlobalShortcutLayer'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/* Plane-like workspace shell (clean-room): compact sidebar + thin topbar +
   dense content area. Layout is original OneFlow code. */
export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="of-shell flex h-screen flex-col overflow-hidden">
      <GlobalShortcutLayer />
      <Topbar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
      <div className="flex min-h-0 min-w-0 flex-1">
        <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
