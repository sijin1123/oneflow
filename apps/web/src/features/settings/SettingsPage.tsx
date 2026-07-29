import {
  Bot,
  Database,
  Flag,
  GitBranch,
  ListChecks,
  Settings2,
  ShieldAlert,
  Waypoints,
  UsersRound,
} from 'lucide-react'
import type * as React from 'react'
import { useCallback, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { AutomationManager } from '@/features/automation/AutomationManager'
import { useMe, useMembers } from '@/features/members/api'
import { StatusManager } from '@/features/project-statuses/StatusManager'
import { TypeManager } from '@/features/project-types/TypeManager'
import { useUnsavedLocationPrompt } from '@/lib/guards'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'

import { DangerPanel } from './DangerPanel'
import { FieldsPanel } from './FieldsPanel'
import { GeneralPanel } from './GeneralPanel'
import { StoragePanel } from './StoragePanel'
import { MembersPanel } from './MembersPanel'
import { MilestonesPanel } from './MilestonesPanel'
import { ProjectPhasesPanel } from './ProjectPhasesPanel'
import { SettingsFrame, SettingsTabList, type SettingsNavItem } from './SettingsShell'

/* Project settings as a tabbed control surface (expansion PLAN Pass 1 PR-A).
   Tabs live in the `?tab=` query so deep links and refreshes keep the section. */
const TABS = [
  { key: 'general', label: '일반', description: '프로젝트 정보와 상태', icon: Settings2 },
  { key: 'members', label: '멤버', description: '역할과 권한', icon: UsersRound },
  { key: 'workflow', label: '워크플로우', description: '상태와 타입', icon: GitBranch },
  { key: 'lifecycle', label: '수명주기', description: '프로젝트 단계와 일정', icon: Waypoints },
  { key: 'milestones', label: '마일스톤', description: '릴리스 기준점', icon: Flag },
  { key: 'fields', label: '필드', description: '커스텀 속성', icon: ListChecks },
  { key: 'automation', label: '자동화', description: '규칙과 실행 조건', icon: Bot },
  { key: 'storage', label: '스토리지', description: '용량과 파일 수', icon: Database },
  { key: 'danger', label: '위험 구역', description: '보관과 파괴적 조치', icon: ShieldAlert },
] as const satisfies readonly SettingsNavItem[]

type TabKey = (typeof TABS)[number]['key']

export function SettingsPage() {
  const { projectId } = useParams() as { projectId: string }
  const [searchParams, setSearchParams] = useSearchParams()
  const me = useMe()
  const members = useMembers(projectId)
  const capabilities = useWorkspaceCapabilities()

  // A tab switch unmounts the active panel, so only that panel can hold dirty
  // edits — one flag + one router blocker covers tab clicks, sidebar links,
  // and browser back/forward uniformly.
  const [dirty, setDirty] = useState(false)
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])
  useUnsavedLocationPrompt(dirty, '저장되지 않은 변경이 있습니다. 나가시겠습니까?')

  const requested = searchParams.get('tab')
  // The notification toggles are USER-scoped (/me) and moved to /settings —
  // old project-settings deep links follow them (Pass 64 PR-CD).
  if (requested === 'notifications') return <Navigate to="/settings?tab=notifications" replace />
  const releasesEnabled = capabilities.data?.releases.enabled === true
  const availableTabs = TABS.filter((item) => item.key !== 'milestones' || releasesEnabled)
  const tab: TabKey = availableTabs.some((t) => t.key === requested)
    ? (requested as TabKey)
    : 'general'

  if ((members.isPending && !members.data) || me.isPending) return <ListSkeleton />
  if (!members.data) {
    return <ErrorState error={members.error} onRetry={() => void members.refetch()} />
  }
  if (requested === 'milestones' && capabilities.isPending) {
    return <ListSkeleton />
  }
  if (requested === 'milestones' && !releasesEnabled) {
    return <Navigate to={`/projects/${projectId}/settings`} replace />
  }

  const myRole = members.data.items.find((m) => m.user_id === me.data?.id)?.role
  const lastKnownIsOwner = myRole === 'owner'
  const isOwner = !members.isError && lastKnownIsOwner
  const canManageMilestones =
    !members.isError && (myRole === 'owner' || myRole === 'member')

  return (
    <SettingsFrame
      eyebrow="Project settings"
      title="프로젝트 설정"
      description="프로젝트 기본 정보, 구성원, 워크플로우, 자동화, 스토리지와 위험 조치를 한 곳에서 관리합니다."
      meta={isOwner ? '소유자 권한' : myRole === 'member' ? '멤버 권한' : '읽기 전용'}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
        <SettingsTabList
          items={availableTabs}
          activeKey={tab}
          ariaLabel="설정 섹션"
          panelId="settings-panel"
          tabIdPrefix="settings-tab"
          onSelect={(key) => setSearchParams(key === 'general' ? {} : { tab: key })}
        />
        <div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          className="min-w-0 flex-1 pb-8"
        >
          {tab === 'general' ? (
            <GeneralPanel projectId={projectId} isOwner={isOwner} onDirtyChange={onDirtyChange} />
          ) : null}
          {tab === 'members' ? (
            <MembersPanel
              projectId={projectId}
              isOwner={lastKnownIsOwner}
              onDirtyChange={onDirtyChange}
            />
          ) : null}
          {tab === 'workflow' ? (
            <WorkflowGovernanceSurface isOwner={isOwner}>
              <StatusManager projectId={projectId} isOwner={isOwner} />
              <TypeManager projectId={projectId} isOwner={isOwner} />
            </WorkflowGovernanceSurface>
          ) : null}
          {tab === 'lifecycle' ? (
            <ProjectPhasesPanel projectId={projectId} isOwner={isOwner} onDirtyChange={onDirtyChange} />
          ) : null}
          {tab === 'milestones' ? (
            <MilestonesPanel
              projectId={projectId}
              canManage={canManageMilestones}
              onDirtyChange={onDirtyChange}
            />
          ) : null}
          {tab === 'fields' ? (
            <FieldsPanel projectId={projectId} isOwner={isOwner} onDirtyChange={onDirtyChange} />
          ) : null}
          {tab === 'automation' ? (
            <AutomationManager
              projectId={projectId}
              isOwner={isOwner}
              onDirtyChange={onDirtyChange}
            />
          ) : null}
          {tab === 'storage' ? <StoragePanel projectId={projectId} /> : null}
          {tab === 'danger' ? <DangerPanel isOwner={isOwner} /> : null}
        </div>
      </div>
    </SettingsFrame>
  )
}

function WorkflowGovernanceSurface({
  isOwner,
  children,
}: {
  isOwner: boolean
  children: React.ReactNode
}) {
  return (
    <section
      aria-label="워크플로우 거버넌스"
      className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
    >
      <header className="flex min-w-0 flex-col gap-3 border-b border-of-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
            <GitBranch size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">Project workflow</p>
            <h2 className="mt-1 text-sm font-semibold">상태 흐름과 작업 타입</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
              프로젝트의 작업 분류와 표시 순서를 관리합니다.
            </p>
          </div>
        </div>
        <Badge variant={isOwner ? 'accent' : 'outline'} className="self-start">
          {isOwner ? '소유자 편집 가능' : '읽기 전용'}
        </Badge>
      </header>
      <div className="grid min-w-0 divide-y divide-of-border xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        {children}
      </div>
    </section>
  )
}
