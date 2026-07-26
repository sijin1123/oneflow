import { ShieldCheck, Workflow } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { WorkspacePhaseDefinitionsSettingsPage } from './WorkspacePhaseDefinitionsSettingsPage'
import { WorkspaceProjectRolesSettingsPage } from './WorkspaceProjectRolesSettingsPage'

type ConfigurationTab = 'phases' | 'roles'

const TABS: Array<{
  key: ConfigurationTab
  label: string
  icon: typeof Workflow
}> = [
  { key: 'phases', label: '단계', icon: Workflow },
  { key: 'roles', label: '역할', icon: ShieldCheck },
]

export function WorkspaceProjectConfigurationPage() {
  const [searchParams] = useSearchParams()
  const tab: ConfigurationTab = searchParams.get('tab') === 'roles' ? 'roles' : 'phases'

  return (
    <section
      aria-label="프로젝트 구성"
      className="flex min-h-full min-w-0 flex-col overflow-hidden bg-of-surface"
    >
      <h1 className="sr-only">프로젝트 구성</h1>
      <nav
        role="tablist"
        aria-label="프로젝트 구성 보기"
        className="flex min-w-0 shrink-0 items-center gap-1 border-b border-of-border-subtle px-3 py-2"
      >
        {TABS.map((item) => {
          const Icon = item.icon
          const selected = tab === item.key
          return (
            <Link
              key={item.key}
              role="tab"
              id={`project-configuration-tab-${item.key}`}
              aria-selected={selected}
              aria-controls="project-configuration-panel"
              to={`/admin/project-configuration?tab=${item.key}`}
              replace
              className={cn(
                'inline-flex min-h-7 items-center gap-1.5 rounded-of px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                selected
                  ? 'bg-of-surface-selected text-of-accent'
                  : 'text-of-muted hover:bg-of-surface-hover hover:text-of-text',
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <main
        id="project-configuration-panel"
        role="tabpanel"
        aria-labelledby={`project-configuration-tab-${tab}`}
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg"
      >
        {tab === 'phases' ? (
          <WorkspacePhaseDefinitionsSettingsPage embedded />
        ) : (
          <WorkspaceProjectRolesSettingsPage embedded />
        )}
      </main>
    </section>
  )
}
