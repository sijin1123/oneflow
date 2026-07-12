import { NavLink, useParams } from 'react-router-dom'

import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { cn } from '@/lib/utils'

import { projectNavSections } from './Sidebar'

export function ProjectNavigationTabs({ enabled }: { enabled: boolean }) {
  const { projectId } = useParams()
  const capabilities = useWorkspaceCapabilities()

  if (!enabled || !projectId) return null

  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const items = projectNavSections.flatMap((section) => section.items)

  return (
    <nav
      aria-label="프로젝트 화면 탭"
      className="of-scrollbar flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-of-border-subtle bg-of-surface px-3"
    >
      {items
        .filter((item) => item.path !== 'documents' || wikiEnabled)
        .map((item) => (
          <NavLink
            key={item.path}
            to={`/projects/${projectId}/${item.path}`}
            className={({ isActive }) => cn(
              'flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-xs text-of-muted transition-colors duration-[var(--of-duration-fast)] hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus motion-reduce:transition-none [&_svg]:size-3.5',
              isActive && 'border-of-accent font-medium text-of-accent',
            )}
          >
            <item.icon aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
    </nav>
  )
}
