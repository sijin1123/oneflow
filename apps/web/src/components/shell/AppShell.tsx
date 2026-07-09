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
    <div className="flex h-screen overflow-hidden bg-of-bg text-of-text">
      <GlobalShortcutLayer />
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
