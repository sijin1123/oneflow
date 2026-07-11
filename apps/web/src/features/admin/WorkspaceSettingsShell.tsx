import {
  Bot,
  BookOpen,
  Building2,
  Clock3,
  Compass,
  Flag,
  Settings,
  UsersRound,
  Webhook,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useMe } from '@/features/members/api'
import { useWorkspaceProfile } from '@/features/workspace-profile/api'
import { cn } from '@/lib/utils'

type SettingsLink = { to: string; label: string; icon: LucideIcon }

const groups: Array<{ label: string; items: SettingsLink[] }> = [
  {
    label: '관리',
    items: [
      { to: '/admin/general', label: '일반', icon: Settings },
      { to: '/admin/users', label: '사용자', icon: UsersRound },
      { to: '/admin/worklogs', label: 'Worklogs', icon: Clock3 },
    ],
  },
  {
    label: '기능',
    items: [
      { to: '/admin/wiki', label: 'Wiki', icon: BookOpen },
      { to: '/admin/ai', label: 'AI', icon: Bot },
      { to: '/admin/initiatives', label: 'Initiatives', icon: Compass },
      { to: '/admin/releases', label: 'Releases', icon: Flag },
      { to: '/admin/customers', label: 'Customers', icon: Building2 },
    ],
  },
  {
    label: '개발자 도구',
    items: [{ to: '/admin/webhooks', label: 'Webhooks', icon: Webhook }],
  },
]

function SettingsNavigation() {
  return (
    <nav
      aria-label="워크스페이스 설정"
      className="of-scrollbar flex min-w-0 gap-4 overflow-x-auto px-4 py-2 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-3 lg:py-4"
    >
      {groups.map((group) => (
        <div key={group.label} className="shrink-0 lg:shrink">
          <p className="mb-1 px-2 text-[10px] font-medium uppercase text-of-muted">
            {group.label}
          </p>
          <div className="flex gap-1 lg:flex-col">
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex h-8 min-w-max items-center gap-2 rounded-of px-2 text-xs text-of-muted transition-colors hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus lg:min-w-0',
                      isActive && 'bg-of-surface-selected font-medium text-of-accent',
                    )
                  }
                >
                  <Icon size={14} aria-hidden="true" />
                  {item.label}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function WorkspaceSettingsShell() {
  const me = useMe()
  const profile = useWorkspaceProfile()

  if (me.isPending) return <ListSkeleton />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />
  if (!me.data.is_admin) {
    return (
      <EmptyState
        title="접근 권한이 없습니다"
        hint="워크스페이스 설정은 관리자만 열 수 있습니다."
      />
    )
  }

  return (
    <div className="min-h-full bg-of-bg lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="border-b border-of-border-subtle bg-of-surface-raised lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2 border-b border-of-border-subtle px-4 lg:px-5">
          <Settings size={16} className="text-of-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">워크스페이스 설정</p>
            <p className="truncate text-[11px] text-of-muted">
              {profile.data?.name ?? 'OneFlow'} 관리
            </p>
          </div>
        </div>
        <SettingsNavigation />
      </aside>
      <section className="min-w-0" aria-label="설정 내용">
        <Outlet />
      </section>
    </div>
  )
}
