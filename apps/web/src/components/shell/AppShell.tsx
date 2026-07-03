import { Outlet } from 'react-router-dom'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/* Plane-like workspace shell (clean-room): compact sidebar + thin topbar +
   dense content area. Layout is original OneFlow code. */
export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
