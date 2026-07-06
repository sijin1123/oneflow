import { useCallback, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { AutomationManager } from '@/features/automation/AutomationManager'
import { useMe, useMembers } from '@/features/members/api'
import { StatusManager } from '@/features/project-statuses/StatusManager'
import { useUnsavedLocationPrompt } from '@/lib/guards'

import { DangerPanel } from './DangerPanel'
import { GeneralPanel } from './GeneralPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { MembersPanel } from './MembersPanel'
import { MilestonesPanel } from './MilestonesPanel'

/* Project settings as a tabbed control surface (expansion PLAN Pass 1 PR-A).
   Tabs live in the `?tab=` query so deep links and refreshes keep the section. */
const TABS = [
  { key: 'general', label: '일반' },
  { key: 'members', label: '멤버' },
  { key: 'workflow', label: '워크플로우' },
  { key: 'milestones', label: '마일스톤' },
  { key: 'automation', label: '자동화' },
  { key: 'notifications', label: '알림' },
  { key: 'danger', label: '위험 구역' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function SettingsPage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const me = useMe()
  const members = useMembers(projectId)

  // A tab switch unmounts the active panel, so only that panel can hold dirty
  // edits — one flag + one router blocker covers tab clicks, sidebar links,
  // and browser back/forward uniformly.
  const [dirty, setDirty] = useState(false)
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])
  useUnsavedLocationPrompt(dirty, '저장되지 않은 변경이 있습니다. 나가시겠습니까?')

  const requested = searchParams.get('tab')
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : 'general'

  if (members.isPending || me.isPending) return <ListSkeleton />
  if (members.isError) return <ErrorState error={members.error} onRetry={() => members.refetch()} />

  const myRole = members.data.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-base font-semibold">프로젝트 설정</h1>
      <p className="mb-4 text-xs text-of-muted">
        {isOwner ? '소유자는 모든 설정을 관리할 수 있습니다.' : '읽기 전용 — 관리는 소유자만 가능합니다.'}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <nav
          role="tablist"
          aria-label="설정 섹션"
          className="flex shrink-0 gap-1 overflow-x-auto sm:w-40 sm:flex-col"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`settings-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="settings-panel"
              className={`rounded-of px-3 py-1.5 text-left text-xs font-medium whitespace-nowrap ${
                tab === t.key
                  ? 'bg-of-accent-soft text-of-accent'
                  : 'text-of-muted hover:bg-of-surface-2 hover:text-of-text'
              }`}
              onClick={() => setSearchParams(t.key === 'general' ? {} : { tab: t.key })}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          className="min-w-0 flex-1"
        >
          {tab === 'general' ? (
            <GeneralPanel projectId={projectId} isOwner={isOwner} onDirtyChange={onDirtyChange} />
          ) : null}
          {tab === 'members' ? (
            <MembersPanel projectId={projectId} isOwner={isOwner} onDirtyChange={onDirtyChange} />
          ) : null}
          {tab === 'workflow' ? <StatusManager projectId={projectId} isOwner={isOwner} /> : null}
          {tab === 'milestones' ? (
            <MilestonesPanel projectId={projectId} isOwner={isOwner} onDirtyChange={onDirtyChange} />
          ) : null}
          {tab === 'automation' ? (
            <AutomationManager projectId={projectId} isOwner={isOwner} />
          ) : null}
          {tab === 'notifications' ? <NotificationsPanel /> : null}
          {tab === 'danger' ? <DangerPanel isOwner={isOwner} /> : null}
        </div>
      </div>
    </div>
  )
}
