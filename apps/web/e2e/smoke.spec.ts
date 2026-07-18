/* Playwright UI smoke (PLAN §1.3 #15 / §8): app shell renders, lists show,
   drawer opens, status PATCH carries expected_version, 409 triggers the
   notify+reload path, date-only strings survive display.

   All API responses are mocked with fixtures TYPED against the app's contract
   types — contract drift fails `npm run typecheck` (PLAN §8). */

import { expect, test, type Page } from '@playwright/test'

import type { Milestone } from '../src/features/milestones/api'
import type { Customer } from '../src/features/customers/types'
import type { DataTransferJob } from '../src/features/ops/dataTransfersApi'
import type { AuthAssistanceRequest } from '../src/features/admin/authAssistanceApi'
import type { DocumentList } from '../src/features/documents/api'
import type {
  Initiative,
  InitiativeActivity,
  InitiativeLabel,
  InitiativeWorkItem,
} from '../src/features/initiatives/api'
import type {
  Project,
  ProjectHealthHistoryList,
  ProjectList,
  ProjectListItem,
  ProjectPhase,
  ProjectPhaseList,
} from '../src/features/projects/types'
import type { ProjectScheduleBaselineSummary } from '../src/features/projects/scheduleBaselineApi'
import type { ProjectTemplate } from '../src/features/project-templates/api'
import type { SearchResults, SearchWorkPackageAnalytics } from '../src/features/search/api'
import type { WorkspaceProjectPhaseDefinitions } from '../src/features/workspace-profile/api'
import type { MyActivityList, MyWorkItemList } from '../src/features/my-work/api'
import type { WorkspaceQuickLink } from '../src/features/my-work/quickLinksApi'
import type {
  WorkItemDraft,
  WorkItemDraftContent,
} from '../src/features/work-item-drafts/api'
import type {
  WorkspaceSavedView,
  WorkspaceSavedViewParams,
} from '../src/features/work-items/workspaceSavedViewsApi'
import type {
  ActivityList,
  Comment,
  CommentList,
  ConflictBody,
  CsvImportResult,
  RelationList,
  WorkPackage,
  WorkPackageList,
} from '../src/features/work-packages/types'

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'ONE',
  name: 'OneFlow 도입',
  description: '데모 프로젝트',
  cover_attachment_id: null,
  budget: null,
  archived_at: null,
  health: null,
  health_note: null,
  health_updated_by: null,
  health_updated_at: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
}

const wpA: WorkPackage = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: project.id,
  subject: '워크패키지 API 구현',
  description: '수직 슬라이스 데모',
  type: 'task',
  status: 'todo',
  priority: 'high',
  assignee_id: null,
  parent_id: null,
      milestone_id: null,
      customer_id: null,
  cycle_id: null,
  module_id: null,
  start_date: '2026-07-01',
  due_date: '2026-07-15',
  estimated_hours: 16,
  created_by: 'me-1',
  version: 0,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
}

const wpB: WorkPackage = {
  ...wpA,
  id: '33333333-3333-4333-8333-333333333333',
  subject: '보드 뷰 구현',
  status: 'in_progress',
  priority: 'medium',
  due_date: null,
}

const projectRollups = {
  work_package_count: 2,
  open_work_package_count: 2,
  overdue_count: 0,
  member_count: 1,
  current_user_role: 'owner' as const,
  initiatives: [],
  initiative_overflow: 0,
}
const projects: ProjectList = { items: [{ ...project, ...projectRollups }], total: 1 }

function projectListItem(
  id: string,
  name: string,
  extra: Partial<ProjectListItem> = {},
): ProjectListItem {
  return {
    ...project,
    ...projectRollups,
    id,
    key: name.replace(/[^A-Za-z가-힣]/g, '').slice(0, 3).toUpperCase(),
    name,
    ...extra,
  }
}
const inactiveProjectPhases: ProjectPhaseList = {
  items: [
    { key: 'discover', name: '발견', color: 'sky', position: 0, active: false, start_date: null, end_date: null, start_gate: { kind: 'start', name: '발견 시작 게이트', active: false, date: null }, finish_gate: { kind: 'finish', name: '발견 완료 게이트', active: false, date: null }, version: 0, retired: false, built_in: true },
    { key: 'plan', name: '계획', color: 'indigo', position: 1, active: false, start_date: null, end_date: null, start_gate: { kind: 'start', name: '계획 시작 게이트', active: false, date: null }, finish_gate: { kind: 'finish', name: '계획 완료 게이트', active: false, date: null }, version: 0, retired: false, built_in: true },
    { key: 'deliver', name: '실행', color: 'emerald', position: 2, active: false, start_date: null, end_date: null, start_gate: { kind: 'start', name: '실행 시작 게이트', active: false, date: null }, finish_gate: { kind: 'finish', name: '실행 완료 게이트', active: false, date: null }, version: 0, retired: false, built_in: true },
    { key: 'close', name: '마감', color: 'amber', position: 3, active: false, start_date: null, end_date: null, start_gate: { kind: 'start', name: '마감 시작 게이트', active: false, date: null }, finish_gate: { kind: 'finish', name: '마감 완료 게이트', active: false, date: null }, version: 0, retired: false, built_in: true },
  ],
  total: 4,
}
const workPackages: WorkPackageList = { items: [wpA, wpB], total: 2 }
const allWorkItems: SearchResults = {
  query: '',
  total: 3,
  items: [
    {
      id: wpA.id,
      project_id: project.id,
      project_key: project.key,
      project_name: project.name,
      subject: wpA.subject,
      status: wpA.status,
      priority: wpA.priority,
      type: wpA.type,
      assignee_id: 'me-1',
      assignee_name: 'Dev User',
      start_date: wpA.start_date,
      due_date: wpA.due_date,
      created_at: wpA.created_at,
      updated_at: wpA.updated_at,
      version: wpA.version,
      current_user_can_write: true,
      matched_in: 'primary',
      snippet: null,
    },
    {
      id: wpB.id,
      project_id: project.id,
      project_key: project.key,
      project_name: project.name,
      subject: wpB.subject,
      status: wpB.status,
      priority: wpB.priority,
      type: wpB.type,
      assignee_id: null,
      assignee_name: null,
      start_date: wpB.start_date,
      due_date: wpB.due_date,
      created_at: wpB.created_at,
      updated_at: wpB.updated_at,
      version: wpB.version,
      current_user_can_write: true,
      matched_in: 'primary',
      snippet: null,
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      project_id: '99999999-9999-4999-8999-999999999999',
      project_key: 'OPS',
      project_name: '운영 개선',
      subject: '외부 API 조율',
      status: 'in_review',
      priority: 'urgent',
      type: 'feature',
      assignee_id: null,
      assignee_name: 'Ops Lead',
      start_date: '2026-07-04',
      due_date: '2026-07-20',
      created_at: '2026-07-03T00:00:00Z',
      updated_at: '2026-07-04T00:00:00Z',
      version: 0,
      current_user_can_write: true,
      matched_in: 'primary',
      snippet: null,
    },
  ],
}
const relations: RelationList = { items: [], total: 0 }
const activities: ActivityList = {
  items: [
    {
      id: 'a1',
      work_package_id: wpA.id,
      actor_id: null,
      action: 'created',
      field: null,
      old_value: null,
      new_value: null,
      created_at: '2026-07-01T00:00:00Z',
    },
    {
      id: 'a2',
      work_package_id: wpA.id,
      actor_id: null,
      action: 'field_changed',
      field: 'cycle_id',
      old_value: '스프린트 1',
      new_value: '스프린트 2',
      created_at: '2026-07-02T00:00:00Z',
    },
    {
      id: 'a3',
      work_package_id: wpA.id,
      actor_id: null,
      action: 'field_changed',
      field: 'status',
      old_value: 'todo',
      new_value: 'in_progress',
      created_at: '2026-07-03T00:00:00Z',
    },
  ],
  total: 3,
}
const noComments: CommentList = { items: [], total: 0 }

const defaultWorkspaceCapabilities = {
  wiki: { enabled: true, revision: 1 },
  ai: {
    enabled: false,
    revision: 1,
    deployment_enabled: false,
    effective_enabled: false,
  },
  initiatives: { enabled: true, revision: 1 },
  releases: { enabled: true, revision: 1 },
  customers: { enabled: false, revision: 1 },
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({ json: defaultWorkspaceCapabilities }),
  )
})

type PersonalNoteFixture = {
  id: string
  title: string
  body: string
  color: 'lavender' | 'mint' | 'yellow' | 'rose' | 'blue' | 'gray'
  is_pinned: boolean
  position: number
  version: number
  created_at: string
  updated_at: string
}

async function mockApi(page: Page, opts: { conflictOnPatch?: boolean } = {}) {
  // Default mutable personal-note store lets all notes routes exercise real
  // request wiring without relying on a backend fixture.
  let personalNotes: PersonalNoteFixture[] = []
  let workspaceQuickLinks: WorkspaceQuickLink[] = []
  let workspaceViews: WorkspaceSavedView[] = []
  let workspaceWorkItems = allWorkItems.items.map((item) => ({ ...item }))
  let currentWorkPackage = { ...wpA }
  let projectDirectoryPreferences = {
    columns: [
      'work_package_count',
      'open_work_package_count',
      'overdue_count',
      'member_count',
    ],
    sort_key: 'default',
    sort_direction: 'asc',
    layout: 'grid',
    updated_at: null as string | null,
    is_default: true,
  }
  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({ json: defaultWorkspaceCapabilities }),
  )
  await page.route('**/api/v1/me/personal-notes**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { title?: string; body?: string; color?: PersonalNoteFixture['color']; is_pinned?: boolean }
      const note: PersonalNoteFixture = {
        id: `note-${personalNotes.length + 1}`,
        title: body.title ?? '',
        body: body.body ?? '',
        color: body.color ?? 'lavender',
        is_pinned: body.is_pinned ?? false,
        position: personalNotes.filter((item) => item.is_pinned === (body.is_pinned ?? false)).length,
        version: 0,
        created_at: '2026-07-10T00:00:00Z',
        updated_at: '2026-07-10T00:00:00Z',
      }
      personalNotes = [...personalNotes, note]
      await route.fulfill({ status: 201, json: note })
      return
    }
    if (request.method() === 'PATCH') {
      const id = url.pathname.split('/').at(-1)!
      const body = request.postDataJSON() as Partial<PersonalNoteFixture> & { expected_version: number }
      const current = personalNotes.find((note) => note.id === id)
      if (!current || current.version !== body.expected_version) {
        await route.fulfill({ status: 409, json: { detail: 'Personal note version conflict', current } })
        return
      }
      personalNotes = personalNotes.map((note) =>
        note.id === id ? { ...note, ...body, version: body.expected_version + 1 } : note,
      )
      await route.fulfill({ json: personalNotes.find((note) => note.id === id) })
      return
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { items: Array<{ id: string; expected_version: number }> }
      personalNotes = body.items.map((item, position) => {
        const note = personalNotes.find((current) => current.id === item.id)!
        return { ...note, position, version: item.expected_version + 1 }
      })
      await route.fulfill({
        json: {
          items: personalNotes,
          total: personalNotes.length,
          limit: 200,
          offset: 0,
        },
      })
      return
    }
    if (request.method() === 'DELETE') {
      personalNotes = personalNotes.filter((note) => note.id !== url.pathname.split('/').at(-1))
      await route.fulfill({ status: 204, body: '' })
      return
    }
    const q = url.searchParams.get('q') ?? ''
    const items = personalNotes.filter((note) => note.title.includes(q))
    await route.fulfill({
      json: {
        items,
        total: items.length,
        limit: Number(url.searchParams.get('limit') ?? 50),
        offset: Number(url.searchParams.get('offset') ?? 0),
      },
    })
  })
  await page.route('**/api/v1/me/quick-links**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Pick<WorkspaceQuickLink, 'title' | 'destination'>
      const link: WorkspaceQuickLink = {
        id: `00000000-0000-4000-8000-${String(workspaceQuickLinks.length + 1).padStart(12, '0')}`,
        title: body.title,
        destination: body.destination,
        position: workspaceQuickLinks.length,
        version: 0,
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
      }
      workspaceQuickLinks = [...workspaceQuickLinks, link]
      await route.fulfill({ status: 201, json: link })
      return
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as {
        items: Array<{ id: string; expected_version: number }>
      }
      workspaceQuickLinks = body.items.map((item, position) => {
        const link = workspaceQuickLinks.find((candidate) => candidate.id === item.id)!
        return { ...link, position, version: item.expected_version + 1 }
      })
      await route.fulfill({
        json: { items: workspaceQuickLinks, total: workspaceQuickLinks.length },
      })
      return
    }
    const id = url.pathname.split('/').at(-1)!
    const current = workspaceQuickLinks.find((link) => link.id === id)
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as {
        expected_version: number
        title: string
        destination: string
      }
      if (!current || current.version !== body.expected_version) {
        await route.fulfill({
          status: current ? 409 : 404,
          json: current
            ? { detail: 'quick link was changed elsewhere', current }
            : { detail: 'not found' },
        })
        return
      }
      const updated: WorkspaceQuickLink = {
        ...current,
        title: body.title,
        destination: body.destination,
        version: current.version + 1,
        updated_at: '2026-07-17T00:01:00Z',
      }
      workspaceQuickLinks = workspaceQuickLinks.map((link) =>
        link.id === id ? updated : link,
      )
      await route.fulfill({ json: updated })
      return
    }
    if (request.method() === 'DELETE') {
      workspaceQuickLinks = workspaceQuickLinks.filter((link) => link.id !== id)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({
      json: { items: workspaceQuickLinks, total: workspaceQuickLinks.length },
    })
  })
  await page.route('**/api/v1/me/workspace-views**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { name: string; params: WorkspaceSavedViewParams }
      const view: WorkspaceSavedView = {
        id: `00000000-0000-4000-8000-${String(workspaceViews.length + 1).padStart(12, '0')}`,
        name: body.name,
        params: body.params,
        version: 0,
        created_at: '2026-07-13T00:00:00Z',
        updated_at: '2026-07-13T00:00:00Z',
      }
      workspaceViews = [view, ...workspaceViews]
      await route.fulfill({ status: 201, json: view })
      return
    }
    const id = url.pathname.split('/').at(-1)!
    const current = workspaceViews.find((view) => view.id === id)
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as {
        expected_version: number
        name?: string
        params?: WorkspaceSavedViewParams
      }
      if (!current || current.version !== body.expected_version) {
        await route.fulfill({
          status: current ? 409 : 404,
          json: current
            ? { detail: 'workspace view was changed elsewhere', current }
            : { detail: 'not found' },
        })
        return
      }
      const updated: WorkspaceSavedView = {
        ...current,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.params !== undefined ? { params: body.params } : {}),
        version: current.version + 1,
        updated_at: '2026-07-13T00:01:00Z',
      }
      workspaceViews = workspaceViews.map((view) => view.id === id ? updated : view)
      await route.fulfill({ json: updated })
      return
    }
    if (request.method() === 'DELETE') {
      const expected = Number(url.searchParams.get('expected_version'))
      if (!current || current.version !== expected) {
        await route.fulfill({
          status: current ? 409 : 404,
          json: current
            ? { detail: 'workspace view was changed elsewhere', current }
            : { detail: 'not found' },
        })
        return
      }
      workspaceViews = workspaceViews.filter((view) => view.id !== id)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ json: { items: workspaceViews, total: workspaceViews.length } })
  })
  await page.route('**/api/v1/me/project-directory-preferences', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Omit<
        typeof projectDirectoryPreferences,
        'updated_at' | 'is_default'
      >
      projectDirectoryPreferences = {
        ...body,
        updated_at: '2026-07-14T00:00:00Z',
        is_default: false,
      }
    }
    await route.fulfill({ json: projectDirectoryPreferences })
  })
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: projects }),
  )
  await page.route('**/api/v1/data-transfer-jobs**', (route) =>
    route.fulfill({ json: { items: [], total: 0, limit: 50, offset: 0 } }),
  )
  await page.route('**/api/v1/search/work-packages**', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().endsWith('/pql/validate')) {
      const body = route.request().postDataJSON() as { query: string }
      const normalized = body.query.trim().replace(/\s+/g, ' ')
      if (/Impossible/i.test(normalized)) {
        await route.fulfill({ status: 422, json: { detail: 'priority value is not supported' } })
        return
      }
      await route.fulfill({
        json: {
          normalized,
          fields: ['priority'],
          order_by: null,
          direction: null,
          limit: null,
        },
      })
      return
    }
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q')?.trim() ?? ''
    const scope = url.searchParams.get('scope') ?? 'all'
    const state = url.searchParams.get('state') ?? 'all'
    const priority = url.searchParams.get('priority')
    const pql = url.searchParams.get('pql')
    const sort = url.searchParams.get('sort') ?? 'updated'
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    let items = query
      ? workspaceWorkItems.filter((item) => item.subject.includes(query))
      : [...workspaceWorkItems]
    if (scope === 'assigned') items = items.filter((item) => item.id === wpA.id)
    else if (scope === 'created') items = items.filter((item) => item.project_id === project.id)
    else if (scope === 'subscribed') items = items.filter((item) => item.id === wpB.id)
    if (state === 'open') items = items.filter((item) => !['done', 'cancelled'].includes(item.status))
    if (priority) items = items.filter((item) => item.priority === priority)
    if (/priority\s*=\s*high/i.test(pql ?? '')) items = items.filter((item) => item.priority === 'high')
    if (url.pathname.endsWith('/analytics')) {
      const pqlLimit = pql?.match(/\bLIMIT\s+(\d+)\b/i)
      if (pqlLimit) items = items.slice(0, Number(pqlLimit[1]))
      const projectCounts = new Map<string, { id: string; key: string; name: string; count: number }>()
      for (const item of items) {
        const current = projectCounts.get(item.project_id)
        projectCounts.set(item.project_id, {
          id: item.project_id,
          key: item.project_key,
          name: item.project_name,
          count: (current?.count ?? 0) + 1,
        })
      }
      const response = {
        total: items.length,
        status_buckets: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'].map((key) => ({
          key,
          count: items.filter((item) => item.status === key).length,
        })),
        priority_buckets: ['none', 'low', 'medium', 'high', 'urgent'].map((key) => ({
          key,
          count: items.filter((item) => item.priority === key).length,
        })),
        top_projects: [...projectCounts.values()].sort((left, right) => right.count - left.count || left.key.localeCompare(right.key)),
        project_overflow: { project_count: 0, item_count: 0 },
        schedule_buckets: {
          completed: items.filter((item) => ['done', 'cancelled'].includes(item.status)).length,
          open_overdue: 0,
          open_due_next_7_days: items.filter((item) => item.due_date && !['done', 'cancelled'].includes(item.status)).length,
          open_later: 0,
          open_unscheduled: items.filter((item) => !item.due_date && !['done', 'cancelled'].includes(item.status)).length,
        },
      } satisfies SearchWorkPackageAnalytics
      await route.fulfill({ json: response })
      return
    }
    if (sort === 'due') {
      items.sort((left, right) => (left.due_date ?? '9999-12-31').localeCompare(right.due_date ?? '9999-12-31'))
    }
    const total = items.length
    route.fulfill({ json: { query, items: items.slice(offset, offset + limit), total } })
  })
  // Single-project GET — the write-access gate (Pass 76) reads archived_at
  // from here; default to the unarchived fixture so owner flows stay editable.
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route('**/api/v1/projects/*/health-history**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies ProjectHealthHistoryList }),
  )
  await page.route('**/api/v1/projects/*/phases**', (route) =>
    route.fulfill({ json: inactiveProjectPhases }),
  )
  await page.route('**/api/v1/projects/*/schedule-baseline**', (route) =>
    route.fulfill({
      json: {
        baseline: null,
        total_snapshot: 0,
        current_total: 2,
        unchanged: 0,
        later: 0,
        earlier: 0,
        unscheduled: 0,
        rescheduled: 0,
        added: 0,
        removed: 0,
        changed_total: 0,
        items: [],
        items_truncated: false,
      } satisfies ProjectScheduleBaselineSummary,
    }),
  )
  // The Topbar bell polls this on every page — default to an empty inbox.
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  // The sidebar gates the admin link on /me (tests re-mocking /me win —
  // they register after mockApi).
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'me-1',
        email: 'dev@oneflow.local',
        display_name: 'Dev User',
        is_active: true,
        is_admin: true,
      },
    }),
  )
  // The settings notifications tab reads the caller's toggles.
  await page.route('**/api/v1/me/notification-settings', (route) =>
    route.fulfill({
      json: {
        assigned: true,
        watched: true,
        commented: true,
        mention: true,
        due_alerts: true,
        overdue_reminder_days: 0,
        intake: true,
        initiatives: true,
      },
    }),
  )
  // Personal developer settings: default to no user-owned API tokens.
  await page.route('**/api/v1/me/access-tokens**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          token: 'ofp_created_once',
          item: {
            id: 'tok-created',
            name: '새 토큰',
            token_prefix: 'ofp_created',
            created_at: '2026-07-10T00:00:00Z',
            expires_at: '2026-10-08T00:00:00Z',
            revoked_at: null,
            last_used_at: null,
          },
        },
      })
      return
    }
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ json: { items: [], total: 0 } })
  })
  await page.route('**/api/v1/workspace/profile', (route) =>
    route.fulfill({
      json: {
        name: 'OneFlow',
        revision: 1,
      },
    }),
  )
  // The meetings page's template select fetches on mount — default to none.
  await page.route('**/api/v1/projects/*/meeting-templates', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The list page's saved-filters bar fetches on mount — default to none.
  await page.route('**/api/v1/projects/*/saved-filters', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // Board/settings read the workflow config — empty → board falls back to built-ins.
  await page.route('**/api/v1/projects/*/statuses', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The drawer cycle picker and the list cycle filter read the project cycles.
  await page.route('**/api/v1/projects/*/cycles', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // Same for the module picker/filter.
  await page.route('**/api/v1/projects/*/modules', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The drawer watch row reads the watcher list.
  await page.route('**/api/v1/work-packages/*/watchers', (route) =>
    route.fulfill({ json: { items: [], total: 0, me_watching: false } }),
  )
  // The drawer pages section reads linked documents.
  await page.route('**/api/v1/work-packages/*/documents', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // File/document surfaces use the project document list for attachment anchors.
  await page.route('**/api/v1/projects/*/documents**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents?**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The timeline reads project-wide relations for dependency connectors.
  await page.route('**/api/v1/projects/*/relations**', (route) =>
    route.fulfill({ json: { items: [], total: 0, truncated: false } }),
  )
  // The drawer attachments section reads anchored files.
  await page.route('**/api/v1/projects/*/attachments**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The intake page reads the queue.
  await page.route('**/api/v1/projects/*/intake', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The initiatives page reads the workspace list.
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/initiatives/labels', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/initiatives/*/activities**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // Type config: default empty → built-in labels everywhere (fallback path).
  await page.route('**/api/v1/projects/*/types', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The sidebar footer shows the auth mode.
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        oidc_provider: null,
        has_client_secret: false,
        command_palette_enabled: false,
      },
    }),
  )
  // The drawer custom-fields section reads definitions + values.
  await page.route('**/api/v1/projects/*/custom-fields**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/work-packages/*/custom-values', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The drawer reads AI capabilities — default the feature OFF (section hidden).
  await page.route('**/api/v1/capabilities', (route) =>
    route.fulfill({ json: { ai_summary_enabled: false } }),
  )
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: workPackages }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/relations`, (route) =>
    route.fulfill({ json: relations }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/time-entries`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { id: 'te-1' } })
      return
    }
    await route.fulfill({ json: { items: [], total: 0, total_hours: 0 } })
  })
  await page.route(`**/api/v1/work-packages/${wpA.id}/cost-entries`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { id: 'ce-1' } })
      return
    }
    await route.fulfill({ json: { items: [], total: 0, total_amount: 0 } })
  })
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  // The drawer assignee picker, the list assignee column and the assignee filter
  // all read the project roster.
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
          { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
        ],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/activities**`, (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const field = url.searchParams.get('field')
    const items = activities.items.filter(
      (activity) => (!action || activity.action === action) && (!field || activity.field === field),
    )
    return route.fulfill({ json: { items, total: items.length } })
  })
  await page.route(`**/api/v1/work-packages/${wpA.id}/comments`, async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { body: string; parent_id?: string | null }
      const created: Comment = {
        id: 'c-new',
        work_package_id: wpA.id,
        parent_id: sent.parent_id ?? null,
        author_id: null,
        body: sent.body,
        mentions: null,
        reactions: [],
        created_at: '2026-07-02T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
      }
      await route.fulfill({ status: 201, json: created })
      return
    }
    await route.fulfill({ json: noComments })
  })
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    const request = route.request()
    if (request.method() === 'PATCH') {
      if (opts.conflictOnPatch) {
        const body: ConflictBody = {
          detail: 'version conflict — resource was modified by someone else',
          current: { ...wpA, status: 'done', version: 3 },
        }
        workspaceWorkItems = workspaceWorkItems.map((item) =>
          item.id === wpA.id ? { ...item, status: 'done', version: 3 } : item,
        )
        currentWorkPackage = body.current
        await route.fulfill({ status: 409, json: body })
        return
      }
      const sent = request.postDataJSON() as {
        expected_version: number
        status?: string
        priority?: string
        assignee_id?: string | null
        start_date?: string | null
        due_date?: string | null
      }
      const updated: WorkPackage = {
        ...currentWorkPackage,
        status: (sent.status as WorkPackage['status']) ?? currentWorkPackage.status,
        priority: (sent.priority as WorkPackage['priority']) ?? currentWorkPackage.priority,
        assignee_id: 'assignee_id' in sent ? sent.assignee_id! : currentWorkPackage.assignee_id,
        start_date: 'start_date' in sent ? sent.start_date! : currentWorkPackage.start_date,
        due_date: 'due_date' in sent ? sent.due_date! : currentWorkPackage.due_date,
        version: sent.expected_version + 1,
      }
      currentWorkPackage = updated
      workspaceWorkItems = workspaceWorkItems.map((item) =>
        item.id === wpA.id
          ? {
            ...item,
            status: updated.status,
            priority: updated.priority,
            assignee_id: updated.assignee_id,
            start_date: updated.start_date,
            due_date: updated.due_date,
            assignee_name: updated.assignee_id === 'u-alex'
              ? 'Alex Kim'
              : updated.assignee_id === 'me-1' ? 'Dev User' : null,
            version: updated.version,
          }
          : item,
      )
      await route.fulfill({ json: updated })
      return
    }
    await route.fulfill({ json: currentWorkPackage })
  })
}

async function enableCommandPalette(page: Page) {
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        has_client_secret: false,
        command_palette_enabled: true,
      },
    }),
  )
}

async function mockCommandPaletteSearch(page: Page) {
  const emptyGroup = { items: [], returned: 0, truncated: false }
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({
      json: {
        query: '구현',
        work_packages: {
          items: [
            {
              id: wpA.id,
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              subject: '워크패키지 API 구현',
              status: 'todo',
              priority: 'high',
              type: 'task',
              due_date: '2026-07-15',
              matched_in: 'content',
              snippet: '수직 슬라이스 구현',
            },
          ],
          returned: 1,
          truncated: false,
        },
        documents: {
          items: [
            {
              id: 'd-77',
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              title: '구현 가이드 문서',
              matched_in: 'primary',
              snippet: null,
            },
          ],
          returned: 1,
          truncated: false,
        },
        files: emptyGroup,
        meetings: emptyGroup,
        cycles: emptyGroup,
        modules: emptyGroup,
        initiatives: {
          items: [{ id: 'ini-9', name: '플랫폼 전략', state: 'in_progress' }],
          returned: 1,
          truncated: false,
        },
      },
    }),
  )
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
}

function localDateOffset(days: number) {
  const value = new Date()
  value.setDate(value.getDate() + days)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDateFromISO(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function localDateISO(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nextWorkingDate(value: string) {
  const date = localDateFromISO(value)
  do date.setDate(date.getDate() + 1)
  while (date.getDay() === 0 || date.getDay() === 6)
  return localDateISO(date)
}

function workingDaysInclusive(start: string, end: string) {
  const date = localDateFromISO(start)
  const last = localDateFromISO(end)
  let count = 0
  while (date <= last) {
    if (date.getDay() !== 0 && date.getDay() !== 6) count += 1
    date.setDate(date.getDate() + 1)
  }
  return Math.max(count, 1)
}

function addWorkingDays(start: string, days: number) {
  const date = localDateFromISO(start)
  while (days > 0) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) days -= 1
  }
  return localDateISO(date)
}

async function mockProjectOverview(page: Page) {
  await page.route(`**/api/v1/projects/${project.id}/dashboard`, (route) =>
    route.fulfill({
      json: {
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        health: 'on_track',
        health_note: '계획대로 진행 중입니다.',
        archived_at: null,
        completion_percent: 40,
        recent_work_packages: [],
        total_work_packages: 5,
        open_work_packages: 3,
        overdue_count: 1,
        status_counts: [],
        priority_counts: [],
        type_counts: [],
        total_estimated_hours: 32,
        total_spent_hours: 14,
        budget: null,
        total_cost: 0,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/activities**`, (route) =>
    route.fulfill({ json: { items: [], total: 0, truncated: false } }),
  )
}

test('앱 셸과 프로젝트/워크패키지 목록이 렌더링된다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.getByText('OneFlow 도입', { exact: false }).first()).toBeVisible()

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('link', { name: /Work Packages/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  // date-only string displayed verbatim — no timezone off-by-one (§6.1)
  await expect(page.getByText('2026-07-15')).toBeVisible()
  await page.screenshot({ path: '../../docs/screenshots/web-list.png', fullPage: true })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/ui-shell/desktop-list.png',
    fullPage: true,
  })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/view-controls/desktop.png',
    fullPage: true,
  })
})

test('프로젝트 작업 화면 제어가 보기·필터·분석·생성 흐름에 연결된다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)

  const controls = page.getByRole('region', { name: '작업 화면 제어' })
  await expect(controls.getByRole('heading', { name: 'Work Packages' })).toBeVisible()
  await expect(controls.getByRole('link', { name: '목록 보기' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/work-packages`,
  )
  await expect(controls.getByRole('link', { name: '보드 보기' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/board`,
  )
  await expect(controls.getByRole('link', { name: '백로그 보기' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/backlog`,
  )
  await expect(controls.getByRole('link', { name: '캘린더 보기' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/calendar`,
  )
  await expect(controls.getByRole('link', { name: '분석' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/dashboard`,
  )
  await expect(controls.getByRole('button', { name: '표시' })).toBeVisible()

  const filterButton = controls.getByRole('button', { name: '필터' })
  await expect(page.getByLabel('상태 필터')).toBeVisible()
  await filterButton.click()
  await expect(page.getByLabel('상태 필터')).toHaveCount(0)
  await expect(filterButton).toHaveAttribute('aria-expanded', 'false')
  await filterButton.click()
  await expect(page.getByLabel('상태 필터')).toBeVisible()

  await controls.getByRole('button', { name: '새 작업' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages\\?new=1`))
  await expect(page.getByRole('region', { name: '새 작업 생성' })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-work-items-composition-ui/desktop.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.locator('[data-shell-scroll-region]').evaluate((container) => {
    const target = container.querySelector('[aria-label="프로젝트 상태 보고 이력"]')
    if (!target) return
    container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - 8
  })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-work-items-composition-ui/mobile.png',
  })
})

test('글로벌 레일과 전체 폭 검색 topbar가 실제 제품 경로에 연결된다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/projects')

  const banner = page.getByRole('banner')
  const bannerBox = await banner.boundingBox()
  expect(bannerBox?.x).toBe(0)
  expect(bannerBox?.width).toBe(await page.evaluate(() => window.innerWidth))

  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await expect(globalNav.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects')
  await expect(globalNav.getByRole('link', { name: 'Wiki' })).toHaveAttribute(
    'href',
    '/wiki',
  )
  await expect(globalNav.getByRole('link', { name: 'AI' })).toHaveAttribute(
    'href',
    '/ai',
  )
  await expect(globalNav.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/admin')
  await expect(page.getByRole('button', { name: '전체 검색 열기' })).toBeVisible()
  await expect(globalNav.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')

  await globalNav.getByRole('link', { name: 'AI' }).click()
  await expect(page).toHaveURL('/ai')
  await expect(page.getByRole('navigation', { name: 'AI 컨텍스트 내비게이션' })).toBeVisible()
  await expect(page.getByRole('button', { name: '새 작업' })).toHaveCount(0)
})

test('Projects rail은 모든 core workspace route의 app context를 유지한다', async ({ page }) => {
  await mockApi(page)

  for (const path of ['/my', '/work-items', '/inbox', `/projects/${project.id}/work-packages`]) {
    await page.goto(path)
    const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
    await expect(globalNav.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    await expect(globalNav.getByRole('link', { name: 'AI' })).not.toHaveAttribute('aria-current', 'page')
    await expect(globalNav.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current', 'page')
  }
})

test('글로벌 앱을 전환하면 Projects·Wiki·AI·Settings 고유 메뉴 트리가 교체된다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/projects')

  let globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await expect(page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })).toBeVisible()

  await globalNav.getByRole('link', { name: 'Wiki' }).click()
  await expect(page).toHaveURL('/wiki')
  await expect(page.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })).toHaveCount(0)

  globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await globalNav.getByRole('link', { name: 'AI' }).click()
  await expect(page).toHaveURL('/ai')
  await expect(page.getByRole('navigation', { name: 'AI 컨텍스트 내비게이션' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' })).toHaveCount(0)

  globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await globalNav.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL('/admin/users')
  await expect(page.getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'AI 컨텍스트 내비게이션' })).toHaveCount(0)

  globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await globalNav.getByRole('link', { name: 'Projects' }).click()
  await expect(page).toHaveURL('/projects')
  await expect(page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/global-app-contexts-ui/projects.png' })
  await globalNav.getByRole('link', { name: 'Wiki' }).click()
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/global-app-contexts-ui/wiki.png' })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const drawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await expect(drawer.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/global-app-contexts-ui/mobile-wiki.png' })
})

test('Frame context는 workspace query와 project route를 실제 breadcrumb navigation으로 표현한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/my')

  let breadcrumb = page.getByRole('navigation', { name: '현재 위치' })
  await expect(breadcrumb.getByRole('link', { name: 'OneFlow' })).toHaveAttribute('href', '/my')
  await expect(breadcrumb.getByRole('link', { name: '워크스페이스' })).toHaveAttribute('href', '/projects')
  await expect(page.getByTestId('frame-context-bar').getByText('홈', { exact: true })).toBeVisible()

  await page.goto('/my?tab=created')
  breadcrumb = page.getByRole('navigation', { name: '현재 위치' })
  await expect(breadcrumb.getByRole('link', { name: '내 작업' })).toHaveAttribute('href', '/my?tab=assigned')
  await expect(page.getByTestId('frame-context-bar').getByText('생성함', { exact: true })).toBeVisible()

  await page.goto(`/projects/${project.id}/board`)
  breadcrumb = page.getByRole('navigation', { name: '현재 위치' })
  await expect(breadcrumb.getByRole('link', { name: project.name })).toHaveAttribute(
    'href',
    `/projects/${project.id}/overview`,
  )
  await expect(breadcrumb.getByRole('link', { name: '작업' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/work-packages`,
  )
  await expect(page.getByTestId('frame-context-bar').getByText('Board', { exact: true })).toBeVisible()
  await breadcrumb.getByRole('link', { name: '작업' }).click()
  await expect(page).toHaveURL(`/projects/${project.id}/work-packages`)

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/shell-header-workspace-switcher-ui/desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('frame-context-bar').getByText('Work Packages', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/shell-header-workspace-switcher-ui/mobile.png' })
})

test('Projects context sidebar는 disclosure·More panel·pin navigation을 유지한다', async ({ page }) => {
  test.setTimeout(90_000)
  await mockApi(page)
  await page.goto('/projects')

  const contextNav = page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  await expect(contextNav.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/my')
  await expect(contextNav.getByRole('link', { name: '초안' })).toHaveAttribute('href', '/drafts')
  await expect(contextNav.getByRole('link', { name: '내 작업' })).toHaveAttribute('href', '/my?tab=assigned')
  await expect(contextNav.getByRole('link', { name: '개인 메모' })).toHaveAttribute('href', '/notes')
  const workspaceDisclosure = contextNav.getByRole('button', { name: '워크스페이스' })
  const projectsDisclosure = contextNav.getByRole('button', { name: '프로젝트', exact: true })
  await expect(workspaceDisclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(projectsDisclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(contextNav.getByRole('link', { name: '프로젝트', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(contextNav.getByRole('link', { name: 'Views' })).toHaveAttribute('href', '/work-items')
  await workspaceDisclosure.click()
  await projectsDisclosure.click()
  await page.reload()
  await expect(workspaceDisclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(projectsDisclosure).toHaveAttribute('aria-expanded', 'false')
  await workspaceDisclosure.click()
  await projectsDisclosure.click()
  await expect(contextNav.getByRole('link', { name: '리포트' })).toHaveCount(0)
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/projects-sidebar-hierarchy-ui/desktop.png' })

  const mainBeforePanel = await page.locator('main').boundingBox()
  const moreTrigger = contextNav.getByRole('button', { name: 'More' })
  await moreTrigger.click()
  const morePanel = page.getByRole('dialog', { name: '워크스페이스 더 보기' })
  await expect(morePanel.getByRole('link', { name: 'Views' })).toHaveAttribute('href', '/work-items')
  await expect(morePanel.getByRole('link', { name: '리포트' })).toHaveAttribute('href', '/reports')
  expect((await page.locator('main').boundingBox())?.x).toBe(mainBeforePanel?.x)
  await morePanel.getByRole('button', { name: '리포트 고정' }).click()
  await expect(contextNav.getByRole('link', { name: '리포트' })).toHaveAttribute('href', '/reports')
  await page.reload()
  await expect(contextNav.getByRole('link', { name: '리포트' })).toHaveAttribute('href', '/reports')
  await contextNav.getByRole('button', { name: 'More' }).click()
  await morePanel.getByRole('button', { name: '리포트 고정 해제' }).click()
  await expect(contextNav.getByRole('link', { name: '리포트' })).toHaveCount(0)
  await page.mouse.click(1000, 200)
  await expect(morePanel).toHaveCount(0)
  await moreTrigger.click()
  await page.keyboard.press('Escape')
  await expect(morePanel).toHaveCount(0)
  await expect(moreTrigger).toBeFocused()

  const projectDisclosure = contextNav.getByRole('button', { name: `${project.name} 하위 내비게이션` })
  await projectDisclosure.click()
  await expect(projectDisclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toBeVisible()
  await projectDisclosure.click()
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toHaveCount(0)
  await page.reload()
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toHaveCount(0)

  await page.evaluate(() => localStorage.removeItem('oneflow.sidebar.preferences.v1'))
  const secondProject = {
    ...project,
    ...projectRollups,
    id: '99999999-9999-4999-8999-999999999998',
    key: 'OPS',
    name: '운영 개선',
  }
  await page.route('**/api/v1/projects', (route) => route.fulfill({
    json: { items: [{ ...project, ...projectRollups }, secondProject], total: 2 },
  }))
  await page.goto(`/projects/${project.id}/board`)
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toBeVisible()
  await contextNav.getByRole('button', { name: `${secondProject.name} 하위 내비게이션` }).click()
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toHaveCount(2)
  await page.reload()
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toHaveCount(2)

  await moreTrigger.click()
  await morePanel.getByRole('link', { name: '리포트' }).click()
  await expect(page).toHaveURL('/reports')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const drawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await drawer.getByRole('button', { name: 'More' }).click()
  const mobileMorePanel = page.getByRole('dialog', { name: '워크스페이스 더 보기' })
  await expect(mobileMorePanel).toBeVisible()
  await expect(mobileMorePanel.getByRole('button', { name: 'More 닫기' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(mobileMorePanel.getByRole('button', { name: '시스템 상태 고정' })).toBeFocused()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/projects-sidebar-hierarchy-ui/mobile.png' })
})

test('프로젝트 행 메뉴는 즐겨찾기·링크·설정·소유자 보관을 실제 상태와 연결한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => window.localStorage.setItem('__copied_project_link', text),
      },
    })
  })
  await mockApi(page)
  const viewerProject = {
    ...project,
    ...projectRollups,
    id: '99999999-9999-4999-8999-999999999998',
    key: 'OPS',
    name: '운영 개선',
  }
  let ownerProjectArchived = false
  await page.route('**/api/v1/projects', (route) => route.fulfill({
    json: {
      items: ownerProjectArchived ? [viewerProject] : [{ ...project, ...projectRollups }, viewerProject],
      total: ownerProjectArchived ? 1 : 2,
    },
  }))
  await page.route(`**/api/v1/projects/${viewerProject.id}/members`, (route) => route.fulfill({
    json: {
      items: [{ user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' }],
      total: 1,
    },
  }))
  await page.route(`**/api/v1/projects/${project.id}/archive`, (route) => {
    ownerProjectArchived = true
    return route.fulfill({ json: { ...project, archived_at: '2026-07-13T00:00:00Z' } })
  })

  await page.goto('/projects')
  const nav = page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  const projectRows = nav.locator('[data-project-row]')
  await expect(projectRows).toHaveCount(2)
  await expect(projectRows.nth(0)).toContainText('OneFlow 도입')

  await nav.getByRole('button', { name: '운영 개선 프로젝트 작업' }).click()
  await page.getByRole('menuitem', { name: '즐겨찾기에 추가' }).click()
  await expect(projectRows.nth(0)).toContainText('운영 개선')
  await expect(projectRows.nth(0).getByLabel('즐겨찾기')).toBeVisible()
  await page.evaluate(() => {
    const key = 'oneflow.sidebar.preferences.v1'
    const preferences = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    window.localStorage.setItem(key, JSON.stringify({ ...preferences, limitProjects: true, projectLimit: 1 }))
  })
  await page.reload()
  await expect(projectRows).toHaveCount(1)
  await expect(projectRows.nth(0)).toContainText('운영 개선')

  await nav.getByRole('button', { name: '운영 개선 프로젝트 작업' }).click()
  await expect(page.getByRole('menuitem', { name: '프로젝트 보관' })).toHaveCount(0)
  await page.getByRole('menuitem', { name: '링크 복사' }).click()
  await expect(page.getByRole('status')).toContainText('링크를 복사했습니다')
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('__copied_project_link')))
    .toBe(`${new URL(page.url()).origin}/projects/${viewerProject.id}/overview`)

  await nav.getByRole('button', { name: '운영 개선 프로젝트 작업' }).click()
  await page.getByRole('menuitem', { name: '설정' }).click()
  await expect(page).toHaveURL(`/projects/${viewerProject.id}/settings`)

  await page.evaluate(() => {
    const key = 'oneflow.sidebar.preferences.v1'
    const preferences = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    window.localStorage.setItem(key, JSON.stringify({ ...preferences, limitProjects: false }))
  })
  await page.goto('/projects')
  await nav.getByRole('button', { name: 'OneFlow 도입 프로젝트 작업' }).click()
  await expect(page.getByRole('menuitem', { name: '프로젝트 보관' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Publish|공개/ })).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/projects-sidebar-actions-ui/project-menu.png',
  })
  const archiveRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith(`/projects/${project.id}/archive`),
  )
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('menuitem', { name: '프로젝트 보관' }).click()
  await archiveRequest
  await expect(page.getByRole('status')).toContainText('프로젝트를 보관했습니다')
  await expect(projectRows).toHaveCount(1)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const drawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await drawer.getByRole('button', { name: '운영 개선 프로젝트 작업' }).click()
  await expect(page.getByRole('menuitem', { name: '설정' })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/projects-sidebar-actions-ui/mobile-project-menu.png',
  })
})

test('사이드바 접기와 내비게이션 개인화는 reload와 cross-tab에서 유지된다', async ({ page }) => {
  test.setTimeout(90_000)
  await mockApi(page)
  await page.goto('/projects')

  const contextNav = page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  await expect(contextNav).toBeVisible()
  await page.getByRole('button', { name: '사이드바 접기' }).click()
  await expect(contextNav).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '글로벌 내비게이션' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })).toHaveCount(0)
  await page.getByRole('button', { name: '사이드바 펼치기' }).click()

  const customizeButton = page.getByRole('button', { name: '내비게이션 사용자 지정' })
  await customizeButton.click()
  const customizer = page.getByRole('dialog', { name: '내비게이션 사용자 지정' })
  await expect(customizer.getByRole('button', { name: '내비게이션 사용자 지정 닫기' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(customizer.getByRole('button', { name: '기본값 복원' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(customizer.getByRole('button', { name: '내비게이션 사용자 지정 닫기' })).toBeFocused()
  const customizerBox = await customizer.boundingBox()
  expect(customizerBox?.x).toBeGreaterThanOrEqual(0)
  expect((customizerBox?.x ?? 0) + (customizerBox?.width ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  )
  await customizer.getByRole('checkbox', { name: '초안 표시' }).uncheck()
  await customizer.getByRole('button', { name: '개인 메모 위로 이동' }).click()
  await customizer.getByRole('button', { name: '개인 메모 위로 이동' }).click()
  await customizer.getByRole('button', { name: '개인 메모 위로 이동' }).click()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/sidebar-resize-customize-ui/desktop-customize.png',
  })
  await page.keyboard.press('Escape')
  await expect(customizeButton).toBeFocused()
  await expect(contextNav.getByRole('link', { name: '초안' })).toHaveCount(0)
  const notesBox = await contextNav.getByRole('link', { name: '개인 메모' }).boundingBox()
  const homeBox = await contextNav.getByRole('link', { name: '홈' }).boundingBox()
  expect(notesBox?.y).toBeLessThan(homeBox?.y ?? 0)

  await page.reload()
  await expect(contextNav.getByRole('link', { name: '초안' })).toHaveCount(0)
  const reloadedNotesBox = await contextNav.getByRole('link', { name: '개인 메모' }).boundingBox()
  const reloadedHomeBox = await contextNav.getByRole('link', { name: '홈' }).boundingBox()
  expect(reloadedNotesBox?.y).toBeLessThan(reloadedHomeBox?.y ?? 0)
  const secondPage = await page.context().newPage()
  await mockApi(secondPage)
  await secondPage.goto('/projects', { waitUntil: 'domcontentloaded' })
  const secondNav = secondPage.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  await expect(secondNav.getByRole('link', { name: '초안' })).toHaveCount(0)
  const secondNotesBox = await secondNav.getByRole('link', { name: '개인 메모' }).boundingBox()
  const secondHomeBox = await secondNav.getByRole('link', { name: '홈' }).boundingBox()
  expect(secondNotesBox?.y).toBeLessThan(secondHomeBox?.y ?? 0)

  await page.getByRole('button', { name: '사이드바 접기' }).click()
  await expect(secondNav).toHaveCount(0)
  await page.getByRole('button', { name: '사이드바 펼치기' }).click()
  await expect(secondNav).toBeVisible()

  await page.getByRole('button', { name: '내비게이션 사용자 지정' }).click()
  await page
    .getByRole('dialog', { name: '내비게이션 사용자 지정' })
    .getByRole('button', { name: '기본값 복원' })
    .click()
  await expect(secondNav.getByRole('link', { name: '초안' })).toBeVisible()
  const resetHomeBox = await secondNav.getByRole('link', { name: '홈' }).boundingBox()
  const resetNotesBox = await secondNav.getByRole('link', { name: '개인 메모' }).boundingBox()
  expect(resetHomeBox?.y).toBeLessThan(resetNotesBox?.y ?? 0)
  await secondPage.close()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '사이드바 접기' }).click()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/sidebar-personalization-ui/desktop-collapsed.png',
  })
})

test('사이드바 너비와 프로젝트 탐색 모드는 조절·저장되고 실제 레이아웃에 반영된다', async ({ page }) => {
  test.setTimeout(90_000)
  await mockApi(page)
  await page.route(/\/api\/v1\/projects(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { ...project, ...projectRollups },
          { ...project, ...projectRollups, id: '22222222-2222-4222-8222-222222222222', key: 'BET', name: 'Beta 개선' },
          { ...project, ...projectRollups, id: '33333333-3333-4333-8333-333333333333', key: 'GAM', name: 'Gamma 운영' },
        ],
        total: 3,
      }),
    })
  })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/projects')

  const separator = page.getByRole('separator', { name: '사이드바 너비 조절' })
  await expect(separator).toHaveAttribute('aria-valuenow', '248')
  await separator.focus()
  await page.keyboard.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '256')
  await page.keyboard.press('End')
  await expect(separator).toHaveAttribute('aria-valuenow', '420')
  await page.keyboard.press('Home')
  await expect(separator).toHaveAttribute('aria-valuenow', '220')
  await page.waitForTimeout(250)

  const separatorBox = await separator.boundingBox()
  if (!separatorBox) throw new Error('사이드바 너비 조절자를 찾지 못했습니다.')
  await page.mouse.move(separatorBox.x + separatorBox.width / 2, separatorBox.y + separatorBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(separatorBox.x + 92, separatorBox.y + separatorBox.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(separator).toHaveAttribute('aria-valuenow', '308')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/sidebar-resize-customize-ui/desktop-resize.png',
  })

  await page.getByRole('button', { name: '내비게이션 사용자 지정' }).click()
  const customizer = page.getByRole('dialog', { name: '내비게이션 사용자 지정' })
  await customizer.getByTestId('nav-drag-/notes').dragTo(customizer.getByTestId('nav-row-/my'))
  await customizer.getByRole('radio', { name: /상단 탭/ }).check()
  await customizer.getByRole('checkbox', { name: '사이드바 프로젝트 수 제한' }).check()
  await customizer.getByLabel('표시할 프로젝트 수').fill('1')
  await page.keyboard.press('Escape')

  const contextNav = page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  await expect(contextNav.locator('a[href^="/projects/"][href$="/overview"]')).toHaveCount(1)
  const notesBox = await contextNav.getByRole('link', { name: '개인 메모' }).boundingBox()
  const homeBox = await contextNav.getByRole('link', { name: '홈' }).boundingBox()
  expect(notesBox?.y).toBeLessThan(homeBox?.y ?? 0)
  const projectLink = contextNav.getByRole('link', { name: project.name })
  await projectLink.click()
  const projectTabs = page.getByRole('navigation', { name: '프로젝트 화면 탭' })
  await expect(projectTabs).toBeVisible()
  await expect(contextNav.getByRole('link', { name: 'Work Packages' })).toHaveCount(0)
  await projectTabs.getByRole('link', { name: 'Board', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[^/]+\/board$/)
  await expect(projectTabs.getByRole('link', { name: 'Board', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.reload()
  await expect(page.getByRole('separator', { name: '사이드바 너비 조절' })).toHaveAttribute('aria-valuenow', '308')
  await expect(page.getByRole('navigation', { name: '프로젝트 화면 탭' })).toBeVisible()
})

test('모바일 Customize navigation은 손상된 저장값을 복구하고 drawer에서 동작한다', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    window.localStorage.setItem('oneflow.sidebar.preferences.v1', '{broken')
  })
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')
  await page.getByRole('button', { name: '사이드바 열기' }).click()

  const drawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  const contextNav = drawer.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  await expect(contextNav.getByRole('link', { name: '초안' })).toBeVisible()
  await drawer.getByRole('button', { name: '내비게이션 사용자 지정' }).click()
  const customizer = page.getByRole('dialog', { name: '내비게이션 사용자 지정' })
  const customizerBox = await customizer.boundingBox()
  expect(customizerBox?.x).toBeGreaterThanOrEqual(0)
  expect((customizerBox?.x ?? 0) + (customizerBox?.width ?? 0)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/sidebar-resize-customize-ui/mobile-customize.png',
  })
  await customizer
    .getByRole('checkbox', { name: '개인 메모 표시' })
    .uncheck()
  await page.keyboard.press('Escape')
  await expect(customizer).toHaveCount(0)
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: '내비게이션 사용자 지정' })).toBeFocused()
  await expect(contextNav.getByRole('link', { name: '개인 메모' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('outer chrome과 floating content frame은 desktop과 mobile 구성을 유지한다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/projects')

  const header = page.getByRole('banner')
  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  const [headerBackground, railBackground] = await Promise.all([
    header.evaluate((element) => getComputedStyle(element).backgroundColor),
    globalNav.evaluate((element) => getComputedStyle(element).backgroundColor),
  ])
  expect(headerBackground).toBe(railBackground)

  const main = page.locator('main')
  const desktopBox = await main.boundingBox()
  expect(desktopBox?.y).toBe(44)
  expect((desktopBox?.x ?? 0) + (desktopBox?.width ?? 0)).toBe(1432)
  expect((desktopBox?.y ?? 0) + (desktopBox?.height ?? 0)).toBe(952)
  await expect(main).toHaveCSS('border-top-right-radius', '8px')
  await page.getByRole('button', { name: '사이드바 접기' }).click()
  await expect(main).toHaveCSS('border-top-left-radius', '8px')
  await expect(main).toHaveCSS('border-left-width', '1px')
  await page.waitForTimeout(250)
  const collapsedSlot = page.getByTestId('collapsed-sidebar-slot')
  const [collapsedMainBox, collapsedSlotBox] = await Promise.all([
    main.boundingBox(),
    collapsedSlot.boundingBox(),
  ])
  expect(Math.abs((collapsedSlotBox?.x ?? 0) - (collapsedMainBox?.x ?? 0))).toBeLessThanOrEqual(2)
  expect(collapsedSlotBox?.width).toBe(44)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/shell-header-workspace-switcher-ui/desktop-collapsed.png',
  })
  await page.getByRole('button', { name: '사이드바 펼치기' }).click()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/floating-shell-tools-ui/desktop-frame.png',
  })

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBox = await main.boundingBox()
  expect(mobileBox?.x).toBe(0)
  expect(mobileBox?.width).toBe(390)
  expect((mobileBox?.y ?? 0) + (mobileBox?.height ?? 0)).toBe(844)
  await expectNoHorizontalOverflow(page)
})

test('빠른 도구는 shell scroll region 이동 후에도 하단 작업과 충돌하지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/projects')
  const scrollRegion = page.locator('[data-shell-scroll-region]')
  await scrollRegion.evaluate((element) => {
    const spacer = document.createElement('div')
    spacer.style.height = '1200px'
    const action = document.createElement('button')
    action.type = 'button'
    action.setAttribute('aria-label', '스크롤 하단 작업')
    action.style.cssText = 'display:block;width:44px;height:44px;margin-left:auto;margin-right:12px;'
    element.append(spacer, action)
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  const action = page.getByRole('button', { name: '스크롤 하단 작업' })
  const dock = page.getByRole('button', { name: '빠른 도구 열기' })
  await expect(action).toBeVisible()
  const dockAvoidsAction = async () => {
    const [actionBox, dockBox] = await Promise.all([action.boundingBox(), dock.boundingBox()])
    if (!actionBox || !dockBox) return false
    return !(
      actionBox.x < dockBox.x + dockBox.width &&
      actionBox.x + actionBox.width > dockBox.x &&
      actionBox.y < dockBox.y + dockBox.height &&
      actionBox.y + actionBox.height > dockBox.y
    )
  }
  await expect.poll(dockAvoidsAction).toBe(true)
  await dock.click()
  const expandedDock = page.getByRole('navigation', { name: '빠른 도구' })
  const expandedDockAvoidsAction = async () => {
    const [actionBox, dockBox] = await Promise.all([action.boundingBox(), expandedDock.boundingBox()])
    if (!actionBox || !dockBox) return false
    return !(
      actionBox.x < dockBox.x + dockBox.width &&
      actionBox.x + actionBox.width > dockBox.x &&
      actionBox.y < dockBox.y + dockBox.height &&
      actionBox.y + actionBox.height > dockBox.y
    )
  }
  await expect.poll(expandedDockAvoidsAction).toBe(true)
  await expandedDock.getByRole('button', { name: '빠른 도구 닫기' }).click()
  await expect(dock).toBeFocused()
  await expect.poll(dockAvoidsAction).toBe(true)
})

test('Quick Dock은 phase 시작 icon 전환과 실제 높이 fold를 같은 timeline에서 실행한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/projects')
  // Keep the phase alive under parallel CI CPU stalls; this section drives
  // currentTime manually and explicitly finishes before the real-time path.
  await page.evaluate(() => document.documentElement.style.setProperty('--of-dock-motion-duration', '10s'))
  const scrollRegion = page.locator('[data-shell-scroll-region]')
  const geometry = await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  const trigger = page.getByRole('button', { name: '빠른 도구 열기' })
  const persistentToggle = page.getByTestId('quick-dock-toggle')
  const closedToggleBox = await persistentToggle.boundingBox()
  expect(closedToggleBox).not.toBeNull()
  await persistentToggle.evaluate((element) => {
    ;(window as Window & { __oneflowQuickDockToggle?: Element }).__oneflowQuickDockToggle = element
  })

  // Interrupted path: dock height, actions and the phase-start X rotate in the same opening frame.
  await trigger.click()
  const dock = page.getByRole('navigation', { name: '빠른 도구' })
  const openingIcon = dock.getByTestId('quick-dock-toggle-icon')
  const openingActions = dock.getByTestId('quick-dock-actions')
  const openingToggle = dock.getByRole('button', { name: '빠른 도구 닫기' })
  const firstAction = dock.getByRole('button', { name: '모든 메모 열기' })
  await expect(dock).toHaveAttribute('data-phase', 'opening')
  await expect(dock).toHaveCSS('animation-name', 'of-dock-enter')
  await expect(dock).toHaveCSS('animation-duration', '10s')
  await expect(openingIcon).toHaveAttribute('data-phase', 'opening')
  await expect(openingIcon.locator('[data-icon="close"]')).toHaveCount(1)
  await expect(openingIcon.locator('[data-icon="note"]')).toHaveCount(0)
  await expect(openingIcon).toHaveCSS('animation-name', 'of-dock-toggle-open')
  await expect(openingIcon).toHaveCSS('animation-duration', '10s')
  await expect(openingActions).toHaveCSS('animation-name', 'of-dock-actions-enter')
  await expect(openingActions).toHaveCSS('animation-duration', '10s')
  const openingTimeline = await dock.evaluate(async (element) => {
    const allAnimations = element.getAnimations({ subtree: true })
    const animations = allAnimations
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    const cssAnimations = allAnimations.filter((animation) => animation instanceof CSSAnimation)
    await Promise.all(animations.map((animation) => animation.ready))
    while (animations.some((animation) => Number(animation.currentTime) <= 0)) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    const startTimes = animations.map((animation) => Number(animation.startTime ?? 0))
    const progress = animations.map((animation) => Number(animation.currentTime) / Number(animation.effect?.getTiming().duration))
    return {
      count: animations.length,
      cssCount: cssAnimations.length,
      cssPaused: cssAnimations.every((animation) => animation.playState === 'paused'),
      skew: Math.max(...startTimes) - Math.min(...startTimes),
      progress,
    }
  })
  expect(openingTimeline.count).toBe(3)
  expect(openingTimeline.cssCount).toBe(3)
  expect(openingTimeline.cssPaused).toBe(true)
  expect(openingTimeline.skew).toBeLessThanOrEqual(1)
  expect(openingTimeline.progress.every((value) => value > 0 && value < 1)).toBe(true)
  expect(Math.max(...openingTimeline.progress) - Math.min(...openingTimeline.progress)).toBeLessThan(0.01)
  await expect(dock).toHaveCSS('pointer-events', 'none')
  await expect(openingToggle).toBeFocused()
  expect(await openingToggle.evaluate((element) => (
    window as Window & { __oneflowQuickDockToggle?: Element }
  ).__oneflowQuickDockToggle === element)).toBe(true)
  const openingToggleBox = await openingToggle.boundingBox()
  expect(openingToggleBox).not.toBeNull()
  expect(Math.abs((openingToggleBox!.x + openingToggleBox!.width / 2) - (closedToggleBox!.x + closedToggleBox!.width / 2))).toBeLessThanOrEqual(1)
  expect(Math.abs((openingToggleBox!.y + openingToggleBox!.height / 2) - (closedToggleBox!.y + closedToggleBox!.height / 2))).toBeLessThanOrEqual(1)
  expect(openingToggleBox!.width).toBe(closedToggleBox!.width)
  expect(openingToggleBox!.height).toBe(closedToggleBox!.height)
  await expect(firstAction).toBeDisabled()
  const openingStart = await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 0
    }
    const icon = element.querySelector<HTMLElement>('[data-testid="quick-dock-toggle-icon"]')!
    const actions = element.querySelector<HTMLElement>('[data-testid="quick-dock-actions"]')!
    return {
      iconTransform: getComputedStyle(icon).transform,
      icon: icon.querySelector('[data-icon="close"]')?.getAttribute('data-icon'),
      actions: Number.parseFloat(getComputedStyle(actions).opacity),
      height: Number.parseFloat(getComputedStyle(element).height),
      expandedHeight: element.scrollHeight,
    }
  })
  const openingEarly = await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    for (const animation of animations) animation.currentTime = 80
    const icon = element.querySelector<HTMLElement>('[data-testid="quick-dock-toggle-icon"]')!
    const actions = element.querySelector<HTMLElement>('[data-testid="quick-dock-actions"]')!
    return {
      iconTransform: getComputedStyle(icon).transform,
      icon: icon.querySelector('[data-icon="close"]')?.getAttribute('data-icon'),
      actions: Number.parseFloat(getComputedStyle(actions).opacity),
      height: Number.parseFloat(getComputedStyle(element).height),
    }
  })
  expect(openingEarly.iconTransform).not.toBe(openingStart.iconTransform)
  expect(openingStart.icon).toBe('close')
  expect(openingEarly.icon).toBe('close')
  expect(openingEarly.actions).toBeGreaterThan(openingStart.actions)
  expect(openingEarly.height).toBeGreaterThan(openingStart.height)
  expect(openingEarly.height).toBeLessThan(openingStart.expandedHeight)
  await dock.screenshot({
    path: '../../docs/screenshots/redevelopment/quick-dock-height-fold-ui/early-opening.png',
  })
  await openingToggle.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(dock).toHaveAttribute('data-phase', 'opening')
  await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 500
    }
  })
  const openingBlend = await openingIcon.evaluate((element) => ({
    icon: element.querySelector('[data-icon="close"]')?.getAttribute('data-icon'),
    height: Number.parseFloat(getComputedStyle(element.closest('[data-quick-dock-surface]')!).height),
    iconTransform: getComputedStyle(element).transform,
    actionsOpacity: Number.parseFloat(getComputedStyle(element.closest('[data-quick-dock-surface]')!.querySelector('[data-testid="quick-dock-actions"]')!).opacity),
    actionsTransform: getComputedStyle(element.closest('[data-quick-dock-surface]')!.querySelector('[data-testid="quick-dock-actions"]')!).transform,
  }))
  expect(openingBlend.icon).toBe('close')
  expect(openingBlend.height).toBeGreaterThan(openingStart.height)
  expect(openingBlend.height).toBeLessThan(openingStart.expandedHeight)
  expect(openingBlend.actionsOpacity).toBeGreaterThan(0)
  expect(openingBlend.actionsOpacity).toBeLessThan(1)
  expect(openingBlend.actionsTransform).not.toBe('none')
  await page.keyboard.press('Escape')
  const closeButton = dock.getByRole('button', { name: '빠른 도구 닫기' })
  const closingIcon = dock.getByTestId('quick-dock-toggle-icon')
  await expect(dock).toHaveAttribute('data-phase', 'closing')
  await expect(closingIcon.locator('[data-icon="note"]')).toHaveCount(1)
  await expect(closingIcon.locator('[data-icon="close"]')).toHaveCount(0)
  const closingTimeline = await dock.evaluate(async (element) => {
    const allAnimations = element.getAnimations({ subtree: true })
    const animations = allAnimations
      .filter((animation) => animation.id.startsWith('of-dock-phase-closing-'))
    const cssAnimations = allAnimations.filter((animation) => animation instanceof CSSAnimation)
    await Promise.all(animations.map((animation) => animation.ready))
    while (animations.some((animation) => Number(animation.currentTime) <= 0)) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    const startTimes = animations.map((animation) => Number(animation.startTime ?? 0))
    const progress = animations.map((animation) => Number(animation.currentTime) / Number(animation.effect?.getTiming().duration))
    return {
      count: animations.length,
      cssCount: cssAnimations.length,
      cssPaused: cssAnimations.every((animation) => animation.playState === 'paused'),
      skew: Math.max(...startTimes) - Math.min(...startTimes),
      progress,
    }
  })
  expect(closingTimeline.count).toBe(3)
  expect(closingTimeline.cssCount).toBe(3)
  expect(closingTimeline.cssPaused).toBe(true)
  expect(closingTimeline.skew).toBeLessThanOrEqual(1)
  expect(closingTimeline.progress.every((value) => value > 0 && value < 1)).toBe(true)
  expect(Math.max(...closingTimeline.progress) - Math.min(...closingTimeline.progress)).toBeLessThan(0.01)
  const reversalStart = await dock.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      height: Number.parseFloat(style.getPropertyValue('--of-dock-current-height')),
      iconTransform: style.getPropertyValue('--of-dock-toggle-current-transform').trim(),
      actionsOpacity: Number.parseFloat(style.getPropertyValue('--of-dock-actions-current-opacity')),
      actionsTransform: style.getPropertyValue('--of-dock-actions-current-transform').trim(),
    }
  })
  expect(reversalStart.height).toBeCloseTo(openingBlend.height, 1)
  expect(reversalStart.iconTransform).toBe(openingBlend.iconTransform)
  expect(reversalStart.actionsOpacity).toBeCloseTo(openingBlend.actionsOpacity, 2)
  expect(reversalStart.actionsTransform).toBe(openingBlend.actionsTransform)
  await expect(dock).toHaveCSS('animation-name', 'of-dock-exit')
  await expect(dock).toHaveCSS('animation-duration', '10s')
  await expect(closingIcon).toHaveAttribute('data-phase', 'closing')
  await expect(closingIcon).toHaveCSS('animation-name', 'of-dock-toggle-close')
  await expect(closingIcon).toHaveCSS('animation-duration', '10s')
  await expect(openingActions).toHaveCSS('animation-name', 'of-dock-actions-exit')
  await expect(openingActions).toHaveCSS('animation-duration', '10s')
  await expect(closeButton).toHaveAttribute('aria-disabled', 'true')
  await expect(closeButton).toBeFocused()
  await closeButton.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(closingIcon).toHaveAttribute('data-phase', 'closing')
  const closingEarly = await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-closing-'))
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 80
    }
    const icon = element.querySelector<HTMLElement>('[data-testid="quick-dock-toggle-icon"]')!
    const actions = element.querySelector<HTMLElement>('[data-testid="quick-dock-actions"]')!
    return {
      icon: icon.querySelector('[data-icon="note"]')?.getAttribute('data-icon'),
      iconTransform: getComputedStyle(icon).transform,
      actions: Number.parseFloat(getComputedStyle(actions).opacity),
      height: Number.parseFloat(getComputedStyle(element).height),
    }
  })
  expect(closingEarly.icon).toBe('note')
  expect(closingEarly.iconTransform).not.toBe(reversalStart.iconTransform)
  expect(closingEarly.actions).toBeLessThan(reversalStart.actionsOpacity)
  expect(closingEarly.height).toBeLessThan(reversalStart.height)
  expect(closingEarly.height).toBeGreaterThanOrEqual(openingStart.height)
  await dock.screenshot({
    path: '../../docs/screenshots/redevelopment/quick-dock-height-fold-ui/early-closing.png',
  })
  await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-closing-'))
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 500
    }
  })
  const closingBlend = await closingIcon.evaluate((element) => ({
    icon: element.querySelector('[data-icon="note"]')?.getAttribute('data-icon'),
    height: Number.parseFloat(getComputedStyle(element.closest('[data-quick-dock-surface]')!).height),
  }))
  expect(closingBlend.icon).toBe('note')
  expect(closingBlend.height).toBeLessThan(reversalStart.height)
  expect(closingBlend.height).toBeGreaterThanOrEqual(openingStart.height)
  await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-closing-'))
    for (const animation of animations) animation.finish()
  })
  await expect(dock).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger.getByTestId('quick-dock-toggle-icon')).toHaveAttribute('data-phase', 'closed')
  expect(await trigger.evaluate((element) => (
    window as Window & { __oneflowQuickDockToggle?: Element }
  ).__oneflowQuickDockToggle === element)).toBe(true)
  const closedAgainBox = await trigger.boundingBox()
  expect(closedAgainBox).not.toBeNull()
  expect(Math.abs((closedAgainBox!.x + closedAgainBox!.width / 2) - (closedToggleBox!.x + closedToggleBox!.width / 2))).toBeLessThanOrEqual(1)
  expect(Math.abs((closedAgainBox!.y + closedAgainBox!.height / 2) - (closedToggleBox!.y + closedToggleBox!.height / 2))).toBeLessThanOrEqual(1)

  // Completed path: animationend commits open/closed and preserves focus handoff.
  await page.evaluate(() => document.documentElement.style.setProperty('--of-dock-motion-duration', '1s'))
  await trigger.click()
  await expect(dock).toHaveAttribute('data-phase', 'opening')
  await expect(dock).toHaveAttribute('data-phase', 'open')
  await expect(dock.getByTestId('quick-dock-toggle-icon')).toHaveAttribute('data-phase', 'open')
  await expect(dock.getByRole('button', { name: '모든 메모 열기' })).toBeFocused()
  await dock.getByRole('button', { name: '빠른 도구 닫기' }).click()
  await expect(dock).toHaveAttribute('data-phase', 'closing')
  await expect(dock).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // A motion-preference change settles an in-flight phase instead of stranding the dock.
  await trigger.click()
  await expect(dock).toHaveAttribute('data-phase', 'opening')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(dock).toHaveAttribute('data-phase', 'open')
  await expect(dock.getByRole('button', { name: '모든 메모 열기' })).toBeFocused()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await dock.getByRole('button', { name: '빠른 도구 닫기' }).click()
  await expect(dock).toHaveAttribute('data-phase', 'closing')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(dock).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))).toEqual(geometry)

  // The default motion uses the observed 300ms interval for icon, actions and pill reveal.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => document.documentElement.style.removeProperty('--of-dock-motion-duration'))
  await trigger.click()
  await expect(dock).toHaveCSS('animation-duration', '0.3s')
  await expect(dock.getByTestId('quick-dock-toggle-icon')).toHaveCSS('animation-duration', '0.3s')
  await expect(dock.getByTestId('quick-dock-actions')).toHaveCSS('animation-duration', '0.3s')
  await expect(dock).toHaveAttribute('data-phase', 'open')
  await dock.getByRole('button', { name: '빠른 도구 닫기' }).click()
  await expect(dock.getByTestId('quick-dock-actions')).toHaveCSS('animation-name', 'of-dock-actions-exit')
  await expect(dock).toHaveCount(0)
})

test('Quick Dock은 opening 중 action 수가 바뀌어도 현재 높이에서 연속 retarget한다', async ({ page }) => {
  await mockApi(page)
  await page.unroute('**/api/v1/me/personal-notes**')
  let releaseNotes!: () => void
  const notesReady = new Promise<void>((resolve) => { releaseNotes = resolve })
  const note: PersonalNoteFixture = {
    id: 'late-note',
    title: '늦게 도착한 메모',
    body: '',
    color: 'mint',
    is_pinned: false,
    position: 0,
    version: 0,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  }
  await page.route('**/api/v1/me/personal-notes**', async (route) => {
    await notesReady
    await route.fulfill({ json: { items: [note], total: 1, limit: 200, offset: 0 } })
  })
  await page.goto('/projects')
  // The async action-count update is also driven manually, so keep its phase
  // alive independently of worker scheduling and finish it explicitly below.
  await page.evaluate(() => document.documentElement.style.setProperty('--of-dock-motion-duration', '10s'))
  const scrollRegion = page.locator('[data-shell-scroll-region]')
  const geometry = await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))

  await page.getByRole('button', { name: '빠른 도구 열기' }).click()
  const dock = page.getByRole('navigation', { name: '빠른 도구' })
  await expect(dock).toHaveAttribute('data-phase', 'opening')
  await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 200
    }
  })
  const heightBefore = await dock.evaluate((element) => Number.parseFloat(getComputedStyle(element).height))
  releaseNotes()
  await expect(dock.getByRole('button', { name: '현재 메모 열기' })).toBeVisible()

  const retarget = await dock.evaluate(async (element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    await Promise.all(animations.map((animation) => animation.ready))
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 0
    }
    const startTimes = animations.map((animation) => Number(animation.startTime ?? 0))
    const actions = element.querySelector<HTMLElement>('[data-testid="quick-dock-actions"]')!
    return {
      count: animations.length,
      skew: Math.max(...startTimes) - Math.min(...startTimes),
      height: Number.parseFloat(getComputedStyle(element).height),
      expectedHeight: 48 + actions.scrollHeight + 4,
      icon: element.querySelector('[data-icon="close"]')?.getAttribute('data-icon'),
    }
  })
  expect(retarget.count).toBe(3)
  expect(retarget.skew).toBeLessThanOrEqual(1)
  expect(retarget.height).toBeCloseTo(heightBefore, 1)
  expect(retarget.icon).toBe('close')

  await dock.evaluate((element) => {
    const animations = element.getAnimations({ subtree: true })
      .filter((animation) => animation.id.startsWith('of-dock-phase-opening-'))
    for (const animation of animations) animation.finish()
  })
  await expect(dock).toHaveAttribute('data-phase', 'open')
  await expect.poll(() => dock.evaluate((element) => Number.parseFloat(getComputedStyle(element).height)))
    .toBeCloseTo(retarget.expectedHeight, 1)
  expect(await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))).toEqual(geometry)
})

test('빠른 도구 dock은 개인 메모를 compact·expanded·modal 상태로 편집한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/projects')

  const trigger = page.getByRole('button', { name: '빠른 도구 열기' })
  const scrollRegion = page.locator('[data-shell-scroll-region]')
  const scrollGeometryBeforeOpen = await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  await trigger.click()
  const dock = page.getByRole('navigation', { name: '빠른 도구' })
  await expect(dock).toHaveAttribute('data-phase', 'open')
  expect(await scrollRegion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))).toEqual(scrollGeometryBeforeOpen)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/shell-motion-fidelity-ui/quick-dock.png',
  })
  await expect(dock.getByRole('button', { name: '모든 메모 열기' })).toBeFocused()
  const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/personal-notes'))
  await dock.getByRole('button', { name: '새 메모 만들기' }).click()
  expect((await createRequest).postDataJSON()).toMatchObject({ title: '', body: '', color: 'mint' })
  const quickCard = page.getByRole('article', { name: '제목 없는 메모' })
  await expect(quickCard).toBeVisible()
  await expect(quickCard.getByLabel('메모 제목')).toBeFocused()
  await quickCard.getByLabel('메모 제목').fill('Dock 메모')
  await quickCard.getByLabel('메모 내용').click()
  await quickCard.getByLabel('메모 내용').fill('현재 화면을 떠나지 않고 기록')
  const bodyPatch = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().includes('/personal-notes/note-1'))
  await dock.getByRole('button', { name: '현재 메모 열기' }).click()
  await bodyPatch
  await dock.getByRole('button', { name: '현재 메모 열기' }).click()
  await expect(page.getByRole('button', { name: '메모 크게 열기' })).toBeVisible()
  await page.getByRole('button', { name: '메모 크게 열기' }).click()
  await expect(page.getByRole('article', { name: 'Dock 메모' })).toBeVisible()

  await dock.getByRole('button', { name: '모든 메모 열기' }).click()
  const allNotes = page.getByRole('dialog', { name: '내 개인 메모' })
  await expect(allNotes.getByRole('article', { name: 'Dock 메모' })).toBeVisible()
  await allNotes.getByRole('button', { name: '모든 메모 검색' }).click()
  await allNotes.getByLabel('모든 메모 제목 검색').fill('없음')
  await expect(allNotes.getByText('일치하는 메모가 없습니다.')).toBeVisible()
  await allNotes.getByRole('button', { name: '모든 메모 검색 닫기' }).click()
  await expect(allNotes.getByRole('article', { name: 'Dock 메모' })).toBeVisible()
  const modalCard = allNotes.getByRole('article', { name: 'Dock 메모' })
  const formatRequest = page.waitForRequest((request) => {
    if (request.method() !== 'PATCH' || !request.url().includes('/personal-notes/note-1')) return false
    return ((request.postDataJSON() as { body?: string }).body ?? '').includes('**굵게**')
  })
  await modalCard.getByRole('button', { name: '굵게' }).click()
  await formatRequest
  const colorRequest = page.waitForRequest((request) => {
    if (request.method() !== 'PATCH' || !request.url().includes('/personal-notes/note-1')) return false
    return (request.postDataJSON() as { color?: string }).color === 'rose'
  })
  await modalCard.getByRole('button', { name: '메모 색상' }).click()
  await modalCard.getByRole('button', { name: 'rose 색상' }).click()
  await colorRequest
  await allNotes.getByRole('button', { name: '모든 메모 닫기' }).click()

  await dock.getByRole('button', { name: '새 메모 만들기' }).click()
  await expect(page.getByRole('article', { name: '제목 없는 메모' })).toBeVisible()
  await dock.getByRole('button', { name: '새 메모 만들기' }).click()
  await expect(page.getByRole('alert')).toContainText('내용이 없는 개인 메모가 이미 있습니다')
  await expect(page.getByTestId('quick-dock-safe-area')).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/quick-notes-dock-ui/desktop.png',
  })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-dock-expanded')).toHaveCSS('animation-name', 'of-dock-exit')
  await expect(trigger).toBeFocused()

  const viewerPage = await page.context().newPage()
  await mockApi(viewerPage)
  await viewerPage.setViewportSize({ width: 390, height: 844 })
  await viewerPage.goto('/projects')
  await viewerPage.getByRole('button', { name: '빠른 도구 열기' }).click()
  const viewerDock = viewerPage.getByRole('navigation', { name: '빠른 도구' })
  const dockBox = await viewerDock.boundingBox()
  expect((dockBox?.x ?? 0) + (dockBox?.width ?? 0)).toBeLessThanOrEqual(390)
  expect((dockBox?.y ?? 0) + (dockBox?.height ?? 0)).toBeLessThanOrEqual(844)
  await expectNoHorizontalOverflow(viewerPage)
  await viewerPage.screenshot({
    path: '../../docs/screenshots/redevelopment/quick-notes-dock-ui/mobile.png',
  })
  await viewerPage.getByRole('button', { name: '사이드바 열기' }).click()
  await expect(viewerPage.getByRole('navigation', { name: '빠른 도구' })).toHaveCount(0)
  await expect(viewerPage.getByRole('dialog', { name: '모바일 내비게이션' })).toBeVisible()
  await viewerPage.keyboard.press('Escape')
  await expect(viewerPage.getByRole('dialog', { name: '모바일 내비게이션' })).toHaveCount(0)
  await expect(viewerPage.getByRole('button', { name: '빠른 도구 열기' })).toBeVisible()
  await viewerPage.close()
})

test('AI rail은 실제 capability와 작업 요약 경로를 전용 workspace에 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/capabilities', (route) => route.fulfill({ json: { ai_summary_enabled: true } }))
  await page.route('**/api/v1/me/work', (route) => route.fulfill({
    json: {
      assigned_to_me: [{
        id: wpA.id,
        project_id: project.id,
        project_name: project.name,
        subject: wpA.subject,
        type: wpA.type,
        status: wpA.status,
        priority: wpA.priority,
        due_date: wpA.due_date,
        assignee_id: 'me-1',
        assignee_name: 'Dev User',
      }],
      due_soon: [],
      created_by_me: [],
      recent_activity: [],
    },
  }))
  await page.goto('/ai')

  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await expect(globalNav.getByRole('link', { name: 'AI' })).toHaveAttribute('aria-current', 'page')
  const aiNav = page.getByRole('navigation', { name: 'AI 컨텍스트 내비게이션' })
  await expect(aiNav.getByRole('link', { name: '작업 요약' })).toHaveAttribute('href', '/ai')
  await expect(aiNav.getByRole('link', { name: '요약 후보' })).toHaveAttribute('href', '/ai#summary-candidates')
  await expect(aiNav.getByRole('link', { name: 'AI 설정' })).toHaveAttribute('href', '/admin/ai')
  await expect(page.getByRole('heading', { name: '작업 요약' })).toBeVisible()
  await expect(page.getByText('AI 요약 사용 가능')).toBeVisible()
  const candidates = page.getByRole('region', { name: 'AI 요약 후보' })
  await expect(candidates.getByText(wpA.subject)).toBeVisible()
  await expect(candidates.getByRole('link', { name: new RegExp(wpA.subject) })).toHaveAttribute('href', `/projects/${project.id}/work-packages?wp=${wpA.id}`)

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/ai-central-composition-ui/desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await expect(page.getByRole('dialog', { name: '모바일 내비게이션' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/ai-central-composition-ui/mobile.png' })
})

test('Settings rail은 권한별 설정 navigation과 중앙 form을 중복 없이 연다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/users', (route) => route.fulfill({
    json: {
      items: [{
        id: 'me-1',
        email: 'dev@oneflow.local',
        display_name: 'Dev User',
        is_active: true,
        is_admin: true,
        created_at: '2026-07-01T00:00:00Z',
      }],
      total: 1,
    },
  }))
  await page.goto('/admin/users')

  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await expect(globalNav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  const settingsNav = page.getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })
  await expect(settingsNav.getByRole('link', { name: '내 계정' })).toHaveAttribute('href', '/settings')
  await expect(settingsNav.getByRole('link', { name: '사용자' })).toHaveAttribute('aria-current', 'page')
  await expect(settingsNav.getByRole('link', { name: 'Webhooks' })).toHaveAttribute('href', '/admin/webhooks')
  await expect(page.getByRole('button', { name: '새 작업' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible()
  const breadcrumb = page.getByRole('navigation', { name: '현재 위치' })
  await expect(breadcrumb.getByRole('link', { name: '워크스페이스 설정' })).toHaveAttribute('href', '/admin/general')
  await expect(page.getByTestId('frame-context-bar').getByText('사용자 관리', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/settings-central-composition-ui/desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await expect(page.getByRole('dialog', { name: '모바일 내비게이션' }).getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/settings-central-composition-ui/mobile.png' })
})

test('Wiki rail은 전용 context navigation과 중앙 lifecycle surface를 연다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/documents`)

  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await expect(globalNav.getByRole('link', { name: 'Wiki' })).toHaveAttribute('aria-current', 'page')

  const wikiNav = page.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' })
  await expect(wikiNav.getByRole('link', { name: '공유' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/documents`,
  )
  await expect(wikiNav.getByRole('link', { name: '비공개' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/documents?bucket=private`,
  )
  await expect(wikiNav.getByRole('link', { name: '보관됨' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/documents?bucket=archived`,
  )
  await expect(wikiNav.getByRole('link', { name: project.name })).toBeVisible()
  await expect(wikiNav.getByRole('button', { name: '새 작업' })).toHaveCount(0)

  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Wiki' })).toBeVisible()
  await expect(main.getByLabel('문서 제목 검색')).toBeVisible()
  await expect(main.getByText('공유 문서가 없습니다')).toBeVisible()

  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/wiki-central-composition-ui/desktop.png',
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const mobileNav = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await expect(mobileNav.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/wiki-central-composition-ui/mobile.png',
  })
})

test('Wiki global app은 capability와 무관하게 표시되고 비활성 상태를 안내한다', async ({ page }) => {
  await mockApi(page)
  let workspaceDocumentRequests = 0
  await page.route('**/api/v1/documents?**', (route) => {
    workspaceDocumentRequests += 1
    return route.fulfill({ json: { items: [], total: 0 } })
  })
  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({
      json: { ...defaultWorkspaceCapabilities, wiki: { enabled: false, revision: 2 } },
    }),
  )
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'me-1',
        email: 'dev@oneflow.local',
        display_name: 'Dev User',
        is_active: true,
        is_admin: false,
      },
    }),
  )
  await page.goto('/projects')

  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await expect(globalNav.getByRole('link', { name: 'Wiki' })).toHaveAttribute('href', '/wiki')
  await expect(globalNav.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  await globalNav.getByRole('link', { name: 'Wiki' }).click()
  await expect(page.getByText('Wiki가 비활성화되어 있습니다')).toBeVisible()
  expect(workspaceDocumentRequests).toBe(0)
})

test('Wiki global app은 zero-project workspace에서도 desktop과 mobile context tree를 유지한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies ProjectList }),
  )
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/projects')

  const globalNav = page.getByRole('navigation', { name: '글로벌 내비게이션' })
  await globalNav.getByRole('link', { name: 'Wiki' }).click()
  await expect(page).toHaveURL('/wiki')
  const wikiNav = page.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' })
  await expect(wikiNav.getByRole('link', { name: '공유' })).toHaveAttribute('href', '/wiki')
  await expect(wikiNav.getByRole('link', { name: '비공개' })).toHaveAttribute('href', '/wiki?bucket=private')
  await expect(wikiNav.getByText('접근 가능한 프로젝트가 없습니다.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Wiki 홈' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await expect(
    page.getByRole('dialog', { name: '모바일 내비게이션' }).getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' }),
  ).toBeVisible()
})

test('Wiki home은 접근 가능한 프로젝트 문서를 범위·검색·프로젝트 필터로 탐색한다', async ({ page }) => {
  await mockApi(page)
  const secondProject = {
    ...project,
    ...projectRollups,
    id: '99999999-9999-4999-8999-999999999999',
    key: 'OPS',
    name: '운영 개선',
  }
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { items: [{ ...project, ...projectRollups }, secondProject], total: 2 } satisfies ProjectList }),
  )
  await page.route('**/api/v1/documents?**', (route) => {
    const url = new URL(route.request().url())
    const bucket = url.searchParams.get('bucket') ?? 'shared'
    const items: DocumentList['items'] = bucket === 'shared'
      ? [
        {
          id: 'doc-one',
          project_id: project.id,
          parent_id: null,
          title: '제품 정책',
          author_id: 'me-1',
          visibility: 'shared',
          archived_at: null,
          archived_by_user_id: null,
          archived_by_name: null,
          version: 1,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-12T02:00:00Z',
        },
        {
          id: 'doc-ops',
          project_id: secondProject.id,
          parent_id: null,
          title: '운영 매뉴얼',
          author_id: 'me-1',
          visibility: 'shared',
          archived_at: null,
          archived_by_user_id: null,
          archived_by_name: null,
          version: 1,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-11T02:00:00Z',
        },
      ]
      : []
    route.fulfill({ json: { items, total: items.length } satisfies DocumentList })
  })

  await page.goto('/wiki')
  const wikiHome = page.getByRole('region', { name: 'Wiki 홈' })
  await expect(wikiHome.getByRole('link', { name: /제품 정책/ })).toHaveAttribute(
    'href',
    `/projects/${project.id}/documents/doc-one`,
  )
  await expect(wikiHome.getByRole('link', { name: /운영 매뉴얼/ })).toBeVisible()

  await wikiHome.getByRole('textbox', { name: 'Wiki 검색' }).fill('운영')
  await expect(wikiHome.getByRole('link', { name: /제품 정책/ })).toHaveCount(0)
  await expect(wikiHome.getByRole('link', { name: /운영 매뉴얼/ })).toBeVisible()

  await wikiHome.getByRole('textbox', { name: 'Wiki 검색' }).fill('')
  await wikiHome.getByRole('combobox', { name: 'Wiki 프로젝트 필터' }).selectOption(project.id)
  await expect(wikiHome.getByRole('link', { name: /제품 정책/ })).toBeVisible()
  await expect(wikiHome.getByRole('link', { name: /운영 매뉴얼/ })).toHaveCount(0)

  await wikiHome.getByRole('button', { name: '비공개' }).click()
  await expect(page).toHaveURL('/wiki?bucket=private')
  await expect(wikiHome.getByText('비공개 문서가 없습니다')).toBeVisible()

  await page.goto('/wiki?bucket=unknown')
  await expect(
    page.getByRole('navigation', { name: 'Wiki 컨텍스트 내비게이션' }).getByRole('link', { name: '공유' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(wikiHome.getByRole('button', { name: '공유' })).toHaveAttribute('aria-current', 'page')
})

test('모바일 앱 셸에서 사이드바가 drawer로 열린다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/projects/${project.id}/work-packages`)

  await expect(page.getByTestId('frame-context-bar').getByText('Work Packages', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/view-controls/mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '사이드바 열기' }).click()

  const drawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'Projects' })).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'Wiki' })).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'AI' })).toBeVisible()
  await expect(drawer.getByRole('link', { name: 'Settings' }).first()).toBeVisible()
  await expect(drawer.getByRole('link', { name: /Board/ })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/ui-shell/mobile-drawer.png',
    fullPage: true,
  })

  await drawer.getByRole('link', { name: /Board/ }).click()
  await expect(drawer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
})

test('개인 메모는 모바일 sidebar/home entry에서 생성·편집·고정·순서·삭제 요청을 연결한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.goto('/my')
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await page.getByRole('dialog', { name: '모바일 내비게이션' }).getByRole('link', { name: '개인 메모' }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(page.getByText('첫 개인 메모를 남겨보세요.')).toBeVisible()

  const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/personal-notes'))
  await page.getByRole('button', { name: '새 메모' }).first().click()
  expect((await createRequest).postDataJSON()).toMatchObject({ title: '', body: '', color: 'mint' })
  const firstCard = page.getByRole('article', { name: '제목 없는 메모' })
  await firstCard.getByLabel('메모 제목').fill('모바일 메모')
  await firstCard.getByLabel('메모 내용').click()
  await firstCard.getByLabel('메모 내용').fill('plain text body')
  const bodyPatch = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().includes('/personal-notes/note-1'))
  await page.getByRole('heading', { name: '개인 메모' }).click()
  await bodyPatch
  await expect(page.getByRole('article', { name: '모바일 메모' })).toBeVisible()

  const pinRequest = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().includes('/personal-notes/note-1'))
  await page.getByRole('button', { name: '고정', exact: true }).click()
  expect((await pinRequest).postDataJSON()).toMatchObject({ is_pinned: true })
  await page.getByRole('button', { name: '새 메모' }).first().click()
  const secondCard = page.getByRole('article', { name: '제목 없는 메모' })
  await secondCard.getByLabel('메모 제목').fill('두번째 메모')
  const secondBodyPatch = page.waitForRequest((request) => {
    if (request.method() !== 'PATCH' || !request.url().includes('/personal-notes/note-2')) return false
    return (request.postDataJSON() as { body?: string }).body === '두번째 내용'
  })
  await secondCard.getByLabel('메모 내용').fill('두번째 내용')
  await page.getByRole('heading', { name: '개인 메모' }).click()
  await secondBodyPatch
  await expect(page.getByRole('article', { name: '두번째 메모' })).toBeVisible()
  const secondPin = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().includes('/personal-notes/note-2'))
  await page.getByRole('article', { name: '두번째 메모' }).getByRole('button', { name: '고정', exact: true }).click()
  await secondPin
  const orderRequest = page.waitForRequest((request) => request.method() === 'PUT' && request.url().includes('/personal-notes/order'))
  await page.getByRole('button', { name: '위로 이동' }).nth(1).click()
  const orderBody = (await orderRequest).postDataJSON() as { items: Array<{ id: string; expected_version: number }> }
  expect(orderBody.items.map((item) => item.id)).toEqual(expect.arrayContaining(['note-1', 'note-2']))

  page.once('dialog', (dialog) => dialog.accept())
  const deleteRequest = page.waitForRequest((request) => request.method() === 'DELETE' && request.url().includes('/personal-notes/note-1'))
  await page.getByRole('article', { name: '모바일 메모' }).getByRole('button', { name: '메모 삭제' }).click()
  await deleteRequest
  await expect(page.getByRole('article', { name: '두번째 메모' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/personal-notes-ui/mobile.png', fullPage: true })
})

test('개인 메모 새 메모는 검색에 숨은 기존 빈 메모를 복원해 포커스한다', async ({ page }) => {
  await mockApi(page)
  let createCount = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/personal-notes')) createCount += 1
  })
  await page.goto('/notes')
  await page.getByRole('button', { name: '새 메모' }).first().click()
  await expect(page.getByLabel('메모 제목', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: '메모 검색' }).click()
  await page.getByLabel('메모 제목 검색').fill('숨김')
  await expect(page.getByText('일치하는 메모가 없습니다.')).toBeVisible()

  await page.getByRole('button', { name: '새 메모' }).first().click()

  await expect(page.getByLabel('메모 제목 검색')).toHaveValue('')
  await expect(page.getByLabel('메모 제목', { exact: true })).toBeFocused()
  expect(createCount).toBe(1)
})

test('개인 메모 목록 오류는 재시도로 독립 복구한다', async ({ page }) => {
  await mockApi(page)
  await page.unroute('**/api/v1/me/personal-notes**')
  let calls = 0
  await page.route('**/api/v1/me/personal-notes**', async (route) => {
    calls += 1
    // Initial fetch plus one automatic retry fail; the explicit retry recovers.
    if (calls <= 2) {
      await route.fulfill({ status: 500, json: { detail: 'notes unavailable' } })
      return
    }
    await route.fulfill({ json: { items: [], total: 0, limit: 200, offset: 0 } })
  })
  await page.goto('/notes')
  await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다')
  const retryRequest = page.waitForRequest((request) => request.url().includes('/api/v1/me/personal-notes'))
  await page.getByRole('button', { name: '다시 시도' }).click()
  await retryRequest
  await expect(page.getByText('첫 개인 메모를 남겨보세요.')).toBeVisible()
})

test('개인 메모 충돌은 초안을 보존하고 최신 버전으로 명시적 재저장한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/notes')
  await page.getByRole('button', { name: '새 메모' }).first().click()
  const card = page.getByRole('article', { name: '제목 없는 메모' })
  await card.getByLabel('메모 제목').fill('충돌 메모')
  await card.getByLabel('메모 내용').click()
  await card.getByLabel('메모 내용').fill('처음 내용')
  const initialBodyPatch = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().includes('/personal-notes/note-1'))
  await page.getByRole('heading', { name: '개인 메모' }).click()
  await initialBodyPatch

  let conflictPending = true
  const current = {
    id: 'note-1',
    title: '서버에서 바뀐 제목',
    body: '서버 최신 내용',
    color: 'lavender',
    is_pinned: false,
    position: 0,
    version: 1,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:01:00Z',
  }
  await page.route('**/api/v1/me/personal-notes/note-1', async (route) => {
    if (route.request().method() === 'PATCH' && conflictPending) {
      conflictPending = false
      await route.fulfill({
        status: 409,
        json: { detail: 'note was changed elsewhere', current },
      })
      return
    }
    await route.fallback()
  })

  await page.getByRole('article', { name: '충돌 메모' }).getByLabel('메모 제목').fill('보존할 내 초안')
  await page.getByRole('heading', { name: '개인 메모' }).click()
  await expect(page.getByRole('alert')).toContainText('작성 중인 내용은 유지됩니다')
  await expect(page.getByLabel('메모 제목', { exact: true })).toHaveValue('보존할 내 초안')

  const overwriteRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' && request.url().includes('/personal-notes/note-1'),
  )
  await page.getByRole('button', { name: '내 내용으로 다시 저장' }).click()
  expect((await overwriteRequest).postDataJSON()).toMatchObject({
    expected_version: 1,
    title: '보존할 내 초안',
  })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('article', { name: '보존할 내 초안' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/personal-notes-ui/desktop.png',
    fullPage: true,
  })
})

test('사용자 전환 로그인은 이전 사용자의 개인 메모 캐시를 즉시 제거한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({
    json: {
      auth_mode: 'dev',
      oidc_issuer: null,
      oidc_client_id: null,
      has_client_secret: false,
      command_palette_enabled: false,
      session_management_enabled: true,
      password_required: true,
    },
  }))
  await page.unroute('**/api/v1/me/personal-notes**')
  let identity: 'a' | 'b' = 'a'
  let releaseUserB: (() => void) | undefined
  let markUserBRequested: (() => void) | undefined
  const userBGate = new Promise<void>((resolve) => {
    releaseUserB = resolve
  })
  const userBRequested = new Promise<void>((resolve) => {
    markUserBRequested = resolve
  })

  await page.route('**/api/v1/me/personal-notes**', async (route) => {
    if (identity === 'a') {
      await route.fulfill({
        json: {
          items: [
            {
              id: 'user-a-note',
              title: 'A 사용자 비공개 메모',
              body: 'A 사용자만 볼 수 있음',
              color: 'lavender',
              is_pinned: false,
              position: 0,
              version: 0,
              created_at: '2026-07-10T00:00:00Z',
              updated_at: '2026-07-10T00:00:00Z',
            },
          ],
          total: 1,
          limit: 200,
          offset: 0,
        },
      })
      return
    }
    markUserBRequested?.()
    await userBGate
    await route.fulfill({ json: { items: [], total: 0, limit: 200, offset: 0 } })
  })
  await page.route('**/api/v1/auth/login', async (route) => {
    identity = 'b'
    await route.fulfill({
      json: { user_id: 'user-b', email: 'user-b@oneflow.local', display_name: 'User B' },
    })
  })

  await page.goto('/notes')
  await expect(page.getByRole('article', { name: 'A 사용자 비공개 메모' })).toBeVisible()
  await page.goto('/login?next=/notes')
  await page.getByLabel('Email address').fill('user-b@oneflow.local')
  await page.getByLabel('Password', { exact: true }).fill('development-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await userBRequested
  await expect(page.getByText('A 사용자 비공개 메모')).toHaveCount(0)

  releaseUserB?.()
  await expect(page.getByText('첫 개인 메모를 남겨보세요.')).toBeVisible()
})

test('새 작업 생성 composer는 모바일에서 핵심 속성과 payload를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    const sent = route.request().postDataJSON() as Partial<WorkPackage>
    await route.fulfill({
      status: 201,
      json: {
        ...wpA,
        id: 'created-mobile',
        subject: sent.subject,
        type: sent.type ?? 'task',
        status: sent.status ?? 'backlog',
        priority: sent.priority ?? 'none',
        assignee_id: sent.assignee_id ?? null,
        due_date: sent.due_date ?? null,
      },
    })
  })

  await page.goto(`/projects/${project.id}/work-packages?new=1`)
  const composer = page.getByRole('region', { name: '새 작업 생성' })
  await expect(composer.getByText('제목 필수')).toBeVisible()
  await expect(composer.getByLabel('타입')).toBeVisible()
  await expect(composer.getByLabel('상태')).toBeVisible()
  await expect(composer.getByLabel('우선순위')).toBeVisible()
  await expect(composer.getByLabel('담당자')).toBeVisible()
  await expect(composer.getByRole('button', { name: '작업 만들기' })).toBeDisabled()

  await composer.getByLabel('작업 제목').fill('모바일 생성 표면')
  await composer.getByLabel('타입').selectOption('feature')
  await composer.getByLabel('상태').selectOption('todo')
  await composer.getByLabel('우선순위').selectOption('high')
  await composer.getByLabel('담당자').selectOption('me-1')
  await composer.getByLabel('기한').fill('2026-07-31')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/work-item-create-ui/mobile.png',
    fullPage: true,
  })

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith(`/projects/${project.id}/work-packages`),
  )
  await composer.getByRole('button', { name: '작업 만들기' }).click()
  const body = (await post).postDataJSON() as {
    subject: string
    type: string
    status: string
    priority: string
    assignee_id: string
    due_date: string
  }
  expect(body).toMatchObject({
    subject: '모바일 생성 표면',
    type: 'feature',
    status: 'todo',
    priority: 'high',
    assignee_id: 'me-1',
    due_date: '2026-07-31',
  })
  await expect(composer).toBeHidden()
})

test('Workspace Views가 Board·Table·scope·filter·sort를 같은 결과 계약으로 연결한다', async ({ page }) => {
  test.setTimeout(45_000)
  await mockApi(page)
  await page.goto('/work-items')

  await expect(page.getByRole('heading', { name: 'All work items' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Views' })).toHaveAttribute('href', '/work-items')
  await expect(page.getByLabel('전체 작업 Board')).toBeVisible()
  await expect(page.getByLabel('Backlog 컬럼')).toBeVisible()
  await expect(page.getByLabel('Started 컬럼', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('운영 개선')).toBeVisible()
  await page.getByRole('button', { name: 'Display' }).click()
  await page.getByRole('menuitemradio', { name: '우선순위', exact: true }).click()
  await expect(page).toHaveURL(/group_by=priority/)
  await expect(page.getByLabel('긴급 컬럼')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-views-ui/desktop-board.png',
  })

  await page.getByRole('button', { name: 'Table 레이아웃' }).click()
  await expect(page).toHaveURL(/layout=table/)
  await expect(page.getByRole('columnheader', { name: '프로젝트' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '수정일' })).toBeVisible()
  await expect(page.getByText('Dev User')).toBeVisible()
  await page.getByRole('button', { name: 'Display' }).click()
  await page.getByRole('menuitemradio', { name: '조밀하게' }).click()
  await expect(page.getByLabel('전체 작업 표 스크롤 영역')).toHaveAttribute('data-density', 'compact')
  await page.getByRole('button', { name: 'Display' }).click()
  await page.getByRole('menuitemcheckbox', { name: '수정일' }).click()
  await page.getByRole('menuitemcheckbox', { name: '작업 ID 표시' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('columnheader', { name: '수정일' })).toHaveCount(0)
  await expect(page.getByText(`${project.key}-${wpA.id.replaceAll('-', '').slice(0, 6).toUpperCase()}`)).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-views-ui/desktop-table.png',
  })

  const statusSortRequest = page.waitForRequest((request) =>
    new URL(request.url()).searchParams.get('sort') === 'status_asc',
  )
  await page.getByRole('button', { name: '상태 열 정렬' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'A → Z' })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Z → A' })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-column-menus-ui/desktop-status.png',
  })
  await page.getByRole('menuitemradio', { name: 'A → Z' }).click()
  await statusSortRequest
  await expect(page).toHaveURL(/sort=status_asc/)
  await expect(page.getByRole('columnheader', { name: '상태 열 정렬' })).toHaveAttribute('aria-sort', 'ascending')

  const prioritySortRequest = page.waitForRequest((request) =>
    new URL(request.url()).searchParams.get('sort') === 'priority_desc',
  )
  await page.getByRole('button', { name: '우선순위 열 정렬' }).click()
  await expect(page.getByRole('menuitemradio', { name: '없음 → 긴급' })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: '긴급 → 없음' })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-column-menus-ui/desktop-priority.png',
  })
  await page.getByRole('menuitemradio', { name: '긴급 → 없음' }).click()
  await prioritySortRequest
  await expect(page).toHaveURL(/sort=priority_desc/)
  await expect(page.getByRole('columnheader', { name: '우선순위 열 정렬' })).toHaveAttribute('aria-sort', 'descending')

  const assignedRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/search/work-packages') && url.searchParams.get('scope') === 'assigned'
  })
  await page.getByLabel('작업 범위').selectOption('assigned')
  await assignedRequest
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toHaveCount(0)

  await page.getByRole('button', { name: '필터' }).click()
  const priorityRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get('priority') === 'high')
  await page.getByLabel('우선순위 필터').selectOption('high')
  await priorityRequest
  const dueRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get('sort') === 'due')
  await page.getByRole('button', { name: 'Display' }).click()
  await page.getByRole('menuitemradio', { name: '기한 빠른순' }).click()
  await dueRequest
  await expect(page).toHaveURL(/priority=high/)
  await expect(page).toHaveURL(/sort=due/)
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByLabel('우선순위 필터')).toHaveValue('all')
  await expect(page).toHaveURL(/sort=due/)
  await page.goto('/work-items?layout=table&density=compact')
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeVisible()

  const req = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/search/work-packages') &&
      url.searchParams.get('scope') === 'all' &&
      url.searchParams.get('q') === '보드'
  })
  await page.getByLabel('전체 작업 검색어').fill('보드')
  await page.getByRole('button', { name: '검색', exact: true }).click()
  await req
  await expect(page).toHaveURL(/q=%EB%B3%B4%EB%93%9C/)
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Board 레이아웃' }).click()
  await expect(page.getByLabel('Backlog 컬럼')).toHaveAttribute('data-density', 'compact')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('전체 작업 검색어')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-views-ui/mobile-board.png',
  })
  await page.getByRole('button', { name: '보드 뷰 구현' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpB.id}`))
})

test('Workspace Board 상태 이동은 반환된 version으로 다음 PATCH를 이어간다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await page.goto('/work-items')

  const statePatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  const stateResponse = page.waitForResponse((response) =>
    response.request().method() === 'PATCH' && response.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await page.getByRole('button', { name: /워크패키지 API 구현/ }).dragTo(page.getByLabel('Started 컬럼', { exact: true }))
  expect((await statePatch).postDataJSON()).toEqual({ expected_version: 0, status: 'in_progress' })
  await stateResponse
  const movedCard = page.getByLabel('Started 컬럼', { exact: true }).getByRole('button', { name: /워크패키지 API 구현/ })
  await expect(movedCard).toBeVisible()
  await expect(movedCard).toHaveAttribute('aria-busy', 'false')

  const backlogPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await movedCard.dragTo(page.getByLabel('Backlog 컬럼'))
  expect((await backlogPatch).postDataJSON()).toEqual({ expected_version: 1, status: 'backlog' })
  await expect(page.getByLabel('Backlog 컬럼').getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-board-drag-ui/desktop.png',
  })

  await page.goto('/work-items?group_by=project')
  await expect(page.getByRole('button', { name: /워크패키지 API 구현/ })).not.toHaveAttribute('draggable', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-board-drag-ui/mobile-project-group.png',
  })
})

test('Workspace Board 우선순위 그룹은 정확한 priority 값으로 이동한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/work-items?group_by=priority')

  const priorityPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  const card = page.getByRole('button', { name: /워크패키지 API 구현/ })
  const lowColumn = page.getByLabel('낮음 컬럼')
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await card.dispatchEvent('dragstart', { dataTransfer })
  await lowColumn.dispatchEvent('dragover', { dataTransfer })
  await expect(lowColumn).toHaveAttribute('data-drop-active', 'true')
  await lowColumn.dispatchEvent('drop', { dataTransfer })
  await card.dispatchEvent('dragend', { dataTransfer })
  const priorityRequest = await priorityPatch
  expect(priorityRequest.postDataJSON()).toEqual({ expected_version: 0, priority: 'low' })
  await expect(page.getByLabel('낮음 컬럼').getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()
})

test('Workspace Board 이동 실패는 원래 그룹으로 복구되고 재시도할 수 있다', async ({ page }) => {
  await mockApi(page)
  let failFirstPatch = true
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() === 'PATCH' && failFirstPatch) {
      failFirstPatch = false
      await route.fulfill({ status: 503, json: { detail: '일시적으로 저장할 수 없습니다' } })
      return
    }
    await route.fallback()
  })
  await page.goto('/work-items')

  await page.getByRole('button', { name: /워크패키지 API 구현/ }).dragTo(page.getByLabel('Started 컬럼', { exact: true }))
  await expect(page.getByRole('alert')).toContainText('이동 실패')
  await expect(page.getByLabel('Unstarted 컬럼').getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()

  const retryPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await page.getByRole('button', { name: '재시도' }).click()
  expect((await retryPatch).postDataJSON()).toEqual({ expected_version: 0, status: 'in_progress' })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Started 컬럼', { exact: true }).getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()
})

test('Workspace Board 충돌은 서버 현재값을 복원하고 viewer 카드는 이동을 노출하지 않는다', async ({ page }) => {
  await mockApi(page, { conflictOnPatch: true })
  await page.goto('/work-items')

  await page.getByRole('button', { name: /워크패키지 API 구현/ }).dragTo(page.getByLabel('Started 컬럼', { exact: true }))
  await expect(page.getByRole('alert')).toContainText('이동 실패')
  await expect(page.getByLabel('Completed 컬럼').getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()

  await page.route('**/api/v1/search/work-packages**', (route) =>
    route.fulfill({
      json: {
        query: '',
        total: 1,
        items: [{ ...allWorkItems.items[0], current_user_can_write: false }],
      },
    }),
  )
  await page.goto('/work-items')
  await expect(page.getByRole('button', { name: /워크패키지 API 구현/ })).not.toHaveAttribute('draggable', 'true')
})

test('Workspace Display URL은 손상된 그룹·열·표시 값을 canonical state로 복구한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/work-items?layout=table&group_by=unknown&columns=status,status,unknown&show_empty_groups=yes&show_ids=no&sort=unknown')

  await expect(page).not.toHaveURL(/group_by=/)
  await expect(page).toHaveURL(/columns=status/)
  await expect(page).not.toHaveURL(/show_empty_groups=/)
  await expect(page).not.toHaveURL(/show_ids=/)
  await expect(page).not.toHaveURL(/sort=/)
  await expect(page.getByRole('columnheader', { name: '상태' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '프로젝트' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '상태 열 정렬' }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-column-menus-ui/mobile-status.png',
  })
})

test('Workspace Views 열 순서는 표·URL·private saved view에서 동일하게 왕복한다', async ({ page }) => {
  test.setTimeout(45_000)
  await mockApi(page)
  await page.route('**/api/v1/search/work-packages**', async (route) => {
    const request = route.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/search/work-packages')) {
      await route.fulfill({ json: { ...allWorkItems, total: 51 } })
      return
    }
    await route.fallback()
  })
  await page.goto('/work-items?layout=table&columns=due,status,project&page=2')

  const headerLabels = async () => page.getByRole('columnheader').allTextContents()
  await expect.poll(headerLabels).toEqual(['작업', '기한', '상태', '프로젝트'])
  const firstRowCells = page.locator('tbody tr').first().getByRole('cell')
  await expect(firstRowCells.nth(1)).toContainText('2026')
  await expect(firstRowCells.nth(2)).toContainText('할 일')
  await expect(firstRowCells.nth(3)).toContainText('ONE')

  const display = page.getByRole('button', { name: 'Display' })
  await display.click()
  await page.getByRole('menuitem', { name: '열 순서 변경' }).click()
  const orderDialog = page.getByRole('dialog', { name: '열 순서 변경' })
  await expect(orderDialog).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-column-order-ui/desktop.png',
  })

  await expect(orderDialog.getByRole('button', { name: '기한 위로 이동' })).toBeDisabled()
  await expect(orderDialog.getByRole('button', { name: '프로젝트 아래로 이동' })).toBeDisabled()
  await orderDialog.getByRole('button', { name: '상태 위로 이동' }).click()
  await expect(orderDialog.getByRole('button', { name: '상태 아래로 이동' })).toBeFocused()
  expect(new URL(page.url()).searchParams.get('columns')).toBe('status,due,project')
  expect(new URL(page.url()).searchParams.get('page')).toBe('2')
  await page.keyboard.press('Escape')
  await expect(orderDialog).toBeHidden()
  await expect(display).toBeFocused()
  await expect.poll(headerLabels).toEqual(['작업', '상태', '기한', '프로젝트'])
  await expect(firstRowCells.nth(1)).toContainText('할 일')
  await expect(firstRowCells.nth(2)).toContainText('2026')
  await expect(firstRowCells.nth(3)).toContainText('ONE')

  await page.getByRole('button', { name: 'Add view' }).click()
  const saveDialog = page.getByRole('dialog', { name: '작업영역 뷰 저장' })
  await saveDialog.getByLabel('뷰 이름').fill('열 순서 뷰')
  const createRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/api/v1/me/workspace-views'),
  )
  await saveDialog.getByRole('button', { name: '저장', exact: true }).click()
  const createdBody = (await createRequest).postDataJSON() as { params: WorkspaceSavedViewParams }
  expect(createdBody.params.columns).toEqual(['status', 'due', 'project'])

  await display.click()
  await page.getByRole('menuitem', { name: '열 순서 변경' }).click()
  await orderDialog.getByRole('button', { name: '프로젝트 위로 이동' }).click()
  await orderDialog.getByRole('button', { name: '열 순서 닫기' }).click()
  expect(new URL(page.url()).searchParams.get('columns')).toBe('status,project,due')
  await expect.poll(headerLabels).toEqual(['작업', '상태', '프로젝트', '기한'])

  const updateRequest = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().includes('/api/v1/me/workspace-views/'),
  )
  await page.getByRole('button', { name: '갱신' }).click()
  const updatedBody = (await updateRequest).postDataJSON() as { params: WorkspaceSavedViewParams }
  expect(updatedBody.params.columns).toEqual(['status', 'project', 'due'])

  await display.click()
  await page.getByRole('menuitem', { name: '열 순서 변경' }).click()
  await orderDialog.getByRole('button', { name: '상태 아래로 이동' }).click()
  await page.keyboard.press('Escape')
  expect(new URL(page.url()).searchParams.get('columns')).toBe('project,status,due')
  await page.getByRole('button', { name: '되돌리기' }).click()
  expect(new URL(page.url()).searchParams.get('columns')).toBe('status,project,due')
  await expect.poll(headerLabels).toEqual(['작업', '상태', '프로젝트', '기한'])

  await page.setViewportSize({ width: 390, height: 844 })
  await display.click()
  await page.getByRole('menuitem', { name: '열 순서 변경' }).click()
  await expect(orderDialog).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-column-order-ui/mobile.png',
  })
  await orderDialog.getByRole('button', { name: '열 순서 닫기' }).click()
  await expect(display).toBeFocused()
})

test('Workspace Table 상태·우선순위 셀은 CAS PATCH와 갱신된 version을 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/work-items?layout=table&columns=status,priority')

  const statusPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await page.getByRole('button', { name: '상태 변경: 할 일' }).click()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-inline-properties-ui/desktop-editor.png',
  })
  await page.getByRole('menuitemradio', { name: '완료' }).click()
  const statusBody = (await statusPatch).postDataJSON() as {
    expected_version: number
    status: string
  }
  expect(statusBody).toEqual({ expected_version: 0, status: 'done' })
  await expect(page.getByRole('button', { name: '상태 변경: 완료' })).toBeVisible()

  const priorityPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await page.getByRole('button', { name: '우선순위 변경: 높음' }).click()
  await page.getByRole('menuitemradio', { name: '낮음' }).click()
  const priorityBody = (await priorityPatch).postDataJSON() as {
    expected_version: number
    priority: string
  }
  expect(priorityBody).toEqual({ expected_version: 1, priority: 'low' })
  await expect(page.getByRole('button', { name: '우선순위 변경: 낮음' })).toBeVisible()
})

test('Workspace Table viewer property cells remain read only', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/search/work-packages**', (route) =>
    route.fulfill({
      json: {
        query: '',
        total: 1,
        items: [{ ...allWorkItems.items[0], current_user_can_write: false }],
      },
    }),
  )
  await page.goto('/work-items?layout=table&columns=status,priority')

  await expect(page.getByRole('button', { name: /상태 변경/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /우선순위 변경/ })).toHaveCount(0)
  await expect(page.getByText('할 일')).toBeVisible()
  await expect(page.getByText('높음')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-inline-properties-ui/mobile-viewer.png',
  })
})

test('Workspace Table 409 conflict refreshes the property and keeps visible feedback', async ({ page }) => {
  await mockApi(page, { conflictOnPatch: true })
  await page.goto('/work-items?layout=table&columns=status')

  await page.getByRole('button', { name: '상태 변경: 할 일' }).click()
  await page.getByRole('menuitemradio', { name: '완료' }).click()
  await expect(page.getByRole('button', { name: '상태 변경: 완료' })).toBeVisible()
  await expect(page.getByLabel(/상태 저장 실패:/)).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-inline-properties-ui/desktop-conflict.png',
  })
})

test('Workspace Table property permission failure keeps the server value and explains the error', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 403, json: { detail: '편집 권한이 없습니다' } })
      return
    }
    await route.fulfill({ json: wpA })
  })
  await page.goto('/work-items?layout=table&columns=status')

  await page.getByRole('button', { name: '상태 변경: 할 일' }).click()
  await page.getByRole('menuitemradio', { name: '완료' }).click()
  await expect(page.getByRole('button', { name: '상태 변경: 할 일' })).toBeVisible()
  await expect(page.getByLabel(/상태 저장 실패:.*편집 권한이 없습니다/)).toBeVisible()
})

test('Workspace Table 담당자 셀은 menu open 시 roster를 조회하고 assignable role만 CAS PATCH한다', async ({ page }) => {
  const opsProjectId = allWorkItems.items[2].project_id
  let opsMemberRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/projects/${opsProjectId}/members`)) {
      opsMemberRequests += 1
    }
  })
  await mockApi(page)
  const roster = {
    json: {
      items: [
        { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
        { user_id: 'u-view', email: 'view@oneflow.local', display_name: 'Read Only', role: 'viewer' },
      ],
      total: 3,
    },
  }
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) => route.fulfill(roster))
  await page.route(`**/api/v1/projects/${opsProjectId}/members`, (route) => route.fulfill(roster))
  await page.goto('/work-items?layout=table&columns=assignee')
  const targetRow = page.getByRole('row', { name: /워크패키지 API 구현/ })

  await expect(targetRow.getByRole('button', { name: '담당자 변경: Dev User' })).toBeVisible()
  expect(opsMemberRequests).toBe(0)
  await page.getByRole('button', { name: '담당자 변경: Ops Lead' }).click()
  await expect.poll(() => opsMemberRequests).toBe(1)
  await expect(page.getByRole('menuitemradio', { name: 'Read Only' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await targetRow.getByRole('button', { name: '담당자 변경: Dev User' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Read Only' })).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-assignee-inline-ui/desktop-editor.png',
  })

  const assignPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await page.getByRole('menuitemradio', { name: 'Alex Kim' }).click()
  expect((await assignPatch).postDataJSON()).toEqual({ expected_version: 0, assignee_id: 'u-alex' })
  await expect(targetRow.getByRole('button', { name: '담당자 변경: Alex Kim' })).toBeVisible()

  const clearPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await targetRow.getByRole('button', { name: '담당자 변경: Alex Kim' }).click()
  await page.getByRole('menuitemradio', { name: '미배정' }).click()
  expect((await clearPatch).postDataJSON()).toEqual({ expected_version: 1, assignee_id: null })
  await expect(targetRow.getByRole('button', { name: '담당자 변경: 미배정' })).toBeVisible()
})

test('Workspace Table 담당자 roster 오류는 menu 안에서 재시도하고 모바일 폭을 유지한다', async ({ page }) => {
  const opsProjectId = allWorkItems.items[2].project_id
  let attempts = 0
  await mockApi(page)
  await page.route(`**/api/v1/projects/${opsProjectId}/members`, async (route) => {
    attempts += 1
    if (attempts <= 2) {
      await route.fulfill({ status: 500, json: { detail: '멤버를 불러오지 못했습니다' } })
      return
    }
    await route.fulfill({
      json: {
        items: [{ user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' }],
        total: 1,
      },
    })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/work-items?layout=table&columns=assignee')

  await page.getByRole('button', { name: '담당자 변경: Ops Lead' }).click()
  await page.getByRole('menuitem', { name: '멤버 다시 불러오기' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Alex Kim' })).toBeVisible()
  expect(attempts).toBe(3)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-assignee-inline-ui/mobile-roster.png',
  })
})

test('Workspace Table viewer 담당자 셀은 roster 요청 없는 정적 chip이다', async ({ page }) => {
  const opsProjectId = allWorkItems.items[2].project_id
  let memberRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/projects/${opsProjectId}/members`)) {
      memberRequests += 1
    }
  })
  await mockApi(page)
  await page.route('**/api/v1/search/work-packages**', (route) => route.fulfill({
    json: {
      query: '',
      total: 1,
      items: [{ ...allWorkItems.items[2], current_user_can_write: false }],
    },
  }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/work-items?layout=table&columns=assignee')

  await expect(page.getByRole('button', { name: /담당자 변경/ })).toHaveCount(0)
  await expect(page.getByText('Ops Lead')).toBeVisible()
  expect(memberRequests).toBe(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-assignee-inline-ui/mobile-viewer.png',
  })
})

test('Workspace Table 담당자 409와 validation failure는 authoritative value와 feedback을 유지한다', async ({ page }) => {
  await mockApi(page, { conflictOnPatch: true })
  await page.goto('/work-items?layout=table&columns=assignee')

  await page.getByRole('button', { name: '담당자 변경: Dev User' }).click()
  await page.getByRole('menuitemradio', { name: 'Alex Kim' }).click()
  await expect(page.getByRole('button', { name: '담당자 변경: Dev User' })).toBeVisible()
  await expect(page.getByLabel(/담당자 저장 실패:.*version conflict/)).toBeVisible()

  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 422, json: { detail: 'assignee must not have a read-only role' } })
      return
    }
    await route.fulfill({ json: wpA })
  })
  await page.getByRole('button', { name: '담당자 변경: Dev User' }).click()
  await page.getByRole('menuitemradio', { name: 'Alex Kim' }).click()
  await expect(page.getByRole('button', { name: '담당자 변경: Dev User' })).toBeVisible()
  await expect(page.getByLabel(/담당자 저장 실패:.*read-only role/)).toBeVisible()
})

test('Workspace Views는 결과 상한을 숨기지 않고 다음 페이지를 요청한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/search/work-packages**', (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') ?? 0)
    return route.fulfill({
      json: {
        query: '',
        total: 51,
        items: [offset >= 50 ? allWorkItems.items[1] : allWorkItems.items[0]],
      },
    })
  })
  await page.goto('/work-items?layout=table')

  await expect(page.getByText('All work items · 1-1 / 51')).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  const nextPage = page.waitForRequest((request) => new URL(request.url()).searchParams.get('offset') === '50')
  await page.getByRole('button', { name: '다음 페이지' }).click()
  await nextPage
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeVisible()
  await expect(page.getByText('All work items · 51-51 / 51')).toBeVisible()

  await page.goto('/work-items?layout=table&page=99')
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByText('All work items · 51-51 / 51')).toBeVisible()

  const sortedFirstPage = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.searchParams.get('sort') === 'status_asc' && url.searchParams.get('offset') === '0'
  })
  await page.getByRole('button', { name: '상태 열 정렬' }).click()
  await page.getByRole('menuitemradio', { name: 'A → Z' }).click()
  await sortedFirstPage
  await expect(page).toHaveURL(/sort=status_asc/)
  await expect(page).not.toHaveURL(/page=2/)
})

test('Workspace Views Calendar·Timeline이 동일 페이지·필터 상태와 일정 미정 작업을 보존한다', async ({ page }) => {
  await mockApi(page)
  const scheduled = allWorkItems.items[0]
  const undated = { ...allWorkItems.items[1], start_date: null, due_date: null }
  await page.route('**/api/v1/search/work-packages**', (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') ?? 0)
    return route.fulfill({
      json: {
        query: '',
        total: 52,
        items: offset >= 50 ? [scheduled, undated] : [scheduled],
      },
    })
  })

  await page.goto('/work-items?scope=assigned&state=open&priority=high&sort=due&density=compact&page=2')
  await page.getByRole('button', { name: 'Calendar 레이아웃' }).click()
  await expect(page).toHaveURL(/layout=calendar/)
  await expect(page).toHaveURL(/scope=assigned/)
  await expect(page).toHaveURL(/state=open/)
  await expect(page).toHaveURL(/priority=high/)
  await expect(page).toHaveURL(/sort=due/)
  await expect(page).toHaveURL(/density=compact/)
  await expect(page).toHaveURL(/page=2/)

  const calendar = page.getByRole('region', { name: '전체 작업 Calendar' })
  await expect(calendar).toBeVisible()
  await expect(calendar.getByRole('button', { name: /ONE.*워크패키지 API 구현/ })).toBeVisible()
  await expect(calendar.getByRole('region', { name: '기한 미정 작업' })).toContainText('보드 뷰 구현')
  await expect(calendar.getByText('51-52 / 52 기준')).toBeVisible()
  const monthLabel = calendar.locator('header strong')
  const initialMonth = await monthLabel.textContent()
  await calendar.getByRole('button', { name: '다음 달' }).click()
  await expect(monthLabel).not.toHaveText(initialMonth ?? '')
  const advancedMonth = await monthLabel.textContent()
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/)

  await page.getByRole('button', { name: 'Timeline 레이아웃' }).click()
  await page.getByRole('button', { name: 'Calendar 레이아웃' }).click()
  await expect(monthLabel).toHaveText(advancedMonth ?? '')
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/)
  await calendar.getByRole('button', { name: '이번 달' }).click()
  await expect(page).not.toHaveURL(/month=/)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-views-ui/desktop-calendar.png',
  })

  await page.getByRole('button', { name: 'Timeline 레이아웃' }).click()
  await expect(page).toHaveURL(/layout=timeline/)
  await expect(page).toHaveURL(/scope=assigned/)
  await expect(page).toHaveURL(/page=2/)
  const timeline = page.getByRole('region', { name: '전체 작업 Timeline' })
  await expect(timeline.getByRole('button', { name: '워크패키지 API 구현 일정 막대' })).toBeVisible()
  await expect(timeline.getByRole('region', { name: '일정 미정 작업' })).toContainText('보드 뷰 구현')
  await expect(timeline.getByText('51-52 / 52 기준')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-views-ui/desktop-timeline.png',
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await expect(timeline).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-views-ui/mobile-timeline.png',
  })
  await timeline.locator('button').filter({ hasText: '워크패키지 API 구현' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}`))
})

test('Workspace Views Add view가 생성·되돌리기·갱신·삭제와 실패 보존을 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/work-items?view=missing-workspace-view')
  await expect(page).not.toHaveURL(/view=/)
  await page.goto('/work-items?scope=assigned&state=open&priority=high&sort=priority_desc&layout=timeline&density=compact')

  await expect(page.getByLabel('저장 뷰', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add view' })).toBeVisible()
  await page.getByRole('button', { name: 'Add view' }).click()
  const dialog = page.getByRole('dialog', { name: '작업영역 뷰 저장' })
  await dialog.getByLabel('뷰 이름').fill('내 긴급 작업')
  const createRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/api/v1/me/workspace-views'),
  )
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  const createdBody = (await createRequest).postDataJSON() as {
    name: string
    params: WorkspaceSavedViewParams
  }
  expect(createdBody).toEqual({
    name: '내 긴급 작업',
    params: {
      q: '',
      scope: 'assigned',
      state: 'open',
      sort: 'priority_desc',
      priority: 'high',
      filter_mode: 'basic',
      pql: '',
      layout: 'timeline',
      density: 'compact',
      group_by: 'state',
      columns: ['project', 'status', 'priority', 'type', 'assignee', 'start', 'due', 'updated'],
      show_empty_groups: true,
      show_ids: false,
    },
  })
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/view=00000000-0000-4000-8000-000000000001/)
  await expect(page.getByLabel('저장 뷰', { exact: true })).toHaveValue('00000000-0000-4000-8000-000000000001')

  await page.getByLabel('작업 범위').selectOption('all')
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeVisible()
  await page.getByRole('button', { name: '되돌리기' }).click()
  await expect(page.getByLabel('작업 범위')).toHaveValue('assigned')

  await page.getByLabel('작업 범위').selectOption('all')
  await page.getByRole('button', { name: 'Calendar 레이아웃' }).click()
  await expect(page).toHaveURL(/layout=calendar/)
  await expect(page.getByRole('button', { name: 'Calendar 레이아웃' })).toHaveAttribute('aria-pressed', 'true')
  const updateRequest = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().includes('/api/v1/me/workspace-views/'),
  )
  await page.getByRole('button', { name: '갱신' }).click()
  const updatedBody = (await updateRequest).postDataJSON() as {
    expected_version: number
    params: WorkspaceSavedViewParams
  }
  expect(updatedBody.expected_version).toBe(0)
  expect(updatedBody.params.scope).toBe('all')
  expect(updatedBody.params.layout).toBe('calendar')
  await expect(page.getByRole('button', { name: '저장됨' })).toBeDisabled()

  page.once('dialog', (confirmation) => confirmation.accept())
  const deleteRequest = page.waitForRequest((request) =>
    request.method() === 'DELETE' && request.url().includes('expected_version=1'),
  )
  await page.getByRole('button', { name: '현재 저장 뷰 삭제' }).click()
  await deleteRequest
  await expect(page).not.toHaveURL(/view=/)
  await expect(page.getByLabel('저장 뷰', { exact: true })).toBeDisabled()

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.route('**/api/v1/me/workspace-views**', (route) =>
    route.fulfill({ status: 500, json: { detail: '임시 저장 오류' } }),
  { times: 1 })
  await page.getByRole('button', { name: 'Add view' }).click()
  await dialog.getByLabel('뷰 이름').fill('실패해도 보존')
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('임시 저장 오류')
  await expect(dialog.getByLabel('뷰 이름')).toHaveValue('실패해도 보존')
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-saved-views-ui/mobile-create-error.png',
  })
})

test('Workspace Analytics는 현재 Basic/PQL 필터의 전체 집계를 지연 조회하고 키보드로 닫힌다', async ({ page }) => {
  await mockApi(page)
  let analyticsRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/search/work-packages/analytics')) analyticsRequests += 1
  })

  await page.goto('/work-items?scope=assigned&state=open&priority=high')
  await expect(page.getByRole('heading', { name: 'All work items' })).toBeVisible()
  expect(analyticsRequests).toBe(0)
  const trigger = page.getByRole('button', { name: '작업 분석 열기' })
  const basicRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/search/work-packages/analytics')
      && url.searchParams.get('scope') === 'assigned'
      && url.searchParams.get('state') === 'open'
      && url.searchParams.get('priority') === 'high'
  })
  await trigger.click()
  await basicRequest
  const dialog = page.getByRole('dialog', { name: '작업 분석' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('전체 작업 1건')).toBeVisible()
  await expect(dialog.getByLabel('시작 전 1건')).toBeVisible()
  await expect(dialog.getByLabel('높음 1건')).toBeVisible()
  await expect(dialog.getByLabel(`ONE · ${project.name} 1건`)).toBeVisible()
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/workspace-analytics-ui/desktop-basic.png' })

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/work-items?filter_mode=pql&pql=priority%20%3D%20High%20LIMIT%201')
  const pqlRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/search/work-packages/analytics')
      && url.searchParams.get('state') === 'all'
      && url.searchParams.get('pql') === 'priority = High LIMIT 1'
      && !url.searchParams.has('priority')
  })
  await page.getByRole('button', { name: '작업 분석 열기' }).click()
  await pqlRequest
  await expect(dialog.getByLabel('전체 작업 1건')).toBeVisible()
  await expect(dialog.getByLabel('대기열 0건').locator('[aria-hidden="true"] > div')).toHaveCSS('width', '0px')
  await expect(page.getByTestId('workspace-analytics-overlay')).toHaveCSS('animation-name', 'none')
  await expect(dialog.getByLabel('높음 1건').locator('[aria-hidden="true"] > div')).toHaveCSS(
    'transition-property',
    'none',
  )

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.route(
    '**/api/v1/search/work-packages/analytics**',
    (route) => route.fulfill({ status: 503, json: { detail: 'cached analytics unavailable' } }),
    { times: 2 },
  )
  await page.getByRole('button', { name: '작업 분석 열기' }).click()
  await expect(dialog.getByRole('alert')).toContainText('cached analytics unavailable')
  await expect(dialog.getByLabel('전체 작업 1건')).toBeHidden()
})

test('Workspace Analytics는 오류 재시도·빈 결과·모바일 크기를 완결한다', async ({ page }) => {
  await mockApi(page)
  let attempts = 0
  let fail = true
  await page.route('**/api/v1/search/work-packages/analytics**', async (route) => {
    attempts += 1
    if (fail) {
      await route.fulfill({ status: 503, json: { detail: 'analytics temporarily unavailable' } })
      return
    }
    await route.fulfill({
      json: {
        total: 0,
        status_buckets: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'].map((key) => ({ key, count: 0 })),
        priority_buckets: ['none', 'low', 'medium', 'high', 'urgent'].map((key) => ({ key, count: 0 })),
        top_projects: [],
        project_overflow: { project_count: 0, item_count: 0 },
        schedule_buckets: { completed: 0, open_overdue: 0, open_due_next_7_days: 0, open_later: 0, open_unscheduled: 0 },
      } satisfies SearchWorkPackageAnalytics,
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/work-items?q=없는작업')
  await page.getByRole('button', { name: '작업 분석 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '작업 분석' })
  await expect(dialog.getByRole('alert')).toContainText('analytics temporarily unavailable')
  fail = false
  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await expect(dialog.getByText('분석할 작업이 없습니다')).toBeVisible()
  expect(attempts).toBeGreaterThanOrEqual(2)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/workspace-analytics-ui/mobile-empty.png' })
})

test('Workspace Views PQL은 추천·검증·실행·저장·초기화를 실제 query에 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/work-items')
  await page.getByRole('button', { name: '필터' }).click()
  await page.getByRole('tab', { name: 'PQL' }).click()

  const editor = page.getByLabel('PQL query')
  const run = page.getByRole('button', { name: 'Run' })
  await expect(editor).toBeVisible()
  await expect(run).toBeDisabled()
  await editor.fill('priority')
  await expect(page.getByRole('listbox', { name: 'PQL suggestions' })).toBeVisible()
  await page.getByRole('option', { name: /= 값과 같음/ }).click()
  await expect(editor).toHaveValue('priority = ')
  await expect(run).toBeDisabled()
  await page.getByRole('option', { name: /High 조건 값/ }).click()
  await expect(editor).toHaveValue('priority = High')
  await expect(run).toBeEnabled()

  const validationRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/search/work-packages/pql/validate'),
  )
  const pqlSearchRequest = page.waitForRequest((request) =>
    request.method() === 'GET' && new URL(request.url()).searchParams.get('pql') === 'priority = High',
  )
  await run.click()
  expect((await validationRequest).postDataJSON()).toEqual({ query: 'priority = High' })
  await pqlSearchRequest
  await expect(page).toHaveURL(/filter_mode=pql/)
  await expect(page).toHaveURL(/pql=priority(?:\+|%20)%3D(?:\+|%20)High/)
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-pql-ui/desktop-applied.png',
  })

  await page.getByRole('button', { name: 'Expand editor' }).click()
  await expect(page.getByRole('button', { name: 'Collapse editor' })).toBeVisible()
  await page.getByRole('tab', { name: 'Basic' }).click()
  await expect(page).not.toHaveURL(/pql=/)
  await page.getByRole('tab', { name: 'PQL' }).click()
  await expect(editor).toHaveValue('priority = High')
  await run.click()
  await expect(page).toHaveURL(/pql=priority/)

  await page.getByRole('button', { name: 'Add view' }).click()
  const dialog = page.getByRole('dialog', { name: '작업영역 뷰 저장' })
  await dialog.getByLabel('뷰 이름').fill('높은 우선순위')
  const saveRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/api/v1/me/workspace-views'),
  )
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  const saved = (await saveRequest).postDataJSON() as { params: WorkspaceSavedViewParams }
  expect(saved.params.filter_mode).toBe('pql')
  expect(saved.params.pql).toBe('priority = High')

  await page.getByRole('button', { name: 'PQL Clear all' }).click()
  await expect(editor).toHaveValue('')
  await expect(page).not.toHaveURL(/pql=/)
  await editor.fill('priority = Impossible')
  await run.click()
  await expect(page.getByRole('alert')).toContainText('priority value is not supported')
  await expect(page).not.toHaveURL(/pql=priority.*Impossible/)

  await page.route('**/api/v1/search/work-packages/pql/validate', async (route) => {
    await page.waitForTimeout(180)
    await route.fulfill({
      json: {
        normalized: 'priority = High',
        fields: ['priority'],
        order_by: null,
        direction: null,
        limit: null,
      },
    })
  }, { times: 1 })
  await editor.fill('priority = High')
  await run.click()
  await editor.fill('priority = Medium')
  await page.waitForTimeout(250)
  await expect(editor).toHaveValue('priority = Medium')
  await expect(page).not.toHaveURL(/pql=priority.*High/)

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-pql-ui/mobile-validation-error.png',
  })
})

test('보드 뷰가 상태 컬럼으로 그려진다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/board`)
  await expect(page.getByLabel('할 일 컬럼')).toBeVisible()
  await expect(page.getByLabel('진행 중 컬럼')).toBeVisible()
  await page.screenshot({ path: '../../docs/screenshots/web-board.png', fullPage: true })

  // swimlanes: priority grouping splits rows; lanes carry their own columns
  await page.getByLabel('스윔레인 기준').selectOption('priority')
  await expect(page.getByTestId('board-lane')).toHaveCount(2) // high + medium (wpA/wpB)
  await expect(page.getByText('높음 (1)')).toBeVisible()
  await expect(page.getByLabel('높음 할 일 컬럼')).toBeVisible()
  await page.getByLabel('스윔레인 기준').selectOption('none')
  await expect(page.getByTestId('board-lane')).toHaveCount(1)
})

test('보드 카드 액션 메뉴가 링크·복제·이동·전체 페이지 흐름을 연결한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => window.localStorage.setItem('__copied_board_card_link', text),
      },
    })
  })
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-board', subject: '(복사) 워크패키지 API 구현' },
        skipped_custom_values: 0,
      },
    }),
  )

  const openCardActions = async () => {
    const card = page.locator('article').filter({ hasText: '워크패키지 API 구현' }).first()
    await card.hover()
    const trigger = card.getByRole('button', { name: '카드 작업' })
    await expect(trigger).toBeVisible()
    await trigger.click()
  }

  await page.goto(`/projects/${project.id}/board`)

  await openCardActions()
  await page.getByRole('menuitem', { name: /링크 복사/ }).click()
  await expect(page.getByRole('status')).toContainText('링크를 복사했습니다')
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('__copied_board_card_link')))
    .toContain(`/projects/${project.id}/work-packages/${wpA.id}`)

  await openCardActions()
  const duplicatePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await page.getByRole('menuitem', { name: '복제' }).click()
  await duplicatePost
  await expect(page.getByRole('status')).toContainText("'(복사) 워크패키지 API 구현' 생성됨")

  await openCardActions()
  await page.getByRole('menuitem', { name: '이동' }).click()
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
  await expect(page).toHaveURL(/move=1/)
  await expect(page.getByRole('dialog').getByLabel('이동 대상 프로젝트')).toBeVisible()

  await page.goto(`/projects/${project.id}/board`)
  await openCardActions()
  await page.getByRole('menuitem', { name: /전체 페이지/ }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
})

test('모바일 보드 카드 액션 메뉴는 hover 없이 열리고 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)

  await page.goto(`/projects/${project.id}/board`)
  const card = page.locator('article').filter({ hasText: '워크패키지 API 구현' }).first()
  const trigger = card.getByRole('button', { name: '카드 작업' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: /상세 드로어/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /링크 복사/ })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/board-card-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('뷰어 보드 카드 액션 메뉴는 쓰기 액션 없이 읽기 전용으로 표시된다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) => route.fulfill({ json: project }))

  await page.goto(`/projects/${project.id}/board`)
  const card = page.locator('article').filter({ hasText: '워크패키지 API 구현' }).first()
  await card.hover()
  await card.getByRole('button', { name: '카드 작업' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText('읽기 전용', { exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '복제' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '이동' })).toHaveCount(0)
})

test('상세 헤더 속성 선택기는 검색·키보드·연속 CAS와 Properties 동기화를 유지한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const properties = drawer.getByRole('complementary', { name: '작업 속성' })
  const statusSelect = drawer.getByLabel('상태', { exact: true })
  const prioritySelect = drawer.getByLabel('우선순위', { exact: true })
  const statusTrigger = drawer.getByRole('button', { name: '상태 변경: 할 일' })
  await expect(statusSelect).toBeVisible()
  await properties.getByRole('button', { name: '속성' }).click()
  await expect(statusSelect).toHaveCount(0)

  await statusTrigger.click()
  const statusPicker = page.getByRole('dialog', { name: '상태 선택' })
  const statusSearch = statusPicker.getByRole('combobox', { name: '상태 검색' })
  await expect(statusSearch).toBeFocused()
  await drawer.getByLabel('제목', { exact: false }).first().click()
  await expect(statusPicker).toBeHidden()
  await expect(drawer).toBeVisible()

  await statusTrigger.click()
  await expect(statusSearch).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(statusPicker).toBeHidden()
  await expect(statusTrigger).toBeFocused()

  await statusTrigger.click()
  await statusSearch.fill('완')
  await expect(statusPicker.getByRole('option', { name: '완료' })).toBeVisible()
  await expect(statusPicker.getByRole('option')).toHaveCount(1)
  await expect.poll(() => statusPicker.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-property-controls-ui/desktop-status-search.png',
  })

  const statusPatchRequest = page.waitForRequest(
    (req) => req.method() === 'PATCH' && req.url().includes(`/work-packages/${wpA.id}`),
  )
  await statusSearch.press('Enter')
  const statusBody = (await statusPatchRequest).postDataJSON() as {
    expected_version: number
    status: string
  }
  expect(statusBody).toEqual({ expected_version: 0, status: 'done' })
  await expect(drawer.getByRole('button', { name: '상태 변경: 완료' })).toBeVisible()

  await properties.getByRole('button', { name: '속성' }).click()
  await expect(statusSelect).toHaveValue('done')
  await expect(prioritySelect).toHaveValue('high')

  const priorityPatchRequest = page.waitForRequest(
    (req) => req.method() === 'PATCH' && req.url().includes(`/work-packages/${wpA.id}`),
  )
  await drawer.getByRole('button', { name: '우선순위 변경: 높음' }).click()
  const priorityPicker = page.getByRole('dialog', { name: '우선순위 선택' })
  const highOption = priorityPicker.getByRole('option', { name: '높음' })
  await expect(highOption).toBeFocused()
  await highOption.press('Home')
  const noneOption = priorityPicker.getByRole('option', { name: '없음' })
  await expect(noneOption).toBeFocused()
  await noneOption.press('ArrowDown')
  const lowOption = priorityPicker.getByRole('option', { name: '낮음' })
  await expect(lowOption).toBeFocused()
  await lowOption.press('Enter')
  const priorityBody = (await priorityPatchRequest).postDataJSON() as {
    expected_version: number
    priority: string
  }
  expect(priorityBody).toEqual({ expected_version: 1, priority: 'low' })
  await expect(drawer.getByRole('button', { name: '우선순위 변경: 낮음' })).toBeVisible()
  await expect(prioritySelect).toHaveValue('low')
})

test('모바일 작업 상세 드로어가 속성과 활동 탭을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog', { name: '워크패키지 API 구현' })

  await expectNoHorizontalOverflow(page)
  await expect(drawer.getByText('속성')).toBeVisible()
  await expect(drawer.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true')
  await drawer.getByRole('complementary', { name: '작업 속성' }).screenshot({
    path: '../../docs/screenshots/redevelopment/detail-properties-ui/mobile.png',
  })
  await drawer.getByRole('button', { name: '상태 변경: 할 일' }).click()
  const mobileStatusPicker = page.getByRole('dialog', { name: '상태 선택' })
  await expect(mobileStatusPicker).toBeVisible()
  await expect.poll(() => mobileStatusPicker.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-property-controls-ui/mobile-status.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  const assigneeTrigger = drawer.getByRole('button', { name: '담당자 변경: 미배정' })
  await assigneeTrigger.click()
  await expect(
    page.getByRole('dialog', { name: '담당자 선택' }).getByRole('option', { name: 'Alex Kim' }),
  ).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-assignee-control-ui/mobile-menu.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(assigneeTrigger).toBeFocused()
  const dueTrigger = drawer.getByRole('button', { name: '기한 변경: 2026. 7. 15.' })
  await dueTrigger.click()
  await expect(page.getByRole('dialog', { name: '기한 선택' }).getByLabel('기한 입력')).toBeFocused()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-schedule-controls-ui/mobile-due.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await expect(dueTrigger).toBeFocused()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/mobile.png',
    fullPage: true,
  })
  await drawer.getByRole('tab', { name: '활동' }).click()
  await expect(drawer.getByText('작업을 생성했습니다')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/mobile-activity.png',
    fullPage: true,
  })
})

test('활동 댓글 표면은 모바일에서 피드와 composer를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const at = (d: string) => ({ created_at: d, updated_at: d })
  const rootComment: Comment = {
    id: 'c-mobile-root',
    work_package_id: wpA.id,
    parent_id: null,
    author_id: 'me-1',
    body: '모바일 QA 기준 확인',
    mentions: ['u-alex'],
    reactions: [{ key: '❤️', count: 1, me: false }],
    ...at('2026-07-03T00:00:00Z'),
  }
  const reply: Comment = {
    id: 'c-mobile-reply',
    work_package_id: wpA.id,
    parent_id: 'c-mobile-root',
    author_id: 'u-alex',
    body: '모바일 답글',
    mentions: null,
    reactions: [],
    ...at('2026-07-03T01:00:00Z'),
  }
  await page.route(`**/api/v1/work-packages/${wpA.id}/comments`, (route) =>
    route.fulfill({ json: { items: [rootComment, reply], total: 2 } }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog', { name: '워크패키지 API 구현' })
  await drawer.getByRole('tab', { name: '활동' }).click()
  const activitySection = drawer.getByRole('region', { name: '활동 및 댓글' })

  await activitySection.scrollIntoViewIfNeeded()
  await expect(activitySection.getByText('모바일 QA 기준 확인')).toBeVisible()
  await expect(activitySection.getByText('모바일 답글')).toBeVisible()
  await expect(activitySection.getByText('@Alex Kim')).toBeVisible()
  await expect(activitySection.getByLabel('댓글 입력')).toBeVisible()
  await expect(activitySection.getByRole('button', { name: '댓글 추가' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/activity-comments-ui/mobile.png',
    fullPage: true,
  })
})

test('관계 표면은 모바일에서 의존 카드와 composer를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/relations`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'rel-mobile-1',
            source_id: wpA.id,
            target_id: wpB.id,
            relation_type: 'blocks',
            direction: 'outgoing',
          },
          {
            id: 'rel-mobile-2',
            source_id: wpB.id,
            target_id: wpA.id,
            relation_type: 'precedes',
            direction: 'incoming',
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog', { name: '워크패키지 API 구현' })
  const relationSection = drawer.getByRole('region', { name: '관계' })

  await relationSection.scrollIntoViewIfNeeded()
  await expect(relationSection.getByText('의존', { exact: true })).toBeVisible()
  await expect(relationSection.getByRole('list').getByText('차단함')).toBeVisible()
  await expect(relationSection.getByRole('list').getByText('선행')).toBeVisible()
  await expect(relationSection.getByText('보드 뷰 구현').first()).toBeVisible()
  await expect(relationSection.getByLabel('관계 유형')).toBeVisible()
  await expect(relationSection.getByLabel('대상 작업')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/relations-ui/mobile.png',
    fullPage: true,
  })
})

test('시간·비용 표면은 모바일에서 기록 카드와 ledger를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/time-entries`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'te-mobile-1',
            work_package_id: wpA.id,
            user_id: 'me-1',
            hours: 6.5,
            spent_on: '2026-07-02',
            comment: 'API 설계',
            created_at: '2026-07-02T01:00:00Z',
          },
          {
            id: 'te-mobile-2',
            work_package_id: wpA.id,
            user_id: 'me-1',
            hours: 4,
            spent_on: '2026-07-03',
            comment: null,
            created_at: '2026-07-03T01:00:00Z',
          },
        ],
        total: 2,
        total_hours: 10.5,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/cost-entries`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'ce-mobile-1',
            work_package_id: wpA.id,
            user_id: 'me-1',
            amount: 120000,
            kind: 'labor',
            spent_on: '2026-07-02',
            comment: '개발 인건비',
            created_at: '2026-07-02T01:00:00Z',
          },
          {
            id: 'ce-mobile-2',
            work_package_id: wpA.id,
            user_id: 'me-1',
            amount: 35000,
            kind: 'material',
            spent_on: '2026-07-03',
            comment: null,
            created_at: '2026-07-03T01:00:00Z',
          },
        ],
        total: 2,
        total_amount: 155000,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog', { name: '워크패키지 API 구현' })
  const timeSection = drawer.getByRole('region', { name: '시간 추적' })
  const costSection = drawer.getByRole('region', { name: '비용' })

  await expect(timeSection.getByText('10.5h')).toBeVisible()
  await expect(timeSection.getByText('예상 대비 진행')).toBeVisible()
  await expect(timeSection.getByText('API 설계')).toBeVisible()
  await expect(timeSection.getByLabel('기록할 시간')).toBeVisible()
  await expect(costSection.getByText('₩155,000').first()).toBeVisible()
  await expect(costSection.getByText('인건비 ₩120,000')).toBeVisible()
  await expect(costSection.getByText('개발 인건비')).toBeVisible()
  await expect(costSection.getByLabel('비용 금액')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await timeSection.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/time-cost-ui/mobile-time.png',
    fullPage: true,
  })
  await costSection.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/time-cost-ui/mobile-cost.png',
    fullPage: true,
  })
})

test('작업 상세 전체 페이지가 드로어 IA와 활동 탭을 재사용한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('slider')).toHaveCount(0)
  await drawer.getByRole('link', { name: '전체 페이지' }).click()

  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
  await expect(page.getByRole('heading', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('속성')).toBeVisible()
  await expect(page.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '상태 변경: 할 일' }).click()
  await expect(page.getByRole('combobox', { name: '상태 검색' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '상태 변경: 할 일' })).toBeFocused()
  const fullPageDueTrigger = page.getByRole('button', { name: '기한 변경: 2026. 7. 15.' })
  await fullPageDueTrigger.click()
  await expect(page.getByRole('dialog', { name: '기한 선택' }).getByLabel('기한 입력')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(fullPageDueTrigger).toBeFocused()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/full-page-desktop.png',
    fullPage: true,
  })

  await page.getByRole('tab', { name: '활동' }).click()
  await expect(page.getByText('작업을 생성했습니다')).toBeVisible()
})

test('전체 페이지 작업 속성 패널과 라벨 열을 조절하고 브라우저에 유지한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages/${wpA.id}`)

  const panelSlider = page.getByRole('slider', { name: '속성 패널 너비 조절' })
  const labelSlider = page.getByRole('slider', { name: '속성 라벨 열 너비 조절' })
  await expect(panelSlider).toHaveAttribute('aria-valuemin', '20')
  await expect(panelSlider).toHaveAttribute('aria-valuemax', '40')
  await expect(panelSlider).toHaveAttribute('aria-valuenow', '25')
  await expect(labelSlider).toHaveAttribute('aria-valuenow', '30')
  await expect(page.getByLabel('상태', { exact: true })).toBeVisible()

  await labelSlider.focus()
  await labelSlider.press('ArrowRight')
  await panelSlider.focus()
  await panelSlider.press('End')
  await expect(labelSlider).toHaveAttribute('aria-valuenow', '31')
  await expect(panelSlider).toHaveAttribute('aria-valuenow', '40')

  await page.reload()
  await expect(labelSlider).toHaveAttribute('aria-valuenow', '31')
  await expect(panelSlider).toHaveAttribute('aria-valuenow', '40')

  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'oneflow:detail-layout:v1',
      newValue: '{"panelWidth":32,"labelWidth":36}',
    }))
  })
  await expect(panelSlider).toHaveAttribute('aria-valuenow', '32')
  await expect(labelSlider).toHaveAttribute('aria-valuenow', '36')

  await page.evaluate(() => window.localStorage.setItem('oneflow:detail-layout:v1', '{broken'))
  await page.reload()
  await expect(panelSlider).toHaveAttribute('aria-valuenow', '25')
  await expect(labelSlider).toHaveAttribute('aria-valuenow', '30')

  const box = await panelSlider.boundingBox()
  expect(box).not.toBeNull()
  const startX = box!.x + box!.width / 2
  await panelSlider.dispatchEvent('pointerdown', { pointerId: 1, clientX: startX, bubbles: true })
  await page.evaluate((clientX) => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX, bubbles: true }))
  }, startX - 80)
  await expect.poll(async () => Number(await panelSlider.getAttribute('aria-valuenow'))).toBeGreaterThan(25)

  await panelSlider.dblclick()
  await expect(panelSlider).toHaveAttribute('aria-valuenow', '25')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-properties-resize-ui/desktop.png',
    fullPage: true,
  })
})

test('모바일 작업 상세 전체 페이지가 속성과 활동 탭을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages/${wpA.id}`)

  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('heading', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('속성')).toBeVisible()
  await expect(page.getByRole('slider')).toHaveCount(0)
  await page.getByRole('tab', { name: '활동' }).click()
  await expect(page.getByText('작업을 생성했습니다')).toBeVisible()
  await page.getByRole('tablist', { name: '활동 피드 필터' }).getByRole('tab', { name: '전환' }).click()
  await expect(page.getByText('상태: 할 일 → 진행 중')).toBeVisible()
  await page.getByRole('region', { name: '활동 및 댓글' }).screenshot({
    path: '../../docs/screenshots/redevelopment/detail-activity-ui/mobile.png',
  })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/full-page-mobile.png',
    fullPage: true,
  })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-properties-resize-ui/mobile.png',
    fullPage: true,
  })
})

test('드로어에서 활동 이력을 보여주고 댓글을 추가한다', async ({ page }) => {
  await mockApi(page)
  // anchored attachment renders in the drawer 첨부 section
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) => {
    const url = new URL(route.request().url())
    const anchored = url.searchParams.get('work_package_id') === wpA.id
    return route.fulfill({
      json: anchored
        ? {
            items: [
              {
                id: 'att-1',
                project_id: project.id,
                work_package_id: wpA.id,
                document_id: null,
                filename: '설계서.pdf',
                content_type: 'application/pdf',
                size_bytes: 1024,
                url: 'oneflow://attachments/att-1',
                has_file: true,
                uploaded_by: null,
                created_at: '2026-07-01T00:00:00Z',
              },
            ],
            total: 1,
          }
        : { items: [], total: 0 },
    })
  })
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('만든 사람: Dev User', { exact: false })).toBeVisible()
  await drawer.getByRole('tab', { name: '활동' }).click()
  await expect(drawer.getByText('작업을 생성했습니다')).toBeVisible() // activity feed
  // Cycle assignment history renders NAME snapshots (Pass 71).
  await expect(drawer.getByText('사이클: 스프린트 1 → 스프린트 2')).toBeVisible()

  const activityFilters = drawer.getByRole('tablist', { name: '활동 피드 필터' })
  const transitionRequest = page.waitForRequest(
    (req) => req.url().includes(`/work-packages/${wpA.id}/activities`) && req.url().includes('field=status'),
  )
  await activityFilters.getByRole('tab', { name: '전환' }).click()
  await transitionRequest
  await expect(drawer.getByText('상태: 할 일 → 진행 중')).toBeVisible()
  await expect(drawer.getByText('사이클: 스프린트 1 → 스프린트 2')).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-activity-ui/desktop.png',
  })

  await activityFilters.getByRole('tab', { name: '댓글' }).click()
  await expect(drawer.getByText('이 범위에 표시할 활동이 없습니다.')).toBeVisible()
  await activityFilters.getByRole('tab', { name: '전체' }).click()

  const commentPost = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes(`/work-packages/${wpA.id}/comments`),
  )
  await drawer.getByLabel('댓글 입력').fill('검토 완료했습니다')
  await drawer.getByRole('button', { name: '댓글 추가' }).click()
  const req = await commentPost
  expect((req.postDataJSON() as { body: string }).body).toBe('검토 완료했습니다')

  // 첨부 section shows the anchored file with a download affordance
  await drawer.getByRole('tab', { name: '개요' }).click()
  await expect(drawer.getByText('설계서.pdf')).toBeVisible()
  await expect(drawer.getByLabel('설계서.pdf 다운로드')).toBeVisible()
})

test('댓글 스레드: 답글이 루트 아래 들여쓰기로 붙고 parent_id를 보낸다', async ({ page }) => {
  await mockApi(page)
  const at = (d: string) => ({ created_at: d, updated_at: d })
  const rootComment: Comment = {
    id: 'c-root',
    work_package_id: wpA.id,
    parent_id: null,
    author_id: null,
    body: '루트 코멘트',
    mentions: null,
    reactions: [],
    ...at('2026-07-01T00:00:00Z'),
  }
  const reply: Comment = {
    id: 'c-reply',
    work_package_id: wpA.id,
    parent_id: 'c-root',
    author_id: null,
    body: '기존 답글',
    mentions: null,
    reactions: [],
    ...at('2026-07-02T00:00:00Z'),
  }
  // Registered after mockApi → precedence over the empty default.
  await page.route(`**/api/v1/work-packages/${wpA.id}/comments`, async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { body: string; parent_id?: string | null }
      await route.fulfill({
        status: 201,
        json: {
          ...rootComment,
          id: 'c-new',
          parent_id: sent.parent_id ?? null,
          body: sent.body,
        },
      })
      return
    }
    await route.fulfill({ json: { items: [rootComment, reply], total: 2 } })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('tab', { name: '활동' }).click()
  await expect(drawer.getByText('루트 코멘트')).toBeVisible()
  await expect(drawer.getByText('기존 답글')).toBeVisible()

  // reply composer opens per-thread and posts with the root's parent_id
  await drawer.getByRole('button', { name: '답글', exact: true }).click()
  await drawer.getByLabel('답글 입력').fill('스레드 답글')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/comments`),
  )
  await drawer.getByRole('button', { name: '답글 추가' }).click()
  expect(((await post).postDataJSON() as { parent_id: string }).parent_id).toBe('c-root')

  // reactions (Pass 35 open set): quick-pick glyph PUTs the percent-encoded
  // emoji itself; the free input accepts any emoji.
  await page.route('**/api/v1/comments/c-root/reactions/**', (route) =>
    route.fulfill({ json: { items: [{ key: '❤️', count: 1, me: true }] } }),
  )
  const reactPut = page.waitForRequest(
    (r) =>
      r.method() === 'PUT' &&
      r.url().includes(`/comments/c-root/reactions/${encodeURIComponent('❤️')}`),
  )
  await drawer.getByLabel('❤️ 리액션').first().click()
  await reactPut

  const freePut = page.waitForRequest(
    (r) =>
      r.method() === 'PUT' &&
      r.url().includes(`/comments/c-root/reactions/${encodeURIComponent('✨')}`),
  )
  await drawer.getByLabel('이모지 추가').first().click()
  await drawer.getByLabel('자유 이모지 입력').fill('✨')
  await drawer.getByLabel('이모지 등록').click()
  await freePut
})

test('드로어 복제 버튼이 duplicate POST를 보내고 결과를 알린다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-1', subject: '(복사) 워크패키지 API 구현', status: 'backlog' },
        skipped_custom_values: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await drawer.getByRole('button', { name: '복제' }).click()
  await post
  await expect(drawer.getByText("'(복사) 워크패키지 API 구현' 생성됨", { exact: false })).toBeVisible()
  await expect(drawer.getByText('복사되지 않은 커스텀 값 2건', { exact: false })).toBeVisible()
})

test('드로어 이동: 대상 선택 시 미리보기 후 이동 POST를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [project, { ...project, id: 'p-2', key: 'TWO', name: '두번째 프로젝트' }],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/move`, (route) => {
    const sent = route.request().postDataJSON() as { dry_run?: boolean }
    if (sent.dry_run) {
      return route.fulfill({
        json: {
          work_package: null,
          dry_run: true,
          cleared: {
            parent: false,
            children: { count: 0, names: [], overflow: 0 },
            milestone: true,
            cycle: false,
            module: false,
            relations: { count: 2, names: ['관계 A', '관계 B'], overflow: 0 },
            custom_values: { count: 0, names: [], overflow: 0 },
            document_links: { count: 0, names: [], overflow: 0 },
            watchers_removed: { count: 0, names: [], overflow: 0 },
            assignee_cleared: false,
          },
        },
      })
    }
    return route.fulfill({
      json: {
        work_package: { ...wpA, project_id: 'p-2', version: 1 },
        dry_run: false,
        cleared: {
          parent: false,
          children: { count: 0, names: [], overflow: 0 },
          milestone: true,
          cycle: false,
          module: false,
          relations: { count: 2, names: ['관계 A', '관계 B'], overflow: 0 },
          custom_values: { count: 0, names: [], overflow: 0 },
          document_links: { count: 0, names: [], overflow: 0 },
          watchers_removed: { count: 0, names: [], overflow: 0 },
          assignee_cleared: false,
        },
      },
    })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: '이동' }).click()

  const dryRun = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/move`),
  )
  await drawer.getByLabel('이동 대상 프로젝트').selectOption('p-2')
  expect(((await dryRun).postDataJSON() as { dry_run: boolean }).dry_run).toBe(true)
  await expect(drawer.getByText('마일스톤 해제')).toBeVisible()
  await expect(drawer.getByText('관계 삭제 2건(관계 A, 관계 B)')).toBeVisible()

  const realMove = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      r.url().includes('/move') &&
      (r.postDataJSON() as { dry_run: boolean }).dry_run === false,
  )
  await drawer.getByRole('button', { name: '이동 실행' }).click()
  const sent = (await realMove).postDataJSON() as { target_project_id: string }
  expect(sent.target_project_id).toBe('p-2')
  await expect(drawer.getByText('이동되었습니다.')).toBeVisible()
})

test('작업 행 액션 메뉴가 링크·복제·이동·전체 페이지 흐름을 연결한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => window.localStorage.setItem('__copied_work_item_link', text),
      },
    })
  })
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-1', subject: '(복사) 워크패키지 API 구현', status: 'backlog' },
        skipped_custom_values: 1,
      },
    }),
  )

  const openRowActions = async () => {
    const row = page.getByRole('row', { name: /워크패키지 API 구현/ })
    await row.hover()
    const trigger = row.getByRole('button', { name: '행 작업' })
    await expect(trigger).toBeVisible()
    await trigger.click()
  }

  await page.goto(`/projects/${project.id}/work-packages`)

  await openRowActions()
  await page.getByRole('menuitem', { name: /링크 복사/ }).click()
  await expect(page.getByRole('status')).toContainText('링크를 복사했습니다')
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('__copied_work_item_link')))
    .toContain(`/projects/${project.id}/work-packages/${wpA.id}`)

  await openRowActions()
  const duplicatePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await page.getByRole('menuitem', { name: '복제' }).click()
  await duplicatePost
  await expect(page.getByRole('status')).toContainText("'(복사) 워크패키지 API 구현' 생성됨")
  await expect(page.getByRole('status')).toContainText('복사되지 않은 커스텀 값 1건')

  await openRowActions()
  await page.getByRole('menuitem', { name: '이동' }).click()
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
  await expect(page).toHaveURL(/move=1/)
  await expect(page.getByRole('dialog').getByLabel('이동 대상 프로젝트')).toBeVisible()

  await page.goto(`/projects/${project.id}/work-packages`)
  await openRowActions()
  await page.getByRole('menuitem', { name: /전체 페이지/ }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
})

test('모바일 작업 행 액션 메뉴는 hover 없이 열리고 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)

  await page.goto(`/projects/${project.id}/work-packages`)
  const trigger = page
    .getByRole('row', { name: /워크패키지 API 구현/ })
    .getByRole('button', { name: '행 작업' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: /상세 드로어/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /링크 복사/ })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/row-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('목록 일괄 변경: 선택한 작업에 상태를 적용하고 payload를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages/bulk-update`, (route) =>
    route.fulfill({
      json: { updated_ids: [wpA.id, wpB.id], unchanged_ids: [], skipped_ids: [] },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByLabel('워크패키지 API 구현 선택').check()
  await page.getByLabel('보드 뷰 구현 선택').check()
  await expect(page.getByText('2건 선택')).toBeVisible()

  await page.getByLabel('일괄 상태').selectOption('done')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/work-packages/bulk-update'),
  )
  await page.getByRole('button', { name: '적용' }).click()
  const sent = (await post).postDataJSON() as { ids: string[]; patch: { status: string } }
  expect(sent.ids.sort()).toEqual([wpA.id, wpB.id].sort())
  expect(sent.patch).toEqual({ status: 'done' })
  // Selection clears after a successful apply.
  await expect(page.getByText('2건 선택')).toBeHidden()
})

test('일괄 작업 surface는 모바일에서 선택 요약과 부분 결과를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages/bulk-update`, (route) =>
    route.fulfill({
      json: { updated_ids: [wpA.id], unchanged_ids: [wpB.id], skipped_ids: ['opaque-skipped'] },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByLabel('현재 페이지 작업 선택').check()
  const bulkSurface = page.getByRole('region', { name: '일괄 작업' })
  await expect(bulkSurface.getByText('2건 선택')).toBeVisible()
  await bulkSurface.getByLabel('일괄 우선순위').selectOption('high')
  await bulkSurface.getByLabel('일괄 담당자').selectOption('__unassigned')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/bulk-edit-ui/mobile.png',
    fullPage: true,
  })

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/work-packages/bulk-update'),
  )
  await bulkSurface.getByRole('button', { name: '적용' }).click()
  const sent = (await post).postDataJSON() as {
    ids: string[]
    patch: { priority: string; assignee_id: string | null }
  }
  expect(sent.ids.sort()).toEqual([wpA.id, wpB.id].sort())
  expect(sent.patch).toEqual({ priority: 'high', assignee_id: null })
  await expect(bulkSurface).toBeHidden()
  const result = page.getByRole('status', { name: '일괄 작업 결과' })
  await expect(result.getByText('변경 1건')).toBeVisible()
  await expect(result.getByText('유지 1건')).toBeVisible()
  await expect(result.getByText('건너뜀 1건')).toBeVisible()
})

test('댓글 멘션: 멤버 체크 후 작성하면 mentioned_user_ids를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')

  await drawer.getByRole('tab', { name: '활동' }).click()
  await drawer.getByLabel('댓글 입력').fill('알렉스 확인 부탁합니다')
  await drawer.getByLabel('Alex Kim 멘션').check()
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/comments`),
  )
  await drawer.getByRole('button', { name: '댓글 추가' }).click()
  const sent = (await post).postDataJSON() as { mentioned_user_ids: string[] }
  expect(sent.mentioned_user_ids).toEqual(['u-alex'])
})

test('409 충돌 시 드로어 내 경고를 보여주고 최신 데이터로 재로드한다', async ({ page }) => {
  await mockApi(page, { conflictOnPatch: true })
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: '상태 변경: 할 일' }).click()
  const picker = page.getByRole('dialog', { name: '상태 선택' })
  await picker.getByRole('combobox', { name: '상태 검색' }).fill('진행')
  await picker.getByRole('option', { name: '진행 중' }).click()
  // The failure is surfaced inline (role="alert"), not via a blocking window.alert.
  await expect(drawer.getByRole('alert')).toContainText('먼저 수정했습니다')
})

test('상세 헤더 속성 선택기는 권한·검증·서버 오류에서 서버값과 피드백을 보존한다', async ({ page }) => {
  await mockApi(page)
  const failures = [
    { status: 403, detail: '편집 권한이 없습니다' },
    { status: 422, detail: '지원하지 않는 상태입니다' },
    { status: 500, detail: '상태 저장 중 서버 오류가 발생했습니다' },
  ]
  let failureIndex = 0
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fulfill({ json: wpA })
      return
    }
    const failure = failures[failureIndex]
    failureIndex += 1
    await route.fulfill({ status: failure.status, json: { detail: failure.detail } })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const trigger = drawer.getByRole('button', { name: '상태 변경: 할 일' })

  for (const failure of failures) {
    await trigger.click()
    await page.getByRole('dialog', { name: '상태 선택' }).getByRole('option', { name: '완료' }).click()
    await expect(drawer.getByRole('alert')).toContainText(failure.detail)
    await expect(trigger).toBeVisible()
    await expect(drawer.getByLabel('상태', { exact: true })).toHaveValue('todo')
  }
  expect(failureIndex).toBe(failures.length)
})

test('대시보드가 집계 타일과 분포를 보여준다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  // The activity actor filter reads the roster (Pass 38).
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
          { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
        ],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/dashboard`, (route) =>
    route.fulfill({
      json: {
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        health: 'at_risk',
        health_note: '일정 위험을 우선 확인하세요.',
        archived_at: null,
        total_work_packages: 5,
        open_work_packages: 3,
        completion_percent: 40,
        overdue_count: 1,
        status_counts: [
          { key: 'backlog', count: 1 },
          { key: 'todo', count: 1 },
          { key: 'in_progress', count: 1 },
          { key: 'in_review', count: 0 },
          { key: 'done', count: 2 },
          { key: 'cancelled', count: 0 },
        ],
        priority_counts: [
          { key: 'none', count: 2 },
          { key: 'low', count: 0 },
          { key: 'medium', count: 1 },
          { key: 'high', count: 2 },
          { key: 'urgent', count: 0 },
        ],
        type_counts: [
          { key: 'task', count: 3 },
          { key: 'bug', count: 2 },
        ],
        total_estimated_hours: 40,
        total_spent_hours: 10.5,
        budget: 1000000,
        total_cost: 250000,
        recent_work_packages: [
          {
            id: wpA.id,
            subject: wpA.subject,
            status: wpA.status,
            priority: wpA.priority,
            assignee_name: 'Dev User',
            updated_at: wpA.updated_at,
          },
        ],
      },
    }),
  )
  const paChanged = {
    id: 'pa1',
    work_package_id: wpA.id,
    work_package_subject: '워크패키지 API 구현',
    actor_id: 'me-1',
    actor_name: 'Dev User',
    action: 'field_changed',
    field: 'status',
    old_value: 'todo',
    new_value: 'in_progress',
    created_at: '2026-07-05T00:00:00Z',
  }
  const paComment = {
    ...paChanged,
    id: 'pa2',
    actor_id: 'u-alex',
    actor_name: 'Alex Kim',
    action: 'commented',
    field: null,
    old_value: null,
    new_value: null,
    created_at: '2026-07-06T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/activities**`, (route) => {
    const url = new URL(route.request().url())
    const action = url.searchParams.get('action')
    const actorId = url.searchParams.get('actor_id')
    const order = url.searchParams.get('order') ?? 'desc'
    let items = [paComment, paChanged]
    if (action) items = items.filter((a) => a.action === action)
    if (actorId) items = items.filter((a) => a.actor_id === actorId)
    items = [...items].sort((x, y) =>
      order === 'asc'
        ? x.created_at.localeCompare(y.created_at)
        : y.created_at.localeCompare(x.created_at),
    )
    return route.fulfill({ json: { items, total: items.length, truncated: false } })
  })
  const defaultWidgets = [
    'summary',
    'budget',
    'progress',
    'status_distribution',
    'priority_distribution',
    'type_distribution',
    'recent_activity',
  ]
  let personalWidgets: string[] | null = null
  let sharedWidgets: string[] | null = null
  let sharedVersion = 0
  let failSharedUpdateOnce = false
  const layoutPayload = () => {
    const source = personalWidgets ? 'personal' : sharedWidgets ? 'shared' : 'builtin'
    return {
      widgets: personalWidgets ?? sharedWidgets ?? defaultWidgets,
      updated_at: source === 'builtin' ? null : '2026-07-07T00:00:00Z',
      is_default: source === 'builtin',
      source,
      shared_layout: sharedWidgets
        ? {
            widgets: sharedWidgets,
            version: sharedVersion,
            updated_at: '2026-07-07T00:00:00Z',
            updated_by_name: 'Dev User',
          }
        : null,
      can_manage_shared: true,
    }
  }
  await page.route(`**/api/v1/projects/${project.id}/dashboard/shared-layout**`, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as {
        widgets: string[]
        expected_version: number
      }
      expect(body.expected_version).toBe(sharedVersion)
      if (failSharedUpdateOnce) {
        failSharedUpdateOnce = false
        await route.fulfill({
          status: 409,
          json: { detail: 'shared dashboard layout version conflict' },
        })
        return
      }
      sharedWidgets = body.widgets
      sharedVersion += 1
      await route.fulfill({ json: layoutPayload() })
      return
    }
    sharedWidgets = null
    sharedVersion = 0
    await route.fulfill({ json: layoutPayload() })
  })
  await page.route(`**/api/v1/projects/${project.id}/dashboard/layout`, async (route) => {
    if (route.request().method() === 'PUT') {
      personalWidgets = (route.request().postDataJSON() as { widgets: string[] }).widgets
      await route.fulfill({ json: layoutPayload() })
      return
    }
    if (route.request().method() === 'DELETE') {
      personalWidgets = null
      await route.fulfill({ json: layoutPayload() })
      return
    }
    await route.fulfill({ json: layoutPayload() })
  })

  await page.goto(`/projects/${project.id}/dashboard`)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: project.name })).toBeVisible()
  await expect(main.getByText('주의')).toBeVisible()
  await expect(main.getByText('일정 위험을 우선 확인하세요.')).toBeVisible()
  await expect(main.getByText('전체 작업')).toBeVisible()
  await expect(main.getByText('완료율')).toBeVisible()
  await expect(main.getByText('40%')).toBeVisible()
  await expect(main.getByText('최근 활동')).toBeVisible()
  await expect(main.getByText('기한 초과')).toBeVisible()
  await expect(main.getByText('10.5 / 40h')).toBeVisible()
  await expect(main.getByText('상태별')).toBeVisible()
  await expect(main.getByText('기본 레이아웃', { exact: true })).toBeVisible()
  // Type distribution widget (Pass 58): renders from the existing payload.
  await expect(main.getByText('타입별')).toBeVisible()
  const recentWork = main.getByRole('region', { name: '최근 작업' })
  await expect(recentWork.getByText(wpA.subject)).toBeVisible()
  await expect(recentWork.getByText('Dev User')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-overview-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-overview-ui/mobile.png',
    fullPage: true,
  })

  // activity filter: only comments remain; order flip puts the change first
  await expect(page.getByText('· 댓글')).toBeVisible()
  await page.getByLabel('활동 종류').selectOption('field_changed')
  await expect(page.getByText('· 댓글')).toBeHidden()
  await expect(page.getByText('todo → in_progress', { exact: false })).toBeVisible()
  await page.getByLabel('활동 종류').selectOption('')
  await page.getByLabel('활동 정렬').selectOption('asc')
  const rows = page.locator('li', { hasText: 'Dev User' })
  await expect(rows.first()).toContainText('todo → in_progress')

  // actor filter (Pass 38): pick Alex → only the comment row; reset restores.
  await page.getByLabel('활동 멤버').selectOption('u-alex')
  await expect(page.getByText('· 댓글')).toBeVisible()
  await expect(page.getByText('todo → in_progress', { exact: false })).toBeHidden()
  await page.getByLabel('활동 멤버').selectOption('')
  await expect(page.getByText('todo → in_progress', { exact: false })).toBeVisible()

  // Publish a shared layout, keep a private override, then return to shared.
  await page.getByRole('button', { name: '위젯 편집' }).click()
  await page.getByLabel('비용/예산 타일 표시').uncheck()
  await page.getByRole('button', { name: '프로젝트 공유로 게시' }).click()
  await expect(main.getByText('프로젝트 공유', { exact: true })).toBeVisible()
  await expect(page.getByText('비용 합계')).toBeHidden()
  expect(sharedWidgets).toEqual([
    'summary',
    'progress',
    'status_distribution',
    'priority_distribution',
    'type_distribution',
    'recent_activity',
  ])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/shared-dashboard-layouts-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/shared-dashboard-layouts-ui/mobile.png',
    fullPage: true,
  })

  // A stale owner tab keeps its draft and can refresh/retry the shared revision.
  failSharedUpdateOnce = true
  await page.getByRole('button', { name: '위젯 편집' }).click()
  await page.getByLabel('우선순위별 분포 표시').uncheck()
  await page.getByRole('button', { name: '프로젝트 공유 업데이트' }).click()
  await expect(page.getByRole('alert')).toContainText('편집 초안은 유지됩니다')
  await expect(page.getByLabel('우선순위별 분포 표시')).not.toBeChecked()
  await page.getByRole('button', { name: '최신 공유 버전 불러오기' }).click()
  await page.getByRole('button', { name: '프로젝트 공유 업데이트' }).click()
  await expect(main.getByText('프로젝트 공유', { exact: true })).toBeVisible()
  expect(sharedWidgets).toEqual([
    'summary',
    'progress',
    'status_distribution',
    'type_distribution',
    'recent_activity',
  ])

  await page.getByRole('button', { name: '위젯 편집' }).click()
  await page.getByLabel('상태별 분포 표시').uncheck()
  await page.getByRole('button', { name: '개인 레이아웃 저장' }).click()
  await expect(main.getByText('개인 레이아웃', { exact: true })).toBeVisible()
  expect(personalWidgets).toEqual([
    'summary',
    'progress',
    'type_distribution',
    'recent_activity',
  ])
  await page.getByRole('button', { name: '공유 레이아웃으로 돌아가기' }).click()
  await expect(main.getByText('프로젝트 공유', { exact: true })).toBeVisible()
  await expect(main.getByText('상태별')).toBeVisible()
  await expect(main.getByText('우선순위별')).toBeHidden()

  await page.getByRole('button', { name: '공유 레이아웃 삭제' }).click()
  await page.getByRole('button', { name: '삭제 확인' }).click()
  await expect(main.getByText('기본 레이아웃', { exact: true })).toBeVisible()
  await expect(page.getByText('비용 합계')).toBeVisible()

  await recentWork.getByRole('button', { name: wpA.subject }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages\\?wp=${wpA.id}`))
  await page.goBack()
  await main.getByRole('button', { name: '전체 보기' }).click()
  await expect(page).toHaveURL(`/projects/${project.id}/work-packages`)
})

test('보관된 빈 프로젝트 개요가 읽기 상태와 empty state를 표시한다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/dashboard`, (route) =>
    route.fulfill({
      json: {
        id: project.id,
        key: project.key,
        name: project.name,
        description: null,
        health: null,
        health_note: null,
        archived_at: '2026-07-11T00:00:00Z',
        total_work_packages: 0,
        open_work_packages: 0,
        completion_percent: 0,
        overdue_count: 0,
        status_counts: [],
        priority_counts: [],
        type_counts: [],
        total_estimated_hours: 0,
        total_spent_hours: 0,
        budget: null,
        total_cost: 0,
        recent_work_packages: [],
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/dashboard/layout`, (route) =>
    route.fulfill({
      json: {
        widgets: ['summary'],
        updated_at: '2026-07-10T00:00:00Z',
        is_default: false,
        source: 'shared',
        shared_layout: {
          widgets: ['summary'],
          version: 1,
          updated_at: '2026-07-10T00:00:00Z',
          updated_by_name: 'Dev User',
        },
        can_manage_shared: false,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/dashboard`)
  await expect(page.getByText('보관됨')).toBeVisible()
  await expect(page.getByText('프로젝트 공유', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '공유 레이아웃 삭제' })).toHaveCount(0)
  await page.getByRole('button', { name: '위젯 편집' }).click()
  await expect(page.getByRole('button', { name: /프로젝트 공유/ })).toHaveCount(0)
  await expect(page.getByText('아직 작업이 없습니다.')).toBeVisible()
  await expect(page.getByText('0%')).toBeVisible()
})

test('뷰어는 목록에서 생성·벌크 컨트롤이 없고 읽기 전용 안내를 본다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) => route.fulfill({ json: project }))

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('읽기 전용입니다', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '새 작업' })).toBeHidden()
  await expect(page.getByRole('region', { name: '새 작업 생성' })).toHaveCount(0)
  // No selection column → no bulk bar can appear.
  await expect(page.getByRole('checkbox', { name: /선택$/ })).toHaveCount(0)
  const row = page.getByRole('row', { name: /워크패키지 API 구현/ })
  await row.hover()
  await row.getByRole('button', { name: '행 작업' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText('읽기 전용', { exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '복제' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '이동' })).toHaveCount(0)
})

test('뷰어 드로어는 필드가 읽기 전용이고 복제·이동·댓글이 없다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) => route.fulfill({ json: project }))

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  // Read-only notice replaces the action row; write controls are gone.
  await expect(drawer.getByText('읽기 전용입니다', { exact: false })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '복제' })).toBeHidden()
  await expect(drawer.getByRole('button', { name: '이동' })).toBeHidden()
  await expect(drawer.getByLabel('댓글 입력')).toHaveCount(0)
  // Fields render but are not editable.
  await expect(drawer.getByLabel('제목', { exact: false }).first()).toHaveAttribute('readonly', '')
  await expect(drawer.locator('#wp-status')).toBeDisabled()
  await expect(drawer.getByRole('button', { name: /상태 변경:/ })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: /우선순위 변경:/ })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: /담당자 변경:/ })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: /시작일 변경:/ })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: /기한 변경:/ })).toHaveCount(0)
  await expect(drawer.getByLabel('상태: 할 일')).toBeVisible()
  await expect(drawer.getByLabel('우선순위: 높음')).toBeVisible()
  await expect(drawer.getByLabel('담당자: 미배정')).toBeVisible()
  await expect(drawer.getByLabel('시작일: 2026. 7. 1.')).toBeVisible()
  await expect(drawer.getByLabel('기한: 2026. 7. 15.')).toBeVisible()
})

test('DHTMLX 타임라인이 막대·의존선·마일스톤을 그리고 읽기 전용이다', async ({ page }) => {
  await mockApi(page)
  // one drawable dependency + one whose endpoint has no bar (omitted note),
  // plus a 'relates' pair that must NOT draw (not a dependency).
  await page.route(`**/api/v1/projects/${project.id}/relations**`, (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'rel-1', source_id: wpA.id, target_id: wpB.id, relation_type: 'precedes' },
          { id: 'rel-2', source_id: wpA.id, target_id: 'ghost-wp', relation_type: 'blocks' },
          { id: 'rel-3', source_id: wpA.id, target_id: wpB.id, relation_type: 'relates' },
        ],
        total: 3,
        truncated: false,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'ms-1',
            project_id: project.id,
            name: 'v1 릴리스',
            due_date: '2026-07-20',
            description: null,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/timeline`)
  const chart = page.getByTestId('gantt-container')
  // Bars render as gantt task lines with our status classes.
  await expect(chart.locator(`[data-task-id="${wpA.id}"].gantt_task_line`)).toBeVisible()
  await expect(chart.locator(`[data-task-id="${wpB.id}"].gantt_task_line`)).toBeVisible()
  // Exactly ONE dependency link (precedes) — relates never draws; the ghost
  // endpoint is reported as omitted instead.
  await expect(chart.locator('.gantt_task_link')).toHaveCount(1)
  await expect(page.getByText('일정 미정으로 표시되지 않은 의존 1건', { exact: false })).toBeVisible()
  // Milestone row renders as a gantt milestone.
  await expect(chart.locator('.gantt_task_line.gantt_milestone')).toHaveCount(1)
  await expect(page.getByText('2026.07').first()).toBeVisible() // month scale header

  // XSS regression (v73.1 R1-⓪): no element injected from task text templates.
  await expect(chart.locator('.gantt_grid img')).toHaveCount(0)

  // Zoom presets persist via localStorage across a reload (Pass 36 parity).
  await page.getByRole('button', { name: '일', exact: true }).click({ force: true })
  await expect(page.getByRole('button', { name: '일', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.reload()
  await expect(page.getByRole('button', { name: '일', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '자동', exact: true }).click({ force: true })

  // Read-only: double-click never opens the built-in editor (lightbox).
  await chart.locator(`[data-task-id="${wpA.id}"].gantt_task_line`).dblclick({ force: true })
  await expect(page.locator('.gantt_cal_light')).toHaveCount(0)

  // Bar click deep-links into the drawer (?wp=).
  await chart.locator(`[data-task-id="${wpA.id}"].gantt_task_line`).click({ force: true })
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
})

test('타임라인 드래그로 일정을 조정하면 PATCH를 보내고 실패 시 되돌린다', async ({ page }) => {
  await mockApi(page)
  // Editable gate: me-1 must be an owner/member AND the project unarchived.
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  let patchCount = 0
  let failNext = false
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: wpA })
    patchCount += 1
    if (failNext) {
      return route.fulfill({ status: 422, json: { detail: 'start_date must be <= due_date' } })
    }
    const sent = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { ...wpA, ...sent, version: 1 } })
  })

  await page.goto(`/projects/${project.id}/timeline`)
  await expect(page.getByText('막대를 드래그해 일정을 조정할 수 있습니다')).toBeVisible()
  const bar = page.getByTestId('gantt-container').locator(`[data-task-id="${wpA.id}"].gantt_task_line`)
  await expect(bar).toBeVisible()

  const drag = async () => {
    let box = await bar.boundingBox()
    await expect.poll(async () => {
      box = await bar.boundingBox()
      return box
    }, { message: '타임라인 막대의 안정된 좌표를 기다립니다.' }).not.toBeNull()
    if (!box) throw new Error('타임라인 막대 좌표를 확인할 수 없습니다.')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()
  }

  const patched = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes(`/work-packages/${wpA.id}`),
  )
  await drag()
  const sent = (await patched).postDataJSON() as {
    start_date: string
    due_date: string
    expected_version: number
  }
  // Moved right — dates travel as date-only strings with the version token.
  expect(sent.expected_version).toBe(0)
  expect(sent.start_date > wpA.start_date!).toBe(true)
  expect(sent.due_date > wpA.due_date!).toBe(true)

  // Failure path (v74.1 R1-①): a 422 rolls the bar back with a notice.
  // The success invalidation re-renders the chart — wait for the bar to settle.
  await expect(bar).toBeVisible()
  await page.waitForTimeout(300)
  failNext = true
  await drag()
  await expect(page.getByText('일정을 저장하지 못해 원래대로 되돌렸습니다.')).toBeVisible()
  expect(patchCount).toBe(2)
})

test('뷰어에게는 타임라인 드래그가 비활성이다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  let patchCount = 0
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() === 'PATCH') patchCount += 1
    return route.fulfill({ json: wpA })
  })

  await page.goto(`/projects/${project.id}/timeline`)
  const bar = page.getByTestId('gantt-container').locator(`[data-task-id="${wpA.id}"].gantt_task_line`)
  await expect(bar).toBeVisible()
  await expect(page.getByText('막대를 드래그해 일정을 조정할 수 있습니다')).toBeHidden()
  let box = await bar.boundingBox()
  await expect.poll(async () => {
    box = await bar.boundingBox()
    return box
  }, { message: '읽기 전용 타임라인 막대의 안정된 좌표를 기다립니다.' }).not.toBeNull()
  if (!box) throw new Error('읽기 전용 타임라인 막대 좌표를 확인할 수 없습니다.')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  expect(patchCount).toBe(0)
})

test('타임라인 항목 액션 메뉴가 링크·복제·이동·전체 페이지 흐름을 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [project, { ...project, id: 'p-2', key: 'TWO', name: '두번째 프로젝트' }],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-timeline', subject: '(복사) 워크패키지 API 구현' },
        skipped_custom_values: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/timeline`)
  const action = page.getByRole('button', { name: '워크패키지 API 구현 타임라인 항목 작업' })
  await expect(action).toBeVisible()

  await action.click()
  await page.getByRole('menuitem', { name: '링크 복사' }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('__copied_timeline_item_link')))
    .toContain(`/projects/${project.id}/work-packages/${wpA.id}`)
  await expect(page.getByText('링크', { exact: false })).toBeVisible()

  await action.click()
  const duplicatePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await page.getByRole('menuitem', { name: '복제' }).click()
  await duplicatePost
  await expect(page.getByText("'(복사) 워크패키지 API 구현' 생성됨", { exact: false })).toBeVisible()

  await action.click()
  await page.getByRole('menuitem', { name: '이동 패널 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
  await expect(page).toHaveURL(/move=1/)
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByLabel('이동 대상 프로젝트')).toBeVisible()
  await drawer.getByRole('button', { name: '닫기' }).click()
  await expect(page).not.toHaveURL(/move=1/)

  await action.click()
  await page.getByRole('menuitem', { name: '전체 페이지 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
})

test('모바일 타임라인 항목 액션 메뉴는 hover 없이 열리고 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)

  await page.goto(`/projects/${project.id}/timeline`)
  const action = page.getByRole('button', { name: '워크패키지 API 구현 타임라인 항목 작업' })
  await expect(action).toBeVisible()
  await action.click()

  const menu = page.getByRole('menu', { name: '워크패키지 API 구현 타임라인 항목 작업' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('타임라인 항목')).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/timeline-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('뷰어 타임라인 항목 액션 메뉴는 쓰기 액션 없이 읽기 전용으로 표시된다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/timeline`)
  await page.getByRole('button', { name: '워크패키지 API 구현 타임라인 항목 작업' }).click()
  const menu = page.getByRole('menu', { name: '워크패키지 API 구현 타임라인 항목 작업' })

  await expect(menu.getByText('쓰기 권한 없음')).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '복제' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '이동 패널 열기' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '전체 페이지 열기' })).toBeVisible()
})

test('설정 화면에서 멤버를 보여주고 소유자가 멤버를 추가한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: projects }),
  )
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'me-1',
        email: 'dev@oneflow.local',
        display_name: 'Dev User',
        is_active: true,
      },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { email: string; role: string }
      await route.fulfill({
        status: 201,
        json: { user_id: 'u2', email: sent.email, display_name: 'New', role: sent.role },
      })
      return
    }
    await route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        ],
        total: 1,
      },
    })
  })

  await page.goto(`/projects/${project.id}/settings`)
  await page.getByRole('tab', { name: '멤버' }).click()
  await expect(page.getByText('dev@oneflow.local')).toBeVisible()
  await expect(page.getByText('(나)')).toBeVisible()

  const addPost = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes(`/projects/${project.id}/members`),
  )
  await page.getByLabel('추가할 멤버 이메일').fill('alex@oneflow.local')
  await page.getByRole('button', { name: '추가' }).click()
  const req = await addPost
  expect((req.postDataJSON() as { email: string }).email).toBe('alex@oneflow.local')
})

test('멤버 패널: 뷰어 옵션을 제공하고 역할 변경 payload를 보낸다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
          { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
        ],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members/u-alex`, (route) =>
    route.fulfill({
      json: { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'viewer' },
    }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=members`)
  await expect(page.getByText('alex@oneflow.local')).toBeVisible()

  // Both selects offer the new viewer role.
  await expect(page.getByLabel('추가 역할').locator('option[value="viewer"]')).toHaveText('뷰어')

  const rolePatch = page.waitForRequest(
    (req) => req.method() === 'PATCH' && req.url().includes(`/members/u-alex`),
  )
  await page.getByLabel('Alex Kim 역할').selectOption('viewer')
  const patchReq = await rolePatch
  expect((patchReq.postDataJSON() as { role: string }).role).toBe('viewer')
})

test('멤버 패널: 역할별 권한 표를 렌더하고 내 역할 열을 강조한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'member' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/permissions`, (route) =>
    route.fulfill({
      json: {
        my_role: 'member',
        verbs: [
          {
            key: 'member.manage',
            label: '멤버 추가·역할 변경·제거',
            owner: 'always',
            member: 'never',
            viewer: 'never',
            condition: null,
            note: null,
          },
          {
            key: 'entry.delete',
            label: '시간/비용 항목 삭제',
            owner: 'always',
            member: 'conditional',
            viewer: 'never',
            condition: '본인이 기록한 항목만',
            note: null,
          },
        ],
      },
    }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=members`)
  const table = page.getByRole('region', { name: '권한' })
  await expect(table.getByText('멤버 추가·역할 변경·제거')).toBeVisible()
  await expect(table.getByText('조건부', { exact: true })).toHaveAttribute(
    'title',
    '본인이 기록한 항목만',
  )
  // My role (member) header cell is highlighted; others are not.
  await expect(table.getByRole('columnheader', { name: '멤버' })).toHaveClass(/bg-of-accent-soft/)
  await expect(table.getByRole('columnheader', { name: '소유자' })).not.toHaveClass(
    /bg-of-accent-soft/,
  )
})

test('프로젝트 팀 표면은 모바일에서 멤버 카드와 권한 카드를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/permissions`, (route) =>
    route.fulfill({
      json: {
        my_role: 'owner',
        verbs: [
          {
            key: 'member.manage',
            label: '멤버 추가·역할 변경·제거',
            owner: 'always',
            member: 'never',
            viewer: 'never',
            condition: null,
            note: null,
          },
          {
            key: 'entry.delete',
            label: '시간/비용 항목 삭제',
            owner: 'always',
            member: 'conditional',
            viewer: 'never',
            condition: '본인이 기록한 항목만',
            note: null,
          },
        ],
      },
    }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=members`)
  await expect(page.getByRole('heading', { name: '프로젝트 설정' })).toBeVisible()
  await expect(page.getByText('전체 멤버')).toBeVisible()
  await expect(page.getByLabel('멤버 카드 목록')).toBeVisible()
  await expect(page.getByText('alex@oneflow.local')).toBeVisible()
  await expect(page.getByLabel('Alex Kim 역할')).toBeVisible()
  const permissions = page.getByRole('region', { name: '권한' })
  await expect(permissions.getByText('멤버 추가·역할 변경·제거')).toBeVisible()
  await expect(permissions.getByText('조건부', { exact: true })).toHaveAttribute(
    'title',
    '본인이 기록한 항목만',
  )
  await expectNoHorizontalOverflow(page)
  await page.getByLabel('멤버 카드 목록').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/team-members-ui/mobile.png',
    fullPage: true,
  })
})

test('설정 탭: 딥링크·미저장 가드·뒤로가기가 동작한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
          { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
        ],
        total: 2,
      },
    }),
  )

  // Deep link straight into the milestones tab via ?tab=.
  await page.goto(`/projects/${project.id}/settings?tab=milestones`)
  await expect(page.getByRole('tab', { name: '마일스톤' })).toHaveAttribute('aria-selected', 'true')

  // Clean switch pushes URL state → browser back returns to the previous tab.
  await page.getByRole('tab', { name: '멤버' }).click()
  await expect(page.getByText('alex@oneflow.local')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('tab', { name: '마일스톤' })).toHaveAttribute('aria-selected', 'true')

  // One persistent handler + an action queue: `once` per click is racy on slow
  // runners (a late dialog can consume the wrong handler → "already handled").
  const dialogActions: Array<'dismiss' | 'accept'> = []
  let dialogCount = 0
  page.on('dialog', (d) => {
    dialogCount += 1
    const action = dialogActions.shift() ?? 'dismiss'
    void (action === 'accept' ? d.accept() : d.dismiss())
  })

  // A typed draft makes the section dirty → switching tabs must ask first.
  await page.getByLabel('마일스톤 이름').fill('임시 초안')
  dialogActions.push('dismiss')
  await page.getByRole('tab', { name: '멤버' }).click()
  // Dismissed → still on milestones, draft kept. Poll until the dialog was
  // actually consumed so the next push can't be stolen by a late dialog.
  await expect.poll(() => dialogActions.length).toBe(0)
  await expect(page.getByRole('tab', { name: '마일스톤' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('마일스톤 이름')).toHaveValue('임시 초안')

  // Accepted → switch proceeds and the draft is discarded with the panel.
  dialogActions.push('accept')
  await page.getByRole('tab', { name: '멤버' }).click()
  await expect(page.getByText('alex@oneflow.local')).toBeVisible()
  // Exactly one confirm per guarded switch — more means the guard double-fired,
  // which is a product bug rather than flakiness.
  expect(dialogCount).toBe(2)
})

test('내 작업 홈이 배정·기한임박·활동을 모아 보여주고 딥링크한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'n-home-1',
            kind: 'assigned',
            project_id: project.id,
            work_package_id: wpA.id,
            work_package_subject: wpA.subject,
            actor_name: 'Dev User',
            read: false,
            created_at: '2026-07-05T09:00:00Z',
          },
        ],
        total: 1,
        unread: 1,
      },
    }),
  )
  await page.route('**/api/v1/me/work', (route) =>
    route.fulfill({
      json: {
        assigned_to_me: [
          {
            id: wpA.id,
            project_id: project.id,
            project_name: project.name,
            subject: wpA.subject,
            type: wpA.type,
            status: wpA.status,
            priority: wpA.priority,
            due_date: wpA.due_date,
          },
        ],
        due_soon: [
          {
            id: wpA.id,
            project_id: project.id,
            project_name: project.name,
            subject: wpA.subject,
            type: wpA.type,
            status: wpA.status,
            priority: wpA.priority,
            due_date: wpA.due_date,
          },
        ],
        created_by_me: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            project_id: project.id,
            project_name: project.name,
            subject: '위임한 작업',
            type: 'task',
            status: 'todo',
            priority: 'medium',
            due_date: null,
            assignee_id: 'u-alex',
            assignee_name: 'Alex Kim',
          },
        ],
        recent_activity: [
          {
            id: 'ma-1',
            project_id: project.id,
            project_name: project.name,
            work_package_id: wpA.id,
            work_package_subject: wpA.subject,
            actor_name: 'Dev User',
            action: 'created',
            field: null,
            old_value: null,
            new_value: null,
            created_at: '2026-07-05T09:00:00Z',
          },
        ],
      },
    }),
  )

  await page.route('**/api/v1/me/time-entries**', (route) =>
    route.fulfill({
      json: {
        from_date: '2026-07-02',
        to_date: '2026-07-08',
        items: [
          {
            id: 'te-1',
            work_package_id: wpA.id,
            work_package_subject: wpA.subject,
            project_id: project.id,
            project_name: project.name,
            hours: 2.5,
            note: null,
            spent_on: '2026-07-07',
          },
        ],
        total: 1,
        total_hours: 2.5,
        by_project: [{ project_id: project.id, project_name: project.name, hours: 2.5 }],
      },
    }),
  )

  await page.goto('/my')
  await expect(page.getByRole('heading', { name: '내 작업' })).toBeVisible()
  const quickLinks = page.getByRole('region', { name: '빠른 이동' })
  await expect(quickLinks.getByRole('link', { name: /전체 작업/ })).toBeVisible()
  await expect(quickLinks.getByRole('link', { name: /인박스/ })).toContainText('읽지 않음 1건')
  await expect(quickLinks.getByRole('link', { name: /운영 허브/ })).toBeVisible()
  await expect(page.getByRole('region', { name: '프로젝트 바로가기' }).getByText(project.name)).toBeVisible()
  const aiWorkspace = page.getByRole('region', { name: 'AI workspace' })
  await expect(aiWorkspace.getByText('꺼짐')).toBeVisible()
  await expect(aiWorkspace.getByRole('link', { name: '시스템 상태' })).toBeVisible()
  await expect(aiWorkspace.getByRole('link', { name: 'AI 요약 열기' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '최근 항목' })).toBeVisible()
  const dueSoon = page.getByRole('region', { name: '기한 임박' })
  await expect(dueSoon.getByText(wpA.subject)).toBeVisible()
  await expect(page.getByRole('region', { name: '최근 활동' }).getByText(/생성/)).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-home/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-home/mobile.png',
    fullPage: true,
  })

  // Personal time (Pass 53): total, per-project bar row, and the entry
  // deep-links into the WP drawer.
  const timeSection = page.getByRole('region', { name: '내 시간' })
  await expect(timeSection.getByText('2.5h').first()).toBeVisible()
  await expect(timeSection.getByText(project.name)).toBeVisible()
  await expect(timeSection.getByRole('button', { name: wpA.subject })).toBeVisible()

  // Delegation section (Pass 45): the item I created shows its assignee.
  const createdSection = page.getByRole('region', { name: '내가 만든 작업' })
  await expect(createdSection.getByText('위임한 작업')).toBeVisible()
  await expect(createdSection.getByText('Alex Kim')).toBeVisible()

  // An assigned item deep-links into the owning project's list with the drawer open.
  await page
    .getByRole('region', { name: '나에게 배정됨' })
    .getByRole('button', { name: new RegExp(wpA.subject) })
    .click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages\\?wp=${wpA.id}`))
})

test('내 작업 홈 위젯 관리는 표시 상태를 저장하고 복원한다', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('oneflow.workspace-home.legacy-seeded')) return
    window.localStorage.setItem(
      'oneflow.workspace-home.widgets.v1',
      JSON.stringify({
        ai: true,
        quickLinks: true,
        projectShortcuts: true,
        recents: true,
        personalNotes: true,
      }),
    )
    window.sessionStorage.setItem('oneflow.workspace-home.legacy-seeded', 'true')
  })
  await page.route('**/api/v1/me/work', (route) =>
    route.fulfill({
      json: {
        assigned_to_me: [],
        due_soon: [],
        created_by_me: [],
        recent_activity: [],
      },
    }),
  )
  await page.route('**/api/v1/me/time-entries**', (route) =>
    route.fulfill({ json: { items: [], total: 0, total_hours: 0, by_project: [] } }),
  )

  await page.goto('/my')
  await expect(page.getByRole('region', { name: 'AI workspace' })).toBeVisible()
  const riskSummary = page.getByRole('region', { name: '프로젝트 위험 요약' })
  await expect(riskSummary).toBeVisible()
  await expect(riskSummary.getByText('현재 주의가 필요한 활성 프로젝트가 없습니다.')).toBeVisible()
  await page.getByRole('button', { name: '위젯 관리' }).click()
  const widgetsMenu = page.getByRole('menu')
  await expect(widgetsMenu.getByRole('menuitemcheckbox', { name: 'AI workspace' })).toHaveAttribute(
    'data-state',
    'checked',
  )
  await expect(
    widgetsMenu.getByRole('menuitemcheckbox', { name: '프로젝트 위험' }),
  ).toHaveAttribute('data-state', 'checked')
  await widgetsMenu.getByRole('menuitemcheckbox', { name: 'AI workspace' }).click()
  await widgetsMenu.getByRole('menuitemcheckbox', { name: '프로젝트 위험' }).click()
  await widgetsMenu.getByRole('menuitemcheckbox', { name: '개인 메모' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'AI workspace' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '프로젝트 위험 요약' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '개인 메모' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '빠른 이동' })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-home-widgets-ui/desktop.png',
    fullPage: true,
  })

  await page.reload()
  await expect(page.getByRole('region', { name: 'AI workspace' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '프로젝트 위험 요약' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '개인 메모' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '위젯 관리' }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-home-widgets-ui/mobile.png',
    fullPage: true,
  })
  await page.getByRole('menuitem', { name: '모든 위젯 복원' }).click()
  await expect(page.getByRole('region', { name: 'AI workspace' })).toBeVisible()
  await expect(page.getByRole('region', { name: '프로젝트 위험 요약' })).toBeVisible()
  await expect(page.getByRole('region', { name: '개인 메모' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'AI workspace' })).toBeVisible()
  await expect(page.getByRole('region', { name: '프로젝트 위험 요약' })).toBeVisible()
  await expect(page.getByRole('region', { name: '개인 메모' })).toBeVisible()
})

test('워크스페이스 홈 위험 요약은 실제 rollup을 우선순위로 표시하고 Overview로 연결한다', async ({
  page,
}) => {
  await mockApi(page)
  const offTrack = projectListItem(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '납기 위험 프로젝트',
    {
      health: 'off_track',
      health_note: '핵심 납기 회복 계획 확인 필요',
      overdue_count: 0,
      open_work_package_count: 8,
    },
  )
  const atRisk = projectListItem(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '품질 주의 프로젝트',
    { health: 'at_risk', overdue_count: 2, open_work_package_count: 5 },
  )
  const overdueOnly = projectListItem(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '기한 초과 프로젝트',
    { health: 'on_track', overdue_count: 4, open_work_package_count: 11 },
  )
  const archived = projectListItem(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '보관된 위험 프로젝트',
    {
      archived_at: '2026-07-16T00:00:00Z',
      health: 'off_track',
      overdue_count: 99,
      open_work_package_count: 99,
    },
  )
  let releaseProjectResponse = () => {}
  const projectResponseGate = new Promise<void>((resolve) => {
    releaseProjectResponse = resolve
  })
  await page.unroute('**/api/v1/projects')
  await page.route('**/api/v1/projects', async (route) => {
    await projectResponseGate
    await route.fulfill({
      json: { items: [overdueOnly, archived, atRisk, offTrack], total: 4 } satisfies ProjectList,
    })
  })
  await page.route('**/api/v1/me/work', (route) =>
    route.fulfill({
      json: { assigned_to_me: [], due_soon: [], created_by_me: [], recent_activity: [] },
    }),
  )
  await page.route('**/api/v1/me/time-entries**', (route) =>
    route.fulfill({ json: { items: [], total: 0, total_hours: 0, by_project: [] } }),
  )

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/my')
  const region = page.getByRole('region', { name: '프로젝트 위험 요약' })
  await expect(region.getByText('프로젝트 위험 정보를 불러오는 중입니다.')).toBeVisible()
  releaseProjectResponse()
  await expect(region.getByText('주의 필요 3')).toBeVisible()
  await expect(region.getByText('기한 초과 작업 6')).toBeVisible()
  const riskLinks = region.getByRole('link', { name: /프로젝트 개요$/ })
  await expect(riskLinks).toHaveCount(3)
  await expect(riskLinks.nth(0)).toHaveAccessibleName('납기 위험 프로젝트 프로젝트 개요')
  await expect(riskLinks.nth(1)).toHaveAccessibleName('품질 주의 프로젝트 프로젝트 개요')
  await expect(riskLinks.nth(2)).toHaveAccessibleName('기한 초과 프로젝트 프로젝트 개요')
  await expect(riskLinks.nth(0)).toHaveAttribute('href', `/projects/${offTrack.id}/overview`)
  await expect(riskLinks.nth(1)).toContainText('기한 초과 2')
  await expect(riskLinks.nth(2)).toContainText('정상')
  await expect(region.getByText(archived.name)).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-risk-summary-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await expect(riskLinks.nth(0)).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-risk-summary-ui/mobile.png',
    fullPage: true,
  })
})

test('워크스페이스 홈 위험 요약 오류는 명시적 재시도로 복구한다', async ({ page }) => {
  await mockApi(page)
  const recoveredProject = projectListItem(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '복구 확인 프로젝트',
    { health: 'at_risk', overdue_count: 1, open_work_package_count: 3 },
  )
  let attempts = 0
  await page.unroute('**/api/v1/projects')
  await page.route('**/api/v1/projects', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({ status: 403, json: { detail: 'project directory unavailable' } })
      return
    }
    await route.fulfill({
      json: { items: [recoveredProject], total: 1 } satisfies ProjectList,
    })
  })
  await page.route('**/api/v1/me/work', (route) =>
    route.fulfill({
      json: { assigned_to_me: [], due_soon: [], created_by_me: [], recent_activity: [] },
    }),
  )
  await page.route('**/api/v1/me/time-entries**', (route) =>
    route.fulfill({ json: { items: [], total: 0, total_hours: 0, by_project: [] } }),
  )

  await page.goto('/my')
  const region = page.getByRole('region', { name: '프로젝트 위험 요약' })
  await expect(region.getByRole('alert')).toContainText(
    '프로젝트 위험 정보를 불러오지 못했습니다.',
  )
  await region.getByRole('button', { name: '다시 시도' }).click()
  await expect(region.getByRole('link', { name: '복구 확인 프로젝트 프로젝트 개요' })).toBeVisible()
  expect(attempts).toBe(2)
})

test('Workspace Home 빠른 링크가 개인 CRUD와 순서를 실제 요청에 연결한다', async ({
  page,
}) => {
  await mockApi(page)
  await page.route('**/api/v1/me/work', (route) =>
    route.fulfill({
      json: { assigned_to_me: [], due_soon: [], created_by_me: [], recent_activity: [] },
    }),
  )
  await page.route('**/api/v1/me/time-entries**', (route) =>
    route.fulfill({ json: { items: [], total: 0, total_hours: 0, by_project: [] } }),
  )

  await page.goto('/my')
  const region = page.getByRole('region', { name: '빠른 이동' })
  await expect(region.getByText('내 링크 0/8')).toBeVisible()

  const firstCreate = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/v1/me/quick-links'),
  )
  await region.getByRole('button', { name: '빠른 링크 추가' }).click()
  await page.getByLabel('이름').fill('팀 핸드북')
  await page.getByLabel('주소').fill('/wiki?section=team')
  await page.getByRole('button', { name: '저장' }).click()
  expect((await firstCreate).postDataJSON()).toEqual({
    title: '팀 핸드북',
    destination: '/wiki?section=team',
  })
  await expect(region.getByRole('link', { name: /팀 핸드북/ })).toHaveAttribute(
    'href',
    '/wiki?section=team',
  )

  await region.getByRole('button', { name: '빠른 링크 추가' }).click()
  await page.getByLabel('이름').fill('제품 문서')
  await page.getByLabel('주소').fill('https://docs.example.com/guide')
  await page.getByRole('button', { name: '저장' }).click()
  const external = region.getByRole('link', { name: /제품 문서/ })
  await expect(external).toHaveAttribute('target', '_blank')
  await expect(external).toHaveAttribute('rel', 'noopener noreferrer')

  await region.getByRole('button', { name: '팀 핸드북 빠른 링크 관리' }).click()
  await page.getByRole('menuitem', { name: '편집' }).click()
  await page.getByLabel('이름').fill('협업 핸드북')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(region.getByRole('link', { name: /협업 핸드북/ })).toBeVisible()

  const orderRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' && request.url().endsWith('/api/v1/me/quick-links/order'),
  )
  await region.getByRole('button', { name: '제품 문서 빠른 링크 관리' }).click()
  await page.getByRole('menuitem', { name: '앞으로 이동' }).click()
  const orderBody = (await orderRequest).postDataJSON() as { items: Array<{ id: string }> }
  expect(orderBody.items[0].id).toBe('00000000-0000-4000-8000-000000000002')

  await region.getByRole('button', { name: '협업 핸드북 빠른 링크 관리' }).click()
  await page.getByRole('menuitem', { name: '삭제' }).click()
  await expect(page.getByRole('heading', { name: '빠른 링크 삭제' })).toBeVisible()
  await page.getByRole('button', { name: '삭제' }).click()
  await expect(region.getByRole('link', { name: /협업 핸드북/ })).toHaveCount(0)
  await expect(region.getByText('내 링크 1/8')).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-quick-links-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-quick-links-ui/mobile.png',
    fullPage: true,
  })
})

test('내 작업 탭이 관계·검색·범위·정렬·페이지 상태를 URL과 API에 연결한다', async ({
  page,
}) => {
  await mockApi(page)
  await page.route('**/api/v1/me/work-items**', (route) => {
    const url = new URL(route.request().url())
    const relationship = url.searchParams.get('relationship') ?? 'assigned'
    const state = url.searchParams.get('state') ?? 'open'
    const sort = url.searchParams.get('sort') ?? 'updated'
    const q = url.searchParams.get('q') ?? '전체'
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const item = offset > 0 ? wpB : wpA
    const body: MyWorkItemList = {
      items: [
        {
          id: item.id,
          project_id: project.id,
          project_name: project.name,
          subject: `${relationship} · ${state} · ${sort} · ${q}`,
          type: item.type,
          status: item.status,
          priority: item.priority,
          due_date: item.due_date,
          assignee_id: relationship === 'assigned' ? 'me-1' : 'u-alex',
          assignee_name: relationship === 'assigned' ? 'Dev User' : 'Alex Kim',
          updated_at: item.updated_at,
        },
      ],
      total: relationship === 'assigned' ? 26 : 1,
      limit: 25,
      offset,
    }
    return route.fulfill({ json: body })
  })
  await page.route('**/api/v1/me/activities**', (route) => {
    const body: MyActivityList = {
      items: [
        {
          id: 'my-activity-1',
          project_id: project.id,
          project_name: project.name,
          work_package_id: wpA.id,
          work_package_subject: wpA.subject,
          actor_name: 'Dev User',
          action: 'commented',
          field: null,
          old_value: null,
          new_value: null,
          created_at: '2026-07-11T08:00:00Z',
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    }
    return route.fulfill({ json: body })
  })

  await page.goto('/my?tab=assigned')
  await expect(page.getByRole('heading', { name: '나에게 배정된 작업' })).toBeVisible()
  await expect(page.getByText('assigned · open · updated · 전체')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/your-work-tabs-ui/desktop.png',
    fullPage: true,
  })

  await page.getByLabel('내 작업 검색').fill('결제')
  await page.getByLabel('내 작업 검색').press('Enter')
  await page.getByLabel('작업 범위').selectOption('all')
  await page.getByLabel('작업 정렬').selectOption('due')
  await expect(page).toHaveURL(/tab=assigned.*q=%EA%B2%B0%EC%A0%9C.*state=all.*sort=due/)
  await expect(page.getByText('assigned · all · due · 결제')).toBeVisible()

  await page.getByRole('button', { name: '초기화' }).click()
  await page.getByRole('button', { name: '다음 페이지' }).click()
  await expect(page).toHaveURL(/offset=25/)
  await expect(page.getByText('26-26 / 26')).toBeVisible()
  await page.getByRole('button', { name: '이전 페이지' }).click()
  await expect(page).not.toHaveURL(/offset=/)
  await page.goBack()
  await expect(page).toHaveURL(/offset=25/)
  await expect(page.getByText('26-26 / 26')).toBeVisible()
  await page.goForward()
  await expect(page).not.toHaveURL(/offset=/)

  await page.getByRole('link', { name: '생성함' }).click()
  await expect(page.getByText('created · open · updated · 전체')).toBeVisible()
  await page.getByRole('link', { name: '구독' }).click()
  await expect(page.getByText('subscribed · open · updated · 전체')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/your-work-tabs-ui/mobile.png',
    fullPage: true,
  })

  await page.getByRole('link', { name: '활동' }).click()
  const activities = page.getByRole('list', { name: '내 프로젝트 활동 목록' })
  await expect(activities.getByText(wpA.subject)).toBeVisible()
  await expect(activities.getByText(/댓글/)).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('내 작업 탭이 오류 재시도 후 빈 상태를 복구한다', async ({ page }) => {
  await mockApi(page)
  let shouldFail = true
  await page.route('**/api/v1/me/work-items**', (route) => {
    if (shouldFail) return route.fulfill({ status: 500, json: { detail: 'temporary' } })
    const body: MyWorkItemList = { items: [], total: 0, limit: 25, offset: 0 }
    return route.fulfill({ json: body })
  })

  await page.goto('/my?tab=subscribed')
  await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다')
  shouldFail = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('조건에 맞는 구독 작업이 없습니다.')).toBeVisible()
})

test('AI workspace가 켜진 AI 요약 기능을 보이는 작업 상세로 연결한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/capabilities', (route) =>
    route.fulfill({ json: { ai_summary_enabled: true } }),
  )
  await page.route('**/api/v1/me/work', (route) =>
    route.fulfill({
      json: {
        assigned_to_me: [
          {
            id: wpA.id,
            project_id: project.id,
            project_name: project.name,
            subject: wpA.subject,
            type: wpA.type,
            status: wpA.status,
            priority: wpA.priority,
            due_date: wpA.due_date,
            assignee_id: 'me-1',
            assignee_name: 'Dev User',
          },
        ],
        due_soon: [],
        created_by_me: [],
        recent_activity: [],
      },
    }),
  )
  await page.route('**/api/v1/me/time-entries**', (route) =>
    route.fulfill({
      json: {
        from_date: '2026-07-02',
        to_date: '2026-07-08',
        items: [],
        total: 0,
        total_hours: 0,
        by_project: [],
      },
    }),
  )

  await page.goto('/my')
  const aiWorkspace = page.getByRole('region', { name: 'AI workspace' })
  await expect(aiWorkspace.getByText('사용 가능')).toBeVisible()
  await expect(aiWorkspace.getByText(wpA.subject)).toBeVisible()
  await expect(aiWorkspace.getByRole('link', { name: 'AI 요약 열기' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await aiWorkspace.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/ai-workspace-ui/mobile.png',
    fullPage: true,
  })

  await aiWorkspace.getByRole('link', { name: 'AI 요약 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages\\?wp=${wpA.id}`))
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('AI 요약')).toBeVisible()
  await expect(drawer.getByRole('button', { name: '요약 생성' })).toBeVisible()
})

test('사이클 페이지가 상태 그룹·진행률을 보여주고 소유자가 생성한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  // Register AFTER mockApi so this takes precedence over the empty default.
  await page.route(`**/api/v1/projects/${project.id}/cycles`, async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { name: string }
      await route.fulfill({
        status: 201,
        json: {
          id: 'cy-new',
          project_id: project.id,
          name: sent.name,
          description: null,
          start_date: '2026-07-20',
          end_date: '2026-08-02',
          status: 'upcoming',
          work_package_count: 0,
          done_work_package_count: 0,
          member_count: 0,
          created_at: '2026-07-06T00:00:00Z',
          updated_at: '2026-07-06T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: 'cy-1',
            project_id: project.id,
            name: '7월 스프린트',
            description: null,
            start_date: '2026-07-01',
            end_date: '2026-07-14',
            status: 'active',
            work_package_count: 4,
            done_work_package_count: 1,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
          {
            id: 'cy-2',
            project_id: project.id,
            name: '6월 스프린트',
            description: null,
            start_date: '2026-06-01',
            end_date: '2026-06-14',
            status: 'completed',
            work_package_count: 5,
            done_work_package_count: 5,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z',
          },
          {
            id: 'cy-0',
            project_id: project.id,
            name: '5월 스프린트',
            description: null,
            start_date: '2026-05-01',
            end_date: '2026-05-14',
            status: 'completed',
            work_package_count: 4,
            done_work_package_count: 3,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-01T00:00:00Z',
          },
        ],
        total: 3,
      },
    })
  })

  await page.goto(`/projects/${project.id}/cycles`)
  // Velocity (Pass 55): the two completed cycles chart with an average.
  const velocity = page.getByRole('region', { name: '벨로시티' })
  await expect(velocity.getByText('평균 4.0건', { exact: false })).toBeVisible()
  await expect(velocity.getByLabel('6월 스프린트 완료 5건')).toBeVisible()
  await expect(velocity.getByLabel('5월 스프린트 완료 3건')).toBeVisible()

  // Grouped by derived status with progress counts.
  const active = page.getByRole('region', { name: '진행 중' })
  await expect(active.getByText('7월 스프린트')).toBeVisible()
  await expect(active.getByText('1/4')).toBeVisible()
  await expect(page.getByRole('region', { name: '완료' }).getByRole('button', { name: '6월 스프린트', exact: true })).toBeVisible()

  // Owner creates a cycle.
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/projects/${project.id}/cycles`),
  )
  // burndown: toggling the row section fetches and draws the chart
  await page.route(`**/api/v1/projects/${project.id}/cycles/*/burndown`, (route) =>
    route.fulfill({
      json: {
        scope: 'tracked_assignment',
        tracking_started_at: '2026-07-02T04:30:00Z',
        coverage_start: '2026-07-02',
        coverage_complete: false,
        total_scope: 4,
        current_scope: 3,
        added_count: 2,
        removed_count: 1,
        delivered: 2,
        days: [
          { date: '2026-07-02', scope: 3, remaining: 3, delivered: 0 },
          { date: '2026-07-03', scope: 4, remaining: 3, delivered: 1 },
          { date: '2026-07-04', scope: 3, remaining: 1, delivered: 2 },
        ],
      },
    }),
  )
  await active.getByRole('button', { name: '7월 스프린트 사이클 작업' }).click()
  await page.getByRole('menuitem', { name: '번다운 보기' }).click()
  await expect(page.getByTestId('burndown-chart')).toBeVisible()
  await expect(page.getByText('배정 이력 기준 · 2026-07-02 이후')).toBeVisible()
  await expect(page.getByText('+2 / -1')).toBeVisible()
  await expect(page.getByLabel('사이클 범위 3건, 잔여 1건')).toBeVisible()
  await page.getByTestId('burndown-chart').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/cycle-scope-analytics-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('burndown-chart')).toBeVisible()
  await page.getByTestId('burndown-chart').scrollIntoViewIfNeeded()
  const chartBox = await page.getByTestId('burndown-chart').boundingBox()
  expect(chartBox?.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/cycle-scope-analytics-ui/mobile.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 720 })

  await active.getByRole('button', { name: '7월 스프린트 사이클 작업' }).click()
  await page.getByRole('menuitem', { name: '편집' }).click()
  await expect(page.getByLabel('사이클 이름 편집')).toHaveValue('7월 스프린트')
  await page.getByRole('button', { name: '취소' }).click()

  await page.getByLabel('새 사이클 이름').fill('8월 스프린트')
  await page.getByLabel('새 사이클 시작일').fill('2026-07-20')
  await page.getByLabel('새 사이클 종료일').fill('2026-08-02')
  await page.getByRole('button', { name: '사이클 추가' }).click()
  const req = await post
  expect((req.postDataJSON() as { name: string }).name).toBe('8월 스프린트')
})

test('모듈 참여자 패널에서 체크 후 저장하면 PUT user_ids를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
          { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
          { user_id: 'u-vera', email: 'vera@oneflow.local', display_name: 'Vera', role: 'viewer' },
        ],
        total: 3,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/modules`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'md-1',
            project_id: project.id,
            name: '인증 모듈',
            description: null,
            lead_id: null,
            state: 'in_progress',
            start_date: null,
            target_date: null,
            work_package_count: 0,
            done_work_package_count: 0,
            member_count: 0,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  let roster: { user_id: string; display_name: string; email: string }[] = []
  await page.route(`**/api/v1/projects/${project.id}/modules/md-1/members`, async (route) => {
    if (route.request().method() === 'PUT') {
      const sent = route.request().postDataJSON() as { user_ids: string[] }
      roster = sent.user_ids.map((id) => ({
        user_id: id,
        display_name: id === 'u-alex' ? 'Alex Kim' : 'Dev User',
        email: `${id}@x`,
      }))
      await route.fulfill({ json: { items: roster, total: roster.length } })
      return
    }
    await route.fulfill({ json: { items: roster, total: roster.length } })
  })

  await page.goto(`/projects/${project.id}/modules`)
  const moduleAction = page.getByRole('button', { name: '인증 모듈 모듈 작업' })
  const dockTrigger = page.getByRole('button', { name: '빠른 도구 열기' })
  await expect.poll(async () => {
    const [actionBox, dockBox] = await Promise.all([
      moduleAction.boundingBox(),
      dockTrigger.boundingBox(),
    ])
    if (!actionBox || !dockBox) return true
    return !(
      actionBox.x < dockBox.x + dockBox.width &&
      actionBox.x + actionBox.width > dockBox.x &&
      actionBox.y < dockBox.y + dockBox.height &&
      actionBox.y + actionBox.height > dockBox.y
    )
  }).toBe(true)
  await moduleAction.click()
  await page.getByRole('menuitem', { name: '참여자 관리' }).click()
  // Viewers cannot participate — the checkbox is disabled.
  await expect(page.getByLabel('인증 모듈 참여자 Vera')).toBeDisabled()

  const put = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/modules/md-1/members'),
  )
  await page.getByLabel('인증 모듈 참여자 Alex Kim').check()
  await page.getByRole('button', { name: '참여자 저장' }).click()
  expect(((await put).postDataJSON() as { user_ids: string[] }).user_ids).toEqual(['u-alex'])
  await expect(page.getByLabel('인증 모듈 참여자 Alex Kim')).toBeChecked()
})

test('모듈 페이지가 상태 그룹·리드·진행률을 보여주고 소유자가 생성한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  // Register AFTER mockApi so this takes precedence over the empty default.
  await page.route(`**/api/v1/projects/${project.id}/modules`, async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { name: string }
      await route.fulfill({
        status: 201,
        json: {
          id: 'md-new',
          project_id: project.id,
          name: sent.name,
          description: null,
          lead_id: null,
          state: 'planned',
          start_date: null,
          target_date: null,
          work_package_count: 0,
          done_work_package_count: 0,
          member_count: 0,
          created_at: '2026-07-06T00:00:00Z',
          updated_at: '2026-07-06T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: 'md-1',
            project_id: project.id,
            name: '인증 모듈',
            description: null,
            lead_id: 'u-alex',
            state: 'in_progress',
            start_date: '2026-07-01',
            target_date: '2026-08-31',
            work_package_count: 6,
            done_work_package_count: 2,
            member_count: 1,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    })
  })
  await page.route(`**/api/v1/projects/${project.id}/modules/md-1`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const sent = route.request().postDataJSON() as {
        name?: string
        lead_id?: string | null
        state?: string
      }
      await route.fulfill({
        json: {
          id: 'md-1',
          project_id: project.id,
          name: sent.name ?? '인증 모듈',
          description: null,
          lead_id: sent.lead_id ?? 'u-alex',
          state: sent.state ?? 'in_progress',
          start_date: '2026-07-01',
          target_date: '2026-08-31',
          work_package_count: 6,
          done_work_package_count: 2,
          member_count: 1,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-02T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { detail: 'not found' } })
  })

  await page.goto(`/projects/${project.id}/modules`)
  const active = page.getByRole('region', { name: '진행 중' })
  await expect(active.getByText('인증 모듈')).toBeVisible()
  await expect(active.getByText('리드: Alex Kim')).toBeVisible()
  await expect(active.getByText('2/6')).toBeVisible()

  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/modules/md-1'),
  )
  await active.getByRole('button', { name: '인증 모듈 모듈 작업' }).click()
  await page.getByRole('menuitem', { name: '편집' }).click()
  await expect(page.getByLabel('모듈 이름 편집')).toHaveValue('인증 모듈')
  await page.getByLabel('모듈 상태 편집').selectOption('paused')
  await page.getByRole('button', { name: '저장' }).click()
  expect(((await patch).postDataJSON() as { state: string }).state).toBe('paused')

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/projects/${project.id}/modules`),
  )
  await page.getByLabel('새 모듈 이름').fill('결제 모듈')
  await page.getByRole('button', { name: '모듈 추가' }).click()
  const req = await post
  expect((req.postDataJSON() as { name: string }).name).toBe('결제 모듈')

  // Gallery layout (Pass 56): toggle renders cards and survives a reload.
  await page.getByRole('button', { name: '갤러리' }).click()
  await expect(page.locator('ul.grid li').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('ul.grid li').first()).toBeVisible()

  // Timeline-lite (Pass 59): dated modules render bars; undated list below.
  await page.getByRole('button', { name: '타임라인' }).click()
  await expect(page.getByLabel(/기간$/).first()).toBeVisible()

  await page.getByRole('button', { name: '목록' }).click()
  await expect(page.locator('ul.grid li')).toHaveCount(0)
})

test('모듈 작업 메뉴가 모바일 폭에서 잘리고 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/modules`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'md-1',
            project_id: project.id,
            name: '인증 모듈',
            description: null,
            lead_id: 'u-alex',
            state: 'in_progress',
            start_date: '2026-07-01',
            target_date: '2026-08-31',
            work_package_count: 6,
            done_work_package_count: 2,
            member_count: 1,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/modules`)
  await page.getByRole('button', { name: '인증 모듈 모듈 작업' }).click()
  const menu = page.getByRole('menu', { name: '인증 모듈 모듈 작업' })
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/module-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('모듈 작업 메뉴는 viewer에게 쓰기 액션을 숨긴다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            user_id: 'me-1',
            email: 'dev@oneflow.local',
            display_name: 'Dev User',
            role: 'viewer',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/modules`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'md-1',
            project_id: project.id,
            name: '인증 모듈',
            description: null,
            lead_id: null,
            state: 'in_progress',
            start_date: null,
            target_date: null,
            work_package_count: 3,
            done_work_package_count: 1,
            member_count: 0,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/modules`)
  await expect(page.getByLabel('새 모듈 이름')).toHaveCount(0)
  await page.getByRole('button', { name: '인증 모듈 모듈 작업' }).click()
  const menu = page.getByRole('menu', { name: '인증 모듈 모듈 작업' })
  await expect(menu.getByRole('menuitem', { name: '작업 목록 열기' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '참여자 관리' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '쓰기 권한 없음' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '편집' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '삭제' })).toHaveCount(0)
})

test('드로어에서 워치 토글이 PUT/DELETE를 보낸다', async ({ page }) => {
  await mockApi(page)
  let watching = false
  await page.route(`**/api/v1/work-packages/${wpA.id}/watchers/me`, async (route) => {
    watching = route.request().method() === 'PUT'
    await route.fulfill({ status: 204 })
  })
  await page.route(`**/api/v1/work-packages/${wpA.id}/watchers`, (route) =>
    route.fulfill({
      json: watching
        ? { items: [{ user_id: 'u-dev', display_name: 'Dev User' }], total: 1, me_watching: true }
        : { items: [], total: 0, me_watching: false },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()

  const put = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes(`/work-packages/${wpA.id}/watchers/me`),
  )
  await page.getByRole('button', { name: '워치', exact: true }).click()
  await put
  await expect(page.getByRole('button', { name: '워치 해제' })).toBeVisible()

  const del = page.waitForRequest(
    (r) => r.method() === 'DELETE' && r.url().includes(`/work-packages/${wpA.id}/watchers/me`),
  )
  await page.getByRole('button', { name: '워치 해제' }).click()
  await del
})

test('워처 구독 표면은 모바일에서 알림 단서와 참여자를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/watchers`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'u-dev', display_name: 'Dev User' },
          { user_id: 'u-ops', display_name: 'Ops Lead' },
          { user_id: 'u-qa', display_name: 'QA Owner' },
          { user_id: 'u-pm', display_name: 'PM Lead' },
        ],
        total: 4,
        me_watching: true,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()

  const section = page.getByRole('region', { name: '워처 구독' })
  await expect(section.getByText('내가 구독 중')).toBeVisible()
  await expect(section.getByRole('button', { name: '워치 해제' })).toBeVisible()
  await expect(section.getByText('상태 변경')).toBeVisible()
  await expect(section.getByText('댓글', { exact: true })).toBeVisible()
  await expect(section.getByText('담당자', { exact: true })).toBeVisible()
  await expect(section.getByText('Dev User')).toBeVisible()
  await expect(section.getByText('Ops Lead')).toBeVisible()
  await expect(section.getByText('QA Owner')).toBeVisible()
  await expect(section.getByText('+1')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/watchers-ui/mobile.png',
    fullPage: true,
  })
})

test('개인 설정에서 알림 토글이 PUT을 보내고 구 딥링크가 리다이렉트된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  // Override mockApi's GET-only default with a PUT-aware handler.
  let notificationSettings = {
    assigned: true,
    watched: true,
    commented: true,
    mention: true,
    due_alerts: true,
    overdue_reminder_days: 0 as 0 | 3 | 7 | 14,
    intake: true,
    initiatives: true,
  }
  await page.route('**/api/v1/me/notification-settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const sent = route.request().postDataJSON() as Partial<typeof notificationSettings>
      notificationSettings = { ...notificationSettings, ...sent }
      await route.fulfill({
        json: notificationSettings,
      })
      return
    }
    await route.fulfill({ json: notificationSettings })
  })

  // The OLD project-settings deep link follows the moved panel (Pass 64).
  await page.goto(`/projects/${project.id}/settings?tab=notifications`)
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: '개인 설정' })).toBeVisible()
  await expect(page.getByText('dev@oneflow.local')).toBeVisible() // account card

  const put = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/me/notification-settings'),
  )
  await page.getByLabel(/워치 알림/).click()
  const req = await put
  expect((req.postDataJSON() as { watched: boolean }).watched).toBe(false)
  await expect(page.getByLabel(/워치 알림/)).not.toBeChecked()

  const cadencePut = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/me/notification-settings'),
  )
  await page.getByLabel('초과 재알림 주기').selectOption('7')
  expect(
    ((await cadencePut).postDataJSON() as { overdue_reminder_days: number })
      .overdue_reminder_days,
  ).toBe(7)
  await expect(page.getByText('매주 같은 간격으로 남아 있는 초과 작업을 다시 알립니다.')).toBeVisible()

  // Due-date alerts toggle (Pass 40) sends its own key.
  const duePut = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/me/notification-settings'),
  )
  await page.getByLabel(/기한 알림/).click()
  expect(((await duePut).postDataJSON() as { due_alerts: boolean }).due_alerts).toBe(false)
  await expect(page.getByLabel('초과 재알림 주기')).toBeDisabled()
  await expect(
    page.getByText('기한 알림을 켜면 재알림 주기를 선택할 수 있습니다.'),
  ).toBeVisible()

  const initiativePut = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/me/notification-settings'),
  )
  await page.getByLabel(/이니셔티브 알림/).click()
  expect(
    ((await initiativePut).postDataJSON() as { initiatives: boolean }).initiatives,
  ).toBe(false)

  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/overdue-reminders-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('초과 재알림 주기')).toBeVisible()
  await page.getByText('알림 설정 (내 계정)').scrollIntoViewIfNeeded()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/overdue-reminders-ui/mobile.png',
    fullPage: true,
  })
})

test('개인 알림 설정은 로딩 오류와 재시도를 기능적으로 처리한다', async ({ page }) => {
  await mockApi(page)
  let attempts = 0
  let releaseFirstResponse: (() => void) | undefined
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirstResponse = resolve
  })
  await page.route('**/api/v1/me/notification-settings', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await firstResponse
      await route.fulfill({
        status: 422,
        json: { detail: '알림 설정을 읽을 수 없습니다.' },
      })
      return
    }
    await route.fulfill({
      json: {
        assigned: true,
        watched: true,
        commented: true,
        mention: true,
        due_alerts: true,
        overdue_reminder_days: 3,
        intake: true,
        initiatives: true,
      },
    })
  })

  await page.goto('/settings')
  await expect(page.getByRole('status', { name: '알림 설정 불러오는 중' })).toBeVisible()
  releaseFirstResponse?.()
  await expect(page.getByText('알림 설정을 불러오지 못했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByLabel('초과 재알림 주기')).toHaveValue('3')
  expect(attempts).toBe(2)
})

test('개인 설정에서 액세스 토큰을 생성하고 폐기한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  let tokens = [
    {
      id: 'tok-existing',
      name: '배포 스크립트',
      token_prefix: 'ofp_existing',
      created_at: '2026-07-01T00:00:00Z',
      expires_at: '2026-09-29T00:00:00Z',
      revoked_at: null as string | null,
      last_used_at: null as string | null,
    },
  ]
  await page.route('**/api/v1/me/access-tokens**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const sent = request.postDataJSON() as { name: string; expires_in_days: number }
      const created = {
        id: 'tok-created',
        name: sent.name,
        token_prefix: 'ofp_created',
        created_at: '2026-07-10T00:00:00Z',
        expires_at: '2026-10-08T00:00:00Z',
        revoked_at: null,
        last_used_at: null,
      }
      tokens = [created, ...tokens]
      await route.fulfill({ status: 201, json: { token: 'ofp_created_secret_once', item: created } })
      return
    }
    if (request.method() === 'DELETE') {
      const id = request.url().split('/').pop()
      tokens = tokens.map((token) =>
        token.id === id ? { ...token, revoked_at: '2026-07-10T01:00:00Z' } : token,
      )
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ json: { items: tokens, total: tokens.length } })
  })

  await page.goto('/settings')
  const tokenSection = page.getByRole('region', { name: '개발자 액세스 토큰' })
  await expect(tokenSection.getByText('배포 스크립트')).toBeVisible()

  const post = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/me/access-tokens'),
  )
  await tokenSection.getByLabel('토큰 이름').fill('통합 스크립트')
  await tokenSection.getByLabel('유효 일수').fill('45')
  await tokenSection.getByRole('button', { name: '토큰 생성' }).click()
  expect((await post).postDataJSON()).toEqual({ name: '통합 스크립트', expires_in_days: 45 })
  await expect(tokenSection.getByLabel('새 액세스 토큰')).toContainText(
    'ofp_created_secret_once',
  )
  await expectNoHorizontalOverflow(page)
  await tokenSection.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/developer-security-ui/mobile.png',
    fullPage: true,
  })

  const del = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().includes('/me/access-tokens/tok-existing'),
  )
  await tokenSection.getByRole('button', { name: '배포 스크립트 폐기' }).click()
  await del
  await expect(tokenSection.getByText('폐기됨')).toBeVisible()
})

test('개인 설정에서 활성 브라우저 세션을 확인하고 종료한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        has_client_secret: false,
        command_palette_enabled: false,
        session_management_enabled: true,
      },
    }),
  )
  let sessions = [
    {
      id: 'session-current',
      created_at: '2026-07-11T08:00:00Z',
      expires_at: '2026-07-18T08:00:00Z',
      is_current: true,
    },
    {
      id: 'session-other',
      created_at: '2026-07-10T08:00:00Z',
      expires_at: '2026-07-17T08:00:00Z',
      is_current: false,
    },
  ]
  let otherRevokeFailed = false
  await page.route('**/api/v1/me/sessions**', async (route) => {
    if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').pop()
      if (id === 'session-other' && !otherRevokeFailed) {
        otherRevokeFailed = true
        await route.fulfill({ status: 503, json: { detail: 'temporary failure' } })
        return
      }
      sessions = sessions.filter((session) => session.id !== id)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ json: { items: sessions, total: sessions.length } })
  })

  await page.goto('/settings')
  const section = page.getByRole('region', { name: '로그인 및 세션' })
  await expect(section.getByText('현재 세션')).toBeVisible()
  const otherSessionButton = section.getByRole('button', { name: /^26\..*세션 종료$/ })
  await expect(otherSessionButton).toBeVisible()

  const otherDelete = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().endsWith('/me/sessions/session-other'),
  )
  await otherSessionButton.click()
  await otherDelete
  await expect(section.getByRole('alert')).toContainText('세션을 종료하지 못했습니다.')
  const retryDelete = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().endsWith('/me/sessions/session-other'),
  )
  await section.getByRole('button', { name: '다시 시도' }).click()
  await retryDelete
  await expect(otherSessionButton).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await section.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/identity-security-ui/mobile.png',
    fullPage: true,
  })

  const currentDelete = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().endsWith('/me/sessions/session-current'),
  )
  await section.getByRole('button', { name: '현재 세션 종료' }).click()
  await currentDelete
  await expect(page).toHaveURL(/\/login$/)
})

test('개인 설정은 인증 모드별로 지원되는 세션 동작만 노출한다', async ({ page }) => {
  await mockApi(page)
  let sessionRequests = 0
  await page.route('**/api/v1/me/sessions**', async (route) => {
    sessionRequests += 1
    await route.fulfill({ json: { items: [], total: 0 } })
  })

  await page.goto('/settings')
  const devSection = page.getByRole('region', { name: '로그인 및 세션' })
  await expect(devSection.getByText('자동 개발 로그인이 사용 중입니다.')).toBeVisible()
  await expect(devSection.getByRole('button', { name: /세션 종료/ })).toHaveCount(0)
  expect(sessionRequests).toBe(0)

  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'oidc',
        oidc_issuer: 'https://login.example.com/tenant',
        oidc_client_id: 'oneflow-web',
        has_client_secret: true,
        command_palette_enabled: false,
        session_management_enabled: false,
      },
    }),
  )
  await page.reload()
  const oidcSection = page.getByRole('region', { name: '로그인 및 세션' })
  await expect(oidcSection.getByText('SSO 공급자가 세션을 관리합니다.')).toBeVisible()
  await expect(oidcSection.getByText('https://login.example.com/tenant')).toBeVisible()
  await expect(oidcSection.getByText('oneflow-web')).toBeVisible()
  await expect(oidcSection.getByRole('button', { name: /세션 종료/ })).toHaveCount(0)
  expect(sessionRequests).toBe(0)
})

test('워크스페이스 일반 설정은 이름을 저장하고 shell identity에 즉시 반영한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  let profile = {
    id: 1,
    name: 'OneFlow',
    revision: 1,
    updated_by_user_id: null as string | null,
    updated_by_name: null as string | null,
    updated_at: '2026-07-01T00:00:00Z',
  }
  await page.route('**/api/v1/workspace/profile', (route) => route.fulfill({ json: profile }))
  await page.route('**/api/v1/admin/workspace/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: profile, headers: { ETag: `"${profile.revision}"` } })
      return
    }
    const sent = route.request().postDataJSON() as { name: string }
    expect(route.request().headers()['if-match']).toBe('"1"')
    profile = {
      ...profile,
      name: sent.name,
      revision: 2,
      updated_by_user_id: 'me-1',
      updated_by_name: 'Dev User',
      updated_at: '2026-07-11T10:00:00Z',
    }
    await route.fulfill({ json: profile, headers: { ETag: '"2"' } })
  })

  await page.goto('/admin/general')
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const settingsDrawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  const settingsNav = settingsDrawer.getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })
  await expect(settingsNav.getByRole('link', { name: '일반' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await settingsDrawer.getByRole('button', { name: '사이드바 닫기' }).last().click()
  const input = page.getByLabel('워크스페이스 이름')
  await expect(input).toHaveValue('OneFlow')
  await input.fill('Delivery Workspace')
  const patchRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PATCH' && request.url().endsWith('/admin/workspace/profile'),
  )
  await page.getByRole('button', { name: '변경 저장' }).click()
  expect((await patchRequest).postDataJSON()).toEqual({ name: 'Delivery Workspace' })
  await expect(page.getByText('revision 2')).toBeVisible()

  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const mobileNav = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await expect(mobileNav.getByText('Delivery Workspace')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-general-settings-ui/mobile.png',
    fullPage: true,
  })
})

test('워크스페이스 이름 충돌은 입력을 보존하고 최신 revision으로 다시 저장한다', async ({ page }) => {
  await mockApi(page)
  let profile = {
    id: 1,
    name: 'OneFlow',
    revision: 1,
    updated_by_user_id: null as string | null,
    updated_by_name: null as string | null,
    updated_at: '2026-07-01T00:00:00Z',
  }
  let patchCount = 0
  await page.route('**/api/v1/workspace/profile', (route) =>
    route.fulfill({ json: { name: profile.name, revision: profile.revision } }),
  )
  await page.route('**/api/v1/admin/workspace/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: profile, headers: { ETag: `"${profile.revision}"` } })
      return
    }
    patchCount += 1
    if (patchCount === 1) {
      expect(route.request().headers()['if-match']).toBe('"1"')
      profile = {
        ...profile,
        name: 'Operations Workspace',
        revision: 2,
        updated_by_user_id: 'other-admin',
        updated_by_name: 'Other Admin',
        updated_at: '2026-07-11T10:00:00Z',
      }
      await route.fulfill({
        status: 412,
        json: { detail: { code: 'stale_revision', current_revision: 2 } },
        headers: { ETag: '"2"' },
      })
      return
    }
    expect(route.request().headers()['if-match']).toBe('"2"')
    const sent = route.request().postDataJSON() as { name: string }
    profile = { ...profile, name: sent.name, revision: 3, updated_by_name: 'Dev User' }
    await route.fulfill({ json: profile, headers: { ETag: '"3"' } })
  })

  await page.goto('/admin/general')
  const input = page.getByLabel('워크스페이스 이름')
  await input.fill('Delivery Draft')
  await page.getByRole('button', { name: '변경 저장' }).click()
  await expect(page.getByRole('alert')).toContainText('입력값은 유지')
  await expect(input).toHaveValue('Delivery Draft')
  await expect(page.getByText('revision 2')).toBeVisible()
  await page.getByRole('button', { name: '변경 저장' }).click()
  await expect(page.getByText('revision 3')).toBeVisible()
  await expect(input).toHaveValue('Delivery Draft')
})

test('워크스페이스 근무 일정은 요일·휴일과 revision 충돌 복구를 실제 저장한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  let calendar = {
    working_weekdays: [0, 1, 2, 3, 4],
    holidays: [] as string[],
    revision: 1,
    updated_by_user_id: null as string | null,
    updated_by_name: null as string | null,
    updated_at: '2026-07-01T00:00:00Z',
  }
  let patchCount = 0
  await page.route('**/api/v1/workspace/calendar', (route) => route.fulfill({ json: calendar }))
  await page.route('**/api/v1/admin/workspace/calendar', async (route) => {
    patchCount += 1
    if (patchCount === 1) {
      expect(route.request().headers()['if-match']).toBe('"1"')
      calendar = { ...calendar, revision: 2, updated_by_name: 'Other Admin' }
      await route.fulfill({
        status: 412,
        json: { detail: { code: 'stale_revision', current_revision: 2 } },
        headers: { ETag: '"2"' },
      })
      return
    }
    expect(route.request().headers()['if-match']).toBe('"2"')
    const sent = route.request().postDataJSON() as {
      working_weekdays: number[]
      holidays: string[]
    }
    calendar = {
      ...calendar,
      ...sent,
      revision: 3,
      updated_by_user_id: 'me-1',
      updated_by_name: 'Dev User',
      updated_at: '2026-07-15T12:00:00Z',
    }
    await route.fulfill({ json: calendar, headers: { ETag: '"3"' } })
  })

  await page.goto('/admin/calendar')
  await page.getByRole('checkbox', { name: '토' }).check()
  await page.getByLabel('휴일 날짜').fill('2026-07-20')
  await page.getByRole('button', { name: '휴일 추가' }).click()
  await expect(page.getByRole('list', { name: '등록된 휴일' })).toContainText('2026-07-20')

  await page.getByRole('button', { name: '일정 저장' }).click()
  await expect(page.getByRole('alert')).toContainText('현재 선택은 유지')
  await expect(page.getByRole('checkbox', { name: '토' })).toBeChecked()
  await expect(page.getByRole('list', { name: '등록된 휴일' })).toContainText('2026-07-20')
  await expect(page.getByText('revision 2')).toBeVisible()

  const retry = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/admin/workspace/calendar'),
  )
  await page.getByRole('button', { name: '일정 저장' }).click()
  expect((await retry).postDataJSON()).toEqual({
    working_weekdays: [0, 1, 2, 3, 4, 5],
    holidays: ['2026-07-20'],
  })
  await expect(page.getByText('revision 3')).toBeVisible()
  await expect(page.getByText('월 · 화 · 수 · 목 · 금 · 토 · 휴일 1일')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-working-calendar-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: '근무 일정' })).toBeVisible()
  await expect(page.getByText('월 · 화 · 수 · 목 · 금 · 토 · 휴일 1일')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-working-calendar-ui/mobile.png',
    fullPage: true,
  })
})

test('워크스페이스 프로젝트 단계 정의는 충돌을 복구하고 프로젝트 전반에 반영된다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  await mockProjectOverview(page)
  let definitions: WorkspaceProjectPhaseDefinitions = {
    items: [
      { key: 'discover', name: '발견', color: 'sky', position: 0, retired: false, built_in: true },
      { key: 'plan', name: '계획', color: 'indigo', position: 1, retired: false, built_in: true },
      { key: 'deliver', name: '실행', color: 'emerald', position: 2, retired: false, built_in: true },
      { key: 'close', name: '마감', color: 'amber', position: 3, retired: false, built_in: true },
    ],
    revision: 1,
    updated_by_user_id: null as string | null,
    updated_by_name: null as string | null,
    updated_at: '2026-07-01T00:00:00Z',
  }
  let patchCount = 0
  const projectPhases = (): ProjectPhaseList => ({
    items: definitions.items.map((definition) => ({
      ...definition,
      active: definition.key === 'plan' || definition.key === 'discover',
      start_date: definition.key === 'plan'
        ? '2026-07-01'
        : definition.key === 'discover'
          ? '2026-07-13'
          : null,
      end_date: definition.key === 'plan'
        ? '2026-07-10'
        : definition.key === 'discover'
          ? '2026-07-17'
          : null,
      start_gate: {
        kind: 'start' as const,
        name: `${definition.name} 시작 게이트`,
        active: definition.key === 'plan',
        date: definition.key === 'plan' ? '2026-07-01' : null,
      },
      finish_gate: {
        kind: 'finish' as const,
        name: `${definition.name} 완료 게이트`,
        active: definition.key === 'plan',
        date: definition.key === 'plan' ? '2026-07-10' : null,
      },
      version: definition.key === 'plan' || definition.key === 'discover' ? 1 : 0,
    })),
    total: definitions.items.length,
  })

  await page.route('**/api/v1/workspace/project-phase-definitions', (route) =>
    route.fulfill({ json: definitions, headers: { ETag: `"${definitions.revision}"` } }),
  )
  await page.route('**/api/v1/admin/workspace/project-phase-definitions', async (route) => {
    patchCount += 1
    const sent = route.request().postDataJSON() as {
      items: Array<{ key: 'discover' | 'plan' | 'deliver' | 'close'; name: string; color: 'sky' | 'indigo' | 'emerald' | 'amber' }>
    }
    if (patchCount === 1) {
      expect(route.request().headers()['if-match']).toBe('"1"')
      definitions = { ...definitions, revision: 2, updated_by_name: 'Other Admin' }
      await route.fulfill({
        status: 412,
        json: { detail: { code: 'stale_revision', current_revision: 2 } },
        headers: { ETag: '"2"' },
      })
      return
    }
    expect(route.request().headers()['if-match']).toBe('"2"')
    expect(sent.items.map((item) => [item.key, item.name, item.color])).toEqual([
      ['plan', '설계', 'amber'],
      ['discover', '탐색', 'sky'],
      ['deliver', '실행', 'emerald'],
      ['close', '마감', 'amber'],
    ])
    definitions = {
      ...definitions,
      items: sent.items.map((item, position) => ({
        ...item,
        position,
        retired: false,
        built_in: true,
      })),
      revision: 3,
      updated_by_user_id: 'me-1',
      updated_by_name: 'Dev User',
      updated_at: '2026-07-15T13:00:00Z',
    }
    await route.fulfill({ json: definitions, headers: { ETag: '"3"' } })
  })
  await page.route('**/api/v1/projects/*/phases**', (route) =>
    route.fulfill({ json: projectPhases() }),
  )

  await page.goto('/admin/project-phases')
  const surface = page.getByRole('region', { name: '워크스페이스 프로젝트 단계 정의' })
  await surface.getByRole('button', { name: '계획 단계 위로 이동' }).click()
  const rows = surface.locator('ol > li')
  await rows.nth(0).getByLabel('1번째 단계 이름').fill('설계')
  await rows.nth(0).getByText('앰버', { exact: true }).click()
  await rows.nth(1).getByLabel('2번째 단계 이름').fill('탐색')

  await page.getByRole('button', { name: '단계 저장' }).click()
  await expect(page.getByRole('alert')).toContainText('현재 편집은 유지')
  await expect(rows.nth(0).getByLabel('1번째 단계 이름')).toHaveValue('설계')
  await expect(page.getByText('revision 2')).toBeVisible()
  await page.getByRole('button', { name: '단계 저장' }).click()
  await expect(page.getByText('revision 3')).toBeVisible()
  await expect(page.getByText('최근 변경: Dev User')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-phase-definitions-ui/desktop.png',
    fullPage: true,
  })

  await page.goto(`/projects/${project.id}/settings?tab=lifecycle`)
  const panel = page.getByRole('region', { name: '프로젝트 단계 설정' })
  const phaseRows = panel.locator('ol > li')
  await expect(phaseRows.nth(0)).toContainText('설계')
  await expect(phaseRows.nth(1)).toContainText('탐색')
  await expect(panel).toContainText('활성 2/4')

  await page.goto(`/projects/${project.id}/overview`)
  const timeline = page.getByRole('region', { name: '프로젝트 수명주기' })
  const timelinePhases = timeline.locator(':scope > ol > li')
  await expect(timelinePhases.nth(0)).toContainText('설계')
  await expect(timelinePhases.nth(1)).toContainText('탐색')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/project-phases')
  await expect(page.getByRole('heading', { name: '프로젝트 단계' })).toBeVisible()
  await expect(page.getByLabel('1번째 단계 이름')).toHaveValue('설계')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-phase-definitions-ui/mobile.png',
    fullPage: true,
  })
  await page.locator('[data-shell-scroll-region]').evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
  )
  await expect(page.getByLabel('4번째 단계 이름')).toHaveValue('마감')
  await expect(page.getByRole('button', { name: '단계 저장' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-phase-definitions-ui/mobile-bottom.png',
    fullPage: true,
  })
})

test('custom 프로젝트 단계는 생성하고 은퇴해도 프로젝트 데이터를 보존한 채 복원된다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  const customKey = 'custom_0123456789abcdef0123456789abcdef'
  let definitions: WorkspaceProjectPhaseDefinitions = {
    items: [
      { key: 'discover', name: '발견', color: 'sky', position: 0, retired: false, built_in: true },
      { key: 'plan', name: '계획', color: 'indigo', position: 1, retired: false, built_in: true },
      { key: 'deliver', name: '실행', color: 'emerald', position: 2, retired: false, built_in: true },
      { key: 'close', name: '마감', color: 'amber', position: 3, retired: false, built_in: true },
    ],
    revision: 1,
    updated_by_user_id: null,
    updated_by_name: null,
    updated_at: '2026-07-01T00:00:00Z',
  }
  const phaseList = (): ProjectPhaseList => ({
    items: definitions.items.map((definition) => ({
      ...definition,
      active: definition.key === customKey,
      start_date: definition.key === customKey ? '2026-08-03' : null,
      end_date: definition.key === customKey ? '2026-08-07' : null,
      start_gate: {
        kind: 'start',
        name: `${definition.name} 시작 게이트`,
        active: definition.key === customKey,
        date: definition.key === customKey ? '2026-08-03' : null,
      },
      finish_gate: {
        kind: 'finish',
        name: `${definition.name} 완료 게이트`,
        active: false,
        date: null,
      },
      version: definition.key === customKey ? 3 : 0,
    })),
    total: definitions.items.length,
  })

  await page.route('**/api/v1/workspace/project-phase-definitions', (route) =>
    route.fulfill({ json: definitions, headers: { ETag: `"${definitions.revision}"` } }),
  )
  await page.route('**/api/v1/admin/workspace/project-phase-definitions**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const expected = `"${definitions.revision}"`
    expect(route.request().headers()['if-match']).toBe(expected)
    if (path.endsWith('/retire')) {
      definitions = {
        ...definitions,
        items: definitions.items.map((item) =>
          item.key === customKey ? { ...item, retired: true } : item,
        ),
        revision: definitions.revision + 1,
      }
    } else if (path.endsWith('/restore')) {
      definitions = {
        ...definitions,
        items: definitions.items.map((item) =>
          item.key === customKey ? { ...item, retired: false } : item,
        ),
        revision: definitions.revision + 1,
      }
    } else {
      const body = route.request().postDataJSON() as { name: string; color: 'sky' }
      definitions = {
        ...definitions,
        items: [
          ...definitions.items,
          {
            key: customKey,
            name: body.name,
            color: body.color,
            position: definitions.items.length,
            retired: false,
            built_in: false,
          },
        ],
        revision: definitions.revision + 1,
        updated_by_user_id: 'me-1',
        updated_by_name: 'Dev User',
        updated_at: '2026-07-15T15:00:00Z',
      }
    }
    await route.fulfill({ json: definitions, headers: { ETag: `"${definitions.revision}"` } })
  })
  await page.route('**/api/v1/projects/*/phases**', (route) =>
    route.fulfill({ json: phaseList() }),
  )

  await page.goto('/admin/project-phases')
  await page.getByLabel('새 단계 이름').fill('검증')
  await page.getByRole('button', { name: '단계 추가' }).click()
  await expect(page.getByLabel('5번째 단계 이름')).toHaveValue('검증')
  await expect(page.getByText('현재 활성 5/12 · 전체 5/32')).toBeVisible()
  await expect(page.getByText('revision 2')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '검증 단계 은퇴' }).click()
  await expect(page.getByRole('heading', { name: '은퇴한 단계' })).toBeVisible()
  await expect(page.getByRole('button', { name: '복원' })).toBeVisible()
  await expect(page.getByText('revision 3')).toBeVisible()

  await page.goto(`/projects/${project.id}/settings?tab=lifecycle`)
  const panel = page.getByRole('region', { name: '프로젝트 단계 설정' })
  await expect(panel.getByRole('heading', { name: '은퇴한 Workspace 단계' })).toBeVisible()
  await expect(panel).toContainText('2026-08-03 - 2026-08-07 · version 3')
  await expect(panel).toContainText('보존됨')
  await expect(panel).toContainText('활성 0/4')

  await page.goto(`/projects/${project.id}/overview`)
  await expect(page.getByRole('region', { name: '프로젝트 수명주기' })).toHaveCount(0)

  await page.goto('/admin/project-phases')
  await page.getByRole('button', { name: '복원' }).click()
  await expect(page.getByLabel('5번째 단계 이름')).toHaveValue('검증')
  await expect(page.getByRole('heading', { name: '은퇴한 단계' })).toHaveCount(0)
  await expect(page.getByText('revision 4')).toBeVisible()
  await expect(page.getByRole('button', { name: '검증 단계 은퇴' })).toBeEnabled()
  await page.locator('[data-shell-scroll-region]').evaluate((element) =>
    element.scrollTo({ top: 0, behavior: 'instant' }),
  )
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/dynamic-project-phases-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByLabel('5번째 단계 이름')).toHaveValue('검증')
  await expectNoHorizontalOverflow(page)
  const dockAvoidsVisibleControls = () => page.locator('main [role="radiogroup"] label').evaluateAll((controls) => {
    const dock = document.querySelector<HTMLElement>('[data-quick-dock]')
    if (!dock) return false
    const dockBox = dock.getBoundingClientRect()
    return controls
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .every((box) => !(
        box.left < dockBox.right &&
        box.right > dockBox.left &&
        box.top < dockBox.bottom &&
        box.bottom > dockBox.top
      ))
  })
  await expect.poll(dockAvoidsVisibleControls).toBe(true)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/dynamic-project-phases-ui/mobile.png',
    fullPage: true,
  })
})

test('settings/admin IA는 모바일 폭에서 표면별 탐색을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/permissions`, (route) =>
    route.fulfill({
      json: {
        my_role: 'owner',
        verbs: [
          {
            key: 'member.manage',
            label: '멤버 추가·역할 변경·제거',
            owner: 'always',
            member: 'never',
            viewer: 'never',
            condition: null,
            note: null,
          },
        ],
      },
    }),
  )
  await page.route('**/api/v1/users', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'me-1',
            email: 'dev@oneflow.local',
            display_name: 'Dev User',
            is_active: true,
            is_admin: true,
            created_at: '2026-07-01T00:00:00Z',
          },
          {
            id: 'u-alex',
            email: 'alex@oneflow.local',
            display_name: 'Alex Kim',
            is_active: true,
            is_admin: false,
            created_at: '2026-07-02T00:00:00Z',
          },
        ],
        total: 2,
      },
    }),
  )
  await page.route('**/api/v1/ops/status', (route) =>
    route.fulfill({
      json: {
        version: '0.1.0',
        readiness: {
          status: 'warning', ok: 3, warnings: 1, errors: 0,
          generated_at: '2026-07-17T02:00:00Z',
          checks: [
            { id: 'database', label: '데이터베이스 연결', status: 'ok', detail: '데이터베이스가 요청에 응답합니다.', observed: 'reachable', expected: 'reachable' },
            { id: 'schema', label: '데이터베이스 스키마', status: 'ok', detail: '데이터베이스 스키마가 애플리케이션 head와 일치합니다.', observed: '0100', expected: '0100' },
            { id: 'storage', label: '파일 스토리지', status: 'ok', detail: 'LocalStorage에 임시 파일을 쓰고 안전하게 정리했습니다.', observed: 'writable', expected: 'writable' },
            { id: 'auth', label: '인증 구성', status: 'warning', detail: '개발 인증 모드입니다. 공유 배포 전 OIDC로 전환하세요.', observed: 'dev', expected: 'oidc' },
          ],
        },
        database: { status: 'ok', current_revision: '0100', expected_revision: '0100', matches_head: true },
        counts: { projects: 3, work_packages: 42 },
        config: {
          environment: 'development',
          auth_mode: 'dev',
          oidc_provider_count: 0,
          ai_summary_enabled: false,
          storage_backend: 'local',
          upload_max_bytes: 10485760,
          project_storage_quota_bytes: 1073741824,
        },
      },
    }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=members`)
  await expect(page.getByRole('heading', { name: '프로젝트 설정' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '멤버' })).toHaveAttribute('aria-selected', 'true')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/settings-ia/project-settings-mobile.png',
    fullPage: true,
  })

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '개인 설정' })).toBeVisible()
  await expect(page.getByText('알림 설정 (내 계정)')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/settings-ia/personal-settings-mobile.png',
    fullPage: true,
  })

  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible()
  await expect(page.getByText('alex@oneflow.local')).toBeVisible()
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  const workspaceSettings = page.getByRole('dialog', { name: '모바일 내비게이션' }).getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })
  await expect(workspaceSettings.getByText('워크스페이스', { exact: true })).toBeVisible()
  await expect(workspaceSettings.getByText('기능', { exact: true })).toBeVisible()
  await expect(workspaceSettings.getByText('개발자 도구', { exact: true })).toBeVisible()
  await expect(workspaceSettings.getByRole('link', { name: '사용자' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(workspaceSettings.getByRole('link', { name: 'Customers' })).toHaveAttribute(
    'href',
    '/admin/customers',
  )
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-settings-shell-ui/mobile.png',
    fullPage: true,
  })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/settings-ia/admin-users-mobile.png',
    fullPage: true,
  })

  await page.goto('/status')
  await expect(page.getByRole('heading', { name: '시스템 상태' })).toBeVisible()
  await expect(page.getByText('0100')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/settings-ia/status-mobile.png',
    fullPage: true,
  })
})

test('운영 허브는 데이터 이전 이력과 고정 export 파일을 제공한다', async ({ page }) => {
  await mockApi(page)
  const checksum = 'a'.repeat(64)
  const job: DataTransferJob = {
    id: '77777777-7777-4777-8777-777777777777',
    project_id: project.id,
    project_key: project.key,
    project_name: project.name,
    actor_id: 'me-1',
    actor_name: 'Dev User',
    direction: 'export',
    source: 'oneflow',
    dry_run: false,
    status: 'completed',
    total_rows: 2,
    valid_rows: 2,
    invalid_rows: 0,
    inserted_rows: 0,
    checksum,
    errors_truncated: false,
    notes: [],
    artifact_available: true,
    artifact_filename: 'oneflow-work-packages.csv',
    artifact_size_bytes: 82,
    artifact_sha256: 'b'.repeat(64),
    created_at: '2026-07-11T03:00:00Z',
  }
  let history: DataTransferJob[] = []
  let artifactAttempts = 0
  await page.route('**/api/v1/data-transfer-jobs**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/artifact')) {
      artifactAttempts += 1
      if (artifactAttempts === 1) {
        await route.fulfill({ status: 503, json: { detail: 'temporary storage error' } })
        return
      }
      await route.fulfill({
        body: 'subject,status\n워크패키지 API 구현,todo\n보드 뷰 구현,in_progress\n',
        headers: { 'content-type': 'text/csv; charset=utf-8' },
      })
      return
    }
    const selected = url.searchParams.get('project_id')
    const items = selected ? history.filter((item) => item.project_id === selected) : history
    await route.fulfill({ json: { items, total: items.length, limit: 50, offset: 0 } })
  })
  await page.route(
    `**/api/v1/projects/${project.id}/data-transfer-jobs/export`,
    async (route) => {
      history = [job]
      await route.fulfill({
        status: 201,
        json: {
          job_id: job.id,
          row_count: job.total_rows,
          checksum: job.checksum,
          artifact_sha256: job.artifact_sha256,
          artifact_filename: job.artifact_filename,
          artifact_size_bytes: job.artifact_size_bytes,
        },
      })
    },
  )

  await page.goto('/operations')
  await expect(page.getByRole('heading', { name: '운영 허브' })).toBeVisible()
  await expect(page.getByLabel('데이터 작업').getByText('OneFlow 도입')).toBeVisible()
  await expect(page.getByText('기록된 데이터 이전 작업이 없습니다.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' }).getByRole('button', { name: 'More' }).click()
  const morePanel = page.getByRole('dialog', { name: '워크스페이스 더 보기' })
  await expect(morePanel.getByRole('link', { name: '시스템 상태', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: /가져오기/ }).click()
  await expect(page).toHaveURL(/ops=import/)
  await expect(page.getByRole('dialog', { name: 'CSV 가져오기' })).toBeVisible()
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page).not.toHaveURL(/ops=import/)

  await page.goto('/operations')
  const exportReq = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/data-transfer-jobs/export'),
  )
  const artifactReq = page.waitForRequest((req) => req.url().endsWith(`/${job.id}/artifact`))
  await page.getByRole('button', { name: /내보내기/ }).click()
  await exportReq
  await artifactReq
  const historyList = page.getByRole('list', { name: '데이터 이전 이력' })
  await expect(historyList.getByText('OneFlow 도입')).toBeVisible()
  await expect(historyList.getByText('OneFlow · 전체 2')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('파일은 생성됐지만 자동 다운로드에 실패')

  const repeatReq = page.waitForRequest((req) => req.url().endsWith(`/${job.id}/artifact`))
  await page.getByRole('button', { name: '다시 받기' }).click()
  await repeatReq
  await page.getByLabel('데이터 이전 프로젝트 필터').selectOption(project.id)
  await expect(historyList.getByText('OneFlow 도입')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/data-transfer-jobs-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/data-transfer-jobs-ui/mobile.png',
    fullPage: true,
  })
})

test('위험 구역에서 보관 확인 후 POST /archive를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/archive`, (route) =>
    route.fulfill({ json: { ...project, archived_at: '2026-07-06T00:00:00Z' } }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=danger`)
  await expect(page.getByRole('tab', { name: '위험 구역' })).toBeVisible()

  const dialogs: string[] = []
  page.once('dialog', (d) => {
    dialogs.push(d.message())
    void d.accept()
  })
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/archive'),
  )
  await page.getByRole('button', { name: '프로젝트 보관' }).click()
  await post
  expect(dialogs[0]).toContain('보관할까요')
})

test('인테이크 큐에서 소유자가 수락하면 triage POST가 간다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/intake/it-1/triage`, (route) =>
    route.fulfill({
      json: {
        id: 'it-1',
        project_id: project.id,
        title: '검색이 느려요',
        body: null,
        status: 'accepted',
        submitted_by: 'u-alex',
        submitter_name: 'Alex Kim',
        snooze_until: null,
        accepted_wp_id: wpA.id,
        created_at: '2026-07-06T00:00:00Z',
        updated_at: '2026-07-06T00:00:00Z',
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/intake`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'it-1',
            project_id: project.id,
            title: '검색이 느려요',
            body: null,
            status: 'pending',
            submitted_by: 'u-alex',
            submitter_name: 'Alex Kim',
            snooze_until: null,
            accepted_wp_id: null,
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/intake`)
  const pending = page.getByRole('region', { name: '대기' })
  await expect(pending.getByText('검색이 느려요')).toBeVisible()
  await expect(pending.getByText('Alex Kim')).toBeVisible()

  // the triage note travels with the decision (Pass 29)
  await pending.getByLabel('검색이 느려요 판정 사유').fill('다음 분기 성능 작업으로 수락')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/intake/it-1/triage'),
  )
  await pending.getByRole('button', { name: '수락' }).click()
  const sent = (await post).postDataJSON() as { status: string; note: string }
  expect(sent.status).toBe('accepted')
  expect(sent.note).toBe('다음 분기 성능 작업으로 수락')
})

test('인테이크 표면은 모바일에서 제출과 판정 큐를 유지한다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(`**/api/v1/projects/${project.id}/intake`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'it-1',
            project_id: project.id,
            title: '검색이 느려요',
            body: null,
            status: 'pending',
            submitted_by: 'u-alex',
            submitter_name: 'Alex Kim',
            snooze_until: null,
            accepted_wp_id: null,
            triage_note: null,
            triaged_by_id: null,
            triaged_at: null,
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
          {
            id: 'it-2',
            project_id: project.id,
            title: '중복 요청',
            body: null,
            status: 'duplicate',
            submitted_by: 'u-alex',
            submitter_name: 'Alex Kim',
            snooze_until: null,
            accepted_wp_id: null,
            triage_note: '기존 요청과 합침',
            triaged_by_id: 'me-1',
            triaged_at: '2026-07-07T00:00:00Z',
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/intake?item=it-1`)
  await expect(page.getByRole('heading', { name: '인테이크', exact: true })).toBeVisible()
  await expect(page.getByText('열린 요청')).toBeVisible()
  await expect(page.getByLabel('인테이크 요청 제목')).toBeVisible()
  const pending = page.getByRole('region', { name: '대기' })
  await expect(pending.getByText('검색이 느려요')).toBeVisible()
  await expect(pending.getByRole('button', { name: '수락' })).toBeVisible()
  await expect(pending.getByLabel('검색이 느려요 판정 사유')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/intake-ui/mobile.png',
    fullPage: true,
  })
})

test('인테이크 판정 이력은 펼칠 때 지연 조회하고 모바일에서도 전이 흐름을 유지한다', async ({
  page,
}) => {
  await mockApi(page)
  let historyRequests = 0
  await page.route(
    `**/api/v1/projects/${project.id}/intake/it-history/history*`,
    (route) => {
      historyRequests += 1
      return route.fulfill({
        json: {
          items: [
            {
              id: 'decision-2',
              intake_item_id: 'it-history',
              previous_status: 'snoozed',
              status: 'accepted',
              note: '범위를 확인해 작업으로 전환',
              snooze_until: null,
              decided_by: 'me-1',
              decided_by_name: 'Dev User',
              created_at: '2026-07-16T02:30:00Z',
            },
            {
              id: 'decision-1',
              intake_item_id: 'it-history',
              previous_status: 'pending',
              status: 'snoozed',
              note: '다음 스프린트에 재검토',
              snooze_until: '2026-08-01',
              decided_by: 'me-1',
              decided_by_name: 'Dev User',
              created_at: '2026-07-15T02:30:00Z',
            },
          ],
          total: 2,
        },
      })
    },
  )
  await page.route(`**/api/v1/projects/${project.id}/intake`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'it-history',
            project_id: project.id,
            title: '검색 인덱스 개선',
            body: null,
            status: 'accepted',
            submitted_by: 'u-alex',
            submitter_name: 'Alex Kim',
            snooze_until: '2026-08-01',
            accepted_wp_id: wpA.id,
            triage_note: '범위를 확인해 작업으로 전환',
            triaged_by_id: 'me-1',
            triaged_at: '2026-07-16T02:30:00Z',
            created_at: '2026-07-14T02:30:00Z',
            updated_at: '2026-07-16T02:30:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/intake`)
  const disclosure = page.getByRole('button', {
    name: '검색 인덱스 개선 판정 이력 펼치기',
  })
  await expect(disclosure).toBeVisible()
  expect(historyRequests).toBe(0)

  await disclosure.click()
  await expect(
    page.getByRole('button', { name: '검색 인덱스 개선 판정 이력 접기' }),
  ).toBeVisible()
  const timeline = page.getByRole('list', { name: '판정 이력 목록' })
  await expect(timeline.getByText('범위를 확인해 작업으로 전환')).toBeVisible()
  await expect(timeline.getByText('다음 스프린트에 재검토')).toBeVisible()
  await expect(timeline.getByText('2026-08-01까지')).toBeVisible()
  await expect(timeline.getByText('Dev User').first()).toBeVisible()
  expect(historyRequests).toBe(1)
  await expectNoHorizontalOverflow(page)
  await timeline.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/intake-decision-history-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(timeline).toBeVisible()
  await timeline.scrollIntoViewIfNeeded()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/intake-decision-history-ui/mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '검색 인덱스 개선 판정 이력 접기' }).click()
  await expect(timeline).not.toBeVisible()
})

test('설정 필드 탭에서 드롭다운 필드를 정의한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/custom-fields**`, async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { name: string; options: string[] }
      await route.fulfill({
        status: 201,
        json: {
          id: 'cf-new',
          project_id: project.id,
          name: sent.name,
          field_type: 'dropdown',
          options: sent.options,
          position: 0,
          is_active: true,
          applies_to: null,
          created_at: '2026-07-06T00:00:00Z',
          updated_at: '2026-07-06T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({ json: { items: [], total: 0 } })
  })

  await page.goto(`/projects/${project.id}/settings?tab=fields`)
  await page.getByLabel('새 필드 이름').fill('심각도')
  await page.getByLabel('새 필드 타입').selectOption('dropdown')
  await page.getByLabel('드롭다운 옵션').fill('낮음, 높음')

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/custom-fields'),
  )
  await page.getByRole('button', { name: '필드 추가' }).click()
  const sent = (await post).postDataJSON() as { name: string; field_type: string; options: string[] }
  expect(sent.name).toBe('심각도')
  expect(sent.field_type).toBe('dropdown')
  expect(sent.options).toEqual(['낮음', '높음'])
})

test('설정 필드 탭에서 아래로 이동하면 전체 순서 PUT이 간다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  const field = (id: string, name: string, position: number) => ({
    id,
    project_id: project.id,
    name,
    field_type: 'text',
    options: null,
    position,
    is_active: true,
    applies_to: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z',
  })
  await page.route(`**/api/v1/projects/${project.id}/custom-fields**`, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: { items: [field('cf-2', '둘', 0), field('cf-1', '하나', 1)], total: 2 },
      })
      return
    }
    await route.fulfill({
      json: { items: [field('cf-1', '하나', 0), field('cf-2', '둘', 1)], total: 2 },
    })
  })

  await page.goto(`/projects/${project.id}/settings?tab=fields`)
  const put = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/custom-fields/order'),
  )
  await page.getByLabel('하나 아래로').click()
  const sentOrder = (await put).postDataJSON() as { ordered_ids: string[] }
  expect(sentOrder.ordered_ids).toEqual(['cf-2', 'cf-1'])
})

test('드로어 커스텀 필드에 값을 입력하면 델타 PUT이 간다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/custom-fields**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'cf-1',
            project_id: project.id,
            name: '심각도',
            field_type: 'dropdown',
            options: ['낮음', '높음'],
            position: 0,
            is_active: true,
            applies_to: null,
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
          {
            id: 'cf-2',
            project_id: project.id,
            name: '재현 절차',
            field_type: 'text',
            options: null,
            position: 1,
            is_active: true,
            applies_to: ['bug'],
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/custom-values`, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          items: [{ field_id: 'cf-1', value: '높음', member_display_name: null }],
          total: 1,
        },
      })
      return
    }
    await route.fulfill({ json: { items: [], total: 0 } })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()

  const put = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes(`/work-packages/${wpA.id}/custom-values`),
  )
  await page.getByRole('dialog').getByLabel('심각도').selectOption('높음')
  const sent = (await put).postDataJSON() as { values: Array<{ field_id: string; value: string }> }
  expect(sent.values).toEqual([{ field_id: 'cf-1', value: '높음' }])

  // Binding shapes the form: wpA is a 'task', so the bug-only field stays hidden.
  await expect(page.getByRole('dialog').getByLabel('재현 절차')).toHaveCount(0)
})

test('커스텀 필드 표면은 모바일에서 값 카드와 입력 상태를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/custom-fields**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'cf-mobile-1',
            project_id: project.id,
            name: '심각도',
            field_type: 'dropdown',
            options: ['낮음', '높음'],
            position: 0,
            is_active: true,
            applies_to: null,
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
          {
            id: 'cf-mobile-2',
            project_id: project.id,
            name: '점수',
            field_type: 'number',
            options: null,
            position: 1,
            is_active: true,
            applies_to: ['task'],
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
          {
            id: 'cf-mobile-3',
            project_id: project.id,
            name: '레거시 코드',
            field_type: 'text',
            options: null,
            position: 2,
            is_active: false,
            applies_to: null,
            created_at: '2026-07-06T00:00:00Z',
            updated_at: '2026-07-06T00:00:00Z',
          },
        ],
        total: 3,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/custom-values`, (route) =>
    route.fulfill({
      json: {
        items: [
          { field_id: 'cf-mobile-1', value: '높음', member_display_name: null },
          { field_id: 'cf-mobile-3', value: 'A-17', member_display_name: null },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog', { name: '워크패키지 API 구현' })
  const customSection = drawer.getByRole('region', { name: '커스텀 필드' })

  await customSection.scrollIntoViewIfNeeded()
  await expect(customSection.getByText('심각도')).toBeVisible()
  await expect(customSection.getByText('점수')).toBeVisible()
  await expect(customSection.getByText('레거시 코드')).toBeVisible()
  await expect(customSection.getByLabel('심각도')).toBeVisible()
  await expect(customSection.getByLabel('점수')).toBeVisible()
  await expect(customSection.getByText('A-17 (비활성 필드)')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/custom-fields-ui/mobile.png',
    fullPage: true,
  })
})

test('보드에서 카드를 드래그해 옮기면 상태 PATCH가 간다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/board`)
  const card = page.getByRole('button', { name: /워크패키지 API 구현/ })
  await expect(card).toBeVisible()

  const patchReq = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes(`/work-packages/${wpA.id}`),
  )
  await card.dragTo(page.getByLabel('진행 중 컬럼'))
  const sent = (await patchReq).postDataJSON() as { status: string; expected_version: number }
  expect(sent.status).toBe('in_progress')
  expect(sent.expected_version).toBe(wpA.version)

  // cross-lane drop carries the LANE field too (Pass 31): wpA is priority
  // 'high'; dropping it into the medium lane's column adds priority to the PATCH
  await page.getByLabel('스윔레인 기준').selectOption('priority')
  const laneCard = page.getByRole('button', { name: /워크패키지 API 구현/ })
  const lanePatch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes(`/work-packages/${wpA.id}`),
  )
  await laneCard.dragTo(page.getByLabel('보통 할 일 컬럼'))
  const laneSent = (await lanePatch).postDataJSON() as { priority?: string; status?: string }
  expect(laneSent.priority).toBe('medium')
  expect(laneSent.status).toBeUndefined() // same column — only the lane changed
})

test('이니셔티브에서 프로젝트를 연결하면 POST가 간다', async ({ page }) => {
  await mockApi(page)
  const ini = {
    id: 'ini-1',
    name: '플랫폼 개편',
    description: null,
    owner_id: 'u-dev',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'in_progress',
    start_date: null,
    target_date: null,
    health: 'at_risk',
    health_note: '일정 검토 필요',
    health_updated_by: 'me-1',
    health_updated_at: '2026-07-08T00:00:00Z',
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 1,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [
      {
        project_id: project.id,
        project_name: project.name,
        work_package_count: 4,
        done_work_package_count: 1,
      },
    ],
    created_at: '2026-07-07T00:00:00Z',
    updated_at: '2026-07-07T00:00:00Z',
  }
  let currentIni = ini
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items: [currentIni], total: 1 } }),
  )
  await page.route('**/api/v1/initiatives/ini-1/projects**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const input = request.postDataJSON() as { project_id: string }
      currentIni = {
        ...currentIni,
        connected_project_count: 2,
        projects: [
          ...currentIni.projects,
          {
            project_id: input.project_id,
            project_name: '두번째 프로젝트',
            work_package_count: 0,
            done_work_package_count: 0,
          },
        ],
      }
      await route.fulfill({ json: currentIni })
      return
    }
    if (request.method() === 'DELETE') {
      const id = request.url().split('/').at(-1)
      currentIni = {
        ...currentIni,
        connected_project_count: Math.max(0, currentIni.connected_project_count - 1),
        projects: currentIni.projects.filter((item) => item.project_id !== id),
      }
      await route.fulfill({ json: currentIni })
      return
    }
    await route.fallback()
  })
  let candidateAttempts = 0
  await page.route('**/api/v1/initiatives/ini-1/owner-candidates', (route) => {
    candidateAttempts += 1
    if (candidateAttempts === 1) {
      return route.fulfill({ status: 500, json: { detail: 'temporary candidate failure' } })
    }
    return route.fulfill({
      json: { items: [{ user_id: 'u-next', display_name: 'Next Owner' }], total: 1 },
    })
  })
  await page.route('**/api/v1/initiatives/ini-1/owner', (route) => {
    currentIni = {
      ...ini,
      owner_id: 'u-next',
      owner_name: 'Next Owner',
      is_mine: false,
    }
    return route.fulfill({ json: currentIni })
  })
  // A second (unconnected) project so the connect select has a candidate.
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [
          project,
          { ...project, id: 'p-2', key: 'TWO', name: '두번째 프로젝트' },
        ],
        total: 2,
      },
    }),
  )

  await page.goto('/initiatives')
  const active = page.getByRole('region', { name: '진행 중' })
  await expect(active.getByText('플랫폼 개편')).toBeVisible()
  await expect(active.getByText('1/4 (25%)')).toBeVisible()
  await expect(active.getByRole('button', { name: '소유권 이전' })).toHaveCount(0)
  await expect(active.getByLabel('이니셔티브 연결 프로젝트')).toHaveCount(0)
  await expect(active.getByLabel('이니셔티브 라벨 배정')).toHaveCount(0)
  await expect(active.getByRole('button', { name: '이니셔티브 삭제' })).toHaveCount(0)

  // Health remains scannable in the list; edits live in the detail information architecture.
  await expect(active.getByTitle('일정 검토 필요')).toHaveText('주의')
  await active.getByRole('button', { name: '플랫폼 개편', exact: true }).click()
  await page.getByRole('button', { name: '수명주기 편집' }).click()
  const healthPatch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/initiatives/ini-1'),
  )
  await page.route('**/api/v1/initiatives/ini-1', (route) =>
    route.fulfill({ json: { ...ini, health: 'off_track', health_note: '차단 발생' } }),
  )
  const lifecycle = page.getByRole('group', { name: '이니셔티브 수명주기 편집' })
  await lifecycle.getByLabel('이니셔티브 헬스').selectOption('off_track')
  await lifecycle.getByLabel('이니셔티브 상태 사유').fill('차단 발생')
  await lifecycle.getByRole('button', { name: '헬스 저장' }).click()
  const healthSent = (await healthPatch).postDataJSON() as {
    health: string
    health_note: string
  }
  expect(healthSent).toEqual({ health: 'off_track', health_note: '차단 발생' })
  const organization = page.getByRole('region', { name: '조직과 연결' })
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/initiatives/ini-1/projects'),
  )
  await organization.getByLabel('이니셔티브 연결 프로젝트').selectOption('p-2')
  await organization.getByRole('button', { name: '연결', exact: true }).click()
  const sent = (await post).postDataJSON() as { project_id: string }
  expect(sent.project_id).toBe('p-2')
  await expect(organization.getByText('두번째 프로젝트', { exact: true })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  const disconnectResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().endsWith(`/initiatives/ini-1/projects/${project.id}`),
  )
  const disconnectRefresh = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().endsWith('/api/v1/initiatives'),
  )
  await organization.getByRole('button', { name: `${project.name} 연결 해제` }).click()
  expect((await disconnectResponse).status()).toBe(200)
  const refreshedInitiatives = await disconnectRefresh
  expect(refreshedInitiatives.status()).toBe(200)
  const refreshedBody = (await refreshedInitiatives.json()) as { items: Initiative[] }
  expect(refreshedBody.items[0].projects.some((item) => item.project_id === project.id)).toBe(false)
  await expect(
    organization.getByRole('button', { name: `${project.name} 대시보드 열기` }),
  ).toHaveCount(0)

  await organization.getByRole('button', { name: '소유권 이전' }).click()
  await expect(page.getByRole('group', { name: '이니셔티브 소유권 이전' })).toBeVisible()
  await expect(page.getByText('소유권 후보를 불러오지 못했습니다.')).toBeVisible()
  await page.getByRole('group', { name: '이니셔티브 소유권 이전' }).getByRole('button', { name: '재시도' }).click()
  await expect(page.getByLabel('이니셔티브 새 소유자')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-organization-ui/desktop.png',
    fullPage: true,
  })
  await page.getByLabel('이니셔티브 새 소유자').selectOption('u-next')
  page.once('dialog', (dialog) => dialog.accept())
  const ownershipPost = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/initiatives/ini-1/owner'),
  )
  await page.getByRole('group', { name: '이니셔티브 소유권 이전' }).getByRole('button', { name: '이전', exact: true }).click()
  expect((await ownershipPost).postDataJSON()).toEqual({ owner_id: 'u-next' })
  await expect(organization.getByRole('button', { name: '소유권 이전' })).toHaveCount(0)
})

test('이니셔티브 상세 삭제는 실패를 복구하고 성공 뒤 drawer를 닫는다', async ({ page }) => {
  await mockApi(page)
  const initiative: Initiative = {
    id: 'ini-delete',
    name: '삭제할 전략',
    description: null,
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'planned',
    start_date: null,
    target_date: null,
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
  }
  let deleted = false
  let deleteAttempts = 0
  await page.route('**/api/v1/initiatives/ini-delete/work-items', (route) =>
    route.fulfill({ json: { items: [], total: 0, connected_work_item_count: 0 } }),
  )
  await page.route('**/api/v1/initiatives/ini-delete', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deleteAttempts += 1
    if (deleteAttempts === 1) {
      await route.fulfill({ status: 503, json: { detail: 'temporary delete failure' } })
      return
    }
    deleted = true
    await route.fulfill({ status: 204 })
  })
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items: deleted ? [] : [initiative], total: deleted ? 0 : 1 } }),
  )

  await page.goto('/initiatives?initiative=ini-delete')
  const organization = page.getByRole('region', { name: '조직과 연결' })
  page.once('dialog', (dialog) => dialog.accept())
  const failedDelete = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().endsWith('/initiatives/ini-delete'),
  )
  await organization.getByRole('button', { name: '이니셔티브 삭제' }).click()
  expect((await failedDelete).status()).toBe(503)
  await expect(organization.getByRole('alert')).toContainText('temporary delete failure')

  const successfulDelete = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      response.url().endsWith('/initiatives/ini-delete'),
  )
  await organization.getByRole('button', { name: '재시도' }).click()
  expect((await successfulDelete).status()).toBe(204)
  await expect(page).not.toHaveURL(/initiative=/)
  await expect(page.getByRole('heading', { name: '이니셔티브 상세' })).toHaveCount(0)
  await expect(page.getByText('이니셔티브가 없습니다')).toBeVisible()
})

test('이니셔티브 상세에서 전략 범위 작업을 검색해 연결하고 해제한다', async ({ page }) => {
  await mockApi(page)
  const initiative: Initiative = {
    id: 'ini-scope',
    name: '전략 범위 개편',
    description: '핵심 출시 범위를 명시적으로 추적합니다.',
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'in_progress',
    start_date: null,
    target_date: null,
    health: 'on_track',
    health_note: null,
    health_updated_by: 'me-1',
    health_updated_at: '2026-07-15T00:00:00Z',
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 1,
    connected_work_item_count: 1,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [
      {
        project_id: project.id,
        project_name: project.name,
        work_package_count: 4,
        done_work_package_count: 1,
      },
    ],
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
  }
  const linked: InitiativeWorkItem[] = [
    {
      id: wpA.id,
      project_id: project.id,
      project_name: project.name,
      subject: wpA.subject,
      status: wpA.status,
      priority: wpA.priority,
      assignee_id: wpA.assignee_id,
      due_date: wpA.due_date,
    },
  ]
  let available: InitiativeWorkItem[] = [
    {
      id: wpB.id,
      project_id: project.id,
      project_name: project.name,
      subject: wpB.subject,
      status: wpB.status,
      priority: wpB.priority,
      assignee_id: wpB.assignee_id,
      due_date: wpB.due_date,
    },
  ]
  let following = false
  let followerCount = 0
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...initiative,
            connected_work_item_count: linked.length,
            follower_count: followerCount,
            is_following: following,
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/initiatives/ini-scope/subscription', async (route) => {
    following = route.request().method() === 'POST'
    followerCount = following ? 1 : 0
    await route.fulfill({ json: { is_following: following, follower_count: followerCount } })
  })
  await page.route('**/api/v1/initiatives/ini-scope/work-items', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { work_package_id: string }
      const item = available.find((candidate) => candidate.id === body.work_package_id)
      if (!item) {
        await route.fulfill({ status: 409, json: { detail: 'already connected' } })
        return
      }
      linked.push(item)
      available = available.filter((candidate) => candidate.id !== item.id)
      await route.fulfill({ status: 201, json: item })
      return
    }
    await route.fulfill({
      json: {
        items: linked,
        total: linked.length,
        connected_work_item_count: linked.length,
      },
    })
  })
  let candidateAttempts = 0
  await page.route('**/api/v1/initiatives/ini-scope/work-item-candidates**', async (route) => {
    candidateAttempts += 1
    if (candidateAttempts === 1) {
      await route.fulfill({ status: 503, json: { detail: 'temporary candidate failure' } })
      return
    }
    const query = new URL(route.request().url()).searchParams.get('q') ?? ''
    const items = available.filter((item) => item.subject.includes(query))
    await route.fulfill({ json: { items, total: items.length } })
  })
  await page.route('**/api/v1/initiatives/ini-scope/work-items/*', async (route) => {
    const id = route.request().url().split('/').at(-1)
    const index = linked.findIndex((item) => item.id === id)
    if (index < 0) {
      await route.fulfill({ status: 404, json: { detail: 'not found' } })
      return
    }
    available.push(linked[index])
    linked.splice(index, 1)
    await route.fulfill({ status: 204 })
  })

  await page.goto('/initiatives')
  await page.getByRole('button', { name: '전략 범위 개편 전략 범위 열기' }).click()
  await expect(page).toHaveURL(/initiative=ini-scope/)
  await expect(page.getByRole('heading', { name: '전략 범위 개편' })).toBeVisible()
  await expect(page.getByText(wpA.subject, { exact: true })).toBeVisible()

  const followRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/subscription'),
  )
  await page.getByRole('button', { name: '팔로우', exact: true }).click()
  await followRequest
  await expect(page.getByRole('button', { name: '팔로잉', exact: true })).toBeVisible()
  await expect(page.getByText('1명', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '작업 연결' }).click()
  await expect(page.getByText('작업 후보를 불러오지 못했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '재시도' }).click()
  await expect(page.getByText(wpB.subject, { exact: true })).toBeVisible()
  await page.getByLabel('연결할 작업 검색').fill('보드')
  const searchRequest = page.waitForRequest((request) =>
    request.url().includes('/work-item-candidates?q=%EB%B3%B4%EB%93%9C'),
  )
  await page.getByRole('button', { name: '검색', exact: true }).click()
  await searchRequest

  const connectRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/ini-scope/work-items'),
  )
  await page.getByRole('listitem').filter({ hasText: wpB.subject }).getByRole('button', { name: '연결' }).click()
  expect((await connectRequest).postDataJSON()).toEqual({ work_package_id: wpB.id })
  await expect(page.getByRole('button', { name: `${wpB.subject} 열기` })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  const disconnectRequest = page.waitForRequest(
    (request) => request.method() === 'DELETE' && request.url().endsWith(`/work-items/${wpA.id}`),
  )
  await page.getByRole('button', { name: `${wpA.subject} 이니셔티브 연결 해제` }).click()
  await disconnectRequest
  await expect(page.getByRole('button', { name: `${wpA.subject} 열기` })).toHaveCount(0)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-notifications-ui/desktop.png',
    fullPage: true,
  })

  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/initiative=/)
})

test('모바일 이니셔티브 상세는 숨은 전략 작업 수를 누수 없이 표시한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const initiative: Initiative = {
    id: 'ini-member-scope',
    name: '멤버 전략 범위',
    description: null,
    owner_id: 'owner-1',
    owner_name: 'Owner',
    owner_active: true,
    state: 'planned',
    start_date: null,
    target_date: null,
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: false,
    can_claim_ownership: false,
    connected_project_count: 2,
    connected_work_item_count: 2,
    follower_count: 1,
    is_following: true,
    labels: [],
    projects: [
      {
        project_id: project.id,
        project_name: project.name,
        work_package_count: 4,
        done_work_package_count: 1,
      },
    ],
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
  }
  const visible: InitiativeWorkItem = {
    id: wpA.id,
    project_id: project.id,
    project_name: project.name,
    subject: wpA.subject,
    status: wpA.status,
    priority: wpA.priority,
    assignee_id: wpA.assignee_id,
    due_date: wpA.due_date,
  }
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items: [initiative], total: 1 } }),
  )
  await page.route('**/api/v1/initiatives/ini-member-scope/work-items', (route) =>
    route.fulfill({
      json: { items: [visible], total: 1, connected_work_item_count: 2 },
    }),
  )

  await page.goto('/initiatives?initiative=ini-member-scope')
  await expect(page.getByRole('heading', { name: '멤버 전략 범위' })).toBeVisible()
  await expect(page.getByText('권한이 없는 프로젝트의 연결 작업 1개')).toBeVisible()
  await expect(page.getByRole('button', { name: '작업 연결' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /이니셔티브 연결 해제/ })).toHaveCount(0)
  const organization = page.getByRole('region', { name: '조직과 연결' })
  await expect(organization.getByRole('button', { name: '소유권 이전' })).toHaveCount(0)
  await expect(organization.getByLabel('이니셔티브 연결 프로젝트')).toHaveCount(0)
  await expect(organization.getByLabel('이니셔티브 라벨 배정')).toHaveCount(0)
  await expect(organization.getByRole('button', { name: '이니셔티브 삭제' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-notifications-ui/mobile.png',
    fullPage: true,
  })
})

test('모바일 이니셔티브 상세에서 고아 소유권을 claim한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const orphan: Initiative = {
    id: 'ini-orphan',
    name: '복구할 전략',
    description: null,
    owner_id: null,
    owner_name: null,
    owner_active: false,
    state: 'paused',
    start_date: null,
    target_date: null,
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: false,
    can_claim_ownership: true,
    connected_project_count: 1,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [
      {
        project_id: project.id,
        project_name: project.name,
        work_package_count: 4,
        done_work_package_count: 1,
      },
    ],
    created_at: '2026-07-07T00:00:00Z',
    updated_at: '2026-07-07T00:00:00Z',
  }
  let current = orphan
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items: [current], total: 1 } }),
  )
  let claimAttempts = 0
  await page.route('**/api/v1/initiatives/ini-orphan/owner/claim', (route) => {
    claimAttempts += 1
    if (claimAttempts === 1) {
      return route.fulfill({ status: 409, json: { detail: 'ownership changed' } })
    }
    current = {
      ...orphan,
      owner_id: 'me-1',
      owner_name: 'Dev User',
      owner_active: true,
      is_mine: true,
      can_claim_ownership: false,
    }
    return route.fulfill({ json: current })
  })

  await page.goto('/initiatives')
  const card = page.locator('li', { hasText: '복구할 전략' })
  await expect(card.getByText('소유자 없음')).toBeVisible()
  await expect(card.getByText('복구 필요')).toBeVisible()
  await card.getByRole('button', { name: '복구할 전략', exact: true }).click()
  const organization = page.getByRole('region', { name: '조직과 연결' })
  page.once('dialog', (dialog) => dialog.accept())
  const failedClaim = page.waitForResponse(
    (request) =>
      request.request().method() === 'POST' &&
      request.url().endsWith('/initiatives/ini-orphan/owner/claim'),
  )
  await organization.getByRole('button', { name: '소유권 가져오기' }).click()
  expect((await failedClaim).status()).toBe(409)
  await expect(organization.getByRole('alert')).toBeVisible()

  const claimPost = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/initiatives/ini-orphan/owner/claim'),
  )
  await organization.getByRole('button', { name: '재시도' }).click()
  await claimPost
  await expect(organization.getByText('Dev User')).toBeVisible()
  await expect(organization.getByRole('button', { name: '소유권 가져오기' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-organization-ui/mobile.png',
    fullPage: true,
  })
})

test('이니셔티브 생성은 전체 전략 범위와 날짜 검증 및 실패 재시도를 보존한다', async ({ page }) => {
  await mockApi(page)
  const created: Initiative = {
    id: 'ini-created',
    name: '2027 플랫폼 전략',
    description: '프로젝트 간 전략 목표와 성공 기준',
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'in_progress',
    start_date: '2027-04-01',
    target_date: '2027-09-30',
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-18T05:00:00Z',
    updated_at: '2026-07-18T05:00:00Z',
  }
  let attempts = 0
  let items: Initiative[] = []
  let releaseFailure: (() => void) | undefined
  const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve })
  await page.route('**/api/v1/initiatives', async (route) => {
    if (route.request().method() === 'POST') {
      attempts += 1
      if (attempts === 1) {
        await failureGate
        await route.fulfill({ status: 503, json: { detail: 'temporary create failure' } })
        return
      }
      items = [created]
      await route.fulfill({ status: 201, json: created })
      return
    }
    await route.fulfill({ json: { items, total: items.length } })
  })
  await page.route('**/api/v1/initiatives/ini-created/work-items', (route) =>
    route.fulfill({ json: { items: [], total: 0, connected_work_item_count: 0 } }),
  )

  await page.goto('/initiatives')
  await page.getByRole('button', { name: '새 이니셔티브' }).click()
  const dialog = page.getByRole('dialog', { name: '이니셔티브 만들기' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('새 이니셔티브 이름').fill('취소할 전략')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '새 이니셔티브' }).click()
  await expect(dialog.getByLabel('새 이니셔티브 이름')).toHaveValue('')
  await dialog.getByLabel('새 이니셔티브 이름').fill('2027 플랫폼 전략')
  await dialog.getByLabel('새 이니셔티브 설명').fill('프로젝트 간 전략 목표와 성공 기준')
  await dialog.getByLabel('새 이니셔티브 실행 상태').selectOption('in_progress')
  await dialog.getByLabel('새 이니셔티브 시작일').fill('2027-10-01')
  await dialog.getByLabel('새 이니셔티브 목표일').fill('2027-09-30')
  await dialog.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('시작일은 목표일보다 늦을 수 없습니다.')
  expect(attempts).toBe(0)

  await dialog.getByLabel('새 이니셔티브 시작일').fill('2027-04-01')
  const failed = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/v1/initiatives'),
  )
  await dialog.getByRole('button', { name: '만들기', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '취소' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '만드는 중…' })).toBeVisible()
  releaseFailure?.()
  expect((await failed).status()).toBe(503)
  await expect(dialog.getByRole('alert')).toContainText('temporary create failure')
  await expect(dialog.getByLabel('새 이니셔티브 이름')).toHaveValue('2027 플랫폼 전략')
  await expect(dialog.getByLabel('새 이니셔티브 설명')).toHaveValue('프로젝트 간 전략 목표와 성공 기준')
  await expect(dialog.getByLabel('새 이니셔티브 실행 상태')).toHaveValue('in_progress')
  await expect(dialog.getByLabel('새 이니셔티브 시작일')).toHaveValue('2027-04-01')
  await expect(dialog.getByLabel('새 이니셔티브 목표일')).toHaveValue('2027-09-30')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-create-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-create-ui/mobile.png',
    fullPage: true,
  })
  const retry = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/api/v1/initiatives'),
  )
  await dialog.getByRole('button', { name: '재시도' }).click()
  expect((await retry).postDataJSON()).toEqual({
    name: '2027 플랫폼 전략',
    description: '프로젝트 간 전략 목표와 성공 기준',
    state: 'in_progress',
    start_date: '2027-04-01',
    target_date: '2027-09-30',
  })
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/initiative=ini-created/)
  await expect(page.getByRole('heading', { name: '2027 플랫폼 전략' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('이니셔티브 탐색은 URL 조합 필터와 정렬 및 초기화를 왕복한다', async ({ page }) => {
  await mockApi(page)
  const base: Initiative = {
    id: 'ini-base',
    name: '기본 전략',
    description: null,
    owner_id: 'owner-1',
    owner_name: 'Mina',
    owner_active: true,
    state: 'planned',
    start_date: null,
    target_date: null,
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: false,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }
  const items: Initiative[] = [
    {
      ...base,
      id: 'ini-platform',
      name: '플랫폼 전환',
      description: '클라우드 기반 전략',
      owner_id: 'me-1',
      owner_name: 'Dev User',
      state: 'in_progress',
      health: 'at_risk',
      is_mine: true,
      target_date: '2027-09-30',
      updated_at: '2026-07-03T00:00:00Z',
    },
    {
      ...base,
      id: 'ini-customer',
      name: '고객 경험',
      health: 'on_track',
      target_date: '2027-04-01',
      projects: [{
        project_id: 'p-customer',
        project_name: '고객 포털',
        work_package_count: 4,
        done_work_package_count: 2,
      }],
      connected_project_count: 1,
    },
    { ...base, id: 'ini-ops', name: '운영 자동화', owner_id: null, owner_name: null },
  ]
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items, total: items.length } }),
  )

  await page.goto(
    '/initiatives?q=%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C&state=in_progress&health=at_risk&owner=mine&sort=name_asc',
  )
  await expect(page.getByRole('button', { name: '플랫폼 전환', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '고객 경험', exact: true })).toHaveCount(0)
  await expect(page.getByText('1 / 3개 표시 · 조건 5개')).toBeVisible()

  await page.getByRole('button', { name: '탐색 초기화' }).first().click()
  await expect(page).toHaveURL('/initiatives')
  await expect(page.getByRole('button', { name: '플랫폼 전환', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '고객 경험', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '운영 자동화', exact: true })).toBeVisible()

  await page.getByLabel('이니셔티브 상태 필터').selectOption('planned')
  await expect(page).toHaveURL(/state=planned/)
  await page.getByLabel('이니셔티브 헬스 필터').selectOption('unreported')
  await expect(page).toHaveURL(/health=unreported/)
  await page.getByLabel('이니셔티브 소유 범위 필터').selectOption('unowned')
  await expect(page.getByRole('button', { name: '운영 자동화', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '고객 경험', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/owner=unowned/)

  await page.getByRole('button', { name: '탐색 초기화' }).first().click()
  await expect(page).toHaveURL('/initiatives')
  await expect(page.getByLabel('이니셔티브 상태 필터')).toHaveValue('all')
  await expect(page.getByLabel('이니셔티브 헬스 필터')).toHaveValue('all')
  await expect(page.getByLabel('이니셔티브 소유 범위 필터')).toHaveValue('all')
  await page.getByLabel('이니셔티브 정렬').selectOption('target_asc')
  const planned = page.getByRole('region', { name: '계획됨' })
  await expect(planned.getByRole('button', { name: /전략 범위 열기/ })).toHaveCount(2)
  const plannedNames = await planned.locator('li').evaluateAll((rows) =>
    rows.map((row) => row.querySelector('button')?.textContent?.trim()),
  )
  expect(plannedNames).toEqual(['고객 경험', '운영 자동화'])

  await page.getByLabel('이니셔티브 검색').fill('존재하지 않는 전략')
  await expect(page.getByText('조건에 맞는 이니셔티브가 없습니다')).toBeVisible()
  await page.getByRole('button', { name: '탐색 초기화' }).last().click()
  await expect(page.getByRole('button', { name: '플랫폼 전환', exact: true })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-discovery-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('이니셔티브 헬스 필터').selectOption('at_risk')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-discovery-ui/mobile.png',
    fullPage: true,
  })
})

test('파일 업로드가 raw body POST로 나가고 다운로드 링크가 생긴다', async ({ page }) => {
  await mockApi(page)
  let uploaded = false
  await page.route(`**/api/v1/projects/${project.id}/attachments/upload**`, async (route) => {
    uploaded = true
    await route.fulfill({
      status: 201,
      json: {
        id: 'att-up',
        project_id: project.id,
        filename: '설계서.txt',
        content_type: 'text/plain',
        size_bytes: 11,
        url: 'oneflow://attachments/att-up',
        has_file: true,
        uploaded_by: 'u-dev',
        created_at: '2026-07-07T00:00:00Z',
      },
    })
  })
  await page.route(`**/api/v1/projects/${project.id}/attachments`, (route) =>
    route.fulfill({
      json: uploaded
        ? {
            items: [
              {
                id: 'att-up',
                project_id: project.id,
                filename: '설계서.txt',
                content_type: 'text/plain',
                size_bytes: 11,
                url: 'oneflow://attachments/att-up',
                has_file: true,
                uploaded_by: 'u-dev',
                created_at: '2026-07-07T00:00:00Z',
              },
            ],
            total: 1,
          }
        : { items: [], total: 0 },
    }),
  )

  await page.goto(`/projects/${project.id}/files`)
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/attachments/upload'),
  )
  await page.getByLabel('업로드할 파일').setInputFiles({
    name: '설계서.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello files'),
  })
  const req = await post
  expect(req.url()).toContain(`filename=${encodeURIComponent('설계서.txt')}`)
  expect(req.postData()).toBe('hello files')

  const link = page.getByRole('link', { name: /설계서\.txt/ })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', /\/attachments\/att-up\/download/)
})

test('OIDC 모드면 사이드바 푸터가 발급자를 표시한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'oidc',
        oidc_issuer: 'https://idp.example.com/realms/company',
        oidc_client_id: 'oneflow-web',
        has_client_secret: true,
        command_palette_enabled: false,
      },
    }),
  )
  await page.goto('/projects')
  await expect(page.getByText('OIDC · idp.example.com')).toBeVisible()
})

test('액션 아이템을 작업으로 전환하면 POST가 가고 링크가 생긴다', async ({ page }) => {
  await mockApi(page)
  let converted = false
  const item = () => ({
    id: 'ai-1',
    meeting_id: 'm1',
    description: '배포 점검',
    assignee_id: null,
    done: converted,
    converted_wp_id: converted ? wpA.id : null,
    created_at: '2026-07-01T00:00:00Z',
  })
  await page.route('**/api/v1/meetings/m1', (route) =>
    route.fulfill({
      json: {
        id: 'm1',
        project_id: project.id,
        title: '스프린트 회의',
        scheduled_on: '2026-07-10',
        agenda: null,
        minutes: null,
        version: 1,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        action_items: [item()],
      },
    }),
  )
  await page.route('**/api/v1/action-items/ai-1/convert', async (route) => {
    converted = true
    await route.fulfill({ json: item() })
  })

  await page.goto(`/projects/${project.id}/meetings/m1`)
  await expect(page.getByText('배포 점검')).toBeVisible()

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/action-items/ai-1/convert'),
  )
  await page.getByLabel('배포 점검 작업으로 전환').click()
  await post
  await expect(page.getByRole('button', { name: '작업 보기' })).toBeVisible()
})

test('완료 사이클에서 미완료 이월을 실행하면 rollover POST가 간다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  const cycles = [
    {
      id: 'cy-old',
      project_id: project.id,
      name: '지난 스프린트',
      description: null,
      start_date: '2026-06-01',
      end_date: '2026-06-14',
      status: 'completed',
      work_package_count: 5,
      done_work_package_count: 3,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
    {
      id: 'cy-new',
      project_id: project.id,
      name: '이번 스프린트',
      description: null,
      start_date: '2026-07-01',
      end_date: '2026-07-14',
      status: 'active',
      work_package_count: 0,
      done_work_package_count: 0,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    },
  ]
  await page.route(`**/api/v1/projects/${project.id}/cycles`, (route) =>
    route.fulfill({ json: { items: cycles, total: 2 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/cycles/cy-old/rollover`, (route) =>
    route.fulfill({ json: { moved: 2 } }),
  )

  await page.goto(`/projects/${project.id}/cycles`)
  await expect(page.getByRole('region', { name: '완료' }).getByText('지난 스프린트')).toBeVisible()

  const dialogs: string[] = []
  page.once('dialog', (d) => {
    dialogs.push(d.message())
    void d.accept()
  })
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/cycles/cy-old/rollover'),
  )
  await page.getByRole('button', { name: '지난 스프린트 사이클 작업' }).click()
  await page.getByLabel('지난 스프린트 미완료 이월').selectOption('cy-new')
  const sent = (await post).postDataJSON() as { target_cycle_id: string }
  expect(sent.target_cycle_id).toBe('cy-new')
  expect(dialogs[0]).toContain('미완료 작업 2건')
})

test('사이클 작업 메뉴가 모바일 폭에서 잘리고 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/cycles`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'cy-1',
            project_id: project.id,
            name: '7월 스프린트',
            description: null,
            start_date: '2026-07-01',
            end_date: '2026-07-14',
            status: 'active',
            work_package_count: 4,
            done_work_package_count: 1,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
          {
            id: 'cy-2',
            project_id: project.id,
            name: '6월 스프린트',
            description: null,
            start_date: '2026-06-01',
            end_date: '2026-06-14',
            status: 'completed',
            work_package_count: 5,
            done_work_package_count: 5,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z',
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/cycles`)
  await page.getByRole('button', { name: '7월 스프린트 사이클 작업' }).click()
  const menu = page.getByRole('menu', { name: '7월 스프린트 사이클 작업' })
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/cycle-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('사이클 작업 메뉴는 viewer에게 쓰기 액션을 숨긴다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            user_id: 'me-1',
            email: 'dev@oneflow.local',
            display_name: 'Dev User',
            role: 'viewer',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/cycles`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'cy-1',
            project_id: project.id,
            name: '7월 스프린트',
            description: null,
            start_date: '2026-07-01',
            end_date: '2026-07-14',
            status: 'active',
            work_package_count: 4,
            done_work_package_count: 1,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/cycles`)
  await expect(page.getByLabel('새 사이클 이름')).toHaveCount(0)
  await page.getByRole('button', { name: '7월 스프린트 사이클 작업' }).click()
  const menu = page.getByRole('menu', { name: '7월 스프린트 사이클 작업' })
  await expect(menu.getByRole('menuitem', { name: '작업 목록 열기' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '쓰기 권한 없음' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '편집' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '삭제' })).toHaveCount(0)
})

test('상태 관리 액션 메뉴에서 라벨을 바꾸고 순서를 조정한다', async ({ page }) => {
  await mockApi(page)
  const statuses = [
    { id: 's1', project_id: project.id, key: 'todo', name: '할 일', position: 0 },
    { id: 's2', project_id: project.id, key: 'in_progress', name: '진행 중', position: 1 },
  ]
  await page.route(`**/api/v1/projects/${project.id}/statuses`, async (route) => {
    await route.fulfill({ json: { items: [...statuses], total: statuses.length } })
  })
  await page.route(`**/api/v1/projects/${project.id}/statuses/order`, async (route) => {
    const sent = route.request().postDataJSON() as { ordered_ids: string[] }
    sent.ordered_ids.forEach((id, index) => {
      const item = statuses.find((status) => status.id === id)
      if (item) item.position = index
    })
    await route.fulfill({ json: { items: [...statuses], total: statuses.length } })
  })
  await page.route(`**/api/v1/projects/${project.id}/statuses/s1`, async (route) => {
    const sent = route.request().postDataJSON() as { name: string }
    statuses[0].name = sent.name
    await route.fulfill({ json: { ...statuses[0] } })
  })

  await page.goto(`/projects/${project.id}/settings?tab=workflow`)
  await expect(page.getByText('워크플로우 상태')).toBeVisible()

  await page.getByLabel('todo 상태 작업').click()
  await page.getByLabel('todo 상태 편집').click()
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/statuses/s1'),
  )
  await page.getByLabel('todo 상태 이름 편집').fill('해야 할 일')
  await page.getByRole('button', { name: '저장' }).click()
  expect(((await patch).postDataJSON() as { name: string }).name).toBe('해야 할 일')

  await page.getByLabel('todo 상태 작업').click()
  const reorder = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().endsWith('/statuses/order'),
  )
  await page.getByLabel('todo 아래로').click()
  expect(((await reorder).postDataJSON() as { ordered_ids: string[] }).ordered_ids).toEqual([
    's2',
    's1',
  ])
})

test('타입 관리 액션 메뉴에서 라벨을 바꾸고 비활성화하면 PATCH가 간다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  const types = [
    {
      id: 'pt-1',
      project_id: project.id,
      key: 'task',
      name: '작업',
      position: 0,
      is_active: true,
      is_builtin: true,
    },
    {
      id: 'pt-2',
      project_id: project.id,
      key: 'bug',
      name: '버그',
      position: 1,
      is_active: true,
      is_builtin: true,
    },
  ]
  await page.route(`**/api/v1/projects/${project.id}/types`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { name: string }
      const custom = {
        id: 'pt-3',
        project_id: project.id,
        key: 'custom_0123456789ab',
        name: body.name,
        position: types.length,
        is_active: true,
        is_builtin: false,
      }
      types.push(custom)
      await route.fulfill({ status: 201, json: custom })
      return
    }
    await route.fulfill({ json: { items: types, total: types.length } })
  })
  await page.route(`**/api/v1/projects/${project.id}/types/pt-2`, async (route) => {
    const sent = route.request().postDataJSON() as { name?: string; is_active?: boolean }
    if (sent.name !== undefined) types[1].name = sent.name
    if (sent.is_active !== undefined) types[1].is_active = sent.is_active
    await route.fulfill({ json: { ...types[1] } })
  })

  await page.goto(`/projects/${project.id}/settings?tab=workflow`)
  await expect(page.getByText('워크 아이템 타입')).toBeVisible()

  const created = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes(`/types`),
  )
  await page.getByLabel('새 작업 타입 이름').fill('사용자 스토리')
  await page.getByRole('button', { name: '타입 추가' }).click()
  expect(((await created).postDataJSON() as { name: string }).name).toBe('사용자 스토리')
  await expect(page.getByText('사용자 스토리', { exact: true })).toBeVisible()
  await expect(page.getByText(/사용자 정의 · 활성/)).toBeVisible()

  await page.getByRole('tab', { name: '필드' }).click()
  await expect(page.getByLabel('사용자 스토리 타입에 적용')).toBeVisible()
  await page.getByRole('tab', { name: '자동화' }).click()
  await page.getByLabel('트리거 종류').selectOption('type_changed_to')
  await expect(page.getByLabel('트리거 값').locator('option', { hasText: '사용자 스토리' })).toHaveCount(1)
  await page.getByRole('tab', { name: '워크플로우' }).click()

  await page.getByLabel('bug 타입 작업').click()
  await page.getByLabel('bug 타입 편집').click()
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/types/pt-2'),
  )
  await page.getByLabel('bug 타입 이름 편집').fill('결함')
  await page.getByRole('button', { name: '저장' }).click()
  expect(((await patch).postDataJSON() as { name: string }).name).toBe('결함')

  await page.getByLabel('bug 타입 작업').click()
  const toggle = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/types/pt-2'),
  )
  await page.getByLabel('bug 타입 비활성화').click()
  expect(((await toggle).postDataJSON() as { is_active: boolean }).is_active).toBe(false)

  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/custom-work-item-types-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('region', { name: '워크 아이템 타입' }).scrollIntoViewIfNeeded()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/custom-work-item-types-ui/mobile.png',
    fullPage: true,
  })
})

test('모바일 워크플로우 액션 메뉴는 읽기 전용 상태를 안전하게 보여준다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 760 })
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({
      json: {
        items: [{ id: 's1', project_id: project.id, key: 'todo', name: '할 일', position: 0 }],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/types`, (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'pt-1', project_id: project.id, key: 'task', name: '작업', position: 0, is_active: true },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=workflow`)
  await page.getByLabel('todo 상태 작업').click()
  const menu = page.getByRole('menu', { name: 'todo 상태 작업 메뉴' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('읽기 전용')).toBeVisible()
  await expect(menu.getByLabel('todo 상태 편집')).toBeHidden()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workflow-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('CSV 가져오기: dry-run 미리보기 후 실행하고 실패 행을 격리한다', async ({ page }) => {
  await mockApi(page)
  // Registered after mockApi → takes precedence over the generic work-packages glob.
  await page.route(
    `**/api/v1/projects/${project.id}/work-packages/import`,
    async (route) => {
      const sent = route.request().postDataJSON() as { dry_run: boolean }
      const base = {
        total_rows: 2,
        valid: 1,
        invalid: 1,
        checksum: 'a1b2c3d4e5f6a7b8c9d0',
        preview_checksum: '1'.repeat(64),
        errors: [{ row: 2, message: 'status: 허용되지 않는 값', raw: '나쁜 행,zzz' }],
        notes: [],
        assignee_identities: [],
        assignable_members: [],
      }
      const result: CsvImportResult = sent.dry_run
        ? { dry_run: true, inserted: 0, ...base }
        : { dry_run: false, inserted: 1, ...base }
      await route.fulfill({ json: result })
    },
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('button', { name: '내보내기' })).toBeVisible()
  await page.getByRole('button', { name: '가져오기', exact: true }).click()

  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('CSV 붙여넣기').fill('subject,status\n좋은 행,todo\n나쁜 행,zzz\n')
  await drawer.getByRole('button', { name: /미리보기/ }).click()

  // dry-run preview: nothing saved, failed row shown for reprocessing
  await expect(drawer.getByText('미리보기 (저장 안 됨)')).toBeVisible()
  await expect(drawer.getByText('실패 행', { exact: false })).toBeVisible()
  await expect(drawer.getByText('2행', { exact: false })).toBeVisible()

  // commit: the run carries dry_run=false and reports the created count
  const importPost = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/work-packages/import'),
  )
  await drawer.getByRole('button', { name: /가져오기 실행/ }).click()
  const req = await importPost
  expect((req.postDataJSON() as { dry_run: boolean }).dry_run).toBe(false)
  await expect(drawer.getByText('가져오기 완료', { exact: false })).toBeVisible()
})

test('Jira CSV 가져오기: 담당자 제안을 명시적으로 적용한 뒤 실행한다', async ({
  page,
}) => {
  await mockApi(page)
  let commitAttempts = 0
  const result: CsvImportResult = {
    dry_run: true,
    total_rows: 1,
    valid: 1,
    invalid: 0,
    inserted: 0,
    checksum: 'f1e2d3c4b5a6f7e8d9c0',
    preview_checksum: '2'.repeat(64),
    errors: [],
    notes: ['무시된 열: Sprint'],
    assignee_identities: [
      {
        source_value: 'dev@oneflow.local',
        row_count: 1,
        suggested_user_id: 'me-1',
        suggested_display_name: 'Dev User',
        suggested_email: 'dev@oneflow.local',
        selected_user_id: null,
        selected_display_name: null,
      },
    ],
    assignable_members: [
      {
        user_id: 'me-1',
        email: 'dev@oneflow.local',
        display_name: 'Dev User',
        role: 'owner',
      },
    ],
  }
  await page.route(
    `**/api/v1/projects/${project.id}/work-packages/import/jira`,
    (route) => {
      const sent = route.request().postDataJSON() as { dry_run: boolean }
      if (sent.dry_run) return route.fulfill({ json: result })
      commitAttempts += 1
      if (commitAttempts === 1) {
        return route.fulfill({
          status: 409,
          json: { detail: 'import preview is stale; run dry-run again' },
        })
      }
      return route.fulfill({
        json: {
          ...result,
          dry_run: false,
          inserted: 1,
          assignee_identities: result.assignee_identities.map((identity) => ({
            ...identity,
            selected_user_id: 'me-1',
            selected_display_name: 'Dev User',
          })),
        },
      })
    },
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '가져오기', exact: true }).click()

  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('가져오기 소스').selectOption('jira')
  await drawer
    .getByLabel('CSV 붙여넣기')
    .fill(
      'Issue key,Summary,Status,Assignee,Sprint\nPROJ-1,로그인 버그,In Progress,dev@oneflow.local,S3\n',
    )

  const jiraPost = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/work-packages/import/jira'),
  )
  await drawer.getByRole('button', { name: /미리보기/ }).click()
  expect(((await jiraPost).postDataJSON() as { dry_run: boolean }).dry_run).toBe(true)

  // Adapter identities become an explicit mapping decision, never a silent note.
  await expect(drawer.getByText('미리보기 (저장 안 됨)')).toBeVisible()
  await expect(drawer.getByRole('heading', { name: '담당자 계정 매핑' })).toBeVisible()
  await expect(drawer.getByText('dev@oneflow.local', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /가져오기 실행/ })).toBeDisabled()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/import-assignee-mapping-ui/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/import-assignee-mapping-ui/mobile.png',
    fullPage: true,
  })
  await drawer.getByRole('button', { name: /제안: Dev User/ }).click()
  await expect(drawer.getByLabel('dev@oneflow.local 담당자 결정')).toHaveValue('me-1')
  await expect(drawer.getByRole('button', { name: /가져오기 실행/ })).toBeEnabled()
  await expect(drawer.getByText('무시된 열: Sprint', { exact: false })).toBeVisible()

  const commitPost = page.waitForRequest(
    (req) =>
      req.method() === 'POST' &&
      req.url().includes('/work-packages/import/jira') &&
      (req.postDataJSON() as { dry_run: boolean }).dry_run === false,
  )
  await drawer.getByRole('button', { name: /가져오기 실행/ }).click()
  const commitBody = (await commitPost).postDataJSON() as {
    preview_checksum: string
    assignee_mappings: Array<{ source_value: string; user_id: string | null }>
  }
  expect(commitBody.preview_checksum).toBe(result.preview_checksum)
  expect(commitBody.assignee_mappings).toEqual([
    { source_value: 'dev@oneflow.local', user_id: 'me-1' },
  ])
  await expect(drawer.getByText('import preview is stale; run dry-run again')).toBeVisible()
  await expect(drawer.getByLabel('dev@oneflow.local 담당자 결정')).toHaveValue('me-1')

  await drawer.getByRole('button', { name: /가져오기 실행/ }).click()
  await expect(drawer.getByText('가져오기 완료 · 1건 생성')).toBeVisible()

  // Linear source posts to /import/linear with the same request shape
  await page.route(
    `**/api/v1/projects/${project.id}/work-packages/import/linear`,
    (route) =>
      route.fulfill({
        json: {
          ...result,
          assignee_identities: [],
          notes: [],
        },
      }),
  )
  await drawer.getByLabel('가져오기 소스').selectOption('linear')
  await drawer.getByLabel('CSV 붙여넣기').fill('ID,Title,Status\nABC-1,로그인,Todo\n')
  const linearPost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/work-packages/import/linear'),
  )
  await drawer.getByRole('button', { name: /미리보기/ }).click()
  await linearPost
})

test('계층 트리가 상/하위 관계를 보여주고 접기가 동작한다', async ({ page }) => {
  await mockApi(page)
  // wpB nested under wpA (registered after mockApi → precedence)
  const nested: WorkPackageList = { items: [wpA, { ...wpB, parent_id: wpA.id }], total: 2 }
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: nested }),
  )
  await page.goto(`/projects/${project.id}/tree`)
  await expect(page.getByRole('button', { name: '워크패키지 API 구현', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '보드 뷰 구현', exact: true })).toBeVisible()

  // collapsing the parent removes the child row from view ('접기' exact to avoid
  // matching the '모두 접기' toolbar button)
  await page.getByRole('button', { name: '접기', exact: true }).click()
  await expect(page.getByRole('button', { name: '보드 뷰 구현', exact: true })).toBeHidden()
})

test('트리 항목 액션 메뉴가 링크·복제·이동·전체 페이지 흐름을 연결한다', async ({ page }) => {
  await mockApi(page)
  const nested: WorkPackageList = { items: [wpA, { ...wpB, parent_id: wpA.id }], total: 2 }
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: nested }),
  )
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [project, { ...project, id: 'p-2', key: 'TWO', name: '두번째 프로젝트' }],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-tree', subject: '(복사) 워크패키지 API 구현' },
        skipped_custom_values: 0,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/tree`)
  const row = page
    .getByRole('treeitem')
    .filter({ has: page.getByRole('button', { name: '워크패키지 API 구현', exact: true }) })
    .first()
  const trigger = row.getByRole('button', { name: '워크패키지 API 구현 트리 항목 작업' })

  await trigger.click()
  await page.getByRole('menuitem', { name: '링크 복사' }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('__copied_tree_item_link')))
    .toContain(`/projects/${project.id}/work-packages/${wpA.id}`)
  await expect(page.getByText('링크', { exact: false })).toBeVisible()

  await trigger.click()
  const duplicatePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await page.getByRole('menuitem', { name: '복제' }).click()
  await duplicatePost
  await expect(page.getByText("'(복사) 워크패키지 API 구현' 생성됨")).toBeVisible()

  await trigger.click()
  await page.getByRole('menuitem', { name: '이동 패널 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
  await expect(page).toHaveURL(/move=1/)
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByLabel('이동 대상 프로젝트')).toBeVisible()
  await drawer.getByRole('button', { name: '닫기' }).click()
  await expect(page).not.toHaveURL(/move=1/)

  await trigger.click()
  await page.getByRole('menuitem', { name: '전체 페이지 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
})

test('모바일 트리 항목 액션 메뉴는 hover 없이 열리고 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const nested: WorkPackageList = { items: [wpA, { ...wpB, parent_id: wpA.id }], total: 2 }
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: nested }),
  )

  await page.goto(`/projects/${project.id}/tree`)
  const row = page
    .getByRole('treeitem')
    .filter({ has: page.getByRole('button', { name: '워크패키지 API 구현', exact: true }) })
    .first()
  await row.getByRole('button', { name: '워크패키지 API 구현 트리 항목 작업' }).click()

  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByText('트리 항목')).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/tree-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('뷰어 트리 항목 액션 메뉴는 쓰기 액션 없이 읽기 전용으로 표시된다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/tree`)
  const row = page
    .getByRole('treeitem')
    .filter({ has: page.getByRole('button', { name: '워크패키지 API 구현', exact: true }) })
    .first()
  await row.getByRole('button', { name: '워크패키지 API 구현 트리 항목 작업' }).click()
  const menu = page.getByRole('menu')

  await expect(menu.getByText('쓰기 권한 없음')).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '복제' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '이동 패널 열기' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '전체 페이지 열기' })).toBeVisible()
})

test('캘린더가 기한이 있는 작업을 해당 날짜에 표시하고 월 이동이 된다', async ({ page }) => {
  await mockApi(page)
  // Pin the clock so the initial month is deterministic across CI runners.
  await page.clock.install({ time: new Date('2026-07-05T12:00:00Z') })
  await page.goto(`/projects/${project.id}/calendar`)
  await expect(page.getByText('2026.07')).toBeVisible()
  // wpA is due 2026-07-15 → shown in July
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  // next month → the due chip is gone
  await page.getByRole('button', { name: '다음 달' }).click()
  await expect(page.getByText('2026.08')).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeHidden()
})

test('캘린더 항목 액션 메뉴가 링크·복제·이동·전체 페이지 흐름을 연결한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => window.localStorage.setItem('__copied_calendar_item_link', text),
      },
    })
  })
  await mockApi(page)
  await page.clock.install({ time: new Date('2026-07-05T12:00:00Z') })
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-calendar', subject: '(복사) 워크패키지 API 구현' },
        skipped_custom_values: 0,
      },
    }),
  )

  const openItemActions = async () => {
    const item = page.locator('article').filter({ hasText: '워크패키지 API 구현' }).first()
    await item.hover()
    const trigger = item.getByRole('button', { name: '캘린더 항목 작업' })
    await expect(trigger).toBeVisible()
    await trigger.click()
  }

  await page.goto(`/projects/${project.id}/calendar`)

  await openItemActions()
  await page.getByRole('menuitem', { name: /링크 복사/ }).click()
  await expect(page.getByRole('status')).toContainText('링크를 복사했습니다')
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('__copied_calendar_item_link')))
    .toContain(`/projects/${project.id}/work-packages/${wpA.id}`)

  await openItemActions()
  const duplicatePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await page.getByRole('menuitem', { name: '복제' }).click()
  await duplicatePost
  await expect(page.getByRole('status')).toContainText("'(복사) 워크패키지 API 구현' 생성됨")

  await openItemActions()
  await page.getByRole('menuitem', { name: '이동' }).click()
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
  await expect(page).toHaveURL(/move=1/)
  await expect(page.getByRole('dialog').getByLabel('이동 대상 프로젝트')).toBeVisible()

  await page.goto(`/projects/${project.id}/calendar`)
  await openItemActions()
  await page.getByRole('menuitem', { name: /전체 페이지/ }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
})

test('모바일 캘린더 항목 액션 메뉴는 hover 없이 열리고 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.clock.install({ time: new Date('2026-07-05T12:00:00Z') })

  await page.goto(`/projects/${project.id}/calendar`)
  const item = page.locator('article').filter({ hasText: '워크패키지 API 구현' }).first()
  const trigger = item.getByRole('button', { name: '캘린더 항목 작업' })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: /상세 드로어/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /링크 복사/ })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/calendar-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('뷰어 캘린더 항목 액션 메뉴는 쓰기 액션 없이 읽기 전용으로 표시된다', async ({ page }) => {
  await mockApi(page)
  await page.clock.install({ time: new Date('2026-07-05T12:00:00Z') })
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) => route.fulfill({ json: project }))

  await page.goto(`/projects/${project.id}/calendar`)
  const item = page.locator('article').filter({ hasText: '워크패키지 API 구현' }).first()
  await item.hover()
  await item.getByRole('button', { name: '캘린더 항목 작업' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText('읽기 전용', { exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '복제' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '이동' })).toHaveCount(0)
})

test('알림 벨이 미확인 개수를 보여주고 모두 읽음을 보낸다', async ({ page }) => {
  await mockApi(page)
  const inbox = {
    items: [
      {
        id: 'n1',
        kind: 'assigned',
        project_id: project.id,
        work_package_id: wpA.id,
        work_package_subject: '워크패키지 API 구현',
        actor_name: 'Dev User',
        read: false,
        created_at: '2026-07-05T09:00:00Z',
      },
      {
        id: 'n2',
        kind: 'overdue',
        project_id: project.id,
        work_package_id: wpA.id,
        work_package_subject: '워크패키지 API 구현',
        actor_name: null,
        read: false,
        created_at: '2026-07-05T09:00:00Z',
      },
      {
        id: 'n3',
        kind: 'intake_declined',
        project_id: project.id,
        work_package_id: null,
        intake_item_id: 'ii-1',
        work_package_subject: null,
        actor_name: 'Dev User',
        read: false,
        created_at: '2026-07-05T09:00:00Z',
      },
    ],
    total: 3,
    unread: 3,
  }
  // sub-actions (read / read-all) → 204; list → the unread inbox (both after mockApi)
  await page.route('**/api/v1/me/notifications/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route('**/api/v1/me/notifications', (route) => route.fulfill({ json: inbox }))

  await page.goto(`/projects/${project.id}/work-packages`)
  const bell = page.getByRole('button', { name: '알림 3건 읽지 않음' })
  await expect(bell).toBeVisible()
  await bell.click()

  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText(/배정했습니다/)).toBeVisible()
  // System due alert (Pass 40): actor-less wording.
  await expect(drawer.getByText(/기한이 지났습니다/)).toBeVisible()

  // Intake verdict (Pass 49): a WP-less declined notification routes to the
  // intake page with the item anchor.
  await drawer.getByText(/반영되지 않았습니다/).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/intake\\?item=ii-1`))
  await page.goBack()
  await bell.click()

  const readAll = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/me/notifications/read-all'),
  )
  await drawer.getByRole('button', { name: '모두 읽음' }).click()
  await readAll
})

test('인박스는 알림 센터를 모바일에서도 정리된 표면으로 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const inbox = {
    items: [
      {
        id: 'n1',
        kind: 'assigned',
        project_id: project.id,
        work_package_id: wpA.id,
        work_package_subject: '워크패키지 API 구현',
        actor_name: 'Dev User',
        read: false,
        created_at: '2026-07-05T09:00:00Z',
      },
      {
        id: 'n2',
        kind: 'mention',
        project_id: project.id,
        work_package_id: wpB.id,
        work_package_subject: '보드 뷰 구현',
        actor_name: 'Ops Lead',
        read: true,
        created_at: '2026-07-04T09:00:00Z',
      },
      {
        id: 'n3',
        kind: 'intake_declined',
        project_id: project.id,
        work_package_id: null,
        intake_item_id: 'ii-1',
        work_package_subject: null,
        actor_name: 'Dev User',
        read: false,
        created_at: '2026-07-03T09:00:00Z',
      },
      {
        id: 'n4',
        kind: 'initiative_health',
        project_id: null,
        initiative_id: 'ini-notify',
        work_package_id: null,
        initiative_name: '모바일 전략',
        work_package_subject: null,
        actor_name: 'Strategy Lead',
        read: false,
        created_at: '2026-07-02T09:00:00Z',
      },
    ],
    total: 4,
    unread: 3,
  }
  await page.route('**/api/v1/me/notifications/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route('**/api/v1/me/notifications', (route) => route.fulfill({ json: inbox }))

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '알림 3건 읽지 않음' }).click()
  await page.getByRole('button', { name: /인박스 열기/ }).click()
  await expect(page).toHaveURL(/\/inbox$/)

  await expect(page.getByRole('heading', { name: '인박스' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '읽지 않음' })).toBeVisible()
  await expect(page.getByText(/회원님을 배정했습니다/)).toBeVisible()
  await expect(page.getByText(/멘션했습니다/)).toBeVisible()
  await expect(page.getByText(/헬스를 업데이트했습니다/)).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/inbox-ui/mobile.png',
    fullPage: true,
  })

  const readReq = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/me/notifications/n1/read'),
  )
  await page.getByRole('button', { name: '읽음', exact: true }).first().click()
  await readReq

  await page.getByRole('tab', { name: '읽음' }).click()
  await expect(page.getByText(/보드 뷰 구현/)).toBeVisible()

  const readAllReq = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/me/notifications/read-all'),
  )
  await page.getByRole('button', { name: /전체 읽음/ }).click()
  await readAllReq

  await page.getByRole('tab', { name: '전체' }).click()
  const declinedReadReq = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/me/notifications/n3/read'),
  )
  await page.getByText(/반영되지 않았습니다/).click()
  await declinedReadReq
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/intake\\?item=ii-1`))

  await page.goto('/inbox')
  await page.getByRole('tab', { name: '전체' }).click()
  await page.getByText(/헬스를 업데이트했습니다/).click()
  await expect(page).toHaveURL(/\/initiatives\?initiative=ini-notify/)
})

test('새 프로젝트 폼에서 템플릿을 고르면 template_project_id를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          ...project,
          id: 'p-new',
          key: 'NEWT',
          name: '템플릿 기반',
          template_applied: { statuses: 6, types: 4, custom_fields: 1, automation_rules: 1 },
        },
      })
      return
    }
    await route.fulfill({ json: { items: [{ ...project, ...projectRollups }], total: 1 } })
  })

  await page.goto('/projects')

  // rollup columns render and toggle off persists in localStorage
  await expect(page.getByText('2건')).toBeVisible()
  await expect(page.getByText('멤버 1')).toBeVisible()
  await page.getByRole('button', { name: '표시' }).click()
  await page.getByRole('menuitemcheckbox', { name: '멤버 열 표시' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('멤버 1')).toBeHidden()
  await page.reload()
  await expect(page.getByText('2건')).toBeVisible()
  await expect(page.getByText('멤버 1')).toBeHidden() // restored from storage
  await page.getByRole('button', { name: '표시' }).click()
  await page.getByRole('menuitemcheckbox', { name: '멤버 열 표시' }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '새 프로젝트' }).first().click()
  await page.getByLabel('이름').fill('템플릿 기반')
  await page.getByLabel(/키 \(대문자/).fill('NEWT')
  await page.getByLabel(/템플릿으로 사용할 프로젝트/).selectOption(project.id)

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/projects'),
  )
  await page.getByRole('button', { name: '만들기' }).click()
  const sent = (await post).postDataJSON() as { template_project_id: string }
  expect(sent.template_project_id).toBe(project.id)
})

test('프로젝트 템플릿 catalog가 revision·적용·보관·복원·삭제를 연결한다', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await mockApi(page)
  const template: ProjectTemplate = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Delivery 표준',
    description: '표준 상태와 자동화',
    source_project_id: project.id,
    source_project_name: project.name,
    created_by: 'me-1',
    creator_name: 'Dev User',
    archived_at: null,
    latest_revision: {
      version: 1,
      statuses: 6,
      types: 4,
      custom_fields: 1,
      automation_rules: 1,
    },
    updated_at: '2026-07-11T08:00:00Z',
    can_manage: true,
  }
  let current: ProjectTemplate | null = template
  await page.route('**/api/v1/project-templates**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const suffix = url.pathname.replace('/api/v1/project-templates', '')
    if (request.method() === 'GET') {
      const includeArchived = url.searchParams.get('include_archived') === 'true'
      const q = url.searchParams.get('q')?.toLocaleLowerCase() ?? ''
      const items = current && (!current.archived_at || includeArchived) && current.name.toLocaleLowerCase().includes(q) ? [current] : []
      return route.fulfill({ json: { items, total: items.length, limit: 50, offset: 0 } })
    }
    if (request.method() === 'POST' && suffix.endsWith('/revisions') && current) {
      current = {
        ...current,
        latest_revision: { ...current.latest_revision!, version: 2 },
        updated_at: '2026-07-11T09:00:00Z',
      }
      return route.fulfill({ status: 201, json: current })
    }
    if (request.method() === 'POST' && suffix.endsWith('/apply')) {
      return route.fulfill({
        status: 201,
        json: { ...project, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', key: 'NEWP' },
      })
    }
    if (request.method() === 'POST' && suffix.endsWith('/archive') && current) {
      current = { ...current, archived_at: '2026-07-11T10:00:00Z' }
      return route.fulfill({ json: current })
    }
    if (request.method() === 'POST' && suffix.endsWith('/unarchive') && current) {
      current = { ...current, archived_at: null }
      return route.fulfill({ json: current })
    }
    if (request.method() === 'DELETE') {
      current = null
      return route.fulfill({ status: 204 })
    }
    return route.fallback()
  })

  await page.goto('/templates')
  await expect(page.getByRole('heading', { name: '프로젝트 템플릿' })).toBeVisible()
  await expect(page.getByText(template.name)).toBeVisible()
  await page.getByRole('button', { name: `${template.name} 상세 보기` }).click()
  const preview = page.getByRole('dialog', { name: '템플릿 상세' })
  await expect(preview.getByText('총 12개 설정 항목이 스냅샷에 포함됩니다.')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/template-library-ui/desktop-preview.png',
    fullPage: true,
  })

  const revision = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/revisions'),
  )
  await preview.getByRole('button', { name: '스냅샷 갱신' }).click()
  await revision
  await expect(preview.getByText('버전 2')).toBeVisible()

  await preview.getByRole('button', { name: '프로젝트에 적용' }).click()
  const applyForm = page.getByRole('form', { name: `${template.name} 적용` })
  await applyForm.getByLabel('새 프로젝트 이름').fill('새 Delivery')
  await applyForm.getByLabel('키').fill('NEWP')
  const apply = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/apply'),
  )
  await applyForm.getByRole('button', { name: '프로젝트 만들기' }).click()
  expect((await apply).postDataJSON()).toMatchObject({ name: '새 Delivery', key: 'NEWP' })
  await expect(page).toHaveURL(/projects\/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\/work-packages/)
  await page.goto('/templates')

  await page.getByRole('button', { name: `${template.name} 상세 보기` }).click()
  await page.getByRole('dialog', { name: '템플릿 상세' }).getByRole('button', { name: '게시 해제' }).click()
  await expect(page.getByText('아직 프로젝트 템플릿이 없습니다')).toBeVisible()
  await page.getByLabel('게시 해제 포함').click()
  await expect(page).toHaveURL(/include_archived=true/)
  await expect(page.getByText('게시 해제', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: `${template.name} 상세 보기` }).click()
  await page.getByRole('dialog', { name: '템플릿 상세' }).getByRole('button', { name: '다시 게시' }).click()
  await expect(page.getByText('게시 중', { exact: true }).first()).toBeVisible()
  await page.getByRole('dialog', { name: '템플릿 상세' }).getByRole('button', { name: '게시 해제' }).click()
  await page.getByRole('button', { name: `${template.name} 상세 보기` }).click()
  await page.getByRole('dialog', { name: '템플릿 상세' }).getByRole('button', { name: '삭제' }).click()
  const dialog = page.getByRole('dialog', { name: `${template.name} 삭제 확인` })
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('dialog', { name: '템플릿 상세' }).getByRole('button', { name: '삭제' }).click()
  const reopenedDialog = page.getByRole('dialog', { name: `${template.name} 삭제 확인` })
  await reopenedDialog.getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('아직 프로젝트 템플릿이 없습니다')).toBeVisible()
})

test('프로젝트 템플릿 생성·검색과 모바일 상태가 실제 요청에 연결된다', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  let items: ProjectTemplate[] = []
  await page.route('**/api/v1/project-templates**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname.endsWith('/sources')) {
      return route.fulfill({
        json: { items: [{ id: project.id, key: project.key, name: project.name }], total: 1 },
      })
    }
    if (request.method() === 'POST' && url.pathname === '/api/v1/project-templates') {
      const input = request.postDataJSON() as {
        name: string
        description: string | null
        source_project_id: string
        publish: boolean
      }
      const { publish, ...templateInput } = input
      const created: ProjectTemplate = {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        ...templateInput,
        source_project_name: project.name,
        created_by: 'me-1',
        creator_name: 'Dev User',
        archived_at: publish ? null : '2026-07-11T08:00:00Z',
        latest_revision: {
          version: 1,
          statuses: 6,
          types: 4,
          custom_fields: 0,
          automation_rules: 0,
        },
        updated_at: '2026-07-11T08:00:00Z',
        can_manage: true,
      }
      items = [created]
      return route.fulfill({ status: 201, json: created })
    }
    if (request.method() === 'GET') {
      const q = url.searchParams.get('q')?.toLocaleLowerCase() ?? ''
      const filtered = items.filter((item) => item.name.toLocaleLowerCase().includes(q))
      return route.fulfill({ json: { items: filtered, total: filtered.length, limit: 50, offset: 0 } })
    }
    return route.fallback()
  })

  await page.goto('/templates')
  await page.getByRole('button', { name: '새 템플릿' }).first().click()
  const createForm = page.getByRole('form', { name: '새 템플릿 생성' })
  await createForm.getByLabel('템플릿 이름').fill('모바일 표준')
  await createForm.getByLabel('원본 프로젝트').selectOption(project.id)
  const create = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/v1/project-templates'),
  )
  await createForm.getByRole('button', { name: '만들기' }).click()
  expect((await create).postDataJSON()).toMatchObject({
    name: '모바일 표준',
    source_project_id: project.id,
    publish: true,
  })
  await expect(page.getByText('모바일 표준')).toBeVisible()
  await page.getByLabel('템플릿 검색어').fill('없음')
  await page.getByLabel('템플릿 검색어').press('Enter')
  await expect(page).toHaveURL(/q=%EC%97%86%EC%9D%8C/)
  await expect(page.getByText('조건에 맞는 템플릿이 없습니다')).toBeVisible()
  await page.getByRole('button', { name: '검색 지우기' }).click()
  await expect(page.getByText('모바일 표준')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/template-library-ui/mobile.png',
    fullPage: true,
  })
})

test('프로젝트 템플릿 목록 오류는 명시적 재시도로 복구한다', async ({ page }) => {
  await mockApi(page)
  let fail = true
  await page.route('**/api/v1/project-templates**', (route) => {
    if (fail) return route.fulfill({ status: 500, json: { detail: 'temporary' } })
    return route.fulfill({ json: { items: [], total: 0, limit: 50, offset: 0 } })
  })
  await page.goto('/templates')
  await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다')
  fail = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('아직 프로젝트 템플릿이 없습니다')).toBeVisible()
})

test('프로젝트 템플릿 페이지 offset은 데이터 범위와 형식에 맞게 교정한다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  const items: ProjectTemplate[] = Array.from({ length: 51 }, (_, index) => ({
    id: `template-${index + 1}`,
    name: `Template ${index + 1}`,
    description: null,
    source_project_id: project.id,
    source_project_name: project.name,
    created_by: 'me-1',
    creator_name: 'Dev User',
    archived_at: null,
    latest_revision: {
      version: 1,
      statuses: 6,
      types: 4,
      custom_fields: 0,
      automation_rules: 0,
    },
    updated_at: '2026-07-11T08:00:00Z',
    can_manage: true,
  }))
  await page.route('**/api/v1/project-templates**', (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') ?? 0)
    return route.fulfill({
      json: { items: items.slice(offset, offset + 50), total: items.length, limit: 50, offset },
    })
  })

  await page.goto('/templates?offset=100')
  await expect(page).toHaveURL(/offset=50/)
  await expect(page.getByText('Template 51')).toBeVisible()
  const firstPage = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/api/v1/project-templates' && url.searchParams.get('offset') === '0'
  })
  await page.getByRole('button', { name: '이전 페이지' }).click()
  await firstPage
  await expect(page).toHaveURL(/\/templates$/)
  await expect(page.getByText('Template 1', { exact: true })).toBeVisible()

  items.length = 0
  for (const invalidOffset of ['50', '-5', 'oops']) {
    await page.goto(`/templates?offset=${invalidOffset}`)
    await expect(page).toHaveURL(/\/templates$/)
    await expect(page.getByText('아직 프로젝트 템플릿이 없습니다')).toBeVisible()
  }
})

test('전체 검색이 그룹 결과를 보여주고 문서로 이동한다', async ({ page }) => {
  await mockApi(page)
  const emptyGroup = { items: [], returned: 0, truncated: false }
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({
      json: {
        query: '구현',
        work_packages: {
          items: [
            {
              id: wpA.id,
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              subject: '워크패키지 API 구현',
              status: 'todo',
              priority: 'high',
              type: 'task',
              due_date: '2026-07-15',
            },
          ],
          returned: 1,
          truncated: false,
        },
        documents: {
          items: [
            {
              id: 'd-77',
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              title: '구현 가이드 문서',
              matched_in: 'content',
              snippet: '…배포 구현 절차를 정리한 본문입니다…',
            },
          ],
          returned: 1,
          truncated: true,
        },
        files: {
          items: [
            {
              id: 'file-77',
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              filename: '배포 체크리스트.txt',
              content_type: 'text/plain',
              size_bytes: 128,
              matched_in: 'content',
              snippet: '…배포 구현 검증 항목을 정리한 파일 본문입니다…',
            },
          ],
          returned: 1,
          truncated: false,
        },
        meetings: emptyGroup,
        cycles: emptyGroup,
        modules: emptyGroup,
        initiatives: emptyGroup,
      },
    }),
  )
  await page.route('**/api/v1/documents/d-77', (route) =>
    route.fulfill({
      json: {
        id: 'd-77',
        project_id: project.id,
        parent_id: null,
        title: '구현 가이드 문서',
        body: null,
        author_id: null,
        version: 0,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/d-77/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'file-77',
            project_id: project.id,
            work_package_id: null,
            document_id: null,
            filename: '배포 체크리스트.txt',
            content_type: 'text/plain',
            size_bytes: 128,
            url: 'oneflow://attachments/file-77',
            has_file: true,
            search_index_status: 'indexed',
            search_indexed_at: '2026-07-16T00:00:00Z',
            uploaded_by: 'u-dev',
            created_at: '2026-07-16T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto('/search')
  await page.getByLabel('전체 검색어').fill('구현')
  await page.getByRole('button', { name: '검색', exact: true }).click()

  // grouped sections with truncation notice on documents
  await expect(page.getByText('작업 1건')).toBeVisible()
  await expect(page.getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()
  await expect(page.getByText('문서 1건')).toBeVisible()
  await expect(page.getByText('파일 1건')).toBeVisible()
  // content match (Pass 39): badge + plain-text snippet render as text nodes
  await expect(page.getByText('본문', { exact: true })).toHaveCount(2)
  await expect(page.getByText('배포 구현 절차를 정리한 본문입니다', { exact: false })).toBeVisible()
  await expect(
    page.getByText('배포 구현 검증 항목을 정리한 파일 본문입니다', { exact: false }),
  ).toBeVisible()
  await expect(page.getByText('더 있음', { exact: false })).toBeVisible()
  await expect(page.getByText('회의', { exact: true })).toBeHidden() // empty group hidden

  // navigation contract: a file result opens the real project Files surface.
  await page.getByRole('button', { name: /배포 체크리스트\.txt/ }).click()
  await expect(page).toHaveURL(`/projects/${project.id}/files?file=file-77`)
  await expect(page.getByRole('link', { name: /배포 체크리스트\.txt/ })).toBeVisible()
  await expect(page.getByText('검색 가능', { exact: true })).toBeVisible()

  // navigation contract: a document result opens the editor
  await page.goBack()
  await page.getByRole('button', { name: /구현 가이드 문서/ }).click()
  await expect(page.getByLabel('문서 제목')).toHaveValue('구현 가이드 문서')
})

test('전체 검색 표면은 모바일에서 요약과 결과 카드를 안정적으로 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const emptyGroup = { items: [], returned: 0, truncated: false }
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({
      json: {
        query: '구현',
        work_packages: {
          items: [
            {
              id: wpA.id,
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              subject: '워크패키지 API 구현',
              status: 'todo',
              priority: 'high',
              type: 'task',
              due_date: '2026-07-15',
              matched_in: 'primary',
              snippet: null,
            },
          ],
          returned: 1,
          truncated: false,
        },
        documents: {
          items: [
            {
              id: 'd-77',
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              title: '구현 가이드 문서',
              matched_in: 'content',
              snippet: '배포 구현 절차를 정리한 본문입니다',
            },
          ],
          returned: 1,
          truncated: true,
        },
        files: {
          items: [
            {
              id: 'file-77',
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              filename: '배포 체크리스트.txt',
              content_type: 'text/plain',
              size_bytes: 128,
              matched_in: 'content',
              snippet: '배포 구현 검증 항목을 정리한 파일 본문입니다',
            },
          ],
          returned: 1,
          truncated: false,
        },
        meetings: emptyGroup,
        cycles: emptyGroup,
        modules: emptyGroup,
        initiatives: emptyGroup,
      },
    }),
  )

  await page.goto('/search?q=%EA%B5%AC%ED%98%84')
  await expect(page.getByRole('heading', { name: '전체 검색' })).toBeVisible()
  await expect(page.getByLabel('검색 결과 요약')).toContainText('작업')
  await expect(page.getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /배포 체크리스트\.txt/ })).toBeVisible()
  await expect(page.getByText('배포 구현 절차를 정리한 본문입니다')).toBeVisible()
  await expect(page.getByText('배포 구현 검증 항목을 정리한 파일 본문입니다')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/file-content-search-ui/search-mobile.png',
    fullPage: true,
  })
})

test('파일 표면에서 legacy 본문 인덱스를 실제로 준비하고 상태를 갱신한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  let indexed = false
  await page.route(
    `**/api/v1/projects/${project.id}/attachments/search-index/rebuild`,
    async (route) => {
      indexed = true
      await route.fulfill({
        json: {
          processed: 1,
          indexed: 1,
          remaining: 0,
          statuses: { indexed: 1 },
        },
      })
    },
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'legacy-file',
            project_id: project.id,
            work_package_id: null,
            document_id: null,
            filename: 'legacy-guide.txt',
            content_type: 'text/plain',
            size_bytes: 64,
            url: 'oneflow://attachments/legacy-file',
            has_file: true,
            search_index_status: indexed ? 'indexed' : 'pending',
            search_indexed_at: indexed ? '2026-07-16T00:00:00Z' : null,
            uploaded_by: 'u-dev',
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/files?file=legacy-file`)
  await expect(page.getByText('준비 필요', { exact: true })).toBeVisible()

  const rebuild = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith(
        `/api/v1/projects/${project.id}/attachments/search-index/rebuild`,
      ),
  )
  await page.getByRole('button', { name: '본문 검색 준비 1건' }).click()
  await rebuild

  await expect(page.getByRole('status')).toHaveText('1건 확인 · 1건 검색 가능')
  await expect(page.getByText('검색 가능', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '본문 검색 준비 1건' })).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/file-content-search-ui/files-mobile.png',
    fullPage: true,
  })
})

test('상단 검색은 flag OFF에서도 overlay를 열고 전역 단축키만 비활성화한다', async ({ page }) => {
  await mockApi(page)
  await mockCommandPaletteSearch(page)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/projects')
  const trigger = page.getByRole('button', { name: '전체 검색 열기' }).first()
  await expect(trigger).toBeVisible()
  await expect(trigger).not.toHaveAttribute('aria-keyshortcuts')
  await page.keyboard.press('/')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)
  await page.addStyleTag({
    content: '.of-search-surface-opening { animation-duration: 2s !important; }',
  })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-phase', 'opening')
  const openingMotion = await dialog.evaluate((element) => ({
    surfaceName: getComputedStyle(element).animationName,
    durationToken: getComputedStyle(document.documentElement)
      .getPropertyValue('--of-duration-overlay')
      .trim(),
    contentName: getComputedStyle(element.querySelector('.of-search-content')!).animationName,
  }))
  expect(openingMotion).toEqual({
    surfaceName: 'of-search-surface-opening',
    durationToken: '220ms',
    contentName: 'of-search-content-opening',
  })
  await expect(dialog.getByLabel('전체 검색어')).toBeFocused()
  await expect(dialog.getByRole('heading', { name: '워크스페이스 검색' })).toBeVisible()
  const geometry = await dialog.evaluate((element) => {
    const style = getComputedStyle(element)
    const trigger = document.querySelector<HTMLElement>('[data-testid="global-search-trigger"]')
    const rect = trigger?.getBoundingClientRect()
    return {
      anchorLeft: Number.parseFloat(style.getPropertyValue('--of-search-anchor-left')),
      anchorTop: Number.parseFloat(style.getPropertyValue('--of-search-anchor-top')),
      anchorWidth: Number.parseFloat(style.getPropertyValue('--of-search-anchor-width')),
      anchorHeight: Number.parseFloat(style.getPropertyValue('--of-search-anchor-height')),
      finalWidth: Number.parseFloat(style.getPropertyValue('--of-search-final-width')),
      rect: rect && { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    }
  })
  expect(geometry.anchorLeft).toBeCloseTo(geometry.rect?.left ?? 0, 0)
  expect(geometry.anchorTop).toBeCloseTo(geometry.rect?.top ?? 0, 0)
  expect(geometry.anchorWidth).toBeCloseTo(geometry.rect?.width ?? 0, 0)
  expect(geometry.anchorHeight).toBeCloseTo(geometry.rect?.height ?? 0, 0)
  expect(geometry.finalWidth).toBeGreaterThanOrEqual(560)
  await dialog.evaluate((element) => {
    const opening = element
      .getAnimations()
      .find((animation) => (animation as CSSAnimation).animationName === 'of-search-surface-opening')
    opening?.finish()
  })
  await expect(dialog).toHaveAttribute('data-phase', 'open')
  const openBox = await dialog.boundingBox()
  expect(openBox?.y).toBeCloseTo(geometry.anchorTop, 0)
  await expect(dialog.getByLabel('전체 검색어')).toHaveCSS('border-top-width', '0px')
  await expect(dialog.getByLabel('전체 검색어')).toHaveCSS('box-shadow', 'none')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/global-search-overlay-ui/desktop-empty.png',
  })
  await dialog.getByLabel('전체 검색어').fill('구현')
  await expect(dialog.getByRole('option', { name: /워크패키지 API 구현/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveAttribute('data-phase', 'closing')
  await expect(dialog).toHaveCSS('animation-name', 'of-search-surface-closing')
  await expect(trigger).not.toBeFocused()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('상단 검색은 opening 중 Escape에도 현재 geometry에서 역방향으로 닫힌다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/projects')
  await page.addStyleTag({
    content: '.of-search-surface-opening { animation-duration: 2s !important; }',
  })
  const trigger = page.getByRole('button', { name: '전체 검색 열기' }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await expect(dialog).toHaveAttribute('data-phase', 'opening')
  const openingBox = await dialog.evaluate((element) => {
    for (const animation of element.parentElement?.getAnimations({ subtree: true }) ?? []) {
      animation.pause()
      animation.currentTime = 60
    }
    const content = element.querySelector<HTMLElement>('.of-search-content')
    return {
      ...element.getBoundingClientRect().toJSON(),
      overlayOpacity: Number.parseFloat(getComputedStyle(element.parentElement!).opacity),
      contentOpacity: Number.parseFloat(getComputedStyle(content!).opacity),
      contentTransform: getComputedStyle(content!).transform,
    }
  })

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveAttribute('data-phase', 'closing')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.dispatchEvent(new Event('resize'))
        window.requestAnimationFrame(() => resolve())
      }),
  )
  const closingGeometry = await dialog.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      startWidth: Number.parseFloat(style.getPropertyValue('--of-search-current-width')),
      finalWidth: Number.parseFloat(style.getPropertyValue('--of-search-final-width')),
      overlayOpacity: Number.parseFloat(
        style.getPropertyValue('--of-search-current-overlay-opacity'),
      ),
      contentOpacity: Number.parseFloat(
        style.getPropertyValue('--of-search-current-content-opacity'),
      ),
      contentTransform: style.getPropertyValue('--of-search-current-content-transform').trim(),
    }
  })
  expect(closingGeometry.startWidth).toBeCloseTo(openingBox.width, 0)
  expect(closingGeometry.startWidth).toBeLessThan(closingGeometry.finalWidth)
  expect(closingGeometry.overlayOpacity).toBeCloseTo(openingBox.overlayOpacity, 2)
  expect(closingGeometry.contentOpacity).toBeCloseTo(openingBox.contentOpacity, 2)
  expect(closingGeometry.contentTransform).toBe(openingBox.contentTransform)
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('커맨드 팔레트가 flag ON에서 검색 결과를 열고 키보드로 이동한다', async ({ page }) => {
  await mockApi(page)
  await enableCommandPalette(page)
  await mockCommandPaletteSearch(page)
  await page.goto('/projects')

  await page.getByRole('button', { name: '전체 검색 열기' }).first().click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('전체 검색어').fill('구현')
  await expect(dialog.getByRole('option', { name: /워크패키지 API 구현/ })).toBeVisible()
  await expect(dialog.getByRole('tab', { name: /작업/ })).toBeVisible()
  await dialog.getByRole('tab', { name: /전체/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('tab', { name: /작업/ })).toBeFocused()
  await expect(dialog.getByRole('tab', { name: /작업/ })).toHaveAttribute('aria-selected', 'true')
  await dialog.getByLabel('전체 검색어').focus()

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
  await expect(page.getByRole('heading', { name: '워크패키지 API 구현' })).toBeVisible()

  await page.getByRole('button', { name: '전체 검색 열기' }).first().click()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('전체 검색어').fill('구현')
  await expect(dialog.getByRole('option', { name: /워크패키지 API 구현/ })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=%EA%B5%AC%ED%98%84$/)
})

test('커맨드 팔레트 파일 결과는 실제 Files 표면으로 이동한다', async ({ page }) => {
  await mockApi(page)
  await enableCommandPalette(page)
  const emptyGroup = { items: [], returned: 0, truncated: false }
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({
      json: {
        query: '배포',
        work_packages: emptyGroup,
        documents: emptyGroup,
        files: {
          items: [
            {
              id: 'palette-file',
              project_id: project.id,
              project_key: 'ONE',
              project_name: 'OneFlow 도입',
              filename: '배포 체크리스트.txt',
              content_type: 'text/plain',
              size_bytes: 128,
              matched_in: 'content',
              snippet: '배포 전 검증할 파일 본문입니다',
            },
          ],
          returned: 1,
          truncated: false,
        },
        meetings: emptyGroup,
        cycles: emptyGroup,
        modules: emptyGroup,
        initiatives: emptyGroup,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'palette-file',
            project_id: project.id,
            work_package_id: null,
            document_id: null,
            filename: '배포 체크리스트.txt',
            content_type: 'text/plain',
            size_bytes: 128,
            url: 'oneflow://attachments/palette-file',
            has_file: true,
            search_index_status: 'indexed',
            search_indexed_at: '2026-07-16T00:00:00Z',
            uploaded_by: 'u-dev',
            created_at: '2026-07-16T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.goto('/projects')

  await page.getByRole('button', { name: '전체 검색 열기' }).first().click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await dialog.getByLabel('전체 검색어').fill('배포')
  await expect(dialog.getByRole('tab', { name: /파일1/ })).toBeVisible()
  await expect(dialog.getByText('배포 전 검증할 파일 본문입니다')).toBeVisible()
  await dialog.getByRole('option', { name: /배포 체크리스트\.txt/ }).click()

  await expect(page).toHaveURL(`/projects/${project.id}/files?file=palette-file`)
  await expect(page.getByRole('link', { name: /배포 체크리스트\.txt/ })).toBeVisible()
  await expect(page.getByText('검색 가능', { exact: true })).toBeVisible()
})

test('커맨드 팔레트 단축키는 편집 필드를 침범하지 않는다', async ({ page }) => {
  await mockApi(page)
  await enableCommandPalette(page)
  await mockCommandPaletteSearch(page)
  await page.goto(`/projects/${project.id}/work-packages`)

  await page.getByLabel('작업 목록 검색어').focus()
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)

  await page.getByRole('button', { name: '워크패키지 API 구현' }).focus()
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)
})

test('커맨드 팔레트는 모바일 폭에서 결과와 닫기 버튼이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await enableCommandPalette(page)
  await mockCommandPaletteSearch(page)
  await page.goto('/projects')

  await page.getByRole('button', { name: '전체 검색 열기' }).first().click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('전체 검색어').fill('구현')
  await expect(dialog.getByRole('option', { name: /워크패키지 API 구현/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '전체 검색 닫기' })).toBeVisible()
  await page.setViewportSize({ width: 360, height: 720 })
  const mobileGeometry = await dialog.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      left: Number.parseFloat(style.getPropertyValue('--of-search-final-left')),
      width: Number.parseFloat(style.getPropertyValue('--of-search-final-width')),
      viewportWidth: window.innerWidth,
    }
  })
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(0)
  expect(mobileGeometry.left + mobileGeometry.width).toBeLessThanOrEqual(mobileGeometry.viewportWidth)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/global-search-overlay-ui/mobile-results.png',
  })
})

test('상단 검색 overlay는 reduced motion에서 전환을 제거한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.goto('/projects')
  await page.getByRole('button', { name: '전체 검색 열기' }).first().click()
  const dialog = page.getByRole('dialog', { name: '전체 검색' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-phase', 'open')
  await expect(dialog).toHaveCSS('animation-name', 'none')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: '전체 검색 열기' }).first()).toBeFocused()
})

test('저장된 필터를 적용하면 목록 쿼리에 반영된다', async ({ page }) => {
  await mockApi(page)
  // one saved filter (registered after mockApi → precedence over the empty default)
  await page.route(`**/api/v1/projects/${project.id}/saved-filters`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'sf1',
            project_id: project.id,
            name: '긴급 작업',
            params: { status: 'todo' },
            layout: 'list',
            sort: null,
            is_shared: false,
            is_locked: false,
            is_mine: true,
            owner_name: 'Dev User',
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.goto(`/projects/${project.id}/work-packages`)
  // exact: avoid matching the '긴급 작업 삭제' delete button
  const chip = page.getByRole('button', { name: '긴급 작업', exact: true })
  await expect(chip).toBeVisible()

  // applying the filter writes ?status=todo → the list refetches with it
  const req = page.waitForRequest(
    (r) => r.url().includes('/work-packages') && r.url().includes('status=todo'),
  )
  await chip.click()
  await req
})

test('저장 뷰 관리 surface는 모바일에서 활성·잠금·저장 흐름을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/saved-filters`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'sf-active',
            project_id: project.id,
            name: '긴급 작업',
            params: { status: 'todo' },
            layout: 'list',
            sort: null,
            is_shared: true,
            is_locked: false,
            is_mine: true,
            owner_name: 'Dev User',
            created_at: '2026-07-01T00:00:00Z',
          },
          {
            id: 'sf-locked',
            project_id: project.id,
            name: '잠긴 뷰',
            params: { priority: 'high' },
            layout: 'list',
            sort: null,
            is_shared: false,
            is_locked: true,
            is_mine: true,
            owner_name: 'Dev User',
            created_at: '2026-07-02T00:00:00Z',
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages?status=todo`)
  const surface = page.getByRole('region', { name: '저장 뷰 관리' })
  await expect(surface.getByText('활성 긴급 작업')).toBeVisible()
  await expect(surface.getByRole('button', { name: '긴급 작업', exact: true })).toBeVisible()
  await expect(surface.getByLabel('잠긴 뷰 잠금 해제')).toBeVisible()
  await expect(surface.getByLabel('잠긴 뷰 삭제')).toBeHidden()
  await surface.getByRole('button', { name: '현재 필터를 뷰로 저장' }).click()
  await expect(surface.getByLabel('뷰 이름')).toBeVisible()
  await expect(surface.getByLabel('뷰 레이아웃')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/saved-views-ui/mobile.png',
    fullPage: true,
  })
})

test('Project Views directory는 생성·공유 뷰 열기·소유자 관리를 연결한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  let ownedLocked = false
  const items = [
    {
      id: 'view-owned',
      project_id: project.id,
      name: '내 일정',
      params: { priority: 'high' },
      layout: 'calendar',
      sort: null,
      is_shared: false,
      is_locked: ownedLocked,
      is_mine: true,
      owner_name: 'Dev User',
      created_at: '2026-07-01T00:00:00Z',
    },
    {
      id: 'view-shared',
      project_id: project.id,
      name: '팀 보드',
      params: { status: 'todo' },
      layout: 'board',
      sort: 'subject',
      is_shared: true,
      is_locked: false,
      is_mine: false,
      owner_name: 'Alex Kim',
      created_at: '2026-07-02T00:00:00Z',
    },
  ]
  await page.route(`**/api/v1/projects/${project.id}/saved-filters`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        json: {
          id: 'view-new',
          project_id: project.id,
          ...body,
          is_locked: false,
          is_mine: true,
          owner_name: 'Dev User',
          created_at: '2026-07-03T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({ json: { items, total: items.length } })
  })
  await page.route(`**/api/v1/projects/${project.id}/saved-filters/view-owned`, async (route) => {
    const body = route.request().postDataJSON() as { is_locked?: boolean }
    if (body.is_locked !== undefined) ownedLocked = body.is_locked
    items[0].is_locked = ownedLocked
    await route.fulfill({ json: items[0] })
  })

  await page.goto(`/projects/${project.id}/views`)
  await expect(page.getByRole('heading', { name: '프로젝트 뷰' })).toBeVisible()
  await expect(page.getByText('Alex Kim님이 공유')).toBeVisible()
  await expect(page.getByRole('button', { name: '잠금' })).toHaveCount(1)
  await page.getByRole('link', { name: '팀 보드 열기' }).click()
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id}/board\\?status=todo&sort=subject`),
  )

  await page.goto(`/projects/${project.id}/views`)
  await page.getByRole('button', { name: '뷰 만들기' }).click()
  await page.getByLabel('뷰 이름').fill('주간 캘린더')
  await page.getByLabel('레이아웃').selectOption('calendar')
  await page.getByRole('checkbox', { name: '팀과 공유' }).check()
  const post = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/saved-filters'),
  )
  await page.getByRole('button', { name: '저장' }).click()
  expect((await post).postDataJSON()).toEqual({
    name: '주간 캘린더',
    params: {},
    layout: 'calendar',
    sort: null,
    is_shared: true,
  })
  const patch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/view-owned'),
  )
  await page.getByRole('button', { name: '잠금' }).click()
  expect((await patch).postDataJSON()).toEqual({ is_locked: true })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-views-ui/mobile.png',
    fullPage: true,
  })
})

test('현재 필터를 보드 레이아웃 공유 뷰로 저장한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages?status=todo`)

  await page.getByRole('button', { name: '현재 필터를 뷰로 저장' }).click()
  await page.getByLabel('뷰 이름').fill('할 일 보드')
  await page.getByLabel('뷰 레이아웃').selectOption('board')
  await page.getByRole('checkbox', { name: '공유' }).check()

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/saved-filters'),
  )
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const sent = (await post).postDataJSON() as {
    name: string
    layout: string
    is_shared: boolean
    params: { status?: string }
  }
  expect(sent.name).toBe('할 일 보드')
  expect(sent.layout).toBe('board')
  expect(sent.is_shared).toBe(true)
  expect(sent.params.status).toBe('todo')
})

test('목록 view controls가 검색과 초기화를 URL 상태로 공유한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages?status=todo&sort=subject`)

  const listReq = page.waitForRequest(
    (r) => r.url().includes('/work-packages?') && r.url().includes('q=API'),
  )
  await page.getByLabel('작업 목록 검색어').fill('API')
  await page.getByRole('button', { name: '검색', exact: true }).click()
  await listReq
  await expect(page).toHaveURL(/q=API/)

  await page.getByLabel('현재 보기 초기화').click()
  await expect(page.getByLabel('작업 목록 검색어')).toHaveValue('')
  await expect(page).not.toHaveURL(/status=/)
  await expect(page).not.toHaveURL(/sort=/)
  await expect(page).not.toHaveURL(/q=/)
})

test('표시 열 구성이 URL을 따르고 저장 시 정규화된다', async ({ page }) => {
  await mockApi(page)
  // Unknown key in a shared/hand-edited URL is silently ignored (R1-④).
  await page.goto(`/projects/${project.id}/work-packages?columns=bogus,created_at,type`)
  await expect(page.getByRole('columnheader', { name: '타입' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '생성일' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '상태' })).toBeHidden()
  await expect(page.getByRole('columnheader', { name: '담당자' })).toBeHidden()
  // created_at renders as the UTC date part only (R1-⑤).
  await expect(page.getByRole('cell', { name: '2026-07-01' }).first()).toBeVisible()

  // Toggling 타입 off leaves 생성일 as the last column — which cannot be
  // turned off (min-1, R1-①).
  await page.getByRole('button', { name: '표시' }).click()
  await page.getByRole('menuitemcheckbox', { name: '타입 열 표시' }).click()
  await expect(page.getByRole('columnheader', { name: '타입' })).toBeHidden()
  await expect(page).toHaveURL(/columns=created_at/)
  await expect(page.getByRole('menuitemcheckbox', { name: '생성일 열 표시' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Saving the view sends the CANONICAL columns value — the bogus key from
  // the URL never reaches the API (URL→저장 왕복, R1-④).
  await page.getByRole('button', { name: '현재 필터를 뷰로 저장' }).click()
  await page.getByLabel('뷰 이름').fill('생성일 뷰')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/saved-filters'),
  )
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const sent = (await post).postDataJSON() as { params: { columns?: string } }
  expect(sent.params.columns).toBe('created_at')
})

test('커스텀 필드 열을 켜면 목록이 값과 함께 렌더된다', async ({ page }) => {
  await mockApi(page)
  const FIELD_ID = '11111111-2222-3333-4444-555555555555'
  await page.route(`**/api/v1/projects/${project.id}/custom-fields**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: FIELD_ID,
            project_id: project.id,
            name: '환경',
            field_type: 'text',
            is_active: true,
            applies_to: null,
            options: null,
            position: 0,
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(
    `**/api/v1/projects/${project.id}/work-packages?**custom_fields=**`,
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              ...wpA,
              custom_values: [
                { field_id: FIELD_ID, value: '스테이징', member_display_name: null },
              ],
            },
            { ...wpB, custom_values: [] },
          ],
          total: 2,
        },
      }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  const listGet = page.waitForRequest((r) => r.url().includes(`custom_fields=${FIELD_ID}`))
  await page.getByRole('button', { name: '표시' }).click()
  await page.getByRole('menuitemcheckbox', { name: '환경 열 표시' }).click()
  await listGet
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(new RegExp(`columns=.*custom%3A${FIELD_ID}|custom:${FIELD_ID}`))
  await expect(page.getByRole('columnheader', { name: '환경' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '스테이징' })).toBeVisible()
})

test('커스텀 필드 필터가 목록을 좁히고 op 전환·저장 뷰로 왕복한다', async ({ page }) => {
  await mockApi(page)
  const FIELD_ID = '11111111-2222-3333-4444-555555555555'
  await page.route(`**/api/v1/projects/${project.id}/custom-fields**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: FIELD_ID,
            project_id: project.id,
            name: '환경',
            field_type: 'text',
            is_active: true,
            applies_to: null,
            options: null,
            position: 0,
          },
        ],
        total: 1,
      },
    }),
  )
  // The list narrows to wpA when the custom filter is present.
  await page.route(`**/api/v1/projects/${project.id}/work-packages**`, (route) => {
    const url = route.request().url()
    if (url.includes(`cf_field=${FIELD_ID}`)) {
      route.fulfill({ json: { items: [wpA], total: 1 } })
      return
    }
    route.fulfill({ json: workPackages })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeVisible()

  // Selecting the field defaults the op to 'has' (no value) — the list refetches.
  const hasReq = page.waitForRequest(
    (r) => r.url().includes('/work-packages?') && r.url().includes(`cf_field=${FIELD_ID}`),
  )
  await page.getByLabel('커스텀 필드 필터').selectOption({ label: '환경' })
  await hasReq
  await expect(page).toHaveURL(new RegExp(`cf_field=${FIELD_ID}`))
  await expect(page).toHaveURL(/cf_op=has/)
  // The list narrowed — the second WP is gone.
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeHidden()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()

  // Switching to '값 일치' reveals a value input and drops the stale value from the URL.
  await page.getByLabel('커스텀 필드 연산').selectOption('eq')
  await expect(page).not.toHaveURL(/cf_value=/)
  const eqReq = page.waitForRequest((r) => r.url().includes('cf_value=%EC%9A%B4%EC%98%81'))
  await page.getByLabel('커스텀 필드 값').fill('운영')
  await eqReq
  await expect(page).toHaveURL(/cf_op=eq/)

  // Saving the current filter carries the custom-field params into the view.
  await page.getByRole('button', { name: '현재 필터를 뷰로 저장' }).click()
  await page.getByLabel('뷰 이름').fill('운영 환경 뷰')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/saved-filters'),
  )
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const sent = (await post).postDataJSON() as {
    params: { cf_field?: string; cf_op?: string; cf_value?: string }
  }
  expect(sent.params.cf_field).toBe(FIELD_ID)
  expect(sent.params.cf_op).toBe('eq')
  expect(sent.params.cf_value).toBe('운영')
})

test('보드가 프로젝트 워크플로우 설정의 라벨과 순서를 반영한다', async ({ page }) => {
  await mockApi(page)
  // custom labels for the two statuses the fixtures use (after mockApi → precedence)
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 's1', project_id: project.id, key: 'todo', name: '해야 할 일', position: 0 },
          { id: 's2', project_id: project.id, key: 'in_progress', name: '작업 중', position: 1 },
        ],
        total: 2,
      },
    }),
  )
  await page.goto(`/projects/${project.id}/board`)
  await expect(page.getByLabel('해야 할 일 컬럼')).toBeVisible()
  await expect(page.getByLabel('작업 중 컬럼')).toBeVisible()
})

test('상세 헤더 담당자는 loaded roster와 연속 CAS를 재사용하고 Properties에 동기화된다', async ({ page }) => {
  let memberRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/projects/${project.id}/members`)) {
      memberRequests += 1
    }
  })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) => route.fulfill({
    json: {
      items: [
        { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        { user_id: 'u-alex', email: 'alex@oneflow.local', display_name: 'Alex Kim', role: 'member' },
        { user_id: 'u-view', email: 'view@oneflow.local', display_name: 'Read Only', role: 'viewer' },
      ],
      total: 3,
    },
  }))
  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('columnheader', { name: '담당자' })).toBeVisible()
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const propertiesAssignee = drawer.getByLabel('담당자', { exact: true })
  const trigger = drawer.getByRole('button', { name: '담당자 변경: 미배정' })
  const subjectBox = await drawer.getByLabel('제목', { exact: false }).first().boundingBox()
  await expect(propertiesAssignee).toHaveValue('')
  await expect.poll(() => memberRequests).toBe(1)

  await trigger.click()
  const assigneePicker = page.getByRole('dialog', { name: '담당자 선택' })
  await expect(assigneePicker).toBeVisible()
  await expect.poll(() => assigneePicker.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  await expect(assigneePicker.getByRole('option', { name: 'Read Only' })).toHaveCount(0)
  const unassignedOption = assigneePicker.getByRole('option', { name: '미배정' })
  await expect(unassignedOption).toBeFocused()
  await unassignedOption.press('End')
  await expect(assigneePicker.getByRole('option', { name: 'Alex Kim' })).toBeFocused()
  expect(memberRequests).toBe(1)
  expect(subjectBox).not.toBeNull()
  await page.mouse.click(subjectBox!.x + subjectBox!.width / 2, subjectBox!.y + subjectBox!.height / 2)
  await expect(assigneePicker).toHaveCount(0)
  await expect(drawer).toBeVisible()

  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(page.getByRole('dialog', { name: '담당자 선택' })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-assignee-control-ui/desktop-menu.png',
  })
  const assignPatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes(`/work-packages/${wpA.id}`),
  )
  await page.getByRole('dialog', { name: '담당자 선택' }).getByRole('option', { name: 'Alex Kim' }).click()
  expect((await assignPatch).postDataJSON()).toEqual({ expected_version: 0, assignee_id: 'u-alex' })
  const assignedTrigger = drawer.getByRole('button', { name: '담당자 변경: Alex Kim' })
  await expect(assignedTrigger).toBeVisible()
  await expect(propertiesAssignee).toHaveValue('u-alex')

  const clearPatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes(`/work-packages/${wpA.id}`),
  )
  await assignedTrigger.click()
  await page.getByRole('dialog', { name: '담당자 선택' }).getByRole('option', { name: '미배정' }).click()
  expect((await clearPatch).postDataJSON()).toEqual({ expected_version: 1, assignee_id: null })
  await expect(drawer.getByRole('button', { name: '담당자 변경: 미배정' })).toBeVisible()
  await expect(propertiesAssignee).toHaveValue('')
})

test('상세 담당자는 기존 viewer 배정을 표시하지만 새 배정 후보로 노출하지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) => route.fulfill({
    json: {
      items: [
        { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        { user_id: 'u-view', email: 'view@oneflow.local', display_name: 'Read Only', role: 'viewer' },
      ],
      total: 2,
    },
  }))
  await page.route(`**/api/v1/work-packages/${wpA.id}`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { ...wpA, assignee_id: 'u-view' } })
    }
    return route.fallback()
  })
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')

  const propertiesAssignee = drawer.getByLabel('담당자', { exact: true })
  await expect(propertiesAssignee).toHaveValue('u-view')
  await expect(propertiesAssignee.locator('option[value="u-view"]')).toBeDisabled()
  await drawer.getByRole('button', { name: '담당자 변경: Read Only' }).click()
  await expect(
    page.getByRole('dialog', { name: '담당자 선택' }).getByRole('option', { name: 'Read Only' }),
  ).toBeDisabled()
})

test('상세 헤더 담당자는 409·권한·검증·서버 오류에서 서버값과 피드백을 보존한다', async ({ page }) => {
  await mockApi(page, { conflictOnPatch: true })
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const trigger = drawer.getByRole('button', { name: '담당자 변경: 미배정' })

  await trigger.click()
  await page.getByRole('dialog', { name: '담당자 선택' }).getByRole('option', { name: 'Alex Kim' }).click()
  await expect(drawer.getByRole('alert')).toContainText('먼저 수정했습니다')
  await expect(trigger).toBeVisible()
  await expect(drawer.getByLabel('담당자', { exact: true })).toHaveValue('')

  const failures = [
    { status: 403, detail: '편집 권한이 없습니다' },
    { status: 422, detail: 'assignee must not have a read-only role' },
    { status: 500, detail: '담당자 저장 중 서버 오류가 발생했습니다' },
  ]
  let failureIndex = 0
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    const failure = failures[failureIndex]
    failureIndex += 1
    await route.fulfill({ status: failure.status, json: { detail: failure.detail } })
  })

  for (const failure of failures) {
    await trigger.click()
    await page.getByRole('dialog', { name: '담당자 선택' }).getByRole('option', { name: 'Alex Kim' }).click()
    await expect(drawer.getByRole('alert')).toContainText(failure.detail)
    await expect(trigger).toBeVisible()
    await expect(drawer.getByLabel('담당자', { exact: true })).toHaveValue('')
  }
  expect(failureIndex).toBe(failures.length)
})

test('상세 헤더 일정은 outside·Escape와 연속 CAS를 유지하고 Properties에 동기화된다', async ({ page }) => {
  let patchCount = 0
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`)) {
      patchCount += 1
    }
  })
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const propertiesStart = drawer.getByLabel('시작일', { exact: true })
  const propertiesDue = drawer.getByLabel('기한', { exact: true })
  const startTrigger = drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 1.' })
  const subjectBox = await drawer.getByLabel('제목', { exact: false }).first().boundingBox()

  await startTrigger.click()
  const startPicker = page.getByRole('dialog', { name: '시작일 선택' })
  const startInput = startPicker.getByLabel('시작일 입력')
  await expect(startInput).toBeFocused()
  await startInput.fill('2026-07-02')
  expect(subjectBox).not.toBeNull()
  await page.mouse.click(subjectBox!.x + subjectBox!.width / 2, subjectBox!.y + subjectBox!.height / 2)
  await expect(startPicker).toHaveCount(0)
  expect(patchCount).toBe(0)

  await startTrigger.click()
  await expect(page.getByRole('dialog', { name: '시작일 선택' }).getByLabel('시작일 입력')).toHaveValue('2026-07-01')
  await page.keyboard.press('Escape')
  await expect(startTrigger).toBeFocused()

  await startTrigger.click()
  const reopenedStartPicker = page.getByRole('dialog', { name: '시작일 선택' })
  await reopenedStartPicker.getByLabel('시작일 입력').fill('2026-07-02')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-schedule-controls-ui/desktop-start.png',
  })
  const startPatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await reopenedStartPicker.getByRole('button', { name: '적용' }).click()
  expect((await startPatch).postDataJSON()).toEqual({ expected_version: 0, start_date: '2026-07-02' })
  await expect(drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 2.' })).toBeVisible()
  await expect(propertiesStart).toHaveValue('2026-07-02')

  const dueTrigger = drawer.getByRole('button', { name: '기한 변경: 2026. 7. 15.' })
  await dueTrigger.click()
  const duePicker = page.getByRole('dialog', { name: '기한 선택' })
  const duePatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await duePicker.getByLabel('기한 입력').fill('2026-07-20')
  await duePicker.getByLabel('기한 입력').press('Enter')
  expect((await duePatch).postDataJSON()).toEqual({ expected_version: 1, due_date: '2026-07-20' })
  const updatedDueTrigger = drawer.getByRole('button', { name: '기한 변경: 2026. 7. 20.' })
  await expect(updatedDueTrigger).toBeVisible()
  await expect(propertiesDue).toHaveValue('2026-07-20')

  const clearDuePatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await updatedDueTrigger.click()
  const clearDuePicker = page.getByRole('dialog', { name: '기한 선택' })
  await clearDuePicker.getByRole('button', { name: '지우기' }).click()
  await clearDuePicker.getByRole('button', { name: '적용' }).click()
  expect((await clearDuePatch).postDataJSON()).toEqual({ expected_version: 2, due_date: null })
  await expect(drawer.getByRole('button', { name: '기한 변경: 미설정' })).toBeVisible()
  await expect(propertiesDue).toHaveValue('')
})

test('상세 일정은 역전 입력을 표시하되 PATCH하지 않고 Properties도 같은 규칙을 따른다', async ({ page }) => {
  let patchCount = 0
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`)) {
      patchCount += 1
    }
  })
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')

  await drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 1.' }).click()
  const picker = page.getByRole('dialog', { name: '시작일 선택' })
  await picker.getByLabel('시작일 입력').fill('2026-07-20')
  await expect(picker.getByRole('alert')).toContainText('시작일은 기한보다 늦을 수 없습니다')
  await expect(picker.getByRole('button', { name: '적용' })).toBeDisabled()
  await picker.getByLabel('시작일 입력').press('Enter')
  await expect(picker).toBeVisible()
  expect(patchCount).toBe(0)
  await page.keyboard.press('Escape')

  const propertiesStart = drawer.getByLabel('시작일', { exact: true })
  await propertiesStart.fill('2026-07-20')
  await drawer.getByLabel('제목', { exact: false }).first().click()
  await expect(
    drawer.getByRole('complementary', { name: '작업 속성' }).getByRole('alert'),
  ).toContainText('시작일은 기한보다 늦을 수 없습니다')
  await expect(propertiesStart).toHaveValue('2026-07-20')
  expect(patchCount).toBe(0)

  const repairPatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await drawer.getByLabel('기한', { exact: true }).fill('2026-07-25')
  await drawer.getByLabel('제목', { exact: false }).first().click()
  expect((await repairPatch).postDataJSON()).toEqual({
    expected_version: 0,
    start_date: '2026-07-20',
    due_date: '2026-07-25',
  })
  await expect(drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 20.' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '기한 변경: 2026. 7. 25.' })).toBeVisible()
})

test('상세 일정은 legacy 역전 범위를 표시하고 한쪽 날짜 수정으로 복구한다', async ({ page }) => {
  await mockApi(page)
  let current: WorkPackage = { ...wpA, start_date: '2026-07-20', due_date: '2026-07-10' }
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const sent = route.request().postDataJSON() as { expected_version: number; start_date: string }
      current = { ...current, start_date: sent.start_date, version: sent.expected_version + 1 }
      await route.fulfill({ json: current })
      return
    }
    await route.fulfill({ json: current })
  })
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 20.' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '기한 변경: 2026. 7. 10.' })).toBeVisible()

  await drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 20.' }).click()
  const picker = page.getByRole('dialog', { name: '시작일 선택' })
  await picker.getByLabel('시작일 입력').fill('2026-07-05')
  const patch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/work-packages/${wpA.id}`),
  )
  await picker.getByRole('button', { name: '적용' }).click()
  expect((await patch).postDataJSON()).toEqual({ expected_version: 0, start_date: '2026-07-05' })
  await expect(drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 5.' })).toBeVisible()
  await expect(drawer.getByLabel('시작일', { exact: true })).toHaveValue('2026-07-05')
  await expect(drawer.getByLabel('기한', { exact: true })).toHaveValue('2026-07-10')
})

test('상세 헤더 일정은 409·권한·검증·서버 오류에서 서버값과 피드백을 보존한다', async ({ page }) => {
  await mockApi(page, { conflictOnPatch: true })
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const trigger = drawer.getByRole('button', { name: '시작일 변경: 2026. 7. 1.' })

  const changeStart = async () => {
    await trigger.click()
    const picker = page.getByRole('dialog', { name: '시작일 선택' })
    await picker.getByLabel('시작일 입력').fill('2026-07-02')
    await picker.getByRole('button', { name: '적용' }).click()
  }

  await changeStart()
  await expect(drawer.getByRole('alert')).toContainText('먼저 수정했습니다')
  await expect(trigger).toBeVisible()
  await expect(drawer.getByLabel('시작일', { exact: true })).toHaveValue('2026-07-01')

  const failures = [
    { status: 403, detail: '편집 권한이 없습니다' },
    { status: 422, detail: 'start_date must be <= due_date' },
    { status: 500, detail: '일정 저장 중 서버 오류가 발생했습니다' },
  ]
  let failureIndex = 0
  await page.route(`**/api/v1/work-packages/${wpA.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    const failure = failures[failureIndex]
    failureIndex += 1
    await route.fulfill({ status: failure.status, json: { detail: failure.detail } })
  })

  for (const failure of failures) {
    await changeStart()
    await expect(drawer.getByRole('alert')).toContainText(failure.detail)
    await expect(trigger).toBeVisible()
    await expect(drawer.getByLabel('시작일', { exact: true })).toHaveValue('2026-07-01')
  }
  expect(failureIndex).toBe(failures.length)
})

test('담당자 필터가 목록 쿼리에 assignee_id를 반영한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  const listReq = page.waitForRequest(
    (r) => r.url().includes('/work-packages?') && r.url().includes('assignee_id=u-alex'),
  )
  await page.getByLabel('담당자 필터').selectOption({ label: 'Alex Kim' })
  await listReq
})

test('워크플로우 라벨이 보드 외 목록 필터에도 반영된다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 's1', project_id: project.id, key: 'todo', name: '해야 할 일', position: 0 },
          { id: 's2', project_id: project.id, key: 'in_progress', name: '작업 중', position: 1 },
        ],
        total: 2,
      },
    }),
  )
  await page.goto(`/projects/${project.id}/work-packages`)
  // The status filter shows the owner's renamed label, not the built-in default —
  // selectOption by that label would throw if the option didn't exist.
  await page.getByLabel('상태 필터').selectOption({ label: '작업 중' })
  await expect(page.getByLabel('상태 필터')).toHaveValue('in_progress')
})

test('설정에서 자동화 규칙을 보여주고 새 규칙을 추가한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        ],
        total: 1,
      },
    }),
  )
  const rules = [
    {
      id: 'r1',
      project_id: project.id,
      name: '검수 시 긴급',
      trigger_type: 'status_changed_to',
      trigger_value: 'in_review',
      action_type: 'set_priority',
      action_value: 'urgent',
      condition_field: null,
      condition_value: null,
      position: 0,
      is_active: true,
      last_fired_at: '2026-07-06T09:00:00Z',
      fired_count: 3,
      created_at: '2026-07-06T08:00:00Z',
    },
  ]
  await page.route(`**/api/v1/projects/${project.id}/automation-rules`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { id: 'r-new' } })
      return
    }
    await route.fulfill({
      json: {
        items: rules,
        total: rules.length,
      },
    })
  })
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/r1`, async (route) => {
    if (route.request().method() === 'DELETE') {
      rules.splice(0, rules.length)
      await route.fulfill({ status: 204 })
      return
    }
    const sent = route.request().postDataJSON() as {
      name?: string
      trigger_value?: string
      action_value?: string
      is_active?: boolean
    }
    Object.assign(rules[0], sent)
    await route.fulfill({ json: { ...rules[0] } })
  })
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/runs**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'run-1',
            rule_id: 'r1',
            rule_name: '검수 시 긴급',
            work_package_id: wpA.id,
            work_package_subject: '워크패키지 API 구현',
            field: 'priority',
            old_value: 'none',
            new_value: 'urgent',
            actor_id: null,
            created_at: '2026-07-07T09:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/settings`)
  await page.getByRole('tab', { name: '자동화' }).click()
  await expect(page.getByText(/상태가 '검토 중'.*우선순위를 '긴급'/)).toBeVisible()

  // fire-audit surface renders per rule
  await expect(page.getByText('발화 3회', { exact: false })).toBeVisible()

  // action-menu edit sends the changed value through PATCH
  await page.getByLabel('검수 시 긴급 자동화 규칙 작업').click()
  await page.getByLabel('검수 시 긴급 규칙 편집').click()
  const rulePatch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/automation-rules/r1'),
  )
  await page.getByLabel('검수 시 긴급 우선순위 값 편집').selectOption('high')
  await page.getByRole('button', { name: '저장' }).click()
  expect(((await rulePatch).postDataJSON() as { action_value: string }).action_value).toBe('high')

  await page.getByLabel('검수 시 긴급 자동화 규칙 작업').click()
  const toggle = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/automation-rules/r1'),
  )
  await page.getByLabel('검수 시 긴급 규칙 사용 중지').click()
  expect(((await toggle).postDataJSON() as { is_active: boolean }).is_active).toBe(false)

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByLabel('검수 시 긴급 자동화 규칙 작업').click()
  const deleteReq = page.waitForRequest(
    (r) => r.method() === 'DELETE' && r.url().includes('/automation-rules/r1'),
  )
  await page.getByLabel('검수 시 긴급 규칙 삭제').click()
  await deleteReq

  // execution log renders behind the details toggle
  await page.getByText('실행 로그', { exact: false }).click()
  await expect(page.getByText("'워크패키지 API 구현'의 우선순위 none → urgent", { exact: false })).toBeVisible()

  // set_assignee action: switching the kind swaps in the member select and
  // the POST carries the member uuid
  await page.getByLabel('액션 종류').selectOption('set_assignee')
  await page.getByLabel('지정할 담당자').selectOption('me-1')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/automation-rules'),
  )
  await page.getByRole('button', { name: '규칙 추가' }).click()
  const sent = (await post).postDataJSON() as { action_type: string; action_value: string }
  expect(sent.action_type).toBe('set_assignee')
  expect(sent.action_value).toBe('me-1')

  // Type trigger (Pass 41): switching the trigger kind swaps the value
  // vocabulary and the POST carries the new trigger pair.
  await page.getByLabel('트리거 종류').selectOption('type_changed_to')
  await page.getByLabel('트리거 값').selectOption('bug')
  await page.getByLabel('액션 종류').selectOption('set_priority')
  const typePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/automation-rules'),
  )
  await page.getByRole('button', { name: '규칙 추가' }).click()
  const typeSent = (await typePost).postDataJSON() as {
    trigger_type: string
    trigger_value: string
  }
  expect(typeSent.trigger_type).toBe('type_changed_to')
  expect(typeSent.trigger_value).toBe('bug')
})

test('자동화 AND 보조 조건: 요약을 표시하고 조건을 담아 POST한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { id: 'r-new' } })
      return
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: 'r1',
            project_id: project.id,
            name: '검수+버그 시 긴급',
            trigger_type: 'status_changed_to',
            trigger_value: 'in_review',
            action_type: 'set_priority',
            action_value: 'urgent',
            condition_field: 'type',
            condition_value: 'bug',
            is_active: true,
            last_fired_at: null,
            fired_count: 0,
          },
        ],
        total: 1,
      },
    })
  })
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/runs**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/settings`)
  await page.getByRole('tab', { name: '자동화' }).click()
  // The conditional rule summary shows the AND clause.
  await expect(page.getByText(/그리고 타입이\(가\) '버그'일 때/)).toBeVisible()

  // Setting a secondary condition carries it into the POST.
  await page.getByLabel('보조 조건 필드').selectOption('type')
  await page.getByLabel('보조 조건 값').selectOption('bug')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/automation-rules'),
  )
  await page.getByRole('button', { name: '규칙 추가' }).click()
  const sent = (await post).postDataJSON() as {
    condition_field: string | null
    condition_value: string | null
  }
  expect(sent.condition_field).toBe('type')
  expect(sent.condition_value).toBe('bug')

  // Regression: '조건 없음' sends null condition (legacy unconditional rule).
  await page.getByLabel('보조 조건 필드').selectOption('')
  const plain = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/automation-rules'),
  )
  await page.getByRole('button', { name: '규칙 추가' }).click()
  const plainSent = (await plain).postDataJSON() as { condition_field: string | null }
  expect(plainSent.condition_field).toBeNull()
})

test('자동화 규칙 우선순위: 아래로 이동하면 순서를 담아 PUT한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
        ],
        total: 1,
      },
    }),
  )
  const rule = (id: string, name: string, action: string, position: number) => ({
    id,
    project_id: project.id,
    name,
    trigger_type: 'status_changed_to',
    trigger_value: 'in_review',
    action_type: 'set_priority',
    action_value: action,
    condition_field: null,
    condition_value: null,
    position,
    is_active: true,
    last_fired_at: null,
    fired_count: 0,
  })
  await page.route(`**/api/v1/projects/${project.id}/automation-rules`, (route) => {
    route.fulfill({
      json: { items: [rule('r1', '긴급 규칙', 'urgent', 0), rule('r2', '낮음 규칙', 'low', 1)], total: 2 },
    })
  })
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/order`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/runs**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/settings`)
  await page.getByRole('tab', { name: '자동화' }).click()
  // The topmost rule (r1) renders first; the priority hint is shown.
  await expect(page.getByText(/위에 있는 규칙이 먼저 적용됩니다/)).toBeVisible()

  // Moving the top rule down sends the full reordered id list.
  const put = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/automation-rules/order'),
  )
  await page.getByLabel('긴급 규칙 자동화 규칙 작업').click()
  await page.getByLabel('긴급 규칙 아래로').click()
  const sent = (await put).postDataJSON() as { ordered_ids: string[] }
  expect(sent.ordered_ids).toEqual(['r2', 'r1'])
})

test('프로젝트 governance 표면은 모바일에서 워크플로우와 자동화를 안정적으로 보여준다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const statuses = [
    { id: 'ps-1', project_id: project.id, key: 'todo', name: '할 일', position: 0 },
    { id: 'ps-2', project_id: project.id, key: 'in_review', name: '검토 중', position: 1 },
    { id: 'ps-3', project_id: project.id, key: 'done', name: '완료', position: 2 },
  ]
  const types = [
    { id: 'pt-1', project_id: project.id, key: 'task', name: '작업', position: 0, is_active: true },
    { id: 'pt-2', project_id: project.id, key: 'bug', name: '버그', position: 1, is_active: true },
    {
      id: 'pt-3',
      project_id: project.id,
      key: 'feature',
      name: '기능',
      position: 2,
      is_active: false,
    },
  ]
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({ json: { items: statuses, total: statuses.length } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/types`, (route) =>
    route.fulfill({ json: { items: types, total: types.length } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'r1',
            project_id: project.id,
            name: '검수 시 긴급',
            trigger_type: 'status_changed_to',
            trigger_value: 'in_review',
            action_type: 'set_priority',
            action_value: 'urgent',
            condition_field: 'type',
            condition_value: 'bug',
            position: 0,
            is_active: true,
            last_fired_at: '2026-07-06T09:00:00Z',
            fired_count: 3,
            created_at: '2026-07-06T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/runs**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=workflow`)
  const workflowGovernance = page.getByRole('region', { name: '워크플로우 거버넌스' })
  await expect(workflowGovernance).toBeVisible()
  await expect(
    page.getByRole('region', { name: '워크플로우 상태' }).getByText('검토 중', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('in_review 상태 작업')).toBeVisible()
  await expect(page.getByRole('region', { name: '워크 아이템 타입' })).toContainText('2/3 활성')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/governance-ui/mobile-workflow.png',
    fullPage: true,
  })

  await page.getByRole('tab', { name: '자동화' }).click()
  await expect(page.getByRole('region', { name: '자동화 규칙' })).toContainText('검수 시 긴급')
  await expect(page.getByText(/그리고 타입이\(가\) '버그'일 때/)).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/governance-ui/mobile-automation.png',
    fullPage: true,
  })
})

test('모바일 자동화 규칙 액션 메뉴는 읽기 전용 상태를 안전하게 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 })
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: projects }))
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/statuses`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'r1',
            project_id: project.id,
            name: '검수 시 긴급',
            trigger_type: 'status_changed_to',
            trigger_value: 'in_review',
            action_type: 'set_priority',
            action_value: 'urgent',
            condition_field: null,
            condition_value: null,
            position: 0,
            is_active: true,
            last_fired_at: null,
            fired_count: 0,
            created_at: '2026-07-06T08:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/runs**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=automation`)
  await page.getByLabel('검수 시 긴급 자동화 규칙 작업').click()
  const menu = page.getByRole('menu', { name: '검수 시 긴급 자동화 규칙 작업 메뉴' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('읽기 전용')).toBeVisible()
  await expect(menu.getByLabel('검수 시 긴급 규칙 편집')).toBeHidden()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/automation-rule-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('AI 요약 플래그가 켜지면 드로어에서 요약을 생성한다', async ({ page }) => {
  await mockApi(page)
  // flag ON (registered after mockApi → precedence over the default OFF)
  await page.route('**/api/v1/capabilities', (route) =>
    route.fulfill({ json: { ai_summary_enabled: true } }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/summary`, (route) =>
    route.fulfill({
      json: {
        work_package_id: wpA.id,
        summary: "'워크패키지 API 구현'은(는) 유형 '작업', 상태 '할 일'인 작업입니다.",
        provider: 'local-extractive',
      },
    }),
  )
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('AI 요약')).toBeVisible()

  await drawer.getByRole('button', { name: '요약 생성' }).click()
  await expect(drawer.getByText(/유형 '작업', 상태 '할 일'/)).toBeVisible()
})

test('드로어 설명이 리치 텍스트 에디터(툴바 포함)로 표시된다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  // lazy-loaded Tiptap editor: toolbar button + editable region
  await expect(drawer.getByRole('button', { name: '굵게' })).toBeVisible()
  await expect(drawer.getByLabel('설명')).toBeVisible()
})

test('표시 메뉴에서 제목순 정렬을 선택하면 목록 쿼리에 sort=subject를 반영한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  const req = page.waitForRequest(
    (r) => r.url().includes('/work-packages') && r.url().includes('sort=subject'),
  )
  await page.getByRole('button', { name: '표시' }).click()
  await page.getByRole('menuitem', { name: '정렬 제목순 (가나다)' }).click()
  await req
  await expect(page).toHaveURL(/sort=subject/)
})

const asViewer = (page: import('@playwright/test').Page) =>
  Promise.all([
    page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
      route.fulfill({
        json: {
          items: [
            { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
          ],
          total: 1,
        },
      }),
    ),
    page.route(`**/api/v1/projects/${project.id}`, (route) => route.fulfill({ json: project })),
  ])

test('뷰어 문서 에디터는 제목·본문이 읽기 전용이고 저장·삭제·코멘트가 없다', async ({ page }) => {
  await mockApi(page)
  await asViewer(page)
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '팀 위키',
    author_id: null,
    version: 2,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) =>
    route.fulfill({
      json: {
        ...doc,
        body: '<p><span data-comment-anchor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">변경된 문구</span></p>',
      },
    }),
  )
  await page.route('**/api/v1/documents/d1/comments', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'viewer-thread',
            document_id: 'd1',
            project_id: project.id,
            author_id: 'me-1',
            body: '원래 문구에 남긴 메모',
            anchor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            anchor_quote: '원래 문구',
            reactions: [{ key: '👍', count: 2, me: false }],
            created_at: '2026-07-03T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/documents/d1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/documents/d1`)
  await expect(page.getByLabel('문서 제목')).toHaveValue('팀 위키')
  await expect(page.getByText('읽기 전용입니다', { exact: false })).toBeVisible()
  await expect(page.getByLabel('문서 제목')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
  await expect(page.getByLabel('문서 삭제')).toHaveCount(0)
  await expect(page.getByLabel('새 코멘트')).toHaveCount(0)
  await expect(page.getByText('본문 변경됨')).toBeVisible()
  await expect(page.locator('.of-document-comment-anchor')).toHaveCount(0)
  await expect(page.getByLabel('👍 리액션 2개')).toBeVisible()
  await expect(page.getByRole('button', { name: '👍 리액션' })).toHaveCount(0)
})

test('뷰어 회의 상세는 저장·후속·삭제가 없고 안건이 비편집이다', async ({ page }) => {
  await mockApi(page)
  await asViewer(page)
  const meeting = {
    id: 'm1',
    project_id: project.id,
    title: '스프린트 회의',
    scheduled_on: '2026-07-10',
    agenda: '<p>안건 내용</p>',
    minutes: null,
    author_id: null,
    recurrence: null,
    recurrence_source_id: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    action_items: [],
  }
  await page.route(`**/api/v1/projects/${project.id}/meetings`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'm1',
            project_id: project.id,
            title: '스프린트 회의',
            scheduled_on: '2026-07-10',
            recurrence: null,
            version: 1,
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/meetings/m1', (route) => route.fulfill({ json: meeting }))

  await page.goto(`/projects/${project.id}/meetings/m1`)
  await expect(page.getByLabel('회의 제목')).toHaveValue('스프린트 회의')
  await expect(page.getByText('읽기 전용입니다', { exact: false })).toBeVisible()
  await expect(page.getByLabel('회의 제목')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '후속 회의 만들기' })).toHaveCount(0)
  await expect(page.getByLabel('회의 삭제')).toHaveCount(0)
  await expect(page.getByLabel('새 액션 아이템')).toHaveCount(0)
})

test('뷰어 인테이크는 제출 폼 대신 읽기 전용 안내를 본다', async ({ page }) => {
  await mockApi(page)
  await asViewer(page)
  await page.route(`**/api/v1/projects/${project.id}/intake`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  let submitPosts = 0
  await page.route(`**/api/v1/projects/${project.id}/intake`, (route) => {
    if (route.request().method() === 'POST') submitPosts += 1
    return route.fulfill({ json: { items: [], total: 0 } })
  })

  await page.goto(`/projects/${project.id}/intake`)
  await expect(page.getByText('읽기 전용입니다', { exact: false })).toBeVisible()
  await expect(page.getByLabel('인테이크 요청 제목')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '요청 제출' })).toHaveCount(0)
  expect(submitPosts).toBe(0)
})

test('문서 목록에서 문서를 열면 편집기가 제목과 본문을 보여준다', async ({ page }) => {
  await mockApi(page)
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '팀 위키',
    author_id: null,
    version: 2,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) =>
    route.fulfill({ json: { ...doc, body: '<p>온보딩 가이드</p>' } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) => {
    const url = new URL(route.request().url())
    const anchored = url.searchParams.get('document_id') === 'd1'
    return route.fulfill({
      json: anchored
        ? {
            items: [
              {
                id: 'att-doc-1',
                project_id: project.id,
                work_package_id: null,
                document_id: 'd1',
                filename: '회의록.docx',
                content_type: null,
                size_bytes: null,
                url: 'https://example.com/회의록.docx',
                has_file: false,
                uploaded_by: null,
                created_at: '2026-07-01T00:00:00Z',
              },
            ],
            total: 1,
          }
        : { items: [], total: 0 },
    })
  })

  // Comments (Pass 43): one existing note by a former member; POST echoes.
  await page.route('**/api/v1/documents/d1/comments', async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { body: string }
      await route.fulfill({
        status: 201,
        json: {
          id: 'dc2',
          document_id: 'd1',
          project_id: project.id,
          author_id: 'me-1',
          body: sent.body,
          anchor_id: null,
          anchor_quote: null,
          created_at: '2026-07-08T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: 'dc1',
            document_id: 'd1',
            project_id: project.id,
            author_id: 'u-gone',
            body: '<b>plain</b> 텍스트로 보여야 함',
            anchor_id: null,
            anchor_quote: null,
            created_at: '2026-07-07T00:00:00Z',
          },
        ],
        total: 1,
      },
    })
  })

  await page.goto(`/projects/${project.id}/documents`)
  const row = page.getByRole('button', { name: /팀 위키/ })
  await expect(row).toBeVisible()
  await row.click()

  // editor page: title input prefilled, lazy Tiptap body editor visible
  await expect(page.getByLabel('문서 제목')).toHaveValue('팀 위키')
  await expect(page.getByLabel('문서 본문')).toBeVisible()

  // document-anchored attachment renders in the editor
  await expect(page.getByText('회의록.docx')).toBeVisible()
  await expect(page.getByLabel('회의록.docx 열기')).toBeVisible()

  // comments: plain text renders as TEXT (tags visible, not parsed), former
  // member label, and POST carries the raw body
  await expect(page.getByText('코멘트 1건')).toBeVisible()
  await expect(page.getByText('<b>plain</b> 텍스트로 보여야 함')).toBeVisible()
  await expect(page.getByText('이전 구성원')).toBeVisible()
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/documents/d1/comments'),
  )
  await page.getByLabel('새 코멘트').fill('여백 메모')
  await page.getByRole('button', { name: '등록' }).click()
  expect(((await post).postDataJSON() as { body: string }).body).toBe('여백 메모')
})

test('문서 선택 텍스트에 인라인 코멘트를 만들고 본문과 스레드를 오간다', async ({ page }) => {
  await mockApi(page)
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '인라인 검토 문서',
    body: '<p>온보딩 가이드 문서입니다.</p>',
    author_id: 'me-1',
    visibility: 'shared',
    archived_at: null,
    archived_by_user_id: null,
    archived_by_name: null,
    version: 2,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) => route.fulfill({ json: doc }))
  await page.route('**/api/v1/documents/d1/comments', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/d1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  const inlineRequests: Array<Record<string, unknown>> = []
  await page.route('**/api/v1/documents/d1/inline-comments', async (route) => {
    const sent = route.request().postDataJSON() as {
      body: string
      mentioned_user_ids?: string[]
      anchor_id: string
      anchor_quote: string
      expected_document_version?: number
      document_body?: string
    }
    inlineRequests.push(sent)
    if (sent.document_body) {
      doc.body = sent.document_body
      doc.version += 1
    }
    await route.fulfill({
      status: 201,
      json: {
        comment: {
          id: `inline-${inlineRequests.length}`,
          document_id: 'd1',
          project_id: project.id,
          author_id: 'me-1',
          body: sent.body,
          mentions: sent.mentioned_user_ids ?? null,
          anchor_id: sent.anchor_id,
          anchor_quote: sent.anchor_quote,
          reactions: [],
          created_at: `2026-07-0${inlineRequests.length + 3}T00:00:00Z`,
        },
        document: doc,
      },
    })
  })

  await page.goto(`/projects/${project.id}/documents/d1`)
  const editor = page.getByLabel('문서 본문')
  await expect(editor).toBeVisible()
  await editor.evaluate((element) => {
    const text = element.querySelector('p')?.firstChild
    if (!text) throw new Error('text node missing')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 4)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  })

  const addInline = page.getByRole('button', { name: '선택 영역에 코멘트' })
  await expect(addInline).toBeEnabled()
  await addInline.click()
  await expect(page.getByRole('region', { name: '선택 영역 코멘트 작성' })).toBeVisible()
  await page.getByRole('textbox', { name: '인라인 코멘트', exact: true }).fill(
    '용어를 더 구체적으로 써 주세요.',
  )
  await page.getByLabel('Alex Kim 인라인 멘션').check()
  await page.getByRole('button', { name: '코멘트', exact: true }).click()

  expect(inlineRequests[0]?.anchor_quote).toBe('온보딩')
  expect(inlineRequests[0]?.mentioned_user_ids).toEqual(['u-alex'])
  expect(inlineRequests[0]?.expected_document_version).toBe(2)
  expect(String(inlineRequests[0]?.document_body)).toContain('data-comment-anchor=')
  const bodyAnchor = page.locator('[data-comment-anchor]').filter({ hasText: '온보딩' })
  await expect(bodyAnchor).toHaveClass(/of-document-comment-anchor-active/)
  await expect(page.getByText('용어를 더 구체적으로 써 주세요.')).toBeVisible()

  await page.getByRole('button', { name: '답글 남기기' }).click()
  await page.getByLabel('인라인 답글').fill('수정 후 다시 확인하겠습니다.')
  const replyMention = page
    .getByRole('group', { name: '인라인 답글에서 멘션할 멤버' })
    .getByLabel('Alex Kim 문서 멘션')
  await replyMention.check()
  await expect(replyMention).toBeChecked()
  await page.getByRole('button', { name: '답글', exact: true }).click()
  expect(inlineRequests[1]).toMatchObject({
    body: '수정 후 다시 확인하겠습니다.',
    mentioned_user_ids: ['u-alex'],
  })
  expect(inlineRequests[1]?.document_body).toBeUndefined()
  expect(inlineRequests[1]?.expected_document_version).toBeUndefined()
  await expect(page.getByText('수정 후 다시 확인하겠습니다.')).toBeVisible()

  await bodyAnchor.click()
  const thread = page.locator(`[id^="document-comment-thread-"]`).first()
  await expect(thread).toHaveClass(/border-of-focus/)
  await thread.getByRole('button', { name: /온보딩/ }).click()
  await expect(bodyAnchor).toHaveClass(/of-document-comment-anchor-active/)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-inline-comments-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(mobileOverflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-inline-comments-ui/mobile.png',
    fullPage: true,
  })
})

test('인라인 코멘트 stale 충돌은 임시 앵커를 되돌리고 모바일에서 넘치지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '모바일 검토 문서',
    body: '<p>선택 문구를 검토합니다.</p>',
    author_id: 'me-1',
    visibility: 'shared',
    archived_at: null,
    archived_by_user_id: null,
    archived_by_name: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) => route.fulfill({ json: doc }))
  await page.route('**/api/v1/documents/d1/comments', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/d1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  let inlineAttempts = 0
  let retryVersion: number | undefined
  await page.route('**/api/v1/documents/d1/inline-comments', async (route) => {
    inlineAttempts += 1
    const sent = route.request().postDataJSON() as {
      body: string
      anchor_id: string
      anchor_quote: string
      expected_document_version: number
      document_body: string
    }
    if (inlineAttempts === 1) {
      await route.fulfill({
        status: 409,
        json: { detail: 'version conflict', current: { ...doc, version: 2 } },
      })
      return
    }
    retryVersion = sent.expected_document_version
    doc.body = sent.document_body
    doc.version = 3
    await route.fulfill({
      status: 201,
      json: {
        comment: {
          id: 'retry-comment',
          document_id: 'd1',
          project_id: project.id,
          author_id: 'me-1',
          body: sent.body,
          anchor_id: sent.anchor_id,
          anchor_quote: sent.anchor_quote,
          created_at: '2026-07-06T00:00:00Z',
        },
        document: doc,
      },
    })
  })

  await page.goto(`/projects/${project.id}/documents/d1`)
  const editor = page.getByLabel('문서 본문')
  await editor.evaluate((element) => {
    const text = element.querySelector('p')?.firstChild
    if (!text) throw new Error('text node missing')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 5)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  })
  await page.getByRole('button', { name: '선택 영역에 코멘트' }).click()
  await page.getByRole('textbox', { name: '인라인 코멘트', exact: true }).fill('충돌 확인')
  await page.getByRole('button', { name: '코멘트', exact: true }).click()

  await expect(page.getByText('인라인 코멘트를 저장하지 못했습니다', { exact: false })).toBeVisible()
  await expect(page.locator('[data-comment-anchor]')).toHaveCount(0)
  await page.getByRole('button', { name: '코멘트', exact: true }).click()
  await expect(page.locator('[data-comment-anchor]')).toHaveCount(1)
  expect(retryVersion).toBe(2)
  await expect(page.getByText('충돌 확인', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('문서 인라인·일반 코멘트 리액션은 quick/custom toggle과 읽기 상태를 반영한다', async ({
  page,
}) => {
  await mockApi(page)
  const anchorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '리액션 검토 문서',
    body: `<p><span data-comment-anchor="${anchorId}">검토 문구</span>입니다.</p>`,
    author_id: 'me-1',
    visibility: 'shared',
    archived_at: null,
    archived_by_user_id: null,
    archived_by_name: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  const comments = [
    {
      id: 'inline-reaction',
      document_id: 'd1',
      project_id: project.id,
      author_id: 'me-1',
      body: '인라인 검토',
      anchor_id: anchorId,
      anchor_quote: '검토 문구',
      reactions: [{ key: '👍', count: 2, me: false }],
      created_at: '2026-07-03T00:00:00Z',
    },
    {
      id: 'general-reaction',
      document_id: 'd1',
      project_id: project.id,
      author_id: 'me-1',
      body: '일반 검토',
      anchor_id: null,
      anchor_quote: null,
      reactions: [],
      created_at: '2026-07-04T00:00:00Z',
    },
  ]
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) => route.fulfill({ json: doc }))
  await page.route('**/api/v1/documents/d1/comments', (route) =>
    route.fulfill({ json: { items: comments, total: comments.length } }),
  )
  await page.route('**/api/v1/documents/d1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  const reactionRequests: Array<{ method: string; commentId: string; emoji: string }> = []
  let failNextReaction = false
  const reactionsByComment = new Map(
    comments.map((comment) => [comment.id, [...comment.reactions]]),
  )
  await page.route('**/api/v1/document-comments/*/reactions/*', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const commentId = parts.at(-3) ?? ''
    const emoji = decodeURIComponent(parts.at(-1) ?? '')
    const method = route.request().method()
    reactionRequests.push({ method, commentId, emoji })
    if (failNextReaction) {
      failNextReaction = false
      await route.fulfill({ status: 500, json: { detail: 'temporary failure' } })
      return
    }
    const current = reactionsByComment.get(commentId) ?? []
    const existing = current.find((reaction) => reaction.key === emoji)
    let next = current
    if (method === 'PUT') {
      next = existing
        ? current.map((reaction) =>
            reaction.key === emoji
              ? {
                  ...reaction,
                  count: reaction.me ? reaction.count : reaction.count + 1,
                  me: true,
                }
              : reaction,
          )
        : [...current, { key: emoji, count: 1, me: true }]
    } else if (existing?.me) {
      next = current
        .map((reaction) =>
          reaction.key === emoji
            ? { ...reaction, count: reaction.count - 1, me: false }
            : reaction,
        )
        .filter((reaction) => reaction.count > 0)
    }
    reactionsByComment.set(commentId, next)
    await route.fulfill({ json: { items: next } })
  })

  await page.goto(`/projects/${project.id}/documents/d1`)
  const inlineThread = page.locator(`[id="document-comment-thread-${anchorId}"]`)
  const inlineUp = inlineThread.getByRole('button', { name: '👍 리액션' })
  await expect(inlineUp).toContainText('2')
  await inlineUp.click()
  await expect(inlineUp).toHaveAttribute('aria-pressed', 'true')
  await expect(inlineUp).toContainText('3')
  expect(reactionRequests.at(-1)).toEqual({
    method: 'PUT',
    commentId: 'inline-reaction',
    emoji: '👍',
  })

  const generalComment = page.locator('li').filter({ hasText: '일반 검토' })
  await generalComment.getByRole('button', { name: '이모지 추가' }).click()
  await generalComment.getByLabel('자유 이모지 입력').fill('✨')
  await generalComment.getByRole('button', { name: '이모지 등록' }).click()
  const sparkle = generalComment.getByRole('button', { name: '✨ 리액션' })
  await expect(sparkle).toHaveAttribute('aria-pressed', 'true')
  await expect(sparkle).toContainText('1')
  await sparkle.click()
  await expect(generalComment.getByRole('button', { name: '✨ 리액션' })).toHaveCount(0)
  expect(reactionRequests.slice(-2)).toEqual([
    { method: 'PUT', commentId: 'general-reaction', emoji: '✨' },
    { method: 'DELETE', commentId: 'general-reaction', emoji: '✨' },
  ])

  failNextReaction = true
  await generalComment.getByRole('button', { name: '🎉 리액션' }).click()
  await expect(page.getByText('리액션을 저장하지 못했습니다', { exact: false })).toBeVisible()

  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-comment-reactions-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-comment-reactions-ui/mobile.png',
    fullPage: true,
  })
})

test('문서 코멘트 멘션은 member picker와 Document Inbox deep link를 연결한다', async ({
  page,
}) => {
  await mockApi(page)
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '멘션 검토 문서',
    body: '<p>제품 결정 기록입니다.</p>',
    author_id: 'me-1',
    visibility: 'shared',
    archived_at: null,
    archived_by_user_id: null,
    archived_by_name: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  const comments: Array<Record<string, unknown>> = []
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) => route.fulfill({ json: doc }))
  await page.route('**/api/v1/documents/d1/comments', async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as {
        body: string
        mentioned_user_ids: string[]
      }
      const created = {
        id: 'document-mention-comment',
        document_id: 'd1',
        project_id: project.id,
        author_id: 'me-1',
        body: sent.body,
        mentions: sent.mentioned_user_ids,
        anchor_id: null,
        anchor_quote: null,
        reactions: [],
        created_at: '2026-07-16T00:00:00Z',
      }
      comments.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }
    await route.fulfill({ json: { items: comments, total: comments.length } })
  })
  await page.route('**/api/v1/documents/d1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/documents/d1`)
  await page.getByLabel('새 코멘트').fill('Alex님 검토 부탁드립니다.')
  await page.getByLabel('Alex Kim 문서 멘션').check()
  const post = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/documents/d1/comments'),
  )
  await page.getByRole('button', { name: '등록' }).click()
  expect((await post).postDataJSON()).toEqual({
    body: 'Alex님 검토 부탁드립니다.',
    mentioned_user_ids: ['u-alex'],
  })
  await expect(page.getByText('@Alex Kim')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-mentions-ui/desktop.png',
    fullPage: true,
  })

  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'document-notification',
            kind: 'document_mention',
            project_id: project.id,
            initiative_id: null,
            document_id: 'd1',
            work_package_id: null,
            intake_item_id: null,
            work_package_subject: null,
            initiative_name: null,
            document_title: '멘션 검토 문서',
            actor_name: 'Alex Kim',
            read: false,
            created_at: '2026-07-16T00:00:00Z',
          },
        ],
        total: 1,
        unread: 1,
      },
    }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/inbox')
  const notification = page.getByText(
    "Alex Kim님이 '멘션 검토 문서' 문서 코멘트에서 회원님을 멘션했습니다.",
  )
  await expect(notification).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-mentions-ui/mobile.png',
    fullPage: true,
  })
  await notification.click()
  await expect(page).toHaveURL(`/projects/${project.id}/documents/d1`)
})

test('문서 편집기에서 이미지를 업로드하면 본문에 img가 삽입되어 저장된다', async ({ page }) => {
  await mockApi(page)
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '이미지 문서',
    author_id: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1/comments', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/d1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/d1', async (route) => {
    if (route.request().method() === 'PATCH') {
      const sent = route.request().postDataJSON() as { body?: string }
      await route.fulfill({ json: { ...doc, version: 2, body: sent.body ?? null } })
      return
    }
    await route.fulfill({ json: { ...doc, body: '<p>본문</p>' } })
  })
  await page.route(
    `**/api/v1/projects/${project.id}/attachments/upload**`,
    (route) =>
      route.fulfill({
        status: 201,
        json: {
          id: 'att-img-1',
          project_id: project.id,
          work_package_id: null,
          document_id: 'd1',
          filename: 'shot.png',
          content_type: 'image/png',
          size_bytes: 3,
          url: 'oneflow://attachments/att-img-1',
          has_file: true,
          uploaded_by: 'me-1',
          created_at: '2026-07-01T00:00:00Z',
        },
      }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments?**`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/documents/d1`)
  await expect(page.getByLabel('문서 본문')).toBeVisible()

  const uploadPost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/attachments/upload'),
  )
  await page.getByLabel('이미지 파일 선택').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78]),
  })
  const req = await uploadPost
  expect(req.url()).toContain('document_id=d1')

  // The editor now holds the img node with the canonical download URL.
  await expect(
    page.getByLabel('문서 본문').locator('img[src="/api/v1/attachments/att-img-1/download"]'),
  ).toBeVisible()

  // Saving sends the body containing the img tag.
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/documents/d1'),
  )
  await page.getByRole('button', { name: '저장' }).click()
  const sent = (await patch).postDataJSON() as { body: string }
  expect(sent.body).toContain('/api/v1/attachments/att-img-1/download')
})

test('문서 트리가 계층을 들여쓰기로 보여주고 상위 페이지 변경을 저장한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const base = {
    project_id: project.id,
    author_id: null,
    version: 0,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  const root = { ...base, id: 'd1', parent_id: null, title: '가이드' }
  const child = { ...base, id: 'd2', parent_id: 'd1', title: '설치 방법' }
  const loose = { ...base, id: 'd3', parent_id: null, title: '회의록' }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [root, child, loose], total: 3 } }),
  )
  await page.route('**/api/v1/documents/d3', async (route) => {
    if (route.request().method() === 'PATCH') {
      const sent = route.request().postDataJSON() as { parent_id: string | null }
      await route.fulfill({ json: { ...loose, parent_id: sent.parent_id, body: null, version: 1 } })
      return
    }
    await route.fulfill({ json: { ...loose, body: null } })
  })

  await page.goto(`/projects/${project.id}/documents`)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Wiki' })).toBeVisible()
  await expect(page.getByLabel('문서 요약').getByText('전체 문서')).toBeVisible()
  await expect(page.getByLabel('문서 요약').getByText('하위 문서')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/documents-ui/mobile-list.png',
    fullPage: true,
  })
  await expect(page.getByRole('button', { name: /설치 방법/ })).toBeVisible()

  // collapsing the root hides its child ('접기' toggle exists only on branches)
  await page.getByRole('button', { name: '접기' }).click()
  await expect(page.getByRole('button', { name: /설치 방법/ })).toBeHidden()
  await page.getByRole('button', { name: '펼치기' }).click()
  await expect(page.getByRole('button', { name: /설치 방법/ })).toBeVisible()

  // editor: parent select excludes the doc itself and saves parent_id
  await page.getByRole('button', { name: /회의록/ }).click()
  await expect(page.getByText('Document detail')).toBeVisible()
  await expect(page.getByLabel('문서 속성')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/documents-ui/mobile-detail.png',
    fullPage: true,
  })
  const parentSelect = page.getByLabel('상위 페이지')
  await expect(parentSelect).toBeVisible()
  await expect(parentSelect.locator('option', { hasText: '회의록' })).toHaveCount(0)
  await parentSelect.selectOption('d1')

  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/documents/d3'),
  )
  await page.getByRole('button', { name: '저장' }).click()
  expect(((await patch).postDataJSON() as { parent_id: string }).parent_id).toBe('d1')
})

test('문서 상세 활동 탭은 실제 변경 이력과 재시도·페이지네이션을 연결한다', async ({
  page,
}) => {
  await mockApi(page)
  const doc = {
    id: 'activity-doc-1',
    project_id: project.id,
    parent_id: null,
    title: '운영 가이드',
    body: '<p>운영 절차를 정리합니다.</p>',
    author_id: 'me-1',
    visibility: 'shared' as const,
    archived_at: null,
    archived_by_user_id: null,
    archived_by_name: null,
    version: 3,
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T03:00:00Z',
  }
  const activityItems = Array.from({ length: 11 }, (_, index) => ({
    id: `document-activity-${index}`,
    actor_id: index === 10 ? null : 'me-1',
    actor_name: index === 10 ? null : 'Dev User',
    kind:
      index === 0
        ? 'document_restored'
        : index === 1
          ? 'document_archived'
          : index === 10
            ? 'document_created'
            : 'document_updated',
    changed_fields:
      index === 0 || index === 1
        ? ['archive_state']
        : index === 10
          ? ['title', 'visibility']
          : ['body', 'title'],
    created_at: `2026-07-18T${String(12 - index).padStart(2, '0')}:00:00Z`,
  }))
  let firstPageAttempts = 0
  let nextPageAttempts = 0

  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/activity-doc-1/comments', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/activity-doc-1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/activity-doc-1/activities**', async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
    if (offset === 0) {
      firstPageAttempts += 1
      await new Promise((resolve) => setTimeout(resolve, 600))
      if (firstPageAttempts === 1) {
        await route.fulfill({ status: 500, json: { detail: 'temporary failure' } })
        return
      }
      await route.fulfill({ json: { items: activityItems.slice(0, 10), total: 11 } })
      return
    }
    nextPageAttempts += 1
    if (nextPageAttempts === 1) {
      await route.fulfill({ status: 500, json: { detail: 'temporary failure' } })
      return
    }
    await route.fulfill({ json: { items: activityItems.slice(10), total: 11 } })
  })
  await page.route('**/api/v1/documents/activity-doc-1', (route) =>
    route.fulfill({ json: doc }),
  )

  await page.goto(`/projects/${project.id}/documents/activity-doc-1`)
  await page.getByRole('tab', { name: '활동' }).click()
  await expect(page.getByRole('status', { name: '문서 활동 불러오는 중' })).toBeVisible()
  await expect(page.getByRole('alert').getByText('활동을 불러오지 못했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '재시도' }).click()

  await expect(page.getByRole('heading', { name: '활동' })).toBeVisible()
  await expect(page.getByText('11건')).toBeVisible()
  await expect(page.getByText('문서를 복원했습니다.')).toBeVisible()
  await expect(page.getByLabel('변경 필드').first().getByText('보관 상태')).toBeVisible()

  await page.getByRole('button', { name: '활동 더 보기' }).click()
  await expect(page.getByText('다음 활동을 불러오지 못했습니다.')).toBeVisible()
  await page.getByRole('button', { name: '재시도' }).click()
  await expect(page.getByText('문서를 만들었습니다.')).toBeVisible()
  await expect(page.getByText('이전 구성원')).toBeVisible()

  await page.getByRole('tablist', { name: '문서 상세 보기' }).evaluate((element) => {
    element.scrollIntoView({ block: 'center' })
  })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-activity-tabs-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tablist', { name: '문서 상세 보기' }).evaluate((element) => {
    element.scrollIntoView({ block: 'center' })
  })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/document-activity-tabs-ui/mobile.png',
    fullPage: true,
  })

  await page.getByRole('tab', { name: '댓글' }).click()
  await expect(page.getByRole('heading', { name: '코멘트 0건' })).toBeVisible()
})

test('Wiki lifecycle은 비공개 생성과 보관·복원을 모바일에서 연결한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  let doc = {
    id: 'life-1',
    project_id: project.id,
    parent_id: null,
    title: '개인 초안',
    body: null,
    author_id: 'me-1',
    visibility: 'private' as const,
    archived_at: null as string | null,
    archived_by_user_id: null as string | null,
    archived_by_name: null as string | null,
    version: 0,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
  }
  let created = false
  await page.route(`**/api/v1/projects/${project.id}/documents**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      created = true
      await route.fulfill({ status: 201, json: doc })
      return
    }
    const bucket = url.searchParams.get('bucket') ?? 'shared'
    const visible =
      (bucket === 'private' && created && doc.archived_at === null) ||
      (bucket === 'archived' && doc.archived_at !== null)
    await route.fulfill({ json: { items: visible ? [doc] : [], total: visible ? 1 : 0 } })
  })
  await page.route('**/api/v1/documents/life-1', (route) => route.fulfill({ json: doc }))
  await page.route('**/api/v1/documents/life-1/comments', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/life-1/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/life-1/archive', async (route) => {
    doc = {
      ...doc,
      archived_at: '2026-07-11T01:00:00Z',
      archived_by_user_id: 'me-1',
      archived_by_name: 'Dev User',
      version: 1,
    }
    await route.fulfill({ json: doc })
  })
  await page.route('**/api/v1/documents/life-1/restore', async (route) => {
    doc = {
      ...doc,
      archived_at: null,
      archived_by_user_id: null,
      archived_by_name: null,
      version: 2,
    }
    await route.fulfill({ json: doc })
  })

  await page.goto(`/projects/${project.id}/documents?bucket=private`)
  await expect(page.getByText('비공개 문서가 없습니다')).toBeVisible()
  const createRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/documents'),
  )
  await page.getByRole('button', { name: '새 문서' }).first().click()
  expect(((await createRequest).postDataJSON() as { visibility: string }).visibility).toBe('private')
  await expect(page.getByLabel('문서 공개 범위')).toHaveValue('private')

  const archiveRequest = page.waitForRequest((request) => request.url().endsWith('/archive'))
  await page.getByRole('button', { name: '보관' }).click()
  expect(((await archiveRequest).postDataJSON() as { expected_version: number }).expected_version).toBe(0)
  await expect(page.getByRole('button', { name: '복원' })).toBeVisible()
  await expect(page.getByLabel('문서 제목')).toHaveAttribute('readonly', '')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/wiki-lifecycle-ui/mobile-archived-detail.png',
    fullPage: true,
  })

  const restoreRequest = page.waitForRequest((request) => request.url().endsWith('/restore'))
  await page.getByRole('button', { name: '복원' }).click()
  expect(((await restoreRequest).postDataJSON() as { expected_version: number }).expected_version).toBe(1)
  await expect(page.getByRole('button', { name: '저장' })).toBeVisible()
})

test('문서 편집기에서 작업을 연결하고 드로어 페이지 섹션이 링크를 보여준다', async ({
  page,
}) => {
  await mockApi(page)
  const doc = {
    id: 'd1',
    project_id: project.id,
    parent_id: null,
    title: '설계 문서',
    author_id: null,
    version: 0,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) =>
    route.fulfill({ json: { ...doc, body: null } }),
  )
  await page.route('**/api/v1/documents/d1/work-package-links', async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { work_package_id: string }
      await route.fulfill({
        status: 201,
        json: {
          id: 'link-1',
          project_id: project.id,
          document_id: 'd1',
          work_package_id: sent.work_package_id,
          created_at: '2026-07-07T00:00:00Z',
        },
      })
      return
    }
    await route.fulfill({ json: { items: [], total: 0 } })
  })
  // Reverse side: the drawer's pages section (registered after mockApi's empty
  // default → takes precedence).
  await page.route(`**/api/v1/work-packages/${wpA.id}/documents`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )

  // editor: pick a work package and link it — the POST carries its id
  await page.goto(`/projects/${project.id}/documents/d1`)
  const section = page.getByRole('region', { name: '연결된 작업' })
  await expect(section.getByText('연결된 작업이 없습니다.')).toBeVisible()
  await section.getByLabel('연결할 작업').selectOption(wpA.id)
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/work-package-links'),
  )
  await section.getByRole('button', { name: '연결' }).click()
  expect(((await post).postDataJSON() as { work_package_id: string }).work_package_id).toBe(
    wpA.id,
  )

  // drawer: the linked page shows up and navigates back to the document
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: wpA.subject }).click()
  const pages = page.getByRole('region', { name: '페이지' })
  await expect(pages.getByRole('button', { name: /설계 문서/ })).toBeVisible()
})

test('회의 상세가 안건·액션 아이템을 보여주고 액션 아이템을 추가한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const meeting = {
    id: 'm1',
    project_id: project.id,
    title: '스프린트 회의',
    scheduled_on: '2026-07-10',
    agenda: '<p>안건 내용</p>',
    minutes: null,
    author_id: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    action_items: [
      {
        id: 'a1',
        meeting_id: 'm1',
        description: '배포 점검',
        assignee_id: null,
        done: false,
        created_at: '2026-07-01T00:00:00Z',
      },
    ],
  }
  await page.route(`**/api/v1/projects/${project.id}/meetings`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'm1',
            project_id: project.id,
            title: '스프린트 회의',
            scheduled_on: '2026-07-10',
            version: 1,
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/meetings/m1/action-items', (route) =>
    route.fulfill({ status: 201, json: { id: 'a2' } }),
  )
  await page.route('**/api/v1/meetings/m1', (route) => route.fulfill({ json: meeting }))

  await page.goto(`/projects/${project.id}/meetings`)
  await expect(page.getByText('Collaboration surface')).toBeVisible()
  await expect(page.getByLabel('회의 요약').getByText('전체 회의')).toBeVisible()
  await expect(page.getByLabel('회의 요약').getByText('일정 있음')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/meetings-ui/mobile-list.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: /스프린트 회의/ }).click()

  await expect(page.getByLabel('회의 제목')).toHaveValue('스프린트 회의')
  await expect(page.getByText('배포 점검')).toBeVisible()
  await expect(page.getByLabel('안건', { exact: true })).toBeVisible()
  await expect(page.getByText('Meeting detail')).toBeVisible()
  await expect(page.getByLabel('회의 속성')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/meetings-ui/mobile-detail.png',
    fullPage: true,
  })

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/meetings/m1/action-items'),
  )
  await page.getByLabel('새 액션 아이템').fill('회의록 정리')
  await page.getByRole('button', { name: '추가' }).click()
  await post

  // Save-as-template (Pass 48): the prompt value becomes the template name
  // and the POST snapshots from the meeting.
  page.once('dialog', (d) => void d.accept('주간 아젠다'))
  const tplPost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/meeting-templates'),
  )
  await page.route(`**/api/v1/projects/${project.id}/meeting-templates`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        id: 't1',
        project_id: project.id,
        name: '주간 아젠다',
        agenda: '<p>안건 내용</p>',
        created_by: 'me-1',
        created_at: '2026-07-08T00:00:00Z',
      },
    }),
  )
  await page.getByRole('button', { name: '템플릿으로 저장' }).click()
  const tplSent = (await tplPost).postDataJSON() as { name: string; from_meeting_id: string }
  expect(tplSent).toEqual({ name: '주간 아젠다', from_meeting_id: 'm1' })
})

test('후속 회의 상세는 원본 링크를 보여주고 클릭하면 원본으로 이동한다', async ({ page }) => {
  await mockApi(page)
  const base = {
    project_id: project.id,
    agenda: null,
    minutes: null,
    author_id: null,
    recurrence: null,
    recurrence_source_id: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    action_items: [],
  }
  const src = { ...base, id: 'm-src', title: '주간 회의', scheduled_on: '2026-07-01', follow_up_source_id: null, follow_up_source_title: null }
  const fu = { ...base, id: 'm-fu', title: '주간 회의', scheduled_on: '2026-07-08', follow_up_source_id: 'm-src', follow_up_source_title: '주간 회의' }
  await page.route('**/api/v1/meetings/m-src', (route) => route.fulfill({ json: src }))
  await page.route('**/api/v1/meetings/m-fu', (route) => route.fulfill({ json: fu }))
  await page.route(`**/api/v1/projects/${project.id}/meetings`, (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'm-src', project_id: project.id, title: '주간 회의', scheduled_on: '2026-07-01', recurrence: null, version: 1, updated_at: '2026-07-01T00:00:00Z' },
          { id: 'm-fu', project_id: project.id, title: '주간 회의', scheduled_on: '2026-07-08', recurrence: null, version: 1, updated_at: '2026-07-01T00:00:00Z' },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/meetings/m-fu`)
  await expect(page.getByText('의 후속 회의입니다', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: "'주간 회의'" }).click()
  await expect(page).toHaveURL(/\/meetings\/m-src/)
  // The source meeting itself shows no follow-up link.
  await expect(page.getByText('의 후속 회의입니다', { exact: false })).toBeHidden()
})

test('회의 상세에서 반복 주기를 고르면 PATCH에 recurrence가 실린다', async ({ page }) => {
  await mockApi(page)
  const meeting = {
    id: 'm1',
    project_id: project.id,
    title: '주간 회의',
    scheduled_on: '2026-07-10',
    agenda: null,
    minutes: null,
    author_id: null,
    recurrence: null,
    recurrence_source_id: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    action_items: [],
  }
  await page.route(`**/api/v1/projects/${project.id}/meetings`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'm1',
            project_id: project.id,
            title: '주간 회의',
            scheduled_on: '2026-07-10',
            recurrence: null,
            version: 1,
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/meetings/m1', async (route) => {
    if (route.request().method() === 'PATCH') {
      const sent = route.request().postDataJSON() as { recurrence?: string | null }
      await route.fulfill({
        json: { ...meeting, recurrence: sent.recurrence ?? null, version: 2 },
      })
      return
    }
    await route.fulfill({ json: meeting })
  })

  await page.goto(`/projects/${project.id}/meetings/m1`)
  await expect(page.getByLabel('회의 제목')).toHaveValue('주간 회의')

  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/meetings/m1'),
  )
  await page.getByLabel('반복 주기').selectOption('weekly')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const sent = (await patch).postDataJSON() as { recurrence?: string }
  expect(sent.recurrence).toBe('weekly')
  await expect(page.getByLabel('반복 주기')).toHaveValue('weekly')
})

test('회의 생성 시 템플릿을 고르면 template_id가 실린다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/meeting-templates`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 't1',
            project_id: project.id,
            name: '주간 아젠다',
            // sanitize boundary: the stored agenda is server-cleaned HTML
            agenda: '<p>안건 1</p>',
            created_by: 'me-1',
            created_at: '2026-07-08T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/meetings`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          id: 'm-new',
          project_id: project.id,
          title: '제목 없는 회의',
          scheduled_on: null,
          agenda: '<p>안건 1</p>',
          minutes: null,
          author_id: null,
          version: 0,
          created_at: '2026-07-08T00:00:00Z',
          updated_at: '2026-07-08T00:00:00Z',
          action_items: [],
        },
      })
      return
    }
    await route.fulfill({ json: { items: [], total: 0 } })
  })
  await page.route('**/api/v1/meetings/m-new', (route) =>
    route.fulfill({
      json: {
        id: 'm-new',
        project_id: project.id,
        title: '제목 없는 회의',
        scheduled_on: null,
        agenda: '<p>안건 1</p>',
        minutes: null,
        author_id: null,
        version: 0,
        created_at: '2026-07-08T00:00:00Z',
        updated_at: '2026-07-08T00:00:00Z',
        action_items: [],
      },
    }),
  )

  await page.goto(`/projects/${project.id}/meetings`)
  await page.getByLabel('회의 템플릿').selectOption('t1')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith(`/projects/${project.id}/meetings`),
  )
  await page.getByRole('button', { name: '새 회의' }).click()
  const sent = (await post).postDataJSON() as { title: string; template_id: string }
  expect(sent.template_id).toBe('t1')
  // Navigated to the new meeting with the template agenda applied (rendered
  // through the rich editor — server-sanitized HTML only).
  await expect(page.getByLabel('회의 제목')).toHaveValue('제목 없는 회의')
  await expect(page.getByText('안건 1')).toBeVisible()
})

test('후속 회의를 만들면 아젠다·미결 항목을 들고 새 회의로 이동한다', async ({ page }) => {
  await mockApi(page)
  const meeting = {
    id: 'm1',
    project_id: project.id,
    title: '주간 회의',
    scheduled_on: '2026-07-10',
    agenda: '<p>안건</p>',
    minutes: null,
    author_id: null,
    version: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    action_items: [
      {
        id: 'a1',
        meeting_id: 'm1',
        description: '미결 항목',
        assignee_id: null,
        done: false,
        converted_wp_id: null,
        created_at: '2026-07-01T00:00:00Z',
      },
      {
        id: 'a2',
        meeting_id: 'm1',
        description: '완료 항목',
        assignee_id: null,
        done: true,
        converted_wp_id: null,
        created_at: '2026-07-01T00:00:00Z',
      },
    ],
  }
  const followUp = {
    ...meeting,
    id: 'm2',
    scheduled_on: '2026-07-17',
    version: 0,
    action_items: [meeting.action_items[0]],
  }
  await page.route(`**/api/v1/projects/${project.id}/meetings`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'm1',
            project_id: project.id,
            title: '주간 회의',
            scheduled_on: '2026-07-10',
            version: 1,
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/meetings/m1', (route) => route.fulfill({ json: meeting }))
  await page.route('**/api/v1/meetings/m2', (route) => route.fulfill({ json: followUp }))
  await page.route('**/api/v1/meetings/m1/follow-up', (route) =>
    route.fulfill({ status: 201, json: followUp }),
  )

  await page.goto(`/projects/${project.id}/meetings/m1`)
  await expect(page.getByLabel('회의 제목')).toHaveValue('주간 회의')

  // The confirm names the carried OPEN item count (done items excluded).
  const dialogs: string[] = []
  page.once('dialog', (d) => {
    dialogs.push(d.message())
    void d.accept()
  })
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/meetings/m1/follow-up'),
  )
  await page.getByRole('button', { name: '후속 회의 만들기' }).click()
  await post
  expect(dialogs[0]).toContain('1건')

  // Navigates to the created follow-up occurrence.
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/meetings/m2`))
  await expect(page.getByLabel('회의 일정')).toHaveValue('2026-07-17')
})

test('뷰어 파일 페이지는 업로드·링크·삭제가 없고 안내 1개만 보인다', async ({ page }) => {
  await mockApi(page)
  await asViewer(page)
  await page.route(`**/api/v1/projects/${project.id}/attachments`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'f1',
            project_id: project.id,
            filename: '설계서.pdf',
            url: 'https://files.example.com/a.pdf',
            content_type: 'application/pdf',
            size_bytes: 20480,
            work_package_id: null,
            document_id: null,
            has_file: false,
            uploaded_by: null,
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/files`)
  await expect(page.getByText('설계서.pdf')).toBeVisible()
  // Exactly one read-only notice on the page (v78.1 R1-①).
  await expect(page.getByText('읽기 전용입니다', { exact: false })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '파일 업로드' })).toHaveCount(0)
  await expect(page.getByLabel('파일 이름')).toHaveCount(0)
  await expect(page.getByLabel('설계서.pdf 삭제')).toHaveCount(0)
})

test('뷰어 드로어 하위 섹션은 시간·비용·관계·커스텀값 편집이 없고 안내는 상단 1개뿐', async ({
  page,
}) => {
  await mockApi(page)
  await asViewer(page)
  await page.route(`**/api/v1/work-packages/${wpA.id}/time-entries`, (route) =>
    route.fulfill({ json: { items: [], total: 0, total_hours: 0 } }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/cost-entries`, (route) =>
    route.fulfill({ json: { items: [], total: 0, total_amount: 0 } }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}/relations`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  // Drawer shows its single top notice — sub-sections add none (v78.1 R1-①).
  await expect(drawer.getByText('읽기 전용입니다', { exact: false })).toHaveCount(1)
  await expect(drawer.getByLabel('기록할 시간')).toHaveCount(0)
  await expect(drawer.getByLabel('비용 금액')).toHaveCount(0)
  await expect(drawer.getByLabel('관계 유형')).toHaveCount(0)
})

test('파일 페이지가 링크를 보여주고 새 파일 링크를 추가한다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/attachments`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { id: 'f-new' } })
      return
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: 'f1',
            project_id: project.id,
            filename: '설계서.pdf',
            url: 'https://files.example.com/a.pdf',
            content_type: 'application/pdf',
            size_bytes: 20480,
            uploaded_by: null,
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    })
  })

  await page.goto(`/projects/${project.id}/files`)
  await expect(page.getByRole('link', { name: /설계서\.pdf/ })).toBeVisible()

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/attachments'),
  )
  await page.getByLabel('파일 이름').fill('회의자료.pptx')
  await page.getByLabel('파일 URL').fill('https://files.example.com/b.pptx')
  await page.getByRole('button', { name: '추가' }).click()
  await post
})

test('첨부 URL이 http(s)가 아니면 클라이언트에서 거부한다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/attachments`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.goto(`/projects/${project.id}/files`)
  await page.getByLabel('파일 이름').fill('악성')
  await page.getByLabel('파일 URL').fill('javascript:alert(1)')
  // The client rejects a non-http(s) scheme before it can be stored.
  await expect(page.getByText('http:// 또는 https://')).toBeVisible()
  await expect(page.getByRole('button', { name: '추가' })).toBeDisabled()
})

test('파일 페이지는 스토리지 허브와 모바일 안전 목록을 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'doc-file',
            project_id: project.id,
            title: '온보딩 위키',
            body: '<p>문서</p>',
            parent_id: null,
            version: 1,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-02T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'file-upload',
            project_id: project.id,
            filename: '설계서.txt',
            url: 'oneflow://attachments/file-upload',
            content_type: 'text/plain',
            size_bytes: 1100,
            work_package_id: wpA.id,
            document_id: null,
            has_file: true,
            uploaded_by: 'u-dev',
            created_at: '2026-07-07T00:00:00Z',
          },
          {
            id: 'file-link',
            project_id: project.id,
            filename: '온보딩 위키 링크',
            url: 'https://files.example.com/wiki',
            content_type: null,
            size_bytes: null,
            work_package_id: null,
            document_id: 'doc-file',
            has_file: false,
            uploaded_by: null,
            created_at: '2026-07-08T00:00:00Z',
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/files`)
  await expect(page.getByText('Storage surface')).toBeVisible()
  await expect(page.getByLabel('파일 요약')).toContainText('전체 파일')
  await expect(page.getByText('작업: 워크패키지 API 구현')).toBeVisible()
  await expect(page.getByText('문서: 온보딩 위키')).toBeVisible()
  await page.getByLabel('파일 검색').fill('위키')
  await expect(page.getByRole('link', { name: /온보딩 위키 링크/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /설계서\.txt/ })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/files-ui/mobile-list.png',
    fullPage: true,
  })
})

test('빈 목록은 모바일에서도 안정적인 빈 상태를 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies WorkPackageList }),
  )
  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByText('아직 작업이 없습니다')).toBeVisible()
  await expect(page.getByText('첫 작업을 만들어 프로젝트 실행을 시작하세요.')).toBeVisible()
  await page.getByRole('button', { name: '첫 작업 만들기' }).click()
  await expect(page).toHaveURL(/new=1/)
  await expect(page.getByRole('region', { name: '새 작업 생성' })).toBeVisible()

  await page.goto(`/projects/${project.id}/work-packages?status=done`)
  await expect(page.getByText('조건에 맞는 작업이 없습니다')).toBeVisible()
  await expect(page.getByText('검색이나 필터를 조정해 다른 작업을 찾아보세요.')).toBeVisible()
  await page.getByRole('button', { name: '현재 보기 초기화' }).click()
  await expect(page).not.toHaveURL(/status=/)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/web-empty.png', fullPage: true })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/states-mobile/empty-list.png',
  })
})

test('빈 작업 목록은 뷰어에게 생성할 수 없는 행동을 안내하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies WorkPackageList }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByText('프로젝트 멤버가 작업을 추가하면 이곳에 표시됩니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '첫 작업 만들기' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('목록 로딩 스켈레톤은 모바일에서 콘텐츠 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/projects/*/work-packages**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await route.fulfill({ json: workPackages })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('status', { name: '불러오는 중' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('status', { name: '불러오는 중' }).screenshot({
    path: '../../docs/screenshots/redevelopment/states-mobile/list-skeleton.png',
  })
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
})

test('목록 오류 상태는 모바일에서 재시도와 요청 정보를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({
      status: 500,
      headers: {
        'access-control-expose-headers': 'x-request-id',
        'x-request-id': 'req-state-mobile',
      },
      json: { detail: '작업 목록을 불러올 수 없습니다' },
    }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('데이터를 불러오지 못했습니다')).toBeVisible()
  await expect(page.getByText('작업 목록을 불러올 수 없습니다')).toBeVisible()
  await expect(page.getByText('요청 ID: req-state-mobile')).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('alert').screenshot({
    path: '../../docs/screenshots/redevelopment/states-mobile/error-list.png',
  })
})

test('목록이 여러 페이지를 모두 불러온다 (200건 무성 절단 없음)', async ({ page }) => {
  // Page 0 returns a full 500-item page with total 501, forcing a second fetch;
  // the item that only exists on page 2 must appear, proving no truncation.
  const firstPage: WorkPackage[] = Array.from({ length: 500 }, (_, i) => ({
    ...wpA,
    id: `g-${i}`,
    subject: `대량 작업 ${i}`,
  }))
  const pageTwoItem: WorkPackage = { ...wpA, id: 'g-500', subject: '두 번째 페이지 작업' }
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: projects }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.route('**/api/v1/projects/*/saved-filters', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/projects/*/statuses', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/projects/*/work-packages**', (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const items = offset >= 500 ? [pageTwoItem] : firstPage
    return route.fulfill({ json: { items, total: 501 } satisfies WorkPackageList })
  })
  const secondPage = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/work-packages') && url.searchParams.get('offset') === '500'
  })
  await page.goto(`/projects/${project.id}/work-packages`)
  await secondPage
  await expect(page.getByText('두 번째 페이지 작업')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('501건', { exact: true })).toBeVisible()
})

test('빈 프로젝트 목록에서 새 프로젝트를 만들면 생성 요청 후 이동한다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as { key: string; name: string }
      return route.fulfill({
        status: 201,
        json: {
          id: 'p-new',
          key: sent.key,
          name: sent.name,
          description: null,
          budget: null,
          created_at: '2026-07-05T00:00:00Z',
          updated_at: '2026-07-05T00:00:00Z',
        },
      })
    }
    return route.fulfill({ json: { items: [], total: 0 } satisfies ProjectList })
  })
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  // Minimal mocks for the create-then-navigate Overview page.
  await page.route('**/api/v1/projects/p-new', (route) => route.fulfill({
    json: { ...project, id: 'p-new', key: 'NEW', name: '신규 프로젝트' },
  }))
  await page.route('**/api/v1/projects/p-new/dashboard', (route) => route.fulfill({
    json: {
      id: 'p-new', key: 'NEW', name: '신규 프로젝트', description: null,
      health: null, health_note: null, archived_at: null, completion_percent: 0,
      recent_work_packages: [], total_work_packages: 0, open_work_packages: 0,
      overdue_count: 0, status_counts: [], priority_counts: [], type_counts: [],
      total_estimated_hours: 0, total_spent_hours: 0, budget: null, total_cost: 0,
    },
  }))
  await page.route('**/api/v1/projects/p-new/activities**', (route) =>
    route.fulfill({ json: { items: [], total: 0, truncated: false } }),
  )
  await page.route('**/api/v1/projects/p-new/members', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto('/projects')
  await page.getByRole('button', { name: '새 프로젝트' }).first().click()
  await page.getByLabel('이름').fill('신규 프로젝트')
  await page.getByLabel(/키/).fill('NEW')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/projects'),
  )
  await page.getByRole('button', { name: '만들기' }).click()
  const req = await post
  expect(req.postDataJSON()).toMatchObject({ key: 'NEW', name: '신규 프로젝트' })
  await expect(page).toHaveURL(/\/projects\/p-new\/overview/)
})

test('마일스톤 패널이 행 작업 메뉴·편집·삭제 확인·필터 이동을 제공한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  let milestone: Milestone = {
    id: 'ms-1',
    project_id: project.id,
    name: '1차 출시',
    description: null,
    due_date: '2026-08-01',
    work_package_count: 4,
    done_work_package_count: 3,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  }
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({
      json: {
        items: [milestone],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones/ms-1`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON() as { name?: string; due_date?: string | null }
      milestone = {
        ...milestone,
        name: patch.name ?? milestone.name,
        due_date: patch.due_date ?? null,
        updated_at: '2026-07-02T00:00:00Z',
      }
      await route.fulfill({ json: milestone })
      return
    }
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 })
      return
    }
    await route.fulfill({ status: 405 })
  })

  await page.goto(`/projects/${project.id}/settings?tab=milestones`)
  await expect(page.getByText('1차 출시')).toBeVisible()
  await expect(page.getByText('3/4')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '1차 출시 진행률' })).toBeVisible()

  await page.getByLabel('1차 출시 마일스톤 작업').click()
  const filtered = page.waitForRequest(
    (r) => r.url().includes('/work-packages?') && r.url().includes('milestone_id=ms-1'),
  )
  await page.getByLabel('1차 출시 작업 목록 열기').click()
  await filtered
  await expect(page).toHaveURL(/milestone_id=ms-1/)
  await expect(page.getByLabel('마일스톤 필터')).toHaveValue('ms-1')

  await page.goto(`/projects/${project.id}/settings?tab=milestones`)
  await page.getByLabel('1차 출시 마일스톤 작업').click()
  await page.getByLabel('1차 출시 편집').click()
  await page.getByLabel('마일스톤 이름 편집').fill('1차 GA')
  await page.getByLabel('마일스톤 기한 편집').fill('2026-08-15')
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().endsWith('/api/v1/projects/11111111-1111-4111-8111-111111111111/milestones/ms-1'),
  )
  await page.getByRole('button', { name: /저장/ }).click()
  const patchReq = await patch
  expect(patchReq.postDataJSON()).toMatchObject({ name: '1차 GA', due_date: '2026-08-15' })
  await expect(page.getByText('1차 GA')).toBeVisible()

  // delete confirm carries the assignment-release wording (never silent)
  const dialogs: string[] = []
  page.once('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  await page.getByLabel('1차 GA 마일스톤 작업').click()
  await page.getByLabel('1차 GA 삭제').click()
  await expect
    .poll(() => dialogs[0] ?? '')
    .toContain('연결된 작업 4건은 삭제되지 않고 배정만 해제됩니다')
})

test('마일스톤 행 작업 메뉴가 모바일 폭 안에 머물고 읽기 전용 cue를 보여준다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'viewer@oneflow.local', display_name: 'Viewer', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'viewer@oneflow.local', display_name: 'Viewer', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'ms-1',
            project_id: project.id,
            name: '모바일 출시',
            description: null,
            due_date: '2026-08-01',
            work_package_count: 4,
            done_work_package_count: 3,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=milestones`)
  await expect(page.getByText('쓰기 권한이 없어 마일스톤 변경 작업은 숨겨졌습니다.')).toBeVisible()
  await page.getByLabel('모바일 출시 마일스톤 작업').click()
  const menu = page.getByRole('menu', { name: '모바일 출시 마일스톤 작업 메뉴' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('쓰기 권한 없음')).toBeVisible()
  await expect(page.getByLabel('모바일 출시 편집')).toHaveCount(0)
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/milestone-item-actions-ui/mobile.png',
    fullPage: true,
  })
})

test('시스템 상태 페이지가 실제 준비 상태를 새로고침하고 안전 진단을 복사한다', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { window.sessionStorage.setItem('__diagnostic_copy', value) } },
    })
  })
  let statusRequests = 0
  await page.route('**/api/v1/ops/status', (route) =>
    { statusRequests += 1; return route.fulfill({
      json: {
        version: '0.1.0',
        readiness: {
          status: 'warning', ok: 3, warnings: 1, errors: 0,
          generated_at: '2026-07-17T02:00:00Z',
          checks: [
            { id: 'database', label: '데이터베이스 연결', status: 'ok', detail: '데이터베이스가 요청에 응답합니다.', observed: 'reachable', expected: 'reachable' },
            { id: 'schema', label: '데이터베이스 스키마', status: 'ok', detail: '데이터베이스 스키마가 애플리케이션 head와 일치합니다.', observed: '0100', expected: '0100' },
            { id: 'storage', label: '파일 스토리지', status: 'ok', detail: 'LocalStorage에 임시 파일을 쓰고 안전하게 정리했습니다.', observed: 'writable', expected: 'writable' },
            { id: 'auth', label: '인증 구성', status: 'warning', detail: '개발 인증 모드입니다. 공유 배포 전 OIDC로 전환하세요.', observed: 'dev', expected: 'oidc' },
          ],
        },
        database: { status: 'ok', current_revision: '0100', expected_revision: '0100', matches_head: true },
        counts: { projects: 3, work_packages: 42 },
        config: {
          environment: 'development',
          auth_mode: 'dev',
          oidc_provider_count: 0,
          ai_summary_enabled: false,
          storage_backend: 'local',
          upload_max_bytes: 10485760,
          project_storage_quota_bytes: 1073741824,
        },
      },
    }) },
  )
  await page.goto('/status')
  await expect(page.getByRole('heading', { name: '시스템 상태' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: '배포 준비 상태' }).getByText('주의 필요'),
  ).toBeVisible()
  await expect(page.getByText('데이터베이스 스키마', { exact: true })).toBeVisible()
  await expect(page.getByText('0.1.0')).toBeVisible()
  await expect(page.getByText('0100')).toBeVisible()
  await expect(page.getByText('42')).toBeVisible()
  await expect(page.getByText('10 MiB')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/deployment-diagnostics-ui/desktop.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '진단 복사' }).click()
  await expect(page.getByRole('status')).toContainText('진단 보고서를 복사했습니다.')
  const copied = await page.evaluate(() => window.sessionStorage.getItem('__diagnostic_copy'))
  expect(copied).toContain('oneflow-deployment-diagnostics/v1')
  expect(copied).not.toContain('postgresql')
  await page.getByRole('button', { name: '새로고침' }).click()
  await expect.poll(() => statusRequests).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/deployment-diagnostics-ui/mobile.png',
    fullPage: true,
  })
})

test('알 수 없는 주소는 스타일된 404 페이지를 보여준다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { items: [{ ...project, ...projectRollups }], total: 1 } satisfies ProjectList }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.goto('/this/route/does/not/exist')
  await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible()
  await page.getByRole('button', { name: '프로젝트 목록으로' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('로그인 화면은 참조 시안의 기능 계약을 유지하고 안전하게 이동한다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  let releaseConfig!: () => void
  const configGate = new Promise<void>((resolve) => { releaseConfig = resolve })
  await page.route('**/api/v1/auth/config', async (route) => {
    await configGate
    await route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        has_client_secret: false,
        command_palette_enabled: false,
        session_management_enabled: true,
        password_required: true,
        oidc_login_enabled: false,
      },
    })
  })
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      json: { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User' },
    }),
  )
  await page.route('**/api/v1/auth/assistance-requests', (route) =>
    route.fulfill({
      status: 202,
      json: {
        accepted: true,
        message: 'If assistance is available, a workspace administrator will review the request.',
      },
    }),
  )

  await page.goto('/login?next=/projects')
  await expect(page.getByText('Checking sign-in options...')).toBeVisible()
  releaseConfig()
  await expect(page.getByRole('heading', { name: 'Plan. Flow. Deliver. Together.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
  await expect(page.locator('.of-login-story-art')).toBeVisible()
  await expect(page.locator('.of-login-story-art')).toHaveAttribute(
    'src',
    /oneflow-login-origin-reference/,
  )
  await expect(page.locator('.of-login-brand-reference')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('dialog')).toContainText('Google OAuth is not configured')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  const assistanceDialog = page.getByRole('dialog')
  await expect(assistanceDialog).toContainText('Request sign-in help')
  await assistanceDialog.getByLabel('Company email').fill('dev@oneflow.local')
  await assistanceDialog.getByLabel('What do you need help with? (optional)').fill('Cannot use my provider')
  const assistancePost = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/auth/assistance-requests'),
  )
  await assistanceDialog.getByRole('button', { name: 'Send request' }).click()
  expect((await assistancePost).postDataJSON()).toEqual({
    kind: 'sign_in_help',
    email: 'dev@oneflow.local',
    reason: 'Cannot use my provider',
  })
  await expect(assistanceDialog).toContainText('Request received')
  await assistanceDialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeFocused()
  await page.getByRole('button', { name: 'Terms' }).click()
  await expect(page.getByRole('dialog')).toContainText('Terms of use')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Choose language' }).click()
  await page.getByRole('menuitemradio', { name: '한국어' }).click()
  await expect(page.getByRole('heading', { name: /다시 만나 반가워요/ })).toBeVisible()
  await page.getByRole('button', { name: 'Choose language' }).click()
  await page.getByRole('menuitemradio', { name: 'English' }).click()

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/auth/login'),
  )
  await page.getByLabel('Email address').fill('dev@oneflow.local')
  await page.getByLabel('Password', { exact: true }).fill('development-password')
  const showPasswordButton = page.getByRole('button', { name: 'Show password' })
  await expect(showPasswordButton.locator('svg')).toHaveClass(/lucide-eye-off/)
  await showPasswordButton.click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  const hidePasswordButton = page.getByRole('button', { name: 'Hide password' })
  await expect(hidePasswordButton.locator('svg')).toHaveClass(/lucide-eye$/)
  await hidePasswordButton.click()
  await page.getByLabel('Remember me').uncheck()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await post).postDataJSON()).toEqual({
    email: 'dev@oneflow.local',
    password: 'development-password',
    remember_me: false,
  })
  await expect(page).toHaveURL(/\/projects$/)

  // OIDC mode keeps credentials fail-closed while preserving provider discovery.
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'oidc',
        oidc_issuer: 'https://idp.example.com',
        oidc_client_id: 'oneflow',
        oidc_provider: 'sso',
        oidc_providers: ['google', 'sso'],
        has_client_secret: true,
        command_palette_enabled: false,
        session_management_enabled: false,
        password_required: false,
        oidc_login_enabled: true,
      },
    }),
  )
  await page.goto('/login')
  await expect(page.locator('.of-login-mode-note')).toContainText(
    'Continue with the configured identity provider below',
  )
  await expect(page.getByLabel('Email address')).toBeDisabled()
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Continue with SSO, configured' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google, configured' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Microsoft, not configured' })).toBeVisible()
  let oidcStartCount = 0
  await page.route('**/api/v1/auth/oidc/start?*', async (route) => {
    oidcStartCount += 1
    await route.abort('aborted')
  })
  await page.evaluate(() => {
    const requestAnimationFrame = window.requestAnimationFrame.bind(window)
    let pendingFrame: FrameRequestCallback | null = null
    window.requestAnimationFrame = (callback) => {
      pendingFrame = callback
      return 1
    }
    Object.defineProperty(window, '__releaseOidcRedirect', {
      configurable: true,
      value: () => {
        if (!pendingFrame) return
        const callback = pendingFrame
        pendingFrame = null
        requestAnimationFrame(callback)
      },
    })
  })
  const oidcStart = page.waitForRequest(
    (request) => request.url().includes('/api/v1/auth/oidc/start?'),
  )
  const configuredSso = page.getByRole('button', { name: 'Continue with SSO, configured' })
  await configuredSso.click()
  await expect(configuredSso).toHaveAttribute('aria-busy', 'true')
  await configuredSso.evaluate((button) => (button as HTMLButtonElement).click())
  await page.waitForTimeout(50)
  expect(oidcStartCount).toBe(0)
  await page.evaluate(() => {
    (window as typeof window & { __releaseOidcRedirect: () => void }).__releaseOidcRedirect()
  })
  const oidcStartUrl = new URL((await oidcStart).url())
  await expect.poll(() => oidcStartCount).toBe(1)
  expect(oidcStartUrl.searchParams.get('provider')).toBe('sso')
  expect(oidcStartUrl.searchParams.get('next')).toBe('/projects')

  await page.goto('/login?auth_error=access_denied')
  await expect(page.getByRole('alert')).toContainText(
    'Sign-in was cancelled at the identity provider.',
  )
  const googleStart = page.waitForRequest(
    (request) => request.url().includes('/api/v1/auth/oidc/start?')
      && new URL(request.url()).searchParams.get('provider') === 'google',
  )
  await page.getByRole('button', { name: 'Continue with Google, configured' }).click()
  const googleStartUrl = new URL((await googleStart).url())
  expect(googleStartUrl.searchParams.get('next')).toBe('/projects')

  await page.goto('/login')
  await page.getByRole('button', { name: 'Continue with Microsoft, not configured' }).click()
  await expect(page.getByRole('dialog')).toContainText('Microsoft Entra is not configured')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'unexpected',
        oidc_issuer: null,
        oidc_client_id: null,
        oidc_provider: null,
        has_client_secret: false,
        command_palette_enabled: false,
        session_management_enabled: false,
        password_required: false,
        oidc_login_enabled: false,
      },
    }),
  )
  await page.goto('/login')
  await expect(page.locator('.of-login-mode-note.is-error')).toContainText(
    'This authentication configuration is not supported',
  )
  await expect(page.getByLabel('Email address')).toBeDisabled()
})

test('로그인 접근 요청은 모바일에서 실패를 복구하고 기능형 결과를 표시한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({
    json: {
      auth_mode: 'dev',
      oidc_issuer: null,
      oidc_client_id: null,
      oidc_provider: null,
      oidc_providers: [],
      has_client_secret: false,
      command_palette_enabled: false,
      session_management_enabled: true,
      password_required: true,
      oidc_login_enabled: false,
    },
  }))
  let attempts = 0
  let releaseFirstAttempt!: () => void
  const firstAttemptGate = new Promise<void>((resolve) => { releaseFirstAttempt = resolve })
  await page.route('**/api/v1/auth/assistance-requests', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await firstAttemptGate
      await route.fulfill({ status: 503, json: { detail: 'temporarily unavailable' } })
      return
    }
    await route.fulfill({
      status: 202,
      json: {
        accepted: true,
        message: 'If assistance is available, a workspace administrator will review the request.',
      },
    })
  })

  await page.goto('/login')
  await page.getByRole('button', { name: 'Create account' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Request workspace access')
  await dialog.getByLabel('Company email').fill(' New.Person@Example.Test ')
  await dialog.getByLabel('What do you need help with? (optional)').fill('Joining delivery')
  const submit = dialog.locator('button[type="submit"]')
  const firstClick = submit.click()
  await expect.poll(() => attempts).toBe(1)
  await expect(submit).toHaveAttribute('aria-busy', 'true')
  releaseFirstAttempt()
  await firstClick
  await expect(dialog.getByRole('alert')).toContainText('could not submit')
  await submit.click()
  await expect(dialog).toContainText('Request received')
  expect(attempts).toBe(2)
  const viewport = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(viewport.scrollWidth).toBe(viewport.clientWidth)
  const mobileFlow = await page.locator('.of-login-canvas').evaluate((canvas) => ({
    scrollHeight: canvas.scrollHeight,
    clientHeight: canvas.clientHeight,
  }))
  expect(mobileFlow.scrollHeight).toBeGreaterThan(mobileFlow.clientHeight)
  await page.locator('.of-login-canvas').evaluate((canvas) => {
    canvas.scrollTop = canvas.scrollHeight
  })
  const footerBox = await page.locator('.of-login-footer').boundingBox()
  expect(footerBox).not.toBeNull()
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(844)
})

test('로그인 설정 오류를 복구하고 외부 next 이동을 차단한다', async ({ page }) => {
  await mockApi(page)
  let configRequests = 0
  let loginRequests = 0
  await page.route('**/api/v1/auth/config', (route) => {
    configRequests += 1
    if (configRequests === 1) {
      void route.fulfill({ status: 503, json: { detail: 'temporarily unavailable' } })
      return
    }
    void route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        has_client_secret: false,
        command_palette_enabled: false,
        session_management_enabled: true,
        password_required: true,
      },
    })
  })
  await page.route('**/api/v1/auth/login', (route) => {
    loginRequests += 1
    if (loginRequests === 1) {
      void route.fulfill({ status: 401, json: { detail: 'login failed' } })
      return
    }
    void route.fulfill({
      json: { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User' },
    })
  })

  await page.goto('/login?next=%2F%2Fevil.example')
  const appOrigin = new URL(page.url()).origin
  await expect(page.getByText('Sign-in options could not be loaded.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByLabel('Email address')).toBeVisible()
  await page.getByLabel('Email address').fill('dev@oneflow.local')
  await page.getByLabel('Password', { exact: true }).fill('development-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'We could not sign you in. Check your credentials and try again.',
  )
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Email address')).toHaveAttribute(
    'aria-describedby',
    'login-auth-help login-auth-error',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  expect(new URL(page.url()).origin).toBe(appOrigin)

  for (const unsafeNext of [
    'https%3A%2F%2Fevil.example%2Fsteal',
    '%2F%5C%5Cevil.example%2Fsteal',
  ]) {
    await page.goto(`/login?next=${unsafeNext}`)
    await page.getByLabel('Email address').fill('dev@oneflow.local')
    await page.getByLabel('Password', { exact: true }).fill('development-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/projects$/)
    expect(new URL(page.url()).origin).toBe(appOrigin)
  }
})

test('로그인 모바일 화면은 인증 흐름에 집중하고 가로 넘침이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({
    json: {
      auth_mode: 'dev',
      oidc_issuer: null,
      oidc_client_id: null,
      has_client_secret: false,
      command_palette_enabled: false,
      session_management_enabled: true,
      password_required: true,
    },
  }))
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Plan. Flow. Deliver. Together.' })).toBeVisible()
  const email = page.getByLabel('Email address')
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(email).not.toBeFocused()
  await expect(signIn).toBeEnabled()
  await signIn.click()
  await expect(page.getByRole('alert')).toContainText('Enter your email address.')
  await expect(email).toBeFocused()
  await expect(page.locator('.of-login-auth-card')).toHaveCSS('animation-name', 'none')
  const viewport = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(viewport.scrollWidth).toBe(viewport.clientWidth)
})

test('로그인 참조 UI는 8개 목표 뷰포트에서 넘침과 compact 충돌 없이 렌더링된다', async ({ page }) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({
    json: {
      auth_mode: 'dev',
      oidc_issuer: null,
      oidc_client_id: null,
      has_client_secret: false,
      command_palette_enabled: false,
      session_management_enabled: true,
      password_required: true,
    },
  }))
  const viewports = [
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '1448x1086', width: 1448, height: 1086 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1280x720', width: 1280, height: 720 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '390x844', width: 390, height: 844 },
  ]
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
    const storyArt = page.locator('.of-login-story-art')
    await expect(storyArt).toHaveAttribute(
      'src',
      /oneflow-login-origin-reference/,
    )
    await page.locator('.of-login-story-art, .of-login-brand-reference img').evaluateAll(
      async (images) => {
        await Promise.all(images.map((image) => (image as HTMLImageElement).decode()))
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      },
    )
    if (viewport.width >= 881) {
      const panel = await page.locator('.of-login-page').boundingBox()
      expect(panel).not.toBeNull()
      expect(panel!.width).toBeLessThanOrEqual(1221)
      expect(panel!.width).toBeLessThanOrEqual(viewport.width - 32)
      expect(Math.abs((panel!.width / panel!.height) - (4 / 3))).toBeLessThan(0.01)
      const geometry = await page.evaluate(() => {
        const box = (selector: string) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect()
          if (!rect) throw new Error(`Missing login element: ${selector}`)
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        }
        const story = box('.of-login-story')
        const auth = box('.of-login-auth')
        const card = box('.of-login-auth-card')
        const footer = box('.of-login-footer')
        return {
          splitGap: Math.abs(story.right - auth.left),
          cardInsideAuth:
            card.left >= auth.left && card.right <= auth.right &&
            card.top >= auth.top && card.bottom <= auth.bottom,
          footerInsideAuth:
            footer.left >= auth.left && footer.right <= auth.right &&
            footer.top >= auth.top && footer.bottom <= auth.bottom,
        }
      })
      expect(geometry.splitGap).toBeLessThan(1.5)
      expect(geometry.cardInsideAuth).toBe(true)
      expect(geometry.footerInsideAuth).toBe(true)
    }
    await expectNoHorizontalOverflow(page)
    await page.screenshot({
      path: `../../docs/screenshots/redevelopment/login-origin-fidelity-ui/${viewport.name}.png`,
      fullPage: true,
    })
  }
})

test('로그인 원본 비주얼과 흐르는 협업 경로 강조를 유지한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({
    json: {
      auth_mode: 'dev',
      oidc_issuer: null,
      oidc_client_id: null,
      has_client_secret: false,
      command_palette_enabled: false,
      session_management_enabled: true,
      password_required: true,
    },
  }))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  const storyArt = page.locator('.of-login-story-art')
  await expect(storyArt).toBeVisible()
  expect(await storyArt.evaluate((image) => ({
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight,
  }))).toEqual({ width: 1448, height: 1086 })
  const routeFlow = page.locator('.of-login-origin-route-accent path')
  await expect(routeFlow).toHaveCSS('animation-name', 'of-login-origin-route-flow')
  await expect(routeFlow).toHaveAttribute('d', /^M684 543C744/)
  await expect(routeFlow).toHaveCSS('stroke-dasharray', '24px, 360px')
  await expect(routeFlow).toHaveCSS('stroke-width', '2.6px')
  await expect(routeFlow).toHaveCSS('stroke', 'rgba(255, 255, 255, 0.34)')
  await expect(page.locator('.of-login-heading h2')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, -4, 0)',
  )
  const routeTimeBefore = await routeFlow.evaluate((element) =>
    Number(element.getAnimations()[0]?.currentTime ?? 0),
  )
  await page.waitForTimeout(120)
  const routeTimeAfter = await routeFlow.evaluate((element) =>
    Number(element.getAnimations()[0]?.currentTime ?? 0),
  )
  expect(routeTimeAfter).toBeGreaterThan(routeTimeBefore)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/login-origin-fidelity-ui/desktop.png',
    fullPage: true,
  })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(routeFlow).toHaveCSS('animation-name', 'none')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/login-origin-fidelity-ui/mobile.png',
    fullPage: true,
  })
})

test('Workspace popover가 실제 설정·멤버·로그아웃 흐름에 연결된다', async ({
  page,
}) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }))

  await page.goto('/projects')
  const workspaceTrigger = page.getByRole('button', { name: '워크스페이스 전환' })
  await workspaceTrigger.click()
  const workspaceMenu = page.getByRole('menu', { name: '워크스페이스' })
  const workspaceChevron = page.getByTestId('workspace-menu-chevron')
  await expect(workspaceChevron).toHaveCSS('rotate', '180deg')
  await expect(workspaceMenu).not.toHaveCSS('animation-name', 'none')
  await expect(workspaceMenu).toHaveCSS('animation-duration', '0.15s')
  await expect(workspaceMenu.getByText('OneFlow', { exact: true })).toBeVisible()
  await expect(workspaceMenu.getByText('dev@oneflow.local')).toBeVisible()
  await expect(workspaceMenu.getByText('관리자', { exact: true })).toBeVisible()
  await expect(workspaceMenu.getByRole('menuitem', { name: '워크스페이스 설정' })).toBeFocused()
  await page.waitForTimeout(200)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/shell-motion-fidelity-ui/workspace-menu.png',
  })
  await page.keyboard.press('Shift+Tab')
  await expect(workspaceMenu.getByRole('menuitem', { name: '로그아웃' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(workspaceMenu.getByRole('menuitem', { name: '워크스페이스 설정' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(workspaceTrigger).toBeFocused()
  await expect(workspaceChevron).toHaveCSS('rotate', 'none')
  await workspaceTrigger.click()
  await page.getByRole('button', { name: '워크스페이스 메뉴 닫기' }).click()
  await expect(workspaceMenu).toHaveCount(0)
  await workspaceTrigger.click()
  await workspaceMenu.getByRole('menuitem', { name: '워크스페이스 설정' }).click()
  await expect(page).toHaveURL('/admin/general')
  await expect(workspaceMenu).toHaveCount(0)

  await page.goto('/projects')
  await workspaceTrigger.click()
  await workspaceMenu.getByRole('menuitem', { name: '멤버 초대', exact: true }).click()
  await expect(page).toHaveURL('/admin/users?view=invites')
  await expect(workspaceMenu).toHaveCount(0)

  await page.goto('/projects')
  await workspaceTrigger.click()
  await expect(page.getByRole('menu', { name: '워크스페이스' }).getByLabel('현재 워크스페이스')).toContainText('OneFlow')

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/auth/logout'),
  )
  await page.getByRole('menu', { name: '워크스페이스' }).getByRole('menuitem', { name: '로그아웃' }).click()
  await post
  await expect(page).toHaveURL(/\/login/)
})

test('Workspace 초대는 브랜드 메뉴에서 생성·복사·회전·취소까지 동작한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          window.localStorage.setItem('__copied_workspace_invitation', value)
        },
      },
    })
  })
  await mockApi(page)
  await page.route('**/api/v1/users', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'me-1',
            email: 'dev@oneflow.local',
            display_name: 'Dev User',
            is_active: true,
            is_admin: true,
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  let version = 0
  let status: 'pending' | 'revoked' = 'pending'
  const invitation = {
    id: '90909090-9090-4090-8090-909090909090',
    email: 'new.member@example.com',
    display_name: '새 멤버',
    status: status as 'pending' | 'revoked',
    expires_at: '2026-07-24T00:00:00Z',
    accepted_at: null,
    revoked_at: null as string | null,
    version,
    created_at: '2026-07-17T00:00:00Z',
  }
  await page.route('**/api/v1/workspace-invitations**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/rotate')) {
      version += 1
      invitation.version = version
      await route.fulfill({ json: { ...invitation, token: `rotated-${'r'.repeat(36)}` } })
      return
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { email: string; display_name: string }
      expect(body).toEqual({ email: 'new.member@example.com', display_name: '새 멤버' })
      await route.fulfill({ status: 201, json: { ...invitation, token: `created-${'c'.repeat(36)}` } })
      return
    }
    if (request.method() === 'DELETE') {
      status = 'revoked'
      invitation.status = status
      invitation.revoked_at = '2026-07-17T01:00:00Z'
      invitation.version += 1
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ json: { items: [invitation], total: 1 } })
  })

  await page.goto('/projects')
  await page.getByRole('button', { name: '워크스페이스 전환' }).click()
  await page.getByRole('menuitem', { name: '멤버 초대', exact: true }).click()
  await expect(page).toHaveURL('/admin/users?view=invites')
  await expect(page.getByRole('heading', { name: '멤버 초대' })).toBeVisible()
  await page.getByLabel('초대 이메일').fill('new.member@example.com')
  await page.getByLabel('초대 사용자 이름').fill('새 멤버')
  await page.getByRole('button', { name: '링크 만들기' }).click()
  await expect(page.getByText('새 초대 링크가 발급되었습니다')).toBeVisible()
  await page.getByRole('button', { name: '링크 복사' }).click()
  await expect(page.getByRole('button', { name: '복사됨' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('__copied_workspace_invitation'))).toContain('/invite/created-')

  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '새 링크 발급' }).click()
  await expect(page.getByLabel('새 초대 링크')).toHaveValue(/\/invite\/rotated-/)
  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '초대 취소' }).click()
  await expect(page.getByText('취소됨', { exact: true }).first()).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-invitations-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/workspace-invitations-ui/mobile.png',
    fullPage: true,
  })
})

test('공개 초대 링크는 미리보기·일회성 수락 후 로그인 이메일을 인계한다', async ({ page }) => {
  const token = `invite-${'t'.repeat(40)}`
  await page.route('**/api/v1/workspace-invitations/preview', (route) =>
    route.fulfill({
      json: {
        display_name: '초대 사용자',
        masked_email: 'i******@example.com',
        status: 'pending',
        expires_at: '2026-07-24T00:00:00Z',
      },
    }),
  )
  await page.route('**/api/v1/workspace-invitations/accept', (route) =>
    route.fulfill({
      json: {
        email: 'invitee@example.com',
        display_name: '초대 사용자',
        login_path: '/login',
      },
    }),
  )
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        oidc_provider: null,
        oidc_providers: [],
        has_client_secret: false,
        command_palette_enabled: false,
        session_management_enabled: false,
        password_required: false,
        oidc_login_enabled: false,
      },
    }),
  )

  await page.goto(`/invite/${token}`)
  await expect(page.getByRole('heading', { name: 'OneFlow 워크스페이스 초대' })).toBeVisible()
  await expect(page.getByText('i******@example.com')).toBeVisible()
  await page.getByRole('button', { name: '초대 수락' }).click()
  await expect(page.getByRole('heading', { name: '워크스페이스에 참여했습니다' })).toBeVisible()
  await page.getByRole('button', { name: '로그인으로 이동' }).click()
  await expect(page).toHaveURL('/login?email=invitee%40example.com&invited=1')
  await expect(page.getByLabel('Email address')).toHaveValue('invitee@example.com')
  await expect(page.getByText('Your invitation has been accepted. Continue with your company sign-in method.')).toBeVisible()
})

test('shell motion은 reduced motion 환경에서 dock과 workspace 전환을 제거한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await page.goto('/projects')

  await page.getByRole('button', { name: '빠른 도구 열기' }).click()
  await expect(page.getByTestId('quick-dock-expanded')).toHaveCSS('animation-name', 'none')
  await expect(page.getByTestId('quick-dock-toggle-icon')).toHaveAttribute('data-phase', 'open')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '빠른 도구 열기' }).getByTestId('quick-dock-toggle-icon')).toHaveAttribute('data-phase', 'closed')

  const workspaceTrigger = page.getByRole('button', { name: '워크스페이스 전환' })
  await workspaceTrigger.click()
  await expect(page.getByRole('menu', { name: '워크스페이스' })).toHaveCSS('animation-name', 'none')
  await expect.poll(() => page.getByTestId('workspace-menu-chevron').evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration),
  )).toBeLessThanOrEqual(0.0001)
  await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' }).getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('dialog', { name: '워크스페이스 더 보기' })).toHaveCSS('animation-name', 'none')
})

test('일반 멤버 workspace popover는 관리자 action을 숨기고 개인 설정으로 이동한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) => route.fulfill({
    json: {
      id: 'member-1',
      email: 'member@oneflow.local',
      display_name: 'Member User',
      is_active: true,
      is_admin: false,
    },
  }))
  await page.goto('/projects')
  await page.getByRole('button', { name: '워크스페이스 전환' }).click()
  const menu = page.getByRole('menu', { name: '워크스페이스' })
  await expect(menu.getByText('멤버', { exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '멤버 초대 및 관리' })).toHaveCount(0)
  await menu.getByRole('menuitem', { name: '개인 설정' }).click()
  await expect(page).toHaveURL('/settings')
})

test('Topbar 계정 메뉴는 focus lifecycle과 개인 설정·로그아웃을 제공한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }))
  await page.goto('/projects')
  const trigger = page.getByLabel('계정 메뉴', { exact: true })
  await trigger.click()
  const menu = page.getByRole('menu', { name: '계정' })
  await expect(menu.getByRole('menuitem', { name: '개인 설정' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(menu.getByRole('menuitem', { name: '로그아웃' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('button', { name: '계정 메뉴 닫기' }).click()
  await expect(menu).toHaveCount(0)

  await trigger.click()
  await menu.getByRole('menuitem', { name: '개인 설정' }).click()
  await expect(page).toHaveURL('/settings')
  await page.goto('/projects')
  await trigger.click()
  const post = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/auth/logout'))
  await menu.getByRole('menuitem', { name: '로그아웃' }).click()
  await post
  await expect(page).toHaveURL(/\/login/)
})

test('Topbar 도움말은 실제 화면 이동, 단축키 안내, 단일 메뉴 lifecycle을 제공한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/projects')
  const helpTrigger = page.getByRole('button', { name: '도움말' })
  await helpTrigger.click()
  const helpMenu = page.getByRole('menu', { name: '도움말' })
  await expect(helpMenu.getByRole('menuitem', { name: '문서' })).toBeVisible()
  await expect(helpMenu.getByRole('menuitem', { name: '시스템 상태' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(helpTrigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(helpMenu.getByRole('menuitem', { name: '문서' })).toBeFocused()

  await page.getByRole('button', { name: '계정 메뉴' }).click()
  await expect(helpMenu).toHaveCount(0)
  await expect(page.getByRole('menu', { name: '계정' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: '계정' })).toHaveCount(0)
  await helpTrigger.click()
  await expect(helpMenu).toBeVisible()
  await page.getByRole('button', { name: '워크스페이스 전환' }).click()
  await expect(helpMenu).toHaveCount(0)
  await expect(page.getByRole('menu', { name: '워크스페이스' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: '워크스페이스' })).toHaveCount(0)
  await helpTrigger.click()

  await page.keyboard.press('Escape')
  await expect(helpTrigger).toBeFocused()
  await helpTrigger.click()
  await page.getByRole('main').click({ position: { x: 20, y: 200 } })
  await expect(helpMenu).toHaveCount(0)
  await helpTrigger.click()
  await helpMenu.getByRole('menuitem', { name: '키보드 단축키' }).click()
  const shortcuts = page.getByRole('dialog', { name: '키보드 단축키' })
  await expect(shortcuts.getByRole('button', { name: '키보드 단축키 닫기' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(shortcuts.getByRole('button', { name: '키보드 단축키 닫기' })).toBeFocused()
  await expect(shortcuts.getByText('Esc', { exact: true })).toBeVisible()
  await expect(shortcuts.getByText('⌘/Ctrl + K', { exact: true })).toHaveCount(0)
  await expect(shortcuts.getByText('/', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(helpTrigger).toBeFocused()

  await helpTrigger.click()
  await helpMenu.getByRole('menuitem', { name: '시스템 상태' }).click()
  await expect(page).toHaveURL('/status')
  await page.goto('/projects')
  await helpTrigger.click()
  await helpMenu.getByRole('menuitem', { name: '문서' }).click()
  await expect(page).toHaveURL('/wiki')

  await page.goto('/projects')
  await page.setViewportSize({ width: 1440, height: 960 })
  await helpTrigger.click()
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/topbar-help-ui/desktop-menu.png' })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await helpTrigger.click()
  await expectNoHorizontalOverflow(page)
  await expect(helpMenu).toHaveCSS('animation-name', 'none')
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/topbar-help-ui/mobile-menu.png' })
})

test('Topbar 도움말은 wiki 및 명령 팔레트 기능 설정을 정확히 반영한다', async ({ page }) => {
  await mockApi(page)
  await page.unroute('**/api/v1/workspace/capabilities')
  await page.route('**/api/v1/workspace/capabilities', (route) => route.fulfill({
    json: { ...defaultWorkspaceCapabilities, wiki: { enabled: false, revision: 1 } },
  }))
  await enableCommandPalette(page)
  await page.goto('/projects')
  const helpTrigger = page.getByRole('button', { name: '도움말' })
  await helpTrigger.click()
  const helpMenu = page.getByRole('menu', { name: '도움말' })
  await expect(helpMenu.getByRole('menuitem', { name: '문서' })).toHaveCount(0)
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)
  await helpMenu.getByRole('menuitem', { name: '키보드 단축키' }).click()
  const shortcuts = page.getByRole('dialog', { name: '키보드 단축키' })
  await page.keyboard.press('Control+K')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)
  await expect(shortcuts.getByText('⌘/Ctrl + K', { exact: true })).toBeVisible()
  await expect(shortcuts.getByText('/', { exact: true })).toBeVisible()
  await expect(shortcuts.getByText('Esc', { exact: true })).toBeVisible()
})

test('Get started는 실제 관리자 데이터의 완료 상태와 기존 화면 이동을 제공한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/users', (route) => route.fulfill({
    json: {
      items: [
        {
          id: 'me-1',
          email: 'dev@oneflow.local',
          display_name: 'Dev User',
          is_active: true,
          is_admin: true,
          created_at: '2026-07-01T00:00:00Z',
        },
        {
          id: 'user-2',
          email: 'teammate@oneflow.local',
          display_name: 'Team Mate',
          is_active: true,
          is_admin: false,
          created_at: '2026-07-02T00:00:00Z',
        },
      ],
      total: 2,
    },
  }))

  await page.goto('/projects')
  const trigger = page.getByRole('link', { name: '시작하기' })
  await trigger.click()
  await expect(page).toHaveURL('/get-started')
  await expect(trigger).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '업무를 시작할 준비가 되었습니다' })).toBeVisible()
  await expect(page.getByText('3/3 완료')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '시작하기 진행률' })).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByRole('button', { name: /프로젝트 열기/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /전체 작업 보기/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /사용자 관리/ })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/get-started-ui/desktop-complete.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('link', { name: '시작하기' })).toBeVisible()
  const teamAction = page.getByRole('button', { name: /사용자 관리/ })
  await teamAction.scrollIntoViewIfNeeded()
  await expect.poll(() => teamAction.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return hit === element || element.contains(hit)
  })).toBe(true)
  await page.screenshot({ path: '../../docs/screenshots/redevelopment/get-started-ui/mobile-complete.png' })

  await page.getByRole('button', { name: /전체 작업 보기/ }).click()
  await expect(page).toHaveURL('/work-items')
})

test('Get started는 일반 멤버에게 관리자 항목을 숨기고 프로젝트 생성 deep link를 연다', async ({ page }) => {
  await mockApi(page)
  let usersRequests = 0
  await page.route('**/api/v1/me', (route) => route.fulfill({
    json: {
      id: 'member-1',
      email: 'member@oneflow.local',
      display_name: 'Member User',
      is_active: true,
      is_admin: false,
    },
  }))
  await page.route('**/api/v1/users', (route) => {
    usersRequests += 1
    return route.fulfill({ status: 403, json: { detail: 'admin only' } })
  })
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies ProjectList }),
  )
  await page.route('**/api/v1/search/work-packages**', (route) =>
    route.fulfill({ json: { query: '', items: [], total: 0 } satisfies SearchResults }),
  )

  await page.goto('/get-started')
  await expect(page.getByText('0/2 완료')).toBeVisible()
  await expect(page.getByText('팀 구성', { exact: true })).toHaveCount(0)
  expect(usersRequests).toBe(0)
  await expect(page.getByRole('progressbar', { name: '시작하기 진행률' })).toHaveAttribute('aria-valuenow', '0')

  await page.getByRole('button', { name: /프로젝트 만들기/ }).click()
  await expect(page).toHaveURL('/projects?new=1')
  await expect(page.getByRole('form', { name: '새 프로젝트 생성' })).toBeVisible()
  await page.getByRole('button', { name: '취소' }).click()
  await expect(page).toHaveURL('/projects')
})

test('Get started는 query 오류를 미완료로 오인하지 않고 재시도한다', async ({ page }) => {
  await mockApi(page)
  let workItemsAttempts = 0
  let workItemsFail = true
  await page.route('**/api/v1/users', (route) => route.fulfill({
    json: {
      items: [
        { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true, is_admin: true, created_at: '2026-07-01T00:00:00Z' },
        { id: 'user-2', email: 'team@oneflow.local', display_name: 'Team User', is_active: true, is_admin: false, created_at: '2026-07-02T00:00:00Z' },
      ],
      total: 2,
    },
  }))
  await page.route('**/api/v1/search/work-packages**', (route) => {
    workItemsAttempts += 1
    if (workItemsFail) {
      return route.fulfill({ status: 503, json: { detail: 'temporary unavailable' } })
    }
    return route.fulfill({ json: allWorkItems })
  })

  await page.goto('/get-started')
  await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다', { timeout: 15_000 })
  await expect(page.getByText(/완료$/)).toHaveCount(0)
  workItemsFail = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('3/3 완료')).toBeVisible()
  expect(workItemsAttempts).toBeGreaterThanOrEqual(2)
})

test('Get started 팀 구성은 비활성 계정을 완료 인원으로 계산하지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/users', (route) => route.fulfill({
    json: {
      items: [
        { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true, is_admin: true, created_at: '2026-07-01T00:00:00Z' },
        { id: 'inactive-1', email: 'inactive@oneflow.local', display_name: 'Inactive User', is_active: false, is_admin: false, created_at: '2026-07-02T00:00:00Z' },
      ],
      total: 2,
    },
  }))

  await page.goto('/get-started')
  await expect(page.getByText('2/3 완료')).toBeVisible()
  const teamStep = page.getByRole('listitem').filter({ hasText: '팀 구성' })
  await expect(teamStep.getByText('할 일', { exact: true })).toBeVisible()
  await expect(teamStep.getByRole('button', { name: /사용자 추가/ })).toBeVisible()
})

test('관리자가 사용자 디렉터리에서 추가·비활성화를 수행한다', async ({ page }) => {
  await mockApi(page)
  const admin = {
    id: 'me-1',
    email: 'dev@oneflow.local',
    display_name: 'Dev User',
    is_active: true,
    is_admin: true,
    created_at: '2026-07-01T00:00:00Z',
  }
  const rookie = {
    id: 'u-b',
    email: 'b@corp.com',
    display_name: '신입',
    is_active: true,
    is_admin: false,
    created_at: '2026-07-02T00:00:00Z',
  }
  let directory = { items: [admin], total: 1 }
  await page.route('**/api/v1/users', (route) => {
    if (route.request().method() === 'POST') {
      directory = { items: [admin, rookie], total: 2 }
      return route.fulfill({ status: 201, json: rookie })
    }
    return route.fulfill({ json: directory })
  })
  await page.route('**/api/v1/users/u-b', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    const updated = { ...rookie, ...body }
    directory = { items: [admin, updated], total: 2 }
    return route.fulfill({ json: updated })
  })

  await page.goto('/projects')
  // The admin link is gated on /me.is_admin.
  await page
    .getByRole('navigation', { name: '글로벌 내비게이션' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible()
  await expect(page.getByText('dev@oneflow.local')).toBeVisible()

  // The last ACTIVE admin can be neither deactivated nor demoted.
  const adminRow = page.getByRole('row', { name: /Dev User/ })
  await expect(adminRow.getByRole('button', { name: '비활성화' })).toBeDisabled()
  await expect(adminRow.getByLabel('Dev User 관리자 권한')).toBeDisabled()

  await page.getByRole('button', { name: '새 사용자' }).click()
  await page.getByLabel('새 사용자 이메일').fill('b@corp.com')
  await page.getByLabel('새 사용자 이름').fill('신입')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/users'),
  )
  await page.getByRole('button', { name: '추가', exact: true }).click()
  const sent = (await post).postDataJSON() as { email: string; display_name: string }
  expect(sent).toEqual({ email: 'b@corp.com', display_name: '신입' })
  await expect(page.getByText('b@corp.com')).toBeVisible()

  // Deactivating the rookie sends is_active=false and the row flips state.
  const rookieRow = page.getByRole('row', { name: /신입/ })
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/api/v1/users/u-b'),
  )
  await rookieRow.getByRole('button', { name: '비활성화' }).click()
  expect(((await patch).postDataJSON() as { is_active: boolean }).is_active).toBe(false)
  await expect(rookieRow.getByText('비활성')).toBeVisible()
  await expect(rookieRow.getByRole('button', { name: '활성화' })).toBeVisible()
})

test('사용자 이름을 클릭하면 프로젝트 멤버십 패널이 열린다', async ({ page }) => {
  await mockApi(page)
  const admin = {
    id: 'me-1',
    email: 'dev@oneflow.local',
    display_name: 'Dev User',
    is_active: true,
    is_admin: true,
    created_at: '2026-07-01T00:00:00Z',
  }
  const target = {
    id: 'u-t',
    email: 't@corp.com',
    display_name: '퇴사자',
    is_active: false,
    is_admin: false,
    created_at: '2026-07-02T00:00:00Z',
  }
  await page.route('**/api/v1/users', (route) =>
    route.fulfill({ json: { items: [admin, target], total: 2 } }),
  )
  await page.route('**/api/v1/users/u-t/memberships', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            project_id: 'p-1',
            project_key: 'ONE',
            project_name: 'OneFlow 도입',
            role: 'member',
            archived: false,
          },
          {
            project_id: 'p-2',
            project_key: 'OLD',
            project_name: '종료 프로젝트',
            role: 'viewer',
            archived: true,
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto('/admin/users')
  const membershipsGet = page.waitForRequest((r) => r.url().includes('/users/u-t/memberships'))
  await page.getByRole('button', { name: '퇴사자' }).click()
  await membershipsGet
  const panel = page.getByLabel('프로젝트 멤버십')
  await expect(panel.getByText('OneFlow 도입')).toBeVisible()
  await expect(panel.getByText('· 멤버')).toBeVisible()
  await expect(panel.getByText('(아카이브)')).toBeVisible()
  // Toggle closed again.
  await page.getByRole('button', { name: '퇴사자' }).click()
  await expect(panel).toBeHidden()
})

test('사용자 디렉터리는 모바일에서 계정 카드와 멤버십을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const admin = {
    id: 'me-1',
    email: 'dev@oneflow.local',
    display_name: 'Dev User',
    is_active: true,
    is_admin: true,
    created_at: '2026-07-01T00:00:00Z',
  }
  const alex = {
    id: 'u-alex',
    email: 'alex@oneflow.local',
    display_name: 'Alex Kim',
    is_active: true,
    is_admin: false,
    created_at: '2026-07-02T00:00:00Z',
  }
  const oldUser = {
    id: 'u-old',
    email: 'old@oneflow.local',
    display_name: 'Old Member',
    is_active: false,
    is_admin: false,
    created_at: '2026-07-03T00:00:00Z',
  }
  await page.route('**/api/v1/users', (route) =>
    route.fulfill({ json: { items: [admin, alex, oldUser], total: 3 } }),
  )
  await page.route('**/api/v1/users/u-alex/memberships', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            project_id: project.id,
            project_key: project.key,
            project_name: project.name,
            role: 'member',
            archived: false,
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible()
  await expect(page.getByLabel('사용자 카드 목록')).toBeVisible()
  await expect(page.getByText('alex@oneflow.local')).toBeVisible()
  await expect(page.getByText('old@oneflow.local')).toBeVisible()

  await page.getByRole('button', { name: '관리자' }).click()
  await expect(page.getByText('dev@oneflow.local')).toBeVisible()
  await expect(page.getByText('alex@oneflow.local')).toBeHidden()
  await page.getByRole('button', { name: '전체', exact: true }).click()

  const membershipsGet = page.waitForRequest((r) => r.url().includes('/users/u-alex/memberships'))
  await page.getByRole('button', { name: 'Alex Kim' }).click()
  await membershipsGet
  const panel = page.getByLabel('프로젝트 멤버십')
  await expect(panel.getByText('OneFlow 도입')).toBeVisible()
  await expect(panel.getByText('· 멤버')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0))
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/user-directory-ui/mobile.png',
    fullPage: true,
  })
})

test('프로젝트 상태 보고를 저장하면 목록에 헬스 칩이 보인다', async ({ page }) => {
  await mockApi(page)
  const atRisk = {
    ...project,
    health: 'at_risk',
    health_note: '일정 지연',
    health_updated_by: 'me-1',
    health_updated_at: '2026-07-08T00:00:00Z',
  }
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { items: [{ ...atRisk, ...projectRollups }], total: 1 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ json: atRisk })
      return
    }
    await route.fulfill({ json: atRisk })
  })
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [{ user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' }],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  // The list shows the health chip with the note as its tooltip.
  await page.goto('/projects')
  await expect(page.getByText('주의', { exact: true })).toBeVisible()

  // The settings health section saves independently: null note trims away.
  await page.goto(`/projects/${project.id}/settings`)
  await page.getByLabel('프로젝트 상태').selectOption('off_track')
  await page.getByLabel('상태 사유').fill('차단 이슈')
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().endsWith(`/projects/${project.id}`),
  )
  await page.getByRole('button', { name: '상태 저장' }).click()
  const sent = (await patch).postDataJSON() as { health: string; health_note: string }
  expect(sent).toEqual({ health: 'off_track', health_note: '차단 이슈' })
  await expect(page.getByText('마지막 보고: 2026-07-08', { exact: false })).toBeVisible()
})


test('프로젝트 목록 정렬이 순서를 바꾸고 방향 토글이 동작한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [
          { ...project, ...projectRollups, id: 'p-a', key: 'AAA', name: '알파', overdue_count: 1 },
          { ...project, ...projectRollups, id: 'p-b', key: 'BBB', name: '베타', overdue_count: 5 },
        ],
        total: 2,
      },
    }),
  )
  await page.goto('/projects')
  const rows = page.getByRole('list', { name: '프로젝트 디렉터리' }).getByRole('listitem')
  await expect(rows.first()).toContainText('알파') // server order by default

  await page.getByLabel('프로젝트 정렬').selectOption('overdue_count')
  await page.getByLabel(/정렬 방향/).click() // asc → desc
  await expect(rows.first()).toContainText('베타') // 5 overdue first
  await page.getByLabel(/정렬 방향/).click() // back to asc
  await expect(rows.first()).toContainText('알파')
})

test('프로젝트 디렉터리 계정 설정을 불러오고 변경값을 다시 저장한다', async ({ page }) => {
  await mockApi(page)
  let stored = {
    columns: ['overdue_count'],
    sort_key: 'name',
    sort_direction: 'desc',
    layout: 'list',
    updated_at: '2026-07-14T00:00:00Z',
    is_default: false,
  }
  const writes: Array<Record<string, unknown>> = []
  await page.route('**/api/v1/me/project-directory-preferences', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as typeof writes[number]
      writes.push(body)
      stored = {
        columns: body.columns as string[],
        sort_key: body.sort_key as string,
        sort_direction: body.sort_direction as string,
        layout: body.layout as string,
        updated_at: '2026-07-14T00:01:00Z',
        is_default: false,
      }
    }
    await route.fulfill({ json: stored })
  })

  await page.goto('/projects')
  await expect(page.getByRole('button', { name: '목록 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByLabel('프로젝트 정렬')).toHaveValue('name')
  await page.getByRole('button', { name: '표시' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: '기한 초과 열 표시' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemcheckbox', { name: '멤버 열 표시' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-preferences-ui/desktop.png',
  })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '카드 보기' }).click()
  await expect.poll(() => writes.at(-1)?.layout).toBe('grid')
  expect(writes.at(-1)).toEqual({
    columns: ['overdue_count'],
    sort_key: 'name',
    sort_direction: 'desc',
    layout: 'grid',
  })

  await page.reload()
  await expect(page.getByRole('button', { name: '카드 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByLabel('프로젝트 정렬')).toHaveValue('name')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '표시' }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-preferences-ui/mobile.png',
    fullPage: true,
  })
})

test('프로젝트 디렉터리 저장은 화면 재진입 중에도 직렬화되어 마지막 조작을 보존한다', async ({
  page,
}) => {
  await mockApi(page)
  let stored = {
    columns: ['overdue_count'],
    sort_key: 'name',
    sort_direction: 'desc',
    layout: 'list',
    updated_at: '2026-07-14T00:00:00Z',
    is_default: false,
  }
  const writes: Array<Record<string, unknown>> = []
  let releaseFirst: (() => void) | undefined
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  await page.route('**/api/v1/me/project-directory-preferences', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      writes.push(body)
      if (writes.length === 1) await firstGate
      stored = {
        columns: body.columns as string[],
        sort_key: body.sort_key as string,
        sort_direction: body.sort_direction as string,
        layout: body.layout as string,
        updated_at: '2026-07-14T00:03:00Z',
        is_default: false,
      }
    }
    await route.fulfill({ json: stored })
  })

  await page.goto('/projects')
  await expect(page.getByRole('button', { name: '목록 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '카드 보기' }).click()
  await expect.poll(() => writes.length).toBe(1)

  const contextNav = page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' })
  await contextNav.getByRole('link', { name: '홈' }).click()
  await expect(page).toHaveURL('/my')
  await contextNav.getByRole('link', { name: '프로젝트', exact: true }).click()
  await expect(page).toHaveURL('/projects')
  await expect(page.getByRole('button', { name: '카드 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '목록 보기' }).click()
  await page.waitForTimeout(200)
  expect(writes).toHaveLength(1)

  releaseFirst?.()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]?.layout).toBe('list')
  await expect(page.getByRole('button', { name: '목록 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('프로젝트 디렉터리는 기존 로컬 설정을 한 번 승격하고 저장 실패를 최신 값으로 재시도한다', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('oneflow.projects.columns.v1', JSON.stringify(['member_count']))
    localStorage.setItem(
      'oneflow.projects.sort.v1',
      JSON.stringify({ key: 'member_count', dir: 'desc' }),
    )
    localStorage.setItem('oneflow.projects.layout.v1', 'list')
  })
  await mockApi(page)
  const writes: Array<Record<string, unknown>> = []
  let putCount = 0
  await page.route('**/api/v1/me/project-directory-preferences', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          columns: ['work_package_count', 'open_work_package_count', 'overdue_count', 'member_count'],
          sort_key: 'default',
          sort_direction: 'asc',
          layout: 'grid',
          updated_at: null,
          is_default: true,
        },
      })
      return
    }
    putCount += 1
    writes.push(route.request().postDataJSON() as Record<string, unknown>)
    if (putCount === 2) {
      await route.fulfill({ status: 503, json: { detail: 'temporarily unavailable' } })
      return
    }
    await route.fulfill({
      json: {
        ...writes.at(-1),
        updated_at: '2026-07-14T00:02:00Z',
        is_default: false,
      },
    })
  })

  await page.goto('/projects')
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({
    columns: ['member_count'],
    sort_key: 'member_count',
    sort_direction: 'desc',
    layout: 'list',
  })

  await page.getByRole('button', { name: '카드 보기' }).click()
  await expect(page.getByText('보기 설정 저장 실패')).toBeVisible()
  await expect(page.getByRole('button', { name: '카드 보기' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('status').getByRole('button', { name: '재시도' }).click()
  await expect.poll(() => writes.length).toBe(3)
  expect(writes[2]).toEqual({
    columns: ['member_count'],
    sort_key: 'member_count',
    sort_direction: 'desc',
    layout: 'grid',
  })
  await expect(page.getByText('보기 설정 저장 실패')).toHaveCount(0)
})


test('프로젝트 목록 이니셔티브 열을 켜면 칩이 보이고 클릭 시 하이라이트로 이동한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...project,
            ...projectRollups,
            initiatives: [{ id: 'ini-9', name: '플랫폼 전략' }],
            initiative_overflow: 2,
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'ini-9',
            name: '플랫폼 전략',
            description: null,
            owner_id: 'me-1',
            owner_name: 'Dev User',
            owner_active: true,
            state: 'in_progress',
            start_date: null,
            target_date: null,
            health: null,
            health_note: null,
            health_updated_by: null,
            health_updated_at: null,
            is_mine: true,
            can_claim_ownership: false,
            connected_project_count: 1,
            connected_work_item_count: 0,
            follower_count: 0,
            is_following: false,
            labels: [],
            projects: [],
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto('/projects')
  // Opt-in column (default off keeps the original look).
  await page.getByRole('button', { name: '표시' }).click()
  await page.getByRole('menuitemcheckbox', { name: '이니셔티브 열 표시' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '플랫폼 전략' })).toBeVisible()
  await expect(page.getByText('외 2')).toBeVisible()

  await page.getByRole('button', { name: '플랫폼 전략' }).click()
  await expect(page).toHaveURL(/\/initiatives\?highlight=ini-9/)
  // The target card carries the highlight ring.
  await expect(page.locator('li.ring-1', { hasText: '플랫폼 전략' })).toBeVisible()
})

test('프로젝트 cover는 디렉터리와 Overview를 공유하고 owner가 교체·제거한다', async ({ page }) => {
  await mockApi(page)
  let currentProject: Project = { ...project, cover_attachment_id: 'cover-old' }
  let rejectNextCover = false
  let commitThenAbortNextCover = false
  let cleanupCount = 0
  const coverPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPkndLBwMDAxAAGAA2bAS37E8jFAAAAAElFTkSuQmCC',
    'base64',
  )
  const dashboard = {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    health: 'on_track',
    health_note: '핵심 delivery가 계획대로 진행 중입니다.',
    archived_at: null,
    completion_percent: 50,
    recent_work_packages: [{
      id: wpA.id,
      subject: wpA.subject,
      status: wpA.status,
      priority: wpA.priority,
      assignee_name: 'Dev User',
      updated_at: wpA.updated_at,
    }],
    total_work_packages: 4,
    open_work_packages: 2,
    overdue_count: 1,
    status_counts: [],
    priority_counts: [],
    type_counts: [],
    total_estimated_hours: 24,
    total_spent_hours: 9,
    budget: null,
    total_cost: 0,
  }

  await page.route('**/api/v1/projects', (route) => route.fulfill({
    json: { items: [{ ...currentProject, ...projectRollups }], total: 1 },
  }))
  await page.route(`**/api/v1/projects/${project.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      if (commitThenAbortNextCover) {
        commitThenAbortNextCover = false
        const body = route.request().postDataJSON() as { cover_attachment_id: string | null }
        currentProject = { ...currentProject, cover_attachment_id: body.cover_attachment_id }
        await route.abort('connectionrefused')
        return
      }
      if (rejectNextCover) {
        rejectNextCover = false
        await route.fulfill({ status: 422, json: { detail: 'cover rejected' } })
        return
      }
      const body = route.request().postDataJSON() as { cover_attachment_id: string | null }
      currentProject = { ...currentProject, cover_attachment_id: body.cover_attachment_id }
      await route.fulfill({ json: currentProject })
      return
    }
    await route.fulfill({ json: currentProject })
  })
  await page.route(`**/api/v1/projects/${project.id}/dashboard`, (route) =>
    route.fulfill({ json: dashboard }),
  )
  await page.route(`**/api/v1/projects/${project.id}/activities**`, (route) =>
    route.fulfill({ json: { items: [], total: 0, truncated: false } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/attachments/upload**`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        id: 'cover-new', project_id: project.id, work_package_id: null, document_id: null,
        filename: 'new-cover.png', content_type: 'image/png', size_bytes: coverPng.length,
        url: 'oneflow://attachments/cover-new', has_file: true, uploaded_by: 'me-1',
        created_at: '2026-07-13T00:00:00Z',
      },
    }),
  )
  await page.route('**/api/v1/attachments/*/download', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: coverPng }),
  )
  await page.route('**/api/v1/attachments/cover-new', (route) => {
    cleanupCount += 1
    return route.fulfill({ status: 204, body: '' })
  })

  await page.goto('/projects')
  const frame = page.getByTestId('frame-context-bar')
  await expect(frame.getByText('프로젝트', { exact: true })).toBeVisible()
  await expect(frame).toContainText('워크스페이스 디렉터리 · 1개 프로젝트')
  await expect(page.getByAltText(`${project.name} 표지`)).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-cover-overview-ui/directory.png',
  })

  await page.getByRole('link', { name: `${project.name} Overview 열기` }).click()
  await expect(page).toHaveURL(`/projects/${project.id}/overview`)
  await expect(frame.getByText('Overview', { exact: true })).toBeVisible()
  await expect(frame.getByRole('navigation', { name: '현재 위치' }).getByRole('link', { name: '프로젝트' })).toHaveAttribute('href', '/projects')
  await expect(page.getByRole('region', { name: '프로젝트 진행 요약' })).toContainText('완료율')
  await expect(page.getByRole('region', { name: '프로젝트 진행 요약' })).toContainText('50%')
  await expect(page.getByRole('region', { name: '최근 작업' })).toContainText(wpA.subject)

  await page.getByRole('button', { name: '표지 변경' }).click()
  const dialog = page.getByRole('dialog', { name: '프로젝트 표지' })
  await expect(dialog).toBeVisible()
  const uploadRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/attachments/upload'),
  )
  const coverPatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/projects/${project.id}`),
  )
  await dialog.getByLabel('프로젝트 표지 파일').setInputFiles({
    name: 'new-cover.png',
    mimeType: 'image/png',
    buffer: coverPng,
  })
  await uploadRequest
  expect((await coverPatch).postDataJSON()).toEqual({ cover_attachment_id: 'cover-new' })
  await expect(dialog).toHaveCount(0)
  await expect(page.getByAltText(`${project.name} 표지`)).toHaveAttribute('src', /cover-new\/download$/)
  await page.waitForTimeout(250)

  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-cover-overview-ui/overview-desktop.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-cover-overview-ui/overview-mobile.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '표지 변경' }).click()
  const removePatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/projects/${project.id}`),
  )
  await page.getByRole('button', { name: '표지 제거' }).click()
  expect((await removePatch).postDataJSON()).toEqual({ cover_attachment_id: null })
  await expect(page.getByAltText(`${project.name} 표지`)).toHaveCount(0)

  await page.getByRole('button', { name: '표지 변경' }).click()
  rejectNextCover = true
  const cleanupRequest = page.waitForRequest(
    (request) => request.method() === 'DELETE' && request.url().endsWith('/attachments/cover-new'),
  )
  await page.getByRole('dialog', { name: '프로젝트 표지' }).getByLabel('프로젝트 표지 파일').setInputFiles({
    name: 'rejected-cover.png',
    mimeType: 'image/png',
    buffer: coverPng,
  })
  await cleanupRequest
  await expect(page.getByRole('dialog', { name: '프로젝트 표지' }).getByRole('alert')).toContainText('cover rejected')

  commitThenAbortNextCover = true
  await page.getByRole('dialog', { name: '프로젝트 표지' }).getByLabel('프로젝트 표지 파일').setInputFiles({
    name: 'committed-cover.png',
    mimeType: 'image/png',
    buffer: coverPng,
  })
  await expect(page.getByRole('dialog', { name: '프로젝트 표지' })).toHaveCount(0)
  await expect(page.getByAltText(`${project.name} 표지`)).toHaveAttribute('src', /cover-new\/download$/)
  expect(cleanupCount).toBe(1)
})

test('프로젝트 일정 기준선은 저장·변동 비교·갱신·삭제까지 실제 요청으로 이어진다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await mockProjectOverview(page)

  const empty: ProjectScheduleBaselineSummary = {
    baseline: null,
    total_snapshot: 0,
    current_total: 4,
    unchanged: 0,
    later: 0,
    earlier: 0,
    unscheduled: 0,
    rescheduled: 0,
    added: 0,
    removed: 0,
    changed_total: 0,
    items: [],
    items_truncated: false,
  }
  const unchanged: ProjectScheduleBaselineSummary = {
    ...empty,
    baseline: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      version: 0,
      captured_at: '2026-07-17T04:00:00Z',
      captured_by_user_id: 'me-1',
    },
    total_snapshot: 4,
    unchanged: 4,
  }
  const changed: ProjectScheduleBaselineSummary = {
    ...unchanged,
    current_total: 5,
    unchanged: 1,
    later: 1,
    earlier: 1,
    unscheduled: 1,
    added: 1,
    changed_total: 4,
    items: [
      {
        work_package_id: wpA.id,
        subject: '배포 일정 조정',
        state: 'later',
        variance_days: 3,
        baseline_start_date: '2026-07-01',
        baseline_due_date: '2026-07-15',
        current_start_date: '2026-07-01',
        current_due_date: '2026-07-18',
      },
      {
        work_package_id: wpB.id,
        subject: '디자인 검토',
        state: 'earlier',
        variance_days: -2,
        baseline_start_date: '2026-07-08',
        baseline_due_date: '2026-07-20',
        current_start_date: '2026-07-08',
        current_due_date: '2026-07-18',
      },
      {
        work_package_id: '44444444-4444-4444-8444-444444444444',
        subject: '범위 재검토',
        state: 'unscheduled',
        variance_days: null,
        baseline_start_date: '2026-07-10',
        baseline_due_date: '2026-07-25',
        current_start_date: null,
        current_due_date: null,
      },
      {
        work_package_id: '55555555-5555-4555-8555-555555555555',
        subject: '신규 운영 점검',
        state: 'added',
        variance_days: null,
        baseline_start_date: null,
        baseline_due_date: null,
        current_start_date: '2026-07-22',
        current_due_date: '2026-07-24',
      },
    ],
  }
  let current = empty
  let rejectDeleteOnce = true
  const writes: Array<{ method: string; expectedVersion: number | null }> = []

  await page.route(`**/api/v1/projects/${project.id}/schedule-baseline**`, async (route) => {
    const request = route.request()
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { expected_version: number | null }
      writes.push({ method: 'PUT', expectedVersion: body.expected_version })
      current = body.expected_version === null
        ? unchanged
        : {
            ...unchanged,
            baseline: { ...unchanged.baseline!, version: body.expected_version + 1 },
          }
      await route.fulfill({ json: current })
      return
    }
    if (request.method() === 'DELETE') {
      const expectedVersion = Number(new URL(request.url()).searchParams.get('expected_version'))
      writes.push({ method: 'DELETE', expectedVersion })
      if (rejectDeleteOnce) {
        rejectDeleteOnce = false
        await route.fulfill({ status: 409, json: { detail: 'schedule baseline version conflict' } })
        return
      }
      current = empty
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({ json: current })
  })

  await page.goto(`/projects/${project.id}/overview`)
  const panel = page.getByRole('region', { name: '프로젝트 일정 기준선' })
  await expect(panel).toContainText('현재 4개 작업')
  await panel.getByRole('button', { name: '현재 일정 저장' }).click()
  await expect(panel).toContainText('기준선 이후 일정 변경이 없습니다.')
  expect(writes.at(-1)).toEqual({ method: 'PUT', expectedVersion: null })

  current = changed
  await page.reload()
  await expect(panel).toContainText('전체 변동')
  await expect(panel).toContainText('4')
  await expect(panel.getByRole('link', { name: '배포 일정 조정' })).toHaveAttribute(
    'href',
    `/projects/${project.id}/work-packages?wp=${wpA.id}`,
  )
  await expect(panel).toContainText('지연 +3일')
  await expect(panel).toContainText('앞당김 -2일')
  await expect(panel).toContainText('일정 제거')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-schedule-baseline-ui/desktop.png',
    fullPage: true,
  })

  await panel.getByRole('button', { name: '현재 일정으로 갱신' }).click()
  await expect(panel).toContainText('기준선 이후 일정 변경이 없습니다.')
  expect(writes.at(-1)).toEqual({ method: 'PUT', expectedVersion: 0 })

  await panel.getByRole('button', { name: '일정 기준선 삭제' }).click()
  const dialog = page.getByRole('dialog', { name: '일정 기준선 삭제' })
  await expect(dialog).toContainText('현재 작업 일정은 바뀌지 않습니다.')
  await dialog.getByRole('button', { name: '기준선 삭제' }).click()
  await expect(dialog.getByRole('alert')).toContainText('다른 변경이 먼저 저장되었습니다')
  await dialog.getByRole('button', { name: '기준선 삭제' }).click()
  await expect(panel).toContainText('아직 저장된 기준 일정이 없습니다.')
  expect(writes.at(-1)).toEqual({ method: 'DELETE', expectedVersion: 1 })

  current = changed
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const mobilePanel = page.getByRole('region', { name: '프로젝트 일정 기준선' })
  await expect(mobilePanel).toContainText('지연 +3일')
  await expectNoHorizontalOverflow(page)
  await mobilePanel.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-schedule-baseline-ui/mobile.png',
    fullPage: true,
  })
})

test('프로젝트 Overview 상태 보고 이력은 전환과 작성자를 최신순으로 표시한다', async ({ page }) => {
  await mockApi(page)
  const dashboard = {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    health: 'off_track',
    health_note: '배포 차단을 우선 해소합니다.',
    archived_at: null,
    completion_percent: 40,
    recent_work_packages: [],
    total_work_packages: 5,
    open_work_packages: 3,
    overdue_count: 1,
    status_counts: [],
    priority_counts: [],
    type_counts: [],
    total_estimated_hours: 32,
    total_spent_hours: 14,
    budget: null,
    total_cost: 0,
  }
  const healthHistory: ProjectHealthHistoryList = {
    items: [
      {
        id: 'history-3',
        project_id: project.id,
        previous_health: 'at_risk',
        previous_note: '일정 변동을 확인합니다.',
        health: 'off_track',
        note: '배포 차단을 우선 해소합니다.',
        changed_by: 'me-1',
        changed_by_name: 'Dev User',
        created_at: '2026-07-14T08:30:00Z',
      },
      {
        id: 'history-2',
        project_id: project.id,
        previous_health: 'on_track',
        previous_note: '계획대로 진행 중입니다.',
        health: 'at_risk',
        note: '일정 변동을 확인합니다.',
        changed_by: null,
        changed_by_name: null,
        created_at: '2026-07-13T05:00:00Z',
      },
      {
        id: 'history-1',
        project_id: project.id,
        previous_health: null,
        previous_note: null,
        health: 'on_track',
        note: null,
        changed_by: 'u-alex',
        changed_by_name: 'Alex Kim',
        created_at: '2026-07-12T03:00:00Z',
      },
    ],
    total: 24,
  }

  await page.route(`**/api/v1/projects/${project.id}/dashboard`, (route) =>
    route.fulfill({ json: dashboard }),
  )
  await page.route(`**/api/v1/projects/${project.id}/activities**`, (route) =>
    route.fulfill({ json: { items: [], total: 0, truncated: false } }),
  )
  await page.route('**/api/v1/projects/*/health-history**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({ json: healthHistory })
  })

  await page.goto(`/projects/${project.id}/overview`)
  await expect(page.getByRole('status', { name: '상태 이력 불러오는 중' })).toBeVisible()
  const timeline = page.getByRole('region', { name: '프로젝트 상태 보고 이력' })
  await expect(timeline).toContainText('24건')
  await expect(timeline.locator('li').first()).toContainText('배포 차단을 우선 해소합니다.')
  await expect(timeline.locator('li').first()).toContainText('Dev User')
  await expect(timeline).toContainText('이전 구성원')
  await expect(timeline).toContainText('메모 없이 상태만 변경했습니다.')
  await expect(timeline).toContainText('최신 3개를 표시합니다.')
  await expect(timeline.locator('li').nth(0)).toContainText('위험')
  await expect(timeline.locator('li').nth(1)).toContainText('주의')

  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-health-history-ui/desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await timeline.screenshot({
    path: '../../docs/screenshots/redevelopment/project-health-history-ui/mobile.png',
  })
})

test('프로젝트 상태 보고 이력은 오류를 알리고 재시도 뒤 빈 상태를 표시한다', async ({ page }) => {
  await mockApi(page)
  let shouldFail = true
  const dashboard = {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    health: null,
    health_note: null,
    archived_at: null,
    completion_percent: 0,
    recent_work_packages: [],
    total_work_packages: 0,
    open_work_packages: 0,
    overdue_count: 0,
    status_counts: [],
    priority_counts: [],
    type_counts: [],
    total_estimated_hours: 0,
    total_spent_hours: 0,
    budget: null,
    total_cost: 0,
  }

  await page.route(`**/api/v1/projects/${project.id}/dashboard`, (route) =>
    route.fulfill({ json: dashboard }),
  )
  await page.route(`**/api/v1/projects/${project.id}/activities**`, (route) =>
    route.fulfill({ json: { items: [], total: 0, truncated: false } }),
  )
  await page.route('**/api/v1/projects/*/health-history**', (route) =>
    shouldFail
      ? route.fulfill({ status: 500, json: { detail: 'history unavailable' } })
      : route.fulfill({ json: { items: [], total: 0 } satisfies ProjectHealthHistoryList }),
  )

  await page.goto(`/projects/${project.id}/overview`)
  const timeline = page.getByRole('region', { name: '프로젝트 상태 보고 이력' })
  await expect(timeline.getByRole('alert')).toContainText('불러오지 못했습니다')
  shouldFail = false
  await timeline.getByRole('button', { name: '재시도' }).click()
  await expect(timeline).toContainText('아직 기록된 상태 보고가 없습니다.')
  await expect(timeline).toContainText('0건')
})

test('프로젝트 소유자는 단계를 편집하고 Overview에서 현재 수명주기를 확인한다', async ({ page }) => {
  await mockApi(page)
  await mockProjectOverview(page)
  const discoverStart = localDateOffset(-14)
  const discoverEnd = localDateOffset(-7)
  const planStart = localDateOffset(-2)
  const updatedPlanStart = localDateOffset(-1)
  const planEnd = localDateOffset(7)
  const updatedPlanEnd = localDateOffset(9)
  const deliverStart = localDateOffset(8)
  const deliverEnd = localDateOffset(30)
  const updatedDeliverStart = nextWorkingDate(updatedPlanEnd)
  const updatedDeliverEnd = addWorkingDays(
    updatedDeliverStart,
    workingDaysInclusive(deliverStart, deliverEnd) - 1,
  )
  let phases: ProjectPhaseList = {
    items: [
      {
        key: 'discover',
        name: '발견',
        color: 'sky',
        position: 0,
        active: true,
        start_date: discoverStart,
        end_date: discoverEnd,
        start_gate: { kind: 'start', name: '발견 시작 게이트', active: true, date: discoverStart },
        finish_gate: { kind: 'finish', name: '발견 완료 게이트', active: true, date: discoverEnd },
        version: 1,
        retired: false,
        built_in: true,
      },
      {
        key: 'plan',
        name: '계획',
        color: 'indigo',
        position: 1,
        active: true,
        start_date: planStart,
        end_date: planEnd,
        start_gate: { kind: 'start', name: '계획 시작 게이트', active: true, date: planStart },
        finish_gate: { kind: 'finish', name: '계획 완료 게이트', active: false, date: null },
        version: 1,
        retired: false,
        built_in: true,
      },
      {
        key: 'deliver',
        name: '실행',
        color: 'emerald',
        position: 2,
        active: true,
        start_date: deliverStart,
        end_date: deliverEnd,
        start_gate: { kind: 'start', name: '실행 시작 게이트', active: false, date: null },
        finish_gate: { kind: 'finish', name: '실행 완료 게이트', active: true, date: deliverEnd },
        version: 1,
        retired: false,
        built_in: true,
      },
      {
        key: 'close',
        name: '마감',
        color: 'amber',
        position: 3,
        active: false,
        start_date: null,
        end_date: null,
        start_gate: { kind: 'start', name: '마감 시작 게이트', active: false, date: null },
        finish_gate: { kind: 'finish', name: '마감 완료 게이트', active: false, date: null },
        version: 0,
        retired: false,
        built_in: true,
      },
    ],
    total: 4,
  }
  const updates: Array<{
    active?: boolean
    start_gate_active?: boolean
    finish_gate_active?: boolean
    start_date?: string | null
    end_date?: string | null
    version: number
  }> = []
  await page.route('**/api/v1/projects/*/phases**', async (route) => {
    const request = route.request()
    if (request.method() === 'PATCH') {
      const key = new URL(request.url()).pathname.split('/').at(-1)
      const body = request.postDataJSON() as {
        active?: boolean
        start_gate_active?: boolean
        finish_gate_active?: boolean
        start_date?: string | null
        end_date?: string | null
        version: number
      }
      const index = phases.items.findIndex((phase) => phase.key === key)
      const current = phases.items[index]
      if (!current || current.version !== body.version) {
        await route.fulfill({ status: 409, json: { detail: 'phase version conflict' } })
        return
      }
      updates.push(body)
      const active = body.active ?? current.active
      const startDate = body.start_date === undefined ? current.start_date : body.start_date
      const endDate = body.end_date === undefined ? current.end_date : body.end_date
      const startGateActive = body.start_gate_active ?? current.start_gate.active
      const finishGateActive = body.finish_gate_active ?? current.finish_gate.active
      const updated: ProjectPhase = {
        ...current,
        active,
        start_date: startDate,
        end_date: endDate,
        start_gate: {
          ...current.start_gate,
          active: startGateActive,
          date: active && startGateActive ? startDate : null,
        },
        finish_gate: {
          ...current.finish_gate,
          active: finishGateActive,
          date: active && finishGateActive ? endDate : null,
        },
        version: current.version + 1,
      }
      let nextItems = phases.items.map((phase, itemIndex) => (itemIndex === index ? updated : phase))
      if (key === 'plan' && body.end_date !== undefined && body.end_date !== current.end_date) {
        nextItems = nextItems.map((phase) => phase.key === 'deliver' ? {
          ...phase,
          start_date: updatedDeliverStart,
          end_date: updatedDeliverEnd,
          finish_gate: { ...phase.finish_gate, date: updatedDeliverEnd },
          version: phase.version + 1,
        } : phase)
      }
      phases = {
        ...phases,
        items: nextItems,
      }
      await route.fulfill({ json: updated })
      return
    }
    await route.fulfill({ json: phases })
  })

  await page.goto(`/projects/${project.id}/settings?tab=lifecycle`)
  const panel = page.getByRole('region', { name: '프로젝트 단계 설정' })
  await expect(panel).toContainText('활성 3/4')
  const planRow = panel.locator('li').filter({ hasText: '계획' })
  await planRow.getByLabel('계획 시작일').fill(updatedPlanStart)
  const datePatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/phases/plan'),
  )
  await planRow.getByRole('button', { name: '저장' }).click()
  expect((await datePatch).postDataJSON()).toEqual({
    start_date: updatedPlanStart,
    end_date: planEnd,
    version: 1,
  })
  await expect(planRow.getByRole('button', { name: '저장' })).toBeDisabled()
  await expect(planRow.getByRole('status')).toHaveCount(0)

  const finishGatePatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/phases/plan'),
  )
  await planRow.getByRole('switch', { name: '계획 완료 게이트 활성화' }).click()
  expect((await finishGatePatch).postDataJSON()).toEqual({ finish_gate_active: true, version: 2 })
  await expect(planRow.getByRole('switch', { name: '계획 완료 게이트 비활성화' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  await planRow.getByLabel('계획 종료일').fill(updatedPlanEnd)
  const schedulePatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/phases/plan'),
  )
  await planRow.getByRole('button', { name: '저장' }).click()
  expect((await schedulePatch).postDataJSON()).toEqual({
    start_date: updatedPlanStart,
    end_date: updatedPlanEnd,
    version: 3,
  })
  await expect(planRow.getByRole('status')).toContainText('후속 활성 단계에 근무일 규칙을 적용했습니다')
  const deliverRow = panel.locator('li').filter({ hasText: '실행' })
  await expect(deliverRow.getByLabel('실행 시작일')).toHaveValue(updatedDeliverStart)
  await expect(deliverRow.getByLabel('실행 종료일')).toHaveValue(updatedDeliverEnd)

  const closeSwitch = panel.getByRole('switch', { name: '마감 단계 활성화' })
  await closeSwitch.click()
  await expect(panel.getByRole('switch', { name: '마감 단계 비활성화' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  expect(updates.at(-1)).toEqual({ active: true, version: 0 })
  await expect(panel).toContainText('활성 4/4')
  await page.locator('[data-shell-scroll-region]').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-phase-working-days-ui/settings-desktop.png',
    fullPage: true,
  })

  await page.goto(`/projects/${project.id}/overview`)
  const timeline = page.getByRole('region', { name: '프로젝트 수명주기' })
  const phaseRows = timeline.locator('ol > li')
  await expect(timeline).toContainText('4단계')
  await expect(phaseRows.filter({ hasText: '발견' })).toContainText('완료')
  await expect(phaseRows.filter({ hasText: '계획' })).toContainText('현재 단계')
  await expect(phaseRows.filter({ hasText: '계획' })).toContainText('계획 완료 게이트')
  await expect(phaseRows.filter({ hasText: '계획' })).toContainText(updatedPlanEnd)
  await expect(phaseRows.filter({ hasText: '실행' })).toContainText('예정')
  await expect(phaseRows.filter({ hasText: '실행' })).toContainText(updatedDeliverStart)
  await expect(phaseRows.filter({ hasText: '마감' })).toContainText('일정 필요')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-phase-working-days-ui/overview-desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-phase-working-days-ui/overview-mobile.png',
    fullPage: true,
  })
})

test('프로젝트 단계 설정은 오류 재시도 후 멤버에게 읽기 전용으로 열린다', async ({ page }) => {
  await mockApi(page)
  let shouldFail = true
  const memberPhases: ProjectPhaseList = {
    items: inactiveProjectPhases.items.map((phase, index) => ({
      ...phase,
      active: index === 0,
      start_date: index === 0 ? '2026-07-01' : null,
      end_date: index === 0 ? '2026-07-05' : null,
      start_gate: {
        ...phase.start_gate,
        active: index === 0,
        date: index === 0 ? '2026-07-01' : null,
      },
      finish_gate: {
        ...phase.finish_gate,
        active: index === 0,
        date: index === 0 ? '2026-07-05' : null,
      },
      version: index === 0 ? 1 : 0,
    })),
    total: 4,
  }
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            user_id: 'me-1',
            email: 'dev@oneflow.local',
            display_name: 'Dev User',
            role: 'member',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/projects/*/phases**', (route) =>
    shouldFail
      ? route.fulfill({ status: 500, json: { detail: 'phase unavailable' } })
      : route.fulfill({ json: memberPhases }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=lifecycle`)
  await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다')
  shouldFail = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  const panel = page.getByRole('region', { name: '프로젝트 단계 설정' })
  await expect(panel).toContainText('읽기 전용')
  await expect(panel.getByRole('switch')).toHaveCount(12)
  for (const control of await panel.getByRole('switch').all()) {
    await expect(control).toBeDisabled()
  }
  await expect(panel.getByRole('button', { name: '저장' })).toHaveCount(0)
})

test('저장된 단계 활성화는 근무일 일정 재배치와 보존 결과를 구분해 알린다', async ({ page }) => {
  await mockApi(page)
  let phases: ProjectPhaseList = {
    items: [
      {
        key: 'discover',
        name: '발견',
        color: 'sky',
        position: 0,
        active: true,
        start_date: '2026-07-13',
        end_date: '2026-07-17',
        start_gate: { kind: 'start', name: '발견 시작 게이트', active: false, date: null },
        finish_gate: { kind: 'finish', name: '발견 완료 게이트', active: false, date: null },
        version: 1,
        retired: false,
        built_in: true,
      },
      {
        key: 'plan',
        name: '계획',
        color: 'indigo',
        position: 1,
        active: false,
        start_date: '2026-07-13',
        end_date: '2026-07-17',
        start_gate: { kind: 'start', name: '계획 시작 게이트', active: false, date: null },
        finish_gate: { kind: 'finish', name: '계획 완료 게이트', active: false, date: null },
        version: 1,
        retired: false,
        built_in: true,
      },
      {
        key: 'deliver',
        name: '실행',
        color: 'emerald',
        position: 2,
        active: true,
        start_date: '2026-07-20',
        end_date: '2026-07-22',
        start_gate: { kind: 'start', name: '실행 시작 게이트', active: false, date: null },
        finish_gate: { kind: 'finish', name: '실행 완료 게이트', active: false, date: null },
        version: 1,
        retired: false,
        built_in: true,
      },
      {
        key: 'close',
        name: '마감',
        color: 'amber',
        position: 3,
        active: false,
        start_date: '2026-08-03',
        end_date: null,
        start_gate: { kind: 'start', name: '마감 시작 게이트', active: false, date: null },
        finish_gate: { kind: 'finish', name: '마감 완료 게이트', active: false, date: null },
        version: 1,
        retired: false,
        built_in: true,
      },
    ],
    total: 4,
  }
  await page.route('**/api/v1/projects/*/phases**', async (route) => {
    const request = route.request()
    if (request.method() !== 'PATCH') {
      await route.fulfill({ json: phases })
      return
    }
    const key = new URL(request.url()).pathname.split('/').at(-1)
    const body = request.postDataJSON() as { active: boolean; version: number }
    const index = phases.items.findIndex((phase) => phase.key === key)
    const current = phases.items[index]
    if (!current || current.version !== body.version) {
      await route.fulfill({ status: 409, json: { detail: 'phase version conflict' } })
      return
    }
    const updated: ProjectPhase = key === 'plan'
      ? {
          ...current,
          active: true,
          start_date: '2026-07-20',
          end_date: '2026-07-24',
          version: 2,
        }
      : { ...current, active: true, version: 2 }
    let nextItems = phases.items.map((phase, itemIndex) => itemIndex === index ? updated : phase)
    if (key === 'plan') {
      nextItems = nextItems.map((phase) => phase.key === 'deliver'
        ? { ...phase, start_date: '2026-07-27', end_date: '2026-07-29', version: 2 }
        : phase)
    }
    phases = { ...phases, items: nextItems }
    await route.fulfill({ json: updated })
  })

  await page.goto(`/projects/${project.id}/settings?tab=lifecycle`)
  const panel = page.getByRole('region', { name: '프로젝트 단계 설정' })
  await expect(panel).toContainText('워크스페이스 근무일 자동 일정')
  const planRow = panel.locator('li').filter({ hasText: '계획' })
  const planPatch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/phases/plan'),
  )
  await planRow.getByRole('switch', { name: '계획 단계 활성화' }).click()
  expect((await planPatch).postDataJSON()).toEqual({ active: true, version: 1 })
  await expect(planRow.getByRole('status')).toContainText('다음 근무일로 재배치했습니다')
  await expect(planRow.getByLabel('계획 시작일')).toHaveValue('2026-07-20')
  await expect(planRow.getByLabel('계획 종료일')).toHaveValue('2026-07-24')
  const deliverRow = panel.locator('li').filter({ hasText: '실행' })
  await expect(deliverRow.getByLabel('실행 시작일')).toHaveValue('2026-07-27')
  await expect(deliverRow.getByLabel('실행 종료일')).toHaveValue('2026-07-29')

  const closeRow = panel.locator('li').filter({ hasText: '마감' })
  await closeRow.getByRole('switch', { name: '마감 단계 활성화' }).click()
  await expect(closeRow.getByRole('status')).toContainText('저장된 날짜는 변경되지 않았습니다')
  await expect(closeRow.getByLabel('마감 시작일')).toHaveValue('2026-08-03')

  await page.locator('[data-shell-scroll-region]').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-phase-activation-ui/settings-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-shell-scroll-region]').evaluate((element) => element.scrollTo({ top: 0 }))
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-phase-activation-ui/settings-mobile.png',
    fullPage: true,
  })
})

test('Overview 단계 오류는 재시도할 수 있고 모든 단계가 비활성이면 표면을 숨긴다', async ({
  page,
}) => {
  await mockApi(page)
  await mockProjectOverview(page)
  let shouldFail = true
  await page.route('**/api/v1/projects/*/phases**', (route) =>
    shouldFail
      ? route.fulfill({ status: 500, json: { detail: 'phase unavailable' } })
      : route.fulfill({ json: inactiveProjectPhases }),
  )

  await page.goto(`/projects/${project.id}/overview`)
  const timeline = page.getByRole('region', { name: '프로젝트 수명주기' })
  await expect(timeline.getByRole('alert')).toContainText('불러오지 못했습니다')
  shouldFail = false
  await timeline.getByRole('button', { name: '재시도' }).click()
  await expect(timeline).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoHorizontalOverflow(page)
})

test('손상된 프로젝트 cover 이미지는 깨진 이미지 대신 fallback visual을 표시한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) => route.fulfill({
    json: {
      items: [{ ...project, ...projectRollups, cover_attachment_id: 'cover-broken' }],
      total: 1,
    },
  }))
  await page.route('**/api/v1/attachments/cover-broken/download', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: 'not-a-png' }),
  )

  await page.goto('/projects')
  await expect(page.getByAltText(`${project.name} 표지`)).toHaveCount(0)
  const cover = page.locator(`[data-project-cover="${project.key}"]`)
  await expect(cover).toBeVisible()
  await expect(cover).toHaveCSS('background-image', /linear-gradient/)
})

test('프로젝트 디렉터리는 비소유자 설정을 숨기고 표지 배지 영역도 Overview로 연다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) => route.fulfill({
    json: {
      items: [{ ...project, ...projectRollups, current_user_role: 'member' }],
      total: 1,
    },
  }))

  await page.goto('/projects')
  const card = page.getByRole('listitem').filter({ hasText: project.name })
  await expect(card.getByRole('link', { name: '설정', exact: true })).toHaveCount(0)
  await expect(card.getByRole('link', { name: '대시보드', exact: true })).toBeVisible()

  const badge = card.locator(`[data-project-cover="${project.key}"]`).getByText('ON', { exact: true })
  const box = await badge.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page).toHaveURL(`/projects/${project.id}/overview`)
})

test('프로젝트 디렉터리는 모바일에서 요약·검색·카드 링크가 겹치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...project,
            ...projectRollups,
            initiatives: [{ id: 'ini-9', name: '플랫폼 전략' }],
            initiative_overflow: 1,
          },
          {
            ...project,
            ...projectRollups,
            id: 'p-b',
            key: 'OPS',
            name: '운영 자동화',
            description: '반복 업무 자동화와 리포팅',
            health: 'off_track',
            overdue_count: 3,
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto('/projects')
  await expect(page.getByTestId('frame-context-bar').getByText('프로젝트', { exact: true })).toBeVisible()
  await expect(page.getByLabel('프로젝트 요약')).toContainText('열린 작업')
  await expect(page.getByRole('button', { name: '카드 보기' })).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-ui/desktop.png',
    fullPage: false,
  })
  await page.getByRole('button', { name: '목록 보기' }).click()
  await expect(page.getByRole('button', { name: '목록 보기' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '카드 보기' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('프로젝트 검색어').fill('운영')
  await expect(page.getByRole('list', { name: '프로젝트 디렉터리' })).toContainText('운영 자동화')
  await expect(page.getByRole('list', { name: '프로젝트 디렉터리' })).not.toContainText('OneFlow 도입')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/project-directory-ui/mobile.png',
    fullPage: true,
  })
})


test('백로그에서 사이클을 배정하면 PATCH 후 행이 사라진다', async ({ page }) => {
  await mockApi(page)
  let assigned = false
  await page.route(`**/api/v1/projects/${project.id}/work-packages**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('no_cycle') === 'true') {
      return route.fulfill({
        json: assigned ? { items: [], total: 0 } : { items: [wpA], total: 1 },
      })
    }
    return route.fulfill({ json: { items: [wpA, wpB], total: 2 } })
  })
  await page.route(`**/api/v1/projects/${project.id}/cycles`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'cy-1',
            project_id: project.id,
            name: '스프린트 8',
            start_date: '2026-07-01',
            end_date: '2026-07-14',
            status: 'active',
            work_package_count: 0,
            done_work_package_count: 0,
            created_at: '2026-07-01T00:00:00Z',
          },
          {
            id: 'cy-0',
            project_id: project.id,
            name: '지난 스프린트',
            start_date: '2026-06-01',
            end_date: '2026-06-14',
            status: 'completed',
            work_package_count: 0,
            done_work_package_count: 0,
            created_at: '2026-06-01T00:00:00Z',
          },
        ],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/work-packages/${wpA.id}`, (route) => {
    assigned = true
    return route.fulfill({ json: { ...wpA, cycle_id: 'cy-1', version: 1 } })
  })

  await page.goto(`/projects/${project.id}/backlog`)
  await expect(page.getByText('워크패키지 API 구현')).toBeVisible()
  const select = page.getByLabel('워크패키지 API 구현 사이클 배정')
  // Completed cycles are not offered (v52.1).
  await expect(select.locator('option', { hasText: '지난 스프린트' })).toHaveCount(0)

  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes(`/work-packages/${wpA.id}`),
  )
  await select.selectOption('cy-1')
  const sent = (await patch).postDataJSON() as { cycle_id: string; expected_version: number }
  expect(sent.cycle_id).toBe('cy-1')
  expect(sent.expected_version).toBe(wpA.version)
  // Refetch drops the assigned row out of the backlog.
  await expect(page.getByText('백로그가 비어 있습니다')).toBeVisible()
})

test('계획 표면은 모바일에서 백로그·보드·캘린더 모드를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('no_cycle') === 'true') {
      return route.fulfill({ json: { items: [wpA, wpB], total: 2 } })
    }
    return route.fulfill({ json: workPackages })
  })
  await page.route(`**/api/v1/projects/${project.id}/cycles`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'cy-planning',
            project_id: project.id,
            name: '7월 스프린트',
            description: null,
            start_date: '2026-07-01',
            end_date: '2026-07-14',
            status: 'active',
            work_package_count: 2,
            done_work_package_count: 0,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/backlog`)
  await expect(page.getByText('Planning surface')).toBeVisible()
  const planningNav = page.getByRole('navigation', { name: '계획 모드' })
  const backlogMode = planningNav.getByRole('link', { name: /백로그/ })
  await expect(backlogMode).toBeVisible()
  await expect(backlogMode).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('계획 요약')).toContainText('미배정 작업')
  await expect(page.getByLabel('계획 요약')).toContainText('배정 가능 사이클')
  await expect(page.getByLabel('백로그 작업 목록')).toContainText('워크패키지 API 구현')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/planning-ui/mobile-backlog.png',
    fullPage: true,
  })

  await planningNav.getByRole('link', { name: /보드/ }).click()
  await expect(page).toHaveURL(/\/board/)
  const boardMode = page.getByRole('navigation', { name: '계획 모드' }).getByRole('link', { name: /보드/ })
  await expect(boardMode).toBeVisible()
  await expect(boardMode).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('계획 요약')).toContainText('스윔레인')
  await expectNoHorizontalOverflow(page)

  await page.getByRole('navigation', { name: '계획 모드' }).getByRole('link', { name: /캘린더/ }).click()
  await expect(page).toHaveURL(/\/calendar/)
  const calendarMode = page.getByRole('navigation', { name: '계획 모드' }).getByRole('link', { name: /캘린더/ })
  await expect(calendarMode).toBeVisible()
  await expect(calendarMode).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('계획 요약')).toContainText('일정 있음')
  await expect(page.getByText('워크패키지 API 구현')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('workspace settings shell은 비관리자 direct route를 차단한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: {
        id: 'member-1',
        email: 'member@oneflow.local',
        display_name: 'Member',
        is_active: true,
        is_admin: false,
      },
    }),
  )
  await page.goto('/admin/users')
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  const settingsNav = page.getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })
  await expect(settingsNav.getByRole('link', { name: '내 계정' })).toBeVisible()
  await expect(settingsNav.getByRole('link', { name: '사용자' })).toHaveCount(0)
})


test('백로그 항목 액션 메뉴가 링크·복제·이동·전체 페이지 흐름을 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({
      json: {
        items: [project, { ...project, id: 'p-2', key: 'TWO', name: '두번째 프로젝트' }],
        total: 2,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/work-packages**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('no_cycle') === 'true') {
      return route.fulfill({ json: { items: [wpA], total: 1 } })
    }
    return route.fulfill({ json: { items: [wpA, wpB], total: 2 } })
  })
  await page.route(`**/api/v1/work-packages/${wpA.id}/duplicate`, (route) =>
    route.fulfill({
      status: 201,
      json: {
        work_package: { ...wpA, id: 'dup-backlog', subject: '(복사) 워크패키지 API 구현' },
        skipped_custom_values: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/backlog`)
  const action = page.getByRole('button', { name: '워크패키지 API 구현 백로그 항목 작업' })
  await expect(action).toBeVisible()

  await action.click()
  await page.getByRole('menuitem', { name: '링크 복사' }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('__copied_backlog_item_link')))
    .toContain(`/projects/${project.id}/work-packages/${wpA.id}`)
  await expect(page.getByText('링크', { exact: false })).toBeVisible()

  await action.click()
  const duplicatePost = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes(`/work-packages/${wpA.id}/duplicate`),
  )
  await page.getByRole('menuitem', { name: '복제' }).click()
  await duplicatePost
  await expect(page.getByText("'(복사) 워크패키지 API 구현' 생성됨", { exact: false })).toBeVisible()

  await action.click()
  await page.getByRole('menuitem', { name: '이동 패널 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`wp=${wpA.id}`))
  await expect(page).toHaveURL(/move=1/)
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByLabel('이동 대상 프로젝트')).toBeVisible()
  await drawer.getByRole('button', { name: '닫기' }).click()
  await expect(page).not.toHaveURL(/move=1/)

  await action.click()
  await page.getByRole('menuitem', { name: '전체 페이지 열기' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
})


test('모바일 백로그 항목 액션 메뉴는 cycle select와 충돌하지 않고 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('no_cycle') === 'true') {
      return route.fulfill({ json: { items: [wpA], total: 1 } })
    }
    return route.fulfill({ json: { items: [wpA, wpB], total: 2 } })
  })

  await page.goto(`/projects/${project.id}/backlog`)
  await expect(page.getByLabel('워크패키지 API 구현 사이클 배정')).toBeVisible()
  await page.getByRole('button', { name: '워크패키지 API 구현 백로그 항목 작업' }).click()

  const menu = page.getByRole('menu', { name: '워크패키지 API 구현 백로그 항목 작업' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('백로그 항목')).toBeVisible()
  const box = await menu.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/backlog-item-actions-ui/mobile.png',
    fullPage: true,
  })
})


test('뷰어 백로그 항목 액션 메뉴는 쓰기 액션 없이 읽기 전용으로 표시된다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('no_cycle') === 'true') {
      return route.fulfill({ json: { items: [wpA], total: 1 } })
    }
    return route.fulfill({ json: { items: [wpA, wpB], total: 2 } })
  })
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'viewer' },
        ],
        total: 1,
      },
    }),
  )

  await page.goto(`/projects/${project.id}/backlog`)
  await expect(page.getByLabel('워크패키지 API 구현 사이클 배정')).toHaveCount(0)
  await page.getByRole('button', { name: '워크패키지 API 구현 백로그 항목 작업' }).click()
  const menu = page.getByRole('menu', { name: '워크패키지 API 구현 백로그 항목 작업' })

  await expect(menu.getByText('쓰기 권한 없음')).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '복제' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '이동 패널 열기' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: '전체 페이지 열기' })).toBeVisible()
})


test('잠긴 뷰는 공유/삭제가 숨고 해제하면 복원된다', async ({ page }) => {
  await mockApi(page)
  let locked = true
  await page.route(`**/api/v1/projects/${project.id}/saved-filters`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'sf-l',
            project_id: project.id,
            name: '잠긴 뷰',
            params: {},
            layout: 'list',
            sort: null,
            is_shared: false,
            is_locked: locked,
            is_mine: true,
            owner_name: 'Dev User',
            created_at: '2026-07-01T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}/saved-filters/sf-l`, (route) => {
    locked = false
    return route.fulfill({ json: { id: 'sf-l' } })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  // Locked: share/delete hidden; only the unlock toggle shows.
  await expect(page.getByLabel('잠긴 뷰 삭제')).toBeHidden()
  await expect(page.getByLabel(/잠긴 뷰 공유/)).toBeHidden()
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/saved-filters/sf-l'),
  )
  await page.getByLabel('잠긴 뷰 잠금 해제').click()
  expect(((await patch).postDataJSON() as { is_locked: boolean }).is_locked).toBe(false)
  // Unlock refetch restores the delete/share controls (v54.1 R1-⑤).
  await expect(page.getByLabel('잠긴 뷰 삭제')).toBeVisible()
  await expect(page.getByLabel(/잠긴 뷰 공유/)).toBeVisible()
})


test('설정 스토리지 탭이 사용량 바와 카운트를 보여준다', async ({ page }) => {
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/storage`, (route) =>
    route.fulfill({
      json: {
        used_bytes: 900 * 1_048_576,
        quota_bytes: 1024 * 1_048_576,
        attachment_count: 12,
        link_count: 3,
      },
    }),
  )
  await page.goto(`/projects/${project.id}/settings?tab=storage`)
  await expect(page.getByText('900.0 MiB / 1024.0 MiB (88%)', { exact: false })).toBeVisible()
  await expect(page.getByText('한도에 가까워지고 있습니다', { exact: false })).toBeVisible()
  await expect(page.getByText('업로드 파일 12건 · 외부 링크 3건', { exact: false })).toBeVisible()
})

test('포트폴리오 타임라인 토글이 프로젝트 막대·마일스톤을 그리고 딥링크한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/reports/portfolio?**', (route) =>
    route.fulfill({
      json: {
        items: [],
        totals: {
          projects: 0,
          work_packages: 0,
          open: 0,
          overdue: 0,
          budget: 0,
          cost_total: 0,
          hours_total: 0,
        },
        total: 0,
      },
    }),
  )
  await page.route('**/api/v1/reports/portfolio/timeline?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            project_id: project.id,
            key: 'ONE',
            name: 'OneFlow 도입',
            archived: false,
            start_date: '2026-07-01',
            end_date: '2026-07-20',
            open_work_package_count: 5,
            milestones: [{ id: 'ms-1', name: 'v1 릴리스', due_date: '2026-07-15' }],
          },
          {
            project_id: 'p-none',
            key: 'EMP',
            name: '<img src=x onerror=alert(1)>일정없음',
            archived: false,
            start_date: null,
            end_date: null,
            open_work_package_count: 0,
            milestones: [],
          },
        ],
        total: 2,
      },
    }),
  )

  await page.goto('/reports')
  await page.getByRole('button', { name: '타임라인' }).click()
  const chart = page.getByTestId('portfolio-gantt')
  await expect(chart.locator(`[data-task-id="p-${project.id}"].gantt_task_line`)).toBeVisible()
  await expect(chart.locator('.gantt_task_line.gantt_milestone')).toHaveCount(1)
  // Undated project stays OUT of the chart with a notice (v75.1 R1-⑤)…
  await expect(page.getByText('일정 없음 1건', { exact: false })).toBeVisible()
  // …and hostile names never become elements (escape regression, R1-②).
  await expect(chart.locator('img')).toHaveCount(0)

  // Lane click deep-links into that project's own timeline (route exists).
  await chart.locator(`[data-task-id="p-${project.id}"].gantt_task_line`).click({ force: true })
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/timeline`))
  await expect(page.getByTestId('gantt-container')).toBeVisible()
})

test('포트폴리오 리포트가 행·합계·아카이브 토글을 보여준다', async ({ page }) => {
  await mockApi(page)
  const active = {
    project_id: 'p-1',
    key: 'ONE',
    name: 'OneFlow 도입',
    archived: false,
    health: 'at_risk',
    member_count: 3,
    work_package_count: 12,
    open_work_package_count: 7,
    overdue_count: 2,
    budget: 20000000,
    cost_total: 5000000,
    hours_total: 42.5,
  }
  const archived = {
    ...active,
    project_id: 'p-2',
    key: 'OLD',
    name: '종료 프로젝트',
    archived: true,
    health: null,
    budget: null,
    cost_total: 100,
    hours_total: 1,
  }
  await page.route('**/api/v1/reports/portfolio?include_archived=false', (route) =>
    route.fulfill({
      json: {
        items: [active],
        totals: {
          projects: 1,
          work_packages: 12,
          open: 7,
          overdue: 2,
          budget: 20000000,
          cost_total: 5000000,
          hours_total: 42.5,
        },
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/reports/portfolio?include_archived=true', (route) =>
    route.fulfill({
      json: {
        items: [active, archived],
        totals: {
          projects: 2,
          work_packages: 24,
          open: 14,
          overdue: 4,
          budget: 20000000,
          cost_total: 5000100,
          hours_total: 43.5,
        },
        total: 2,
      },
    }),
  )

  await page.goto('/projects')
  await page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' }).getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog', { name: '워크스페이스 더 보기' }).getByRole('link', { name: '리포트' }).click()
  await expect(page.getByRole('heading', { name: '포트폴리오 리포트' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'OneFlow 도입', exact: true })).toBeVisible()
  await expect(page.getByText('주의')).toBeVisible() // health chip
  await expect(page.getByText('25%')).toBeVisible() // 5,000,000 / 20,000,000
  await expect(page.getByText('합계 · 1개 프로젝트')).toBeVisible()

  // The archive toggle re-requests with the SERVER param — totals follow.
  const archivedGet = page.waitForRequest((r) => r.url().includes('include_archived=true'))
  await page.getByLabel('아카이브 포함').check()
  await archivedGet
  await expect(page.getByText('(아카이브)')).toBeVisible()
  await expect(page.getByText('합계 · 2개 프로젝트')).toBeVisible()
  await expect(page.getByText('미설정')).toBeVisible() // NULL budget row
})

test('관리자 webhook 표면이 endpoint와 delivery lifecycle을 실제 요청에 연결한다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const endpoints: Array<Record<string, unknown>> = []
  const deliveries: Array<Record<string, unknown>> = []
  const rotations: Array<Record<string, unknown>> = []

  await page.route('**/api/v1/webhooks', async (route) => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON() as {
        name: string
        url: string
        event_types: string[]
      }
      const item = {
        id: 'wh-1',
        ...sent,
        is_active: true,
        secret_version: 1,
        signing_key_id: '2026-q3',
        created_at: '2026-07-10T00:00:00Z',
        updated_at: '2026-07-10T00:00:00Z',
        deleted_at: null,
      }
      endpoints.push(item)
      await route.fulfill({ status: 201, json: { item, secret: 'ofw_once_only_secret' } })
      return
    }
    await route.fulfill({ json: { items: endpoints, total: endpoints.length, enabled: true, active_signing_key_id: '2026-q3', available_signing_key_ids: ['2026-q3', 'legacy-v1'], rotations } })
  })
  await page.route('**/api/v1/webhooks/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/test')) {
      const delivery = {
        id: 'del-1',
        endpoint_id: 'wh-1',
        event_id: 'event-1',
        event_type: 'oneflow.test',
        status: 'failed',
        attempt_count: 1,
        response_status: 500,
        duration_ms: 20,
        error: 'HTTP 500',
        created_at: '2026-07-10T00:01:00Z',
        attempted_at: '2026-07-10T00:01:00Z',
        next_attempt_at: null,
        leased_until: null,
        completed_at: '2026-07-10T00:01:00Z',
        signing_key_id: 'legacy-v1',
        secret_version: 1,
        signing_snapshot_source: 'captured',
      }
      deliveries.unshift(delivery)
      await route.fulfill({ json: delivery })
      return
    }
    if (url.endsWith('/rotate-secret')) {
      const sent = route.request().postDataJSON() as { target_signing_key_id: string; reason: string }
      const previousKey = endpoints[0].signing_key_id
      endpoints[0].secret_version = 2
      endpoints[0].signing_key_id = sent.target_signing_key_id
      rotations.unshift({
        id: 'rotation-1', endpoint_id: endpoints[0].id,
        previous_signing_key_id: previousKey, signing_key_id: sent.target_signing_key_id,
        previous_secret_version: 1, secret_version: 2, reason: sent.reason,
        created_by: 'admin-1', created_at: '2026-07-10T00:06:00Z',
      })
      await route.fulfill({ json: { item: endpoints[0], secret: 'ofw_rotated_secret' } })
      return
    }
    if (route.request().method() === 'DELETE') {
      endpoints.splice(0)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    Object.assign(endpoints[0], route.request().postDataJSON())
    await route.fulfill({ json: endpoints[0] })
  })
  await page.route('**/api/v1/webhook-deliveries**', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const retried = Object.assign(deliveries[0], {
        status: 'succeeded',
        attempt_count: 2,
        response_status: 204,
        error: null,
        completed_at: '2026-07-10T00:02:00Z',
      })
      await route.fulfill({ json: retried })
      return
    }
    await route.fulfill({ json: { items: deliveries, total: deliveries.length } })
  })

  await page.goto('/admin/webhooks')
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible()
  await page.getByLabel('Webhook 이름').fill('Deploy hook')
  await page.getByLabel('Webhook URL').fill('https://hooks.example.com/oneflow')
  const create = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/webhooks'),
  )
  await page.getByRole('button', { name: '추가' }).click()
  expect(((await create).postDataJSON() as { event_types: string[] }).event_types).toEqual([
    'work_package.created',
  ])
  await expect(page.getByLabel('새 webhook secret')).toHaveText('ofw_once_only_secret')

  await page.getByLabel('Deploy hook 테스트 전송').click()
  await expect(page.getByText('테스트 전송: 실패 HTTP 500', { exact: true })).toBeVisible()
  await page.getByLabel('Deploy hook delivery 재시도').click()
  await page.getByLabel('전송 감사 새로고침').click()
  await expect(page.getByText('성공', { exact: true })).toBeVisible()
  await expect(page.getByText('테스트 전송: 실패 HTTP 500', { exact: true })).toHaveCount(0)

  deliveries.unshift(
    {
      ...deliveries[0],
      id: 'del-dead',
      event_id: 'event-dead',
      event_type: 'work_package.updated',
      status: 'dead_letter',
      attempt_count: 5,
      response_status: 503,
      error: 'HTTP 503',
      completed_at: '2026-07-10T00:04:00Z',
    },
    {
      ...deliveries[0],
      id: 'del-retrying',
      event_id: 'event-retrying',
      event_type: 'work_package.created',
      status: 'retrying',
      attempt_count: 2,
      response_status: 503,
      error: 'HTTP 503',
      next_attempt_at: '2026-07-10T00:05:00Z',
      completed_at: null,
    },
  )
  await page.getByLabel('전송 감사 새로고침').click()
  await expect(page.getByText('재시도 예정', { exact: true })).toBeVisible()
  await expect(page.getByText('처리 필요', { exact: true })).toBeVisible()
  await expect(page.getByText('다음 시도', { exact: false })).toBeVisible()

  await page.getByLabel('Deploy hook secret 회전').click()
  await page.getByLabel('Deploy hook signing key').selectOption('legacy-v1')
  await page.getByLabel('Deploy hook secret rotation reason').fill('scheduled rotation')
  const rotate = page.waitForRequest((request) => request.url().endsWith('/rotate-secret'))
  await page.getByRole('button', { name: '확인 및 새 secret 발급' }).click()
  expect((await rotate).postDataJSON()).toMatchObject({ target_signing_key_id: 'legacy-v1', expected_secret_version: 1, reason: 'scheduled rotation' })
  await expect(page.getByLabel('새 webhook secret')).toHaveText('ofw_rotated_secret')
  await expect(page.getByText('scheduled rotation')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/webhook-transport-security-ui/mobile.png',
    fullPage: true,
  })

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByLabel('Deploy hook webhook 삭제').click()
  await expect(page.getByText('등록된 webhook이 없습니다')).toBeVisible()
})

test('webhook 누락 signing key와 CAS 충돌을 최신 endpoint 상태로 복구한다', async ({ page }) => {
  await mockApi(page)
  let endpoint = {
    id: 'wh-missing', name: 'Retired key hook', url: 'https://hooks.example.com/retired',
    event_types: ['work_package.created'], is_active: true, secret_version: 1, signing_key_id: 'retired-key',
    created_at: '2026-07-10T00:00:00Z', updated_at: '2026-07-10T00:00:00Z', deleted_at: null,
  }
  const rotateRequests: Array<Record<string, unknown>> = []
  await page.route('**/api/v1/webhooks', (route) => route.fulfill({
    json: {
      items: [endpoint], total: 1, enabled: true, active_signing_key_id: 'legacy-v1',
      available_signing_key_ids: ['legacy-v1'], rotations: [],
    },
  }))
  await page.route('**/api/v1/webhooks/**', async (route) => {
    const sent = route.request().postDataJSON() as Record<string, unknown>
    rotateRequests.push(sent)
    if (rotateRequests.length === 1) {
      endpoint = { ...endpoint, secret_version: 2 }
      await route.fulfill({ status: 409, json: { detail: 'secret version is stale' } })
      return
    }
    endpoint = { ...endpoint, secret_version: 3, signing_key_id: 'legacy-v1' }
    await route.fulfill({ json: { item: endpoint, secret: 'ofw_recovered_secret' } })
  })
  await page.route('**/api/v1/webhook-deliveries**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto('/admin/webhooks')
  await expect(page.getByText('configured key 없음')).toBeVisible()
  await page.getByLabel('Retired key hook secret 회전').click()
  await expect(page.getByLabel('Retired key hook signing key')).toHaveValue('legacy-v1')
  await page.getByLabel('Retired key hook secret rotation reason').fill('recover retired key')
  await page.getByRole('button', { name: '확인 및 새 secret 발급' }).click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 먼저 secret을 변경했습니다')
  await expect(page.getByText('secret v2')).toBeVisible()
  expect(rotateRequests[0]).toMatchObject({ target_signing_key_id: 'legacy-v1', expected_secret_version: 1 })

  await page.getByRole('button', { name: '확인 및 새 secret 발급' }).click()
  await expect(page.getByLabel('새 webhook secret')).toHaveText('ofw_recovered_secret')
  expect(rotateRequests[1]).toMatchObject({ target_signing_key_id: 'legacy-v1', expected_secret_version: 2 })
})

test('webhook 관리자 surface는 비관리자에게 쓰기 UI를 노출하지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/webhooks', (route) =>
    route.fulfill({ status: 403, json: { detail: 'workspace admin required' } }),
  )
  await page.route('**/api/v1/webhook-deliveries**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.goto('/admin/webhooks')
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByLabel('Webhook URL')).toHaveCount(0)
})

test('비활성 capability에서도 기존 webhook 삭제만 남기고 503 동작은 숨긴다', async ({ page }) => {
  await mockApi(page)
  const endpoint = {
    id: 'wh-disabled', name: 'Legacy hook', url: 'https://hooks.example.com/legacy',
    event_types: ['work_package.created'], is_active: true, secret_version: 1, signing_key_id: 'legacy-v1',
    created_at: '2026-07-10T00:00:00Z', updated_at: '2026-07-10T00:00:00Z', deleted_at: null,
  }
  await page.route('**/api/v1/webhooks', (route) =>
    route.fulfill({ json: { items: [endpoint], total: 1, enabled: false, active_signing_key_id: null, available_signing_key_ids: [], rotations: [] } }),
  )
  await page.route('**/api/v1/webhooks/**', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/v1/webhook-deliveries**', (route) => route.fulfill({ json: { items: [], total: 0 } }))

  await page.goto('/admin/webhooks')
  await expect(page.getByText('Webhook 전달이 꺼져 있습니다')).toBeVisible()
  await expect(page.getByLabel('Legacy hook webhook 삭제')).toBeVisible()
  await expect(page.getByLabel('Legacy hook 테스트 전송')).toHaveCount(0)
  await expect(page.getByLabel('Legacy hook secret 회전')).toHaveCount(0)
  await expect(page.getByLabel('Legacy hook webhook 편집')).toHaveCount(0)
})

test('webhook 재시도 실패와 알 수 없는 delivery 상태를 운영자에게 표시한다', async ({ page }) => {
  await mockApi(page)
  const endpoint = {
    id: 'wh-1', name: 'Retry hook', url: 'https://hooks.example.com/retry',
    event_types: ['work_package.created'], is_active: true, secret_version: 1, signing_key_id: 'legacy-v1',
    created_at: '2026-07-10T00:00:00Z', updated_at: '2026-07-10T00:00:00Z', deleted_at: null,
  }
  const delivery = {
    id: 'del-unknown', endpoint_id: 'wh-1', event_id: 'event-unknown',
    event_type: 'work_package.created', status: 'failed', attempt_count: 1,
    response_status: 503, duration_ms: 10, error: 'HTTP 503',
    created_at: '2026-07-10T00:01:00Z', attempted_at: '2026-07-10T00:01:00Z',
    next_attempt_at: null, leased_until: null, completed_at: '2026-07-10T00:01:00Z',
    signing_key_id: 'legacy-v1', secret_version: 1,
    signing_snapshot_source: 'migrated_current',
  }
  const unknownDelivery = { ...delivery, id: 'del-unrecognized', event_id: 'event-unrecognized', status: 'unrecognized' }
  await page.route('**/api/v1/webhooks', (route) =>
    route.fulfill({ json: { items: [endpoint], total: 1, enabled: true, active_signing_key_id: 'legacy-v1', available_signing_key_ids: ['legacy-v1'], rotations: [] } }),
  )
  await page.route('**/api/v1/webhook-deliveries**', (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 500, json: { detail: 'retry failed' } })
    return route.fulfill({ json: { items: [delivery, unknownDelivery], total: 2 } })
  })

  await page.goto('/admin/webhooks')
  await expect(page.getByText('알 수 없는 상태')).toBeVisible()
  await expect(page.getByText('migration estimate').first()).toBeVisible()
  await page.getByLabel('Retry hook delivery 재시도').click()
  await expect(page.getByRole('alert')).toContainText('전송 재시도를 완료하지 못했습니다')
})

test('보고 표면은 모바일에서 포트폴리오와 이니셔티브를 넘침 없이 보여준다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/reports/portfolio?include_archived=false', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            project_id: 'p-1',
            key: 'ONE',
            name: 'OneFlow 도입',
            archived: false,
            health: 'at_risk',
            member_count: 3,
            work_package_count: 12,
            open_work_package_count: 7,
            overdue_count: 2,
            budget: 20000000,
            cost_total: 5000000,
            hours_total: 42.5,
          },
        ],
        totals: {
          projects: 1,
          work_packages: 12,
          open: 7,
          overdue: 2,
          budget: 20000000,
          cost_total: 5000000,
          hours_total: 42.5,
        },
        total: 1,
      },
    }),
  )
  await page.route('**/api/v1/reports/portfolio/timeline?**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'ini-1',
            name: '플랫폼 개편',
            description: null,
            owner_id: 'u-dev',
            owner_name: 'Dev User',
            owner_active: true,
            state: 'in_progress',
            start_date: null,
            target_date: null,
            health: 'at_risk',
            health_note: '일정 검토 필요',
            health_updated_by: 'me-1',
            health_updated_at: '2026-07-08T00:00:00Z',
            is_mine: true,
            can_claim_ownership: false,
            connected_project_count: 2,
            connected_work_item_count: 0,
            follower_count: 0,
            is_following: false,
            labels: [],
            projects: [
              {
                project_id: project.id,
                project_name: project.name,
                work_package_count: 4,
                done_work_package_count: 1,
              },
            ],
            created_at: '2026-07-07T00:00:00Z',
            updated_at: '2026-07-07T00:00:00Z',
          },
        ],
        total: 1,
      },
    }),
  )

  await page.goto('/reports')
  await expect(page.getByRole('heading', { name: '포트폴리오 리포트' })).toBeVisible()
  await expect(page.getByText('미완료 작업', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/reporting-ui/mobile-reports.png',
    fullPage: true,
  })

  await page.goto('/initiatives')
  await expect(page.getByRole('heading', { name: '이니셔티브', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '진행 중' }).getByText('플랫폼 개편')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/reporting-ui/mobile-initiatives.png',
    fullPage: true,
  })
})

type AdminWorklogFixture = {
  id: string
  work_package_id: string
  work_package_subject: string
  project_id: string
  project_key: string
  project_name: string
  project_is_archived: boolean
  user_id: string | null
  user_display_name: string | null
  user_email: string | null
  user_is_active: boolean | null
  hours: number
  spent_on: string
  comment: string | null
  created_at: string
}

function adminWorklogFixture(
  overrides: Partial<AdminWorklogFixture> & { id: string },
): AdminWorklogFixture {
  const { id, ...rest } = overrides
  return {
    id,
    work_package_id: wpA.id,
    work_package_subject: '관리자 Worklog 검토',
    project_id: project.id,
    project_key: project.key,
    project_name: project.name,
    project_is_archived: false,
    user_id: 'u-dev',
    user_display_name: 'Dev User',
    user_email: 'dev@oneflow.local',
    user_is_active: true,
    hours: 2.5,
    spent_on: '2026-07-10',
    comment: '운영 검토',
    created_at: '2026-07-10T08:00:00Z',
    ...rest,
  }
}

async function mockAdminWorklogs(page: Page, items: AdminWorklogFixture[]) {
  await page.route('**/api/v1/admin/worklogs**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/options')) {
      await route.fulfill({
        json: {
          users: [
            { id: 'u-dev', display_name: 'Dev User', email: 'dev@oneflow.local', is_active: true },
            { id: 'u-old', display_name: 'Old User', email: 'old@oneflow.local', is_active: false },
          ],
          projects: [
            { id: project.id, key: project.key, name: project.name, is_archived: false },
            { id: 'p-archived', key: 'ARC', name: '보관 프로젝트', is_archived: true },
          ],
        },
      })
      return
    }
    if (url.pathname.endsWith('/export.csv')) {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="oneflow-worklogs-2026-07-01-to-2026-07-31.csv"',
          'access-control-expose-headers': 'content-disposition',
        },
        body: '\ufeffid,hours\nworklog-1,2.5\n',
      })
      return
    }
    const userId = url.searchParams.get('user_id')
    const projectId = url.searchParams.get('project_id')
    if (userId && !['u-dev', 'u-old', 'deleted'].includes(userId)) {
      await route.fulfill({ status: 422, json: { detail: 'invalid user filter' } })
      return
    }
    if (projectId && ![project.id, 'p-archived'].includes(projectId)) {
      await route.fulfill({ status: 422, json: { detail: 'invalid project filter' } })
      return
    }
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const filtered = items.filter(
      (item) =>
        (!userId || (userId === 'deleted' ? item.user_id === null : item.user_id === userId)) &&
        (!projectId || item.project_id === projectId),
    )
    await route.fulfill({
      json: {
        from_date: url.searchParams.get('from'),
        to_date: url.searchParams.get('to'),
        items: filtered.slice(offset, offset + 50),
        total: filtered.length,
        total_hours: filtered.reduce((sum, item) => sum + item.hours, 0),
        limit: 50,
        offset,
      },
    })
  })
}

test('Workspace Worklogs는 관리자 필터·다운로드·모바일 탐색을 실제 요청에 연결한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await mockAdminWorklogs(page, [
    adminWorklogFixture({ id: 'worklog-1' }),
    adminWorklogFixture({
      id: 'worklog-2',
      project_id: 'p-archived',
      project_key: 'ARC',
      project_name: '보관 프로젝트',
      project_is_archived: true,
      user_id: 'u-old',
      user_display_name: 'Old User',
      user_email: 'old@oneflow.local',
      user_is_active: false,
      hours: 1,
    }),
  ])

  await page.goto('/my')
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await page
    .getByRole('dialog', { name: '모바일 내비게이션' })
    .getByRole('navigation', { name: '글로벌 내비게이션' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await page
    .getByRole('dialog', { name: '모바일 내비게이션' })
    .getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })
    .getByRole('link', { name: 'Worklogs' })
    .click()
  await expect(page.getByRole('heading', { name: 'Worklogs' })).toBeVisible()
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/)
  const mobileList = page.getByRole('list', { name: '모바일 Worklogs 목록' })
  await expect(mobileList.getByText('관리자 Worklog 검토').first()).toBeVisible()

  await page.getByLabel('Worklogs 사용자').selectOption('u-old')
  await page.getByLabel('Worklogs 프로젝트').selectOption('p-archived')
  await expect(page).toHaveURL(/user=u-old/)
  await expect(page).toHaveURL(/project=p-archived/)
  await expect(mobileList.getByText('Old User')).toBeVisible()
  await expect(mobileList.getByText('보관됨')).toBeVisible()

  await page.getByLabel('Worklogs 시작일').fill('2026-08-01')
  await page.getByLabel('Worklogs 종료일').fill('2026-07-31')
  await expect(page.getByRole('alert')).toContainText('시작일은 종료일보다 늦을 수 없습니다')
  await expect(page.getByRole('button', { name: '적용', exact: true })).toBeDisabled()
  await page.getByLabel('Worklogs 시작일').fill('2026-07-01')
  const filteredRequest = page.waitForRequest(
    (request) => request.url().includes('/admin/worklogs?') && request.url().includes('from=2026-07-01'),
  )
  await page.getByRole('button', { name: '적용', exact: true }).click()
  await filteredRequest
  await expect(page).toHaveURL(/from=2026-07-01/)
  await expect(page).toHaveURL(/to=2026-07-31/)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV' }).click()
  expect((await download).suggestedFilename()).toBe(
    'oneflow-worklogs-2026-07-01-to-2026-07-31.csv',
  )
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/worklogs-admin-ui/mobile.png',
    fullPage: true,
  })
})

test('Workspace Worklogs는 범위 밖 페이지와 빈 결과를 canonical URL로 복구한다', async ({
  page,
}) => {
  await mockApi(page)
  const items = Array.from({ length: 51 }, (_, index) =>
    adminWorklogFixture({ id: `worklog-${index + 1}`, comment: null }),
  )
  await mockAdminWorklogs(page, items)
  await page.goto('/admin/worklogs?from=2026-07-01&to=2026-07-31&offset=100')
  await expect(page).toHaveURL(/offset=50/)
  await expect(page.getByText('51-51 / 51')).toBeVisible()
  await page.getByRole('button', { name: '이전 Worklogs 페이지' }).click()
  await expect(page).not.toHaveURL(/offset=/)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/worklogs-admin-ui/desktop.png',
    fullPage: true,
  })

  await page.goto('/admin/worklogs?from=2026-08-01&to=2026-07-31&project=missing&offset=17')
  await expect(page).not.toHaveURL(/project=missing/)
  await expect(page).not.toHaveURL(/offset=/)
  await expect(page).not.toHaveURL(/from=2026-08-01/)
  await expect(page.getByText('관리자 Worklog 검토').first()).toBeVisible()

  await page.goto('/admin/worklogs?from=2026-02-31&to=2026-03-02')
  await expect(page).not.toHaveURL(/from=2026-02-31/)
  await expect(page.getByText('관리자 Worklog 검토').first()).toBeVisible()

  await page.goto(
    '/admin/worklogs?from=2026-07-01&to=2026-07-31&user=deleted&offset=50',
  )
  await expect(page).not.toHaveURL(/offset=/)
  await expect(page.getByText('조회 범위에 Worklog가 없습니다')).toBeVisible()
})

test('Workspace Worklogs는 비관리자에게 데이터를 노출하지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/admin/worklogs**', (route) =>
    route.fulfill({ status: 403, json: { detail: 'workspace admin required' } }),
  )
  await page.goto('/admin/worklogs?from=2026-07-01&to=2026-07-31')
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Worklogs' })).toHaveCount(0)
})

test('Workspace Worklogs 목록 오류는 명시적 재시도로 복구한다', async ({ page }) => {
  await mockApi(page)
  let listCalls = 0
  await page.route('**/api/v1/admin/worklogs**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/options')) {
      return route.fulfill({ json: { users: [], projects: [] } })
    }
    listCalls += 1
    if (listCalls <= 2) {
      return route.fulfill({ status: 500, json: { detail: 'worklogs unavailable' } })
    }
    return route.fulfill({
      json: {
        from_date: '2026-07-01',
        to_date: '2026-07-31',
        items: [],
        total: 0,
        total_hours: 0,
        limit: 50,
        offset: 0,
      },
    })
  })
  await page.goto('/admin/worklogs?from=2026-07-01&to=2026-07-31')
  await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('조회 범위에 Worklog가 없습니다')).toBeVisible()
})

function authAssistanceFixture(
  overrides: Partial<AuthAssistanceRequest> & { id: string },
): AuthAssistanceRequest {
  const { id, ...rest } = overrides
  return {
    id,
    kind: 'sign_in_help',
    status: 'pending',
    email: 'member@oneflow.local',
    reason: '비밀번호를 잊어 로그인할 수 없습니다.',
    submission_count: 1,
    last_submitted_at: '2026-07-15T01:00:00Z',
    version: 0,
    triage_note: null,
    triaged_by_id: null,
    triaged_at: null,
    redacted_at: null,
    created_at: '2026-07-15T01:00:00Z',
    updated_at: '2026-07-15T01:00:00Z',
    ...rest,
  }
}

async function mockAdminAuthAssistance(
  page: Page,
  initial: AuthAssistanceRequest[],
  options: { conflictFirstPatch?: boolean } = {},
) {
  let items = initial.map((item) => ({ ...item }))
  let patchCount = 0
  const patchBodies: Array<{ status: string; expected_version: number; note?: string }> = []
  const deletedIds: string[] = []

  await page.route('**/api/v1/admin/auth-assistance-requests**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const id = url.pathname.split('/').at(-1)!

    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as { status: string; expected_version: number; note?: string }
      patchBodies.push(body)
      patchCount += 1
      const current = items.find((item) => item.id === id)
      if (options.conflictFirstPatch && patchCount === 1) {
        await route.fulfill({ status: 409, json: { detail: 'request version conflict', current } })
        return
      }
      if (!current || current.version !== body.expected_version) {
        await route.fulfill({ status: current ? 409 : 404, json: { detail: 'request version conflict', current } })
        return
      }
      const allowed =
        (current.status === 'pending' && ['in_review', 'resolved', 'rejected'].includes(body.status)) ||
        (current.status === 'in_review' && ['resolved', 'rejected'].includes(body.status))
      const terminal = body.status === 'resolved' || body.status === 'rejected'
      if (!allowed || (terminal && !body.note?.trim())) {
        await route.fulfill({ status: 409, json: { detail: 'invalid assistance transition', current } })
        return
      }
      const updated: AuthAssistanceRequest = {
        ...current,
        status: body.status as AuthAssistanceRequest['status'],
        triage_note: body.note ?? current.triage_note,
        triaged_by_id: 'me-1',
        triaged_at: '2026-07-15T02:00:00Z',
        version: current.version + 1,
        updated_at: '2026-07-15T02:00:00Z',
      }
      items = items.map((item) => item.id === id ? updated : item)
      await route.fulfill({ json: updated })
      return
    }

    if (request.method() === 'DELETE') {
      const current = items.find((item) => item.id === id)
      if (!current || current.status === 'pending' || current.status === 'in_review') {
        await route.fulfill({ status: current ? 409 : 404, json: { detail: 'terminal request required' } })
        return
      }
      deletedIds.push(id)
      items = items.map((item) => item.id === id ? {
        ...item,
        email: null,
        reason: null,
        triage_note: null,
        redacted_at: '2026-07-15T03:00:00Z',
        version: item.version + 1,
        updated_at: '2026-07-15T03:00:00Z',
      } : item)
      await route.fulfill({ status: 204, body: '' })
      return
    }

    const status = url.searchParams.get('status')
    const kind = url.searchParams.get('kind')
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const filtered = items.filter(
      (item) => (!status || item.status === status) && (!kind || item.kind === kind),
    )
    await route.fulfill({
      json: {
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
        limit,
        offset,
      },
    })
  })

  return { patchBodies, deletedIds }
}

test('로그인 지원 큐는 모바일 탐색과 실제 검토 수명주기를 연결한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  const mock = await mockAdminAuthAssistance(page, [authAssistanceFixture({ id: 'assist-mobile' })])

  await page.goto('/my')
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await page
    .getByRole('dialog', { name: '모바일 내비게이션' })
    .getByRole('navigation', { name: '글로벌 내비게이션' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await page
    .getByRole('dialog', { name: '모바일 내비게이션' })
    .getByRole('navigation', { name: '설정 컨텍스트 내비게이션' })
    .getByRole('link', { name: '로그인 지원' })
    .click()

  await expect(page.getByRole('heading', { name: '로그인 지원' })).toBeVisible()
  const mobileList = page.getByRole('list', { name: '모바일 로그인 지원 요청' })
  await expect(mobileList.getByText('member@oneflow.local')).toBeVisible()
  await mobileList.getByRole('button', { name: '검토 시작' }).click()
  await expect(mobileList.getByText('검토 중')).toBeVisible()
  expect(mock.patchBodies[0]).toEqual({ status: 'in_review', expected_version: 0 })

  const resolve = mobileList.getByRole('button', { name: '해결', exact: true })
  await resolve.click()
  const decision = page.getByRole('dialog', { name: '요청 해결' })
  await expect(decision.getByRole('button', { name: '해결 확정' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(resolve).toBeFocused()

  await resolve.click()
  await decision.getByLabel('로그인 지원 검토 메모').fill('본인 확인 후 개발용 비밀번호를 재발급했습니다.')
  await decision.getByRole('button', { name: '해결 확정' }).click()
  await expect(mobileList.getByText('해결').first()).toBeVisible()
  expect(mock.patchBodies[1]).toEqual({
    status: 'resolved',
    expected_version: 1,
    note: '본인 확인 후 개발용 비밀번호를 재발급했습니다.',
  })

  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/auth-assistance-admin-ui/mobile.png',
    fullPage: true,
  })
})

test('로그인 지원 큐는 충돌 복구·PII 삭제·canonical URL을 보장한다', async ({ page }) => {
  await mockApi(page)
  const items = [
    authAssistanceFixture({ id: 'assist-pending' }),
    authAssistanceFixture({
      id: 'assist-terminal',
      kind: 'workspace_access',
      status: 'resolved',
      email: 'contractor@oneflow.local',
      reason: '프로젝트 초대가 필요합니다.',
      triage_note: '프로젝트 소유자 승인 완료',
      triaged_at: '2026-07-15T02:00:00Z',
      version: 3,
    }),
  ]
  const mock = await mockAdminAuthAssistance(page, items, { conflictFirstPatch: true })

  await page.goto('/admin/auth-assistance?status=unknown&kind=bad&offset=17')
  await expect(page).not.toHaveURL(/status=|kind=|offset=/)
  await page.getByRole('button', { name: '검토 시작' }).click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 이미 변경')
  await page.getByRole('button', { name: '목록 새로고침' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)

  const terminalRow = page.getByRole('row').filter({ hasText: 'contractor@oneflow.local' })
  await terminalRow.getByRole('button', { name: '개인정보 삭제' }).click()
  const redaction = page.getByRole('dialog', { name: '연락 정보 삭제' })
  await expect(redaction).toContainText('영구 삭제')
  await redaction.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(page.getByRole('table').getByText('개인정보 삭제됨')).toBeVisible()
  expect(mock.deletedIds).toEqual(['assist-terminal'])

  await page.getByLabel('로그인 지원 상태').selectOption('resolved')
  await expect(page).toHaveURL(/status=resolved/)
  await page.getByLabel('로그인 지원 유형').selectOption('workspace_access')
  await expect(page).toHaveURL(/kind=workspace_access/)
  await expect(page.getByRole('table').getByText('개인정보 삭제됨')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/auth-assistance-admin-ui/desktop.png',
    fullPage: true,
  })
})

test('로그인 지원 큐는 범위 밖 페이지와 API 권한 변경을 복구한다', async ({ page }) => {
  await mockApi(page)
  const items = Array.from({ length: 51 }, (_, index) =>
    authAssistanceFixture({ id: `assist-${index + 1}` }),
  )
  await mockAdminAuthAssistance(page, items)
  await page.goto('/admin/auth-assistance?offset=100')
  await expect(page).toHaveURL(/offset=50/)
  await expect(page.getByText('51-51 / 51')).toBeVisible()

  await page.route('**/api/v1/admin/auth-assistance-requests**', (route) =>
    route.fulfill({ status: 403, json: { detail: 'workspace admin required' } }),
  )
  await page.goto('/admin/auth-assistance?status=resolved')
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByRole('heading', { name: '로그인 지원' })).toHaveCount(0)
})

test('로그인 지원 큐는 비관리자를 민감한 collection GET 전에 차단한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) => route.fulfill({
    json: {
      id: 'viewer-1',
      email: 'viewer@oneflow.local',
      display_name: 'Viewer',
      is_active: true,
      is_admin: false,
    },
  }))
  let collectionRequests = 0
  await page.route('**/api/v1/admin/auth-assistance-requests**', (route) => {
    collectionRequests += 1
    return route.fulfill({ status: 403, json: { detail: 'workspace admin required' } })
  })

  await page.goto('/admin/auth-assistance')
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByText('워크스페이스 설정은 관리자만 열 수 있습니다.')).toBeVisible()
  await page.waitForTimeout(250)
  expect(collectionRequests).toBe(0)
})

function draftFixture(
  overrides: Partial<WorkItemDraft> & { id: string },
): WorkItemDraft {
  return {
    project_id: project.id,
    content: {
      subject: 'API 정리 초안',
      type: 'task',
      status: 'backlog',
      priority: 'none',
      assignee_id: null,
      due_date: null,
    },
    version: 0,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  }
}

async function mockWorkItemDraftApi(
  page: Page,
  initial: WorkItemDraft[] = [],
  options: { conflictFirstSave?: boolean } = {},
) {
  let drafts = [...initial]
  let conflictPending = options.conflictFirstSave ?? false

  await page.route('**/api/v1/projects?include_archived=true', (route) =>
    route.fulfill({ json: projects }),
  )

  await page.route('**/api/v1/me/work-item-drafts**', async (route) => {
    const url = new URL(route.request().url())
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    await route.fulfill({
      json: {
        items: drafts.slice(offset, offset + limit),
        total: drafts.length,
        limit,
        offset,
      },
    })
  })
  await page.route('**/api/v1/projects/*/work-item-drafts', async (route) => {
    const body = route.request().postDataJSON() as { content: WorkItemDraftContent }
    const created = draftFixture({
      id: `draft-${drafts.length + 1}`,
      content: body.content,
      updated_at: '2026-07-11T01:00:00Z',
    })
    drafts = [created, ...drafts]
    await route.fulfill({ status: 201, json: created })
  })
  await page.route('**/api/v1/work-item-drafts/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const parts = url.pathname.split('/')
    const draftId = parts.at(-1) === 'submit' ? parts.at(-2)! : parts.at(-1)!
    const current = drafts.find((item) => item.id === draftId)
    if (!current) {
      await route.fulfill({ status: 404, json: { detail: 'not found' } })
      return
    }
    if (request.method() === 'GET') {
      await route.fulfill({ json: current })
      return
    }
    if (request.method() === 'DELETE') {
      drafts = drafts.filter((item) => item.id !== draftId)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as {
        expected_version: number
        content: WorkItemDraftContent
      }
      if (conflictPending) {
        conflictPending = false
        const serverCurrent = {
          ...current,
          version: current.version + 1,
          content: { ...current.content, subject: '서버에서 갱신된 초안' },
          updated_at: '2026-07-11T01:10:00Z',
        }
        drafts = drafts.map((item) => (item.id === draftId ? serverCurrent : item))
        await route.fulfill({
          status: 409,
          json: { detail: 'draft was changed elsewhere', current: serverCurrent },
        })
        return
      }
      const saved = {
        ...current,
        content: body.content,
        version: body.expected_version + 1,
        updated_at: '2026-07-11T01:20:00Z',
      }
      drafts = drafts.map((item) => (item.id === draftId ? saved : item))
      await route.fulfill({ json: saved })
      return
    }
    if (request.method() === 'POST' && parts.at(-1) === 'submit') {
      drafts = drafts.filter((item) => item.id !== draftId)
      await route.fulfill({
        json: {
          ...wpA,
          id: 'draft-created-work-package',
          subject: current.content.subject,
          type: current.content.type,
          status: current.content.status,
          priority: current.content.priority,
          assignee_id: current.content.assignee_id,
          due_date: current.content.due_date,
        },
      })
      return
    }
    await route.abort()
  })
}

test('작업 초안은 삭제·저장·이어쓰기·최종 제출 흐름을 연결한다', async ({ page }) => {
  await mockApi(page)
  await mockWorkItemDraftApi(page, [draftFixture({ id: 'draft-existing' })])
  await page.goto('/drafts')
  await expect(page.getByRole('heading', { name: '작업 초안' })).toBeVisible()
  await expect(page.getByText('API 정리 초안')).toBeVisible()

  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().includes('/draft-existing'),
  )
  await page.getByRole('button', { name: '초안 삭제' }).click()
  await page.getByRole('button', { name: '삭제', exact: true }).click()
  await deleteRequest
  await expect(page.getByText('저장된 작업 초안이 없습니다.')).toBeVisible()

  await page.goto(`/projects/${project.id}/work-packages?new=1`)
  await page.getByLabel('작업 제목').fill('새로 저장한 초안')
  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes(`/projects/${project.id}/work-item-drafts`),
  )
  await page.getByRole('button', { name: '초안 저장' }).click()
  expect((await createRequest).postDataJSON()).toMatchObject({
    content: { subject: '새로 저장한 초안', type: 'task', status: 'backlog' },
  })
  await expect(page).toHaveURL(/\/drafts$/)
  await page.getByText('새로 저장한 초안').click()
  await expect(page.getByRole('heading', { name: '작업 초안 이어쓰기' })).toBeVisible()
  await expect(page.getByLabel('작업 제목')).toHaveValue('새로 저장한 초안')
  await page.getByLabel('작업 제목').fill('제출할 최종 작업')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '저장하지 않고 닫기' }).click()
  await expect(page.getByRole('heading', { name: '작업 초안 이어쓰기' })).toBeVisible()

  const saveRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' && request.url().includes('/work-item-drafts/draft-1'),
  )
  const submitRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/work-item-drafts/draft-1/submit'),
  )
  await page.getByRole('button', { name: '작업 만들기' }).click()
  expect((await saveRequest).postDataJSON()).toMatchObject({
    expected_version: 0,
    content: { subject: '제출할 최종 작업' },
  })
  expect((await submitRequest).postDataJSON()).toEqual({ expected_version: 1 })
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id}/work-packages$`),
  )
  await page.goto('/drafts')
  await expect(page.getByText('저장된 작업 초안이 없습니다.')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/work-item-drafts-ui/desktop.png',
    fullPage: true,
  })
})

test('작업 초안 충돌은 입력을 보존하고 최신 버전으로 다시 저장한다', async ({ page }) => {
  await mockApi(page)
  await mockWorkItemDraftApi(
    page,
    [draftFixture({ id: 'draft-conflict' })],
    { conflictFirstSave: true },
  )
  await page.goto(
    `/projects/${project.id}/work-packages?new=1&draft=draft-conflict`,
  )
  await page.getByLabel('작업 제목').fill('내가 작성 중인 제목')
  await page.getByRole('button', { name: '초안 저장' }).click()
  await expect(page.getByRole('alert')).toContainText('다른 창에서 초안이 변경되었습니다')
  await expect(page.getByRole('alert')).toContainText('서버에서 갱신된 초안')
  await expect(page.getByLabel('작업 제목')).toHaveValue('내가 작성 중인 제목')
  await expect(page.getByRole('button', { name: '초안 저장' })).toBeDisabled()

  const retryRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' && request.url().includes('/draft-conflict'),
  )
  await page.getByRole('button', { name: '내 입력으로 다시 저장' }).click()
  expect((await retryRequest).postDataJSON()).toMatchObject({
    expected_version: 1,
    content: { subject: '내가 작성 중인 제목' },
  })
  await expect(page).toHaveURL(/\/drafts$/)
})

test('모바일 작업 초안 목록은 sidebar 진입과 빈·목록 상태를 안정적으로 표시한다', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await mockWorkItemDraftApi(page, [draftFixture({ id: 'draft-mobile' })])
  await page.goto('/my')
  await page.getByRole('button', { name: '사이드바 열기' }).click()
  await page
    .getByRole('dialog', { name: '모바일 내비게이션' })
    .getByRole('link', { name: '초안' })
    .click()
  await expect(page).toHaveURL(/\/drafts$/)
  await expect(page.getByText('API 정리 초안')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/work-item-drafts-ui/mobile.png',
    fullPage: true,
  })
})

test('작업 초안 목록 오류는 명시적 재시도로 복구한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/projects?include_archived=true', (route) =>
    route.fulfill({ json: projects }),
  )
  let calls = 0
  await page.route('**/api/v1/me/work-item-drafts**', async (route) => {
    calls += 1
    if (calls <= 2) {
      await route.fulfill({ status: 500, json: { detail: 'drafts unavailable' } })
      return
    }
    await route.fulfill({
      json: { items: [], total: 0, limit: 50, offset: 0 },
    })
  })
  await page.goto('/drafts')
  await expect(page.getByRole('alert')).toContainText('초안을 불러오지 못했습니다')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('저장된 작업 초안이 없습니다.')).toBeVisible()
})

test('작업 초안 dirty 상태는 sidebar와 전역 Escape 이탈을 확인한다', async ({ page }) => {
  await mockApi(page)
  await mockWorkItemDraftApi(page, [draftFixture({ id: 'draft-dirty' })])
  await page.goto(
    `/projects/${project.id}/work-packages?new=1&draft=draft-dirty`,
  )
  await page.getByLabel('작업 제목').fill('저장하지 않은 제목')

  const sidebarDialog = page.waitForEvent('dialog')
  await page.getByRole('link', { name: '개인 메모' }).click()
  await (await sidebarDialog).dismiss()
  await expect(page).toHaveURL(/draft=draft-dirty/)
  await expect(page.getByLabel('작업 제목')).toHaveValue('저장하지 않은 제목')

  const dismissedEscape = page.waitForEvent('dialog')
  const dismissPress = page.keyboard.press('Escape')
  await (await dismissedEscape).dismiss()
  await dismissPress
  await expect(page.getByRole('heading', { name: '작업 초안 이어쓰기' })).toBeVisible()

  const acceptedEscape = page.waitForEvent('dialog')
  const acceptPress = page.keyboard.press('Escape')
  await (await acceptedEscape).accept()
  await acceptPress
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id}/work-packages$`),
  )
  await expect(page.getByRole('region', { name: '작업 초안 이어쓰기' })).toHaveCount(0)

  await page.goto(
    `/projects/${project.id}/work-packages?new=1&draft=draft-dirty`,
  )
  await page.getByLabel('작업 제목').fill('다시 연 뒤 저장하지 않은 제목')
  const reopenedDialog = page.waitForEvent('dialog')
  await page.getByRole('link', { name: '개인 메모' }).click()
  await (await reopenedDialog).dismiss()
  await expect(page).toHaveURL(/draft=draft-dirty/)
})

test('읽기 전용 프로젝트 초안은 재개 control 없이 삭제만 제공한다', async ({ page }) => {
  await mockApi(page)
  await mockWorkItemDraftApi(page, [draftFixture({ id: 'draft-viewer' })])
  await page.route(`**/api/v1/projects/${project.id}/members`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            user_id: 'me-1',
            email: 'dev@oneflow.local',
            display_name: 'Dev User',
            role: 'viewer',
          },
        ],
        total: 1,
      },
    }),
  )
  await page.goto('/drafts')
  await expect(page.getByText(/읽기 전용 · 삭제만 가능/)).toBeVisible()
  await expect(page.getByRole('button', { name: '초안 이어쓰기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '초안 삭제' })).toBeVisible()
})

test('초안 URL 프로젝트가 다르면 올바른 프로젝트 경로로 교정한다', async ({ page }) => {
  await mockApi(page)
  await mockWorkItemDraftApi(page, [draftFixture({ id: 'draft-mismatch' })])
  const wrongProjectId = '99999999-9999-4999-8999-999999999998'
  await page.goto(
    `/projects/${wrongProjectId}/work-packages?new=1&draft=draft-mismatch`,
  )
  await expect(page.getByRole('alert')).toContainText(
    '현재 URL의 프로젝트에 속하지 않습니다',
  )
  await page.getByRole('button', { name: '올바른 프로젝트에서 열기' }).click()
  await expect(page).toHaveURL(
    new RegExp(
      `/projects/${project.id}/work-packages\\?new=1&draft=draft-mismatch$`,
    ),
  )
  await expect(page.getByRole('heading', { name: '작업 초안 이어쓰기' })).toBeVisible()
  await page.getByLabel('작업 제목').fill('교정 후 저장하지 않은 제목')
  const correctedDialog = page.waitForEvent('dialog')
  await page.getByRole('link', { name: '개인 메모' }).click()
  await (await correctedDialog).dismiss()
  await expect(page).toHaveURL(/draft=draft-mismatch/)
})

async function mockWikiPolicy(
  page: Page,
  options: { staleFirstPatch?: boolean; forbidden?: boolean } = {},
) {
  let enabled = true
  let revision = 1
  let patchCount = 0
  const requests: string[] = []

  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({
      json: {
        wiki: { enabled, revision },
        ai: {
          enabled: false,
          revision: 1,
          deployment_enabled: false,
          effective_enabled: false,
        },
        initiatives: { enabled: true, revision: 1 },
        releases: { enabled: true, revision: 1 },
        customers: { enabled: false, revision: 1 },
      },
    }),
  )
  await page.route('**/api/v1/admin/workspace/features/wiki', async (route) => {
    if (options.forbidden) {
      await route.fulfill({ status: 403, json: { detail: 'workspace admin required' } })
      return
    }
    if (route.request().method() === 'PATCH') {
      patchCount += 1
      requests.push(route.request().headers()['if-match'] ?? '')
      const body = route.request().postDataJSON() as { enabled: boolean }
      if (options.staleFirstPatch && patchCount === 1) {
        enabled = false
        revision = 2
        await route.fulfill({
          status: 412,
          headers: { ETag: '"2"' },
          json: { detail: { code: 'stale_revision', current_revision: 2 } },
        })
        return
      }
      enabled = body.enabled
      revision += 1
    }
    await route.fulfill({
      headers: { ETag: `"${revision}"` },
      json: {
        feature_key: 'wiki',
        enabled,
        revision,
        updated_by_user_id: patchCount ? 'me-1' : null,
        updated_by_name: patchCount ? 'Dev User' : null,
        updated_at: '2026-07-11T09:00:00Z',
      },
    })
  })
  return { requests }
}

test('Wiki 설정은 navigation과 API surface를 함께 끄고 데이터 보존 상태로 복구한다', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await enableCommandPalette(page)
  await mockCommandPaletteSearch(page)
  const wiki = await mockWikiPolicy(page)
  let documentRequests = 0
  await page.route(`**/api/v1/projects/${project.id}/documents**`, (route) => {
    documentRequests += 1
    return route.fulfill({
      json: {
        items: [
          {
            id: 'wiki-persisted',
            project_id: project.id,
            parent_id: null,
            title: '보존된 운영 문서',
            author_id: 'me-1',
            version: 2,
            created_at: '2026-07-10T00:00:00Z',
            updated_at: '2026-07-11T00:00:00Z',
          },
        ],
        total: 1,
      },
    })
  })

  await page.goto('/admin/wiki')
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible()
  let toggle = page.getByRole('switch', { name: '프로젝트 Wiki 사용' })
  await expect(toggle).toBeChecked()
  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('link', { name: 'Documents' }).first()).toBeVisible()
  await page.goto('/admin/wiki')
  toggle = page.getByRole('switch', { name: '프로젝트 Wiki 사용' })

  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText('정책 revision 2')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Documents' })).toHaveCount(0)
  expect(wiki.requests).toEqual(['"1"'])

  await page.getByRole('button', { name: '전체 검색 열기' }).click()
  await page.getByLabel('전체 검색어').fill('구현')
  await expect(page.getByRole('tab', { name: '문서' })).toHaveCount(0)
  await expect(page.getByText('구현 가이드 문서')).toHaveCount(0)
  await page.getByRole('button', { name: '전체 검색 닫기' }).click()

  await page.goto('/search?q=구현')
  await expect(page.getByText('구현 가이드 문서')).toHaveCount(0)

  documentRequests = 0
  await page.goto(`/projects/${project.id}/documents`)
  await expect(page.getByText('Wiki가 비활성화되어 있습니다')).toBeVisible()
  expect(documentRequests).toBe(0)

  await page.goto('/admin/wiki')
  await page.getByRole('switch', { name: '프로젝트 Wiki 사용' }).click()
  await expect(page.getByRole('switch', { name: '프로젝트 Wiki 사용' })).toBeChecked()
  expect(wiki.requests).toEqual(['"1"', '"2"'])

  await page.goto(`/projects/${project.id}/documents`)
  await expect(page.getByText('보존된 운영 문서')).toBeVisible()
  expect(documentRequests).toBe(1)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/wiki-settings-ui/desktop-documents-restored.png',
    fullPage: true,
  })
})

test('Wiki 설정은 stale revision을 최신 서버 상태로 복구한다', async ({ page }) => {
  await mockApi(page)
  await mockWikiPolicy(page, { staleFirstPatch: true })
  await page.goto('/admin/wiki')

  const toggle = page.getByRole('switch', { name: '프로젝트 Wiki 사용' })
  await toggle.click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 정책을 변경했습니다')
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText('정책 revision 2')).toBeVisible()
})

test('Wiki 설정은 비관리자에게 권한 없음 상태를 표시한다', async ({ page }) => {
  await mockApi(page)
  await mockWikiPolicy(page, { forbidden: true })
  await page.goto('/admin/wiki')
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
})

test('Wiki 설정 mobile surface는 가로 overflow 없이 동작한다', async ({ page }) => {
  await mockApi(page)
  await mockWikiPolicy(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/wiki')
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/wiki-settings-ui/mobile-settings.png',
    fullPage: true,
  })
})

async function mockAiPolicy(
  page: Page,
  options: { staleFirstPatch?: boolean; forbidden?: boolean; deploymentEnabled?: boolean } = {},
) {
  let enabled = false
  let revision = 1
  let patchCount = 0
  const deploymentEnabled = options.deploymentEnabled ?? true
  const requests: string[] = []

  await page.route('**/api/v1/capabilities', (route) =>
    route.fulfill({
      json: { ai_summary_enabled: deploymentEnabled && enabled },
    }),
  )
  await page.route('**/api/v1/admin/workspace/features/ai', async (route) => {
    if (options.forbidden) {
      await route.fulfill({ status: 403, json: { detail: 'workspace admin required' } })
      return
    }
    if (route.request().method() === 'PATCH') {
      patchCount += 1
      requests.push(route.request().headers()['if-match'] ?? '')
      const body = route.request().postDataJSON() as { enabled: boolean }
      if (options.staleFirstPatch && patchCount === 1) {
        enabled = true
        revision = 2
        await route.fulfill({
          status: 412,
          headers: { ETag: '"2"' },
          json: { detail: { code: 'stale_revision', current_revision: 2 } },
        })
        return
      }
      enabled = body.enabled
      revision += 1
    }
    await route.fulfill({
      headers: { ETag: `"${revision}"` },
      json: {
        feature_key: 'ai',
        enabled,
        revision,
        deployment_enabled: deploymentEnabled,
        effective_enabled: deploymentEnabled && enabled,
        updated_by_user_id: patchCount ? 'me-1' : null,
        updated_by_name: patchCount ? 'Dev User' : null,
        updated_at: '2026-07-11T09:00:00Z',
      },
    })
  })
  return { requests }
}

test('AI workspace 정책은 실제 요약 진입점과 즉시 연결된다', async ({ page }) => {
  await mockApi(page)
  const policy = await mockAiPolicy(page)
  await page.goto('/admin/ai')

  await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible()
  const toggle = page.getByRole('switch', { name: 'AI 작업 요약 사용' })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect(page.getByText('정책 revision 2')).toBeVisible()
  expect(policy.requests).toEqual(['"1"'])

  await page.goto(`/projects/${project.id}/work-packages?wp=${wpA.id}`)
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('AI 요약')).toBeVisible()
  await expect(drawer.getByRole('button', { name: '요약 생성' })).toBeVisible()
})

test('AI workspace 정책은 stale revision을 최신 상태로 복구한다', async ({ page }) => {
  await mockApi(page)
  await mockAiPolicy(page, { staleFirstPatch: true })
  await page.goto('/admin/ai')

  const toggle = page.getByRole('switch', { name: 'AI 작업 요약 사용' })
  await toggle.click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 정책을 변경했습니다')
  await expect(toggle).toBeChecked()
  await expect(page.getByText('정책 revision 2')).toBeVisible()
})

test('AI workspace 정책은 배포 상한과 관리자 권한을 fail-closed로 표시한다', async ({
  page,
}) => {
  await mockApi(page)
  await mockAiPolicy(page, { deploymentEnabled: false })
  await page.goto('/admin/ai')
  const toggle = page.getByRole('switch', { name: 'AI 작업 요약 사용' })
  await expect(toggle).toBeDisabled()
  await expect(page.getByText('배포 상한이 꺼져 있어 변경할 수 없습니다')).toBeVisible()

  await page.unroute('**/api/v1/admin/workspace/features/ai')
  await mockAiPolicy(page, { forbidden: true })
  await page.reload()
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
})

test('AI workspace 정책 mobile surface는 가로 overflow 없이 동작한다', async ({ page }) => {
  await mockApi(page)
  await mockAiPolicy(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/ai')
  await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/ai-policy-ui/mobile-settings.png',
    fullPage: true,
  })
})

async function mockInitiativesPolicy(
  page: Page,
  options: { staleFirstPatch?: boolean; forbidden?: boolean } = {},
) {
  let enabled = true
  let revision = 1
  let patchCount = 0
  const requests: string[] = []

  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({
      json: {
        wiki: { enabled: true, revision: 1 },
        ai: {
          enabled: false,
          revision: 1,
          deployment_enabled: false,
          effective_enabled: false,
        },
        initiatives: { enabled, revision },
        releases: { enabled: true, revision: 1 },
        customers: { enabled: false, revision: 1 },
      },
    }),
  )
  await page.route('**/api/v1/admin/workspace/features/initiatives', async (route) => {
    if (options.forbidden) {
      await route.fulfill({ status: 403, json: { detail: 'workspace admin required' } })
      return
    }
    if (route.request().method() === 'PATCH') {
      patchCount += 1
      requests.push(route.request().headers()['if-match'] ?? '')
      const body = route.request().postDataJSON() as { enabled: boolean }
      if (options.staleFirstPatch && patchCount === 1) {
        enabled = false
        revision = 2
        await route.fulfill({
          status: 412,
          headers: { ETag: '"2"' },
          json: { detail: { code: 'stale_revision', current_revision: 2 } },
        })
        return
      }
      enabled = body.enabled
      revision += 1
    }
    await route.fulfill({
      headers: { ETag: `"${revision}"` },
      json: {
        feature_key: 'initiatives',
        enabled,
        revision,
        updated_by_user_id: patchCount ? 'me-1' : null,
        updated_by_name: patchCount ? 'Dev User' : null,
        updated_at: '2026-07-11T09:00:00Z',
      },
    })
  })
  return { requests }
}

test('Initiatives 정책은 navigation과 API surface를 함께 끄고 복구한다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  const policy = await mockInitiativesPolicy(page)
  let initiativeRequests = 0
  await page.route('**/api/v1/initiatives', (route) => {
    initiativeRequests += 1
    return route.fulfill({ json: { items: [], total: 0 } })
  })
  await page.goto('/admin/initiatives')

  let toggle = page.getByRole('switch', { name: '이니셔티브 사용' })
  await expect(toggle).toBeChecked()
  await page.goto('/projects')
  await page.getByRole('navigation', { name: 'Projects 컨텍스트 내비게이션' }).getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('dialog', { name: '워크스페이스 더 보기' }).getByRole('link', { name: '이니셔티브', exact: true })).toBeVisible()
  await page.goto('/admin/initiatives')
  toggle = page.getByRole('switch', { name: '이니셔티브 사용' })
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(page.getByRole('link', { name: '이니셔티브', exact: true })).toHaveCount(0)
  expect(policy.requests).toEqual(['"1"'])

  await page.goto('/reports')
  await expect(page.getByRole('link', { name: '이니셔티브', exact: true })).toHaveCount(0)

  initiativeRequests = 0
  await page.goto('/initiatives')
  await expect(page.getByText('이니셔티브가 비활성화되어 있습니다')).toBeVisible()
  expect(initiativeRequests).toBe(0)

  await page.goto('/admin/initiatives')
  await page.getByRole('switch', { name: '이니셔티브 사용' }).click()
  await expect(page.getByRole('switch', { name: '이니셔티브 사용' })).toBeChecked()
  expect(policy.requests).toEqual(['"1"', '"2"'])

  await page.goto('/initiatives')
  await expect(page.getByRole('heading', { name: '이니셔티브', exact: true })).toBeVisible()
  expect(initiativeRequests).toBe(1)
})

test('Initiatives 정책은 stale revision을 최신 상태로 복구한다', async ({ page }) => {
  await mockApi(page)
  await mockInitiativesPolicy(page, { staleFirstPatch: true })
  await page.goto('/admin/initiatives')
  const toggle = page.getByRole('switch', { name: '이니셔티브 사용' })
  await toggle.click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 정책을 변경했습니다')
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText('정책 revision 2')).toBeVisible()
})

test('Initiatives 정책은 비관리자와 모바일 상태를 안전하게 처리한다', async ({ page }) => {
  await mockApi(page)
  await mockInitiativesPolicy(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/initiatives')
  await expect(page.getByRole('heading', { name: 'Initiatives', exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiatives-policy-ui/mobile-settings.png',
    fullPage: true,
  })

  await page.unroute('**/api/v1/admin/workspace/features/initiatives')
  await mockInitiativesPolicy(page, { forbidden: true })
  await page.reload()
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
})

test('Initiative labels는 설정 CRUD와 소유자 배정 및 목록 필터를 연결한다', async ({ page }) => {
  await mockApi(page)
  await mockInitiativesPolicy(page)
  await page.unroute('**/api/v1/initiatives/labels')
  let labels: InitiativeLabel[] = [
    {
      id: '11111111-1111-4111-8111-111111111141',
      name: 'Strategic',
      color: '#6d5dfb',
      created_at: '2026-07-18T00:00:00Z',
      updated_at: '2026-07-18T00:00:00Z',
    },
  ]
  let initiative: Initiative = {
    id: '11111111-1111-4111-8111-111111111142',
    name: '라벨 전략',
    description: '라벨 기반 포트폴리오 분류',
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'in_progress',
    start_date: null,
    target_date: null,
    health: 'on_track',
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
  }
  await page.route('**/api/v1/initiatives**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/v1/initiatives/labels') {
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as { name: string; color: string }
        labels = [...labels, {
          id: '11111111-1111-4111-8111-111111111143',
          name: input.name,
          color: input.color,
          created_at: '2026-07-18T01:00:00Z',
          updated_at: '2026-07-18T01:00:00Z',
        }]
        await route.fulfill({ status: 201, json: labels.at(-1) })
        return
      }
      await route.fulfill({ json: { items: labels, total: labels.length } })
      return
    }
    if (path.startsWith('/api/v1/initiatives/labels/')) {
      const id = path.split('/').at(-1)
      if (request.method() === 'PATCH') {
        const input = request.postDataJSON() as { name: string; color: string }
        labels = labels.map((label) => label.id === id ? { ...label, ...input } : label)
        await route.fulfill({ json: labels.find((label) => label.id === id) })
        return
      }
      labels = labels.filter((label) => label.id !== id)
      initiative = { ...initiative, labels: initiative.labels.filter((label) => label.id !== id) }
      await route.fulfill({ status: 204 })
      return
    }
    if (path === `/api/v1/initiatives/${initiative.id}/labels`) {
      const input = request.postDataJSON() as { label_ids: string[] }
      initiative = { ...initiative, labels: labels.filter((label) => input.label_ids.includes(label.id)) }
      await route.fulfill({ json: initiative })
      return
    }
    if (path === '/api/v1/initiatives') {
      const labelId = url.searchParams.get('label_id')
      const items = labelId && !initiative.labels.some((label) => label.id === labelId) ? [] : [initiative]
      await route.fulfill({ json: { items, total: items.length } })
      return
    }
    await route.fallback()
  })

  await page.goto('/admin/initiatives')
  const labelSettings = page.getByRole('region', { name: '라벨' })
  await expect(labelSettings.getByText('Strategic', { exact: true })).toBeVisible()
  await labelSettings.getByLabel('새 라벨 이름').fill('Compliance')
  const createRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/initiatives/labels'),
  )
  await labelSettings.getByRole('button', { name: '라벨 추가' }).click()
  await createRequest
  const complianceRow = labelSettings.getByRole('listitem').filter({ hasText: 'Compliance' })
  await expect(complianceRow).toBeVisible()
  await complianceRow.getByRole('button', { name: '수정' }).click()
  await labelSettings.getByLabel('Compliance 이름').fill('Regulated')
  await labelSettings.getByRole('button', { name: '저장' }).click()
  await expect(labelSettings.getByText('Regulated', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-labels-ui/desktop-settings.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/initiatives')
  const initiativeRow = page.getByRole('listitem').filter({
    has: page.getByRole('button', { name: '라벨 전략', exact: true }),
  })
  await initiativeRow.getByRole('button', { name: '라벨 전략', exact: true }).click()
  const assignResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/initiatives/${initiative.id}/labels`),
  )
  await page.getByRole('region', { name: '조직과 연결' }).getByLabel('이니셔티브 라벨 배정').selectOption(labels[0].id)
  expect((await assignResponse).status()).toBe(200)
  await expect(page.getByRole('region', { name: '조직과 연결' }).getByText('Strategic', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(initiativeRow.getByText('Strategic', { exact: true })).toBeVisible()
  await page.getByLabel('이니셔티브 라벨 필터').selectOption(labels[0].id)
  await expect(page).toHaveURL(new RegExp(`label=${labels[0].id}`))
  await expect(page.getByText('라벨 전략', { exact: true })).toBeVisible()
  await page.getByLabel('이니셔티브 라벨 필터').selectOption(labels[1].id)
  await expect(page.getByText('이 라벨의 이니셔티브가 없습니다')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-labels-ui/mobile-filter.png',
    fullPage: true,
  })
})

test('Initiative 상세는 기본 정보와 전략 일정을 실제 저장한다', async ({ page }) => {
  await mockApi(page)
  let initiative: Initiative = {
    id: '11111111-1111-4111-8111-111111111144',
    name: '플랫폼 전략',
    description: '기존 설명',
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'in_progress',
    start_date: null,
    target_date: null,
    health: 'on_track',
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
  }
  let failNextPatch = true

  await page.route('**/api/v1/initiatives**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/initiatives/labels') {
      await route.fulfill({ json: { items: [], total: 0 } })
      return
    }
    if (path === `/api/v1/initiatives/${initiative.id}/work-items`) {
      await route.fulfill({
        json: { items: [], total: 0, connected_work_item_count: 0 },
      })
      return
    }
    if (path === `/api/v1/initiatives/${initiative.id}` && request.method() === 'PATCH') {
      if (failNextPatch) {
        failNextPatch = false
        await route.fulfill({ status: 500, json: { detail: 'temporary failure' } })
        return
      }
      const input = request.postDataJSON() as Partial<Initiative>
      initiative = { ...initiative, ...input, updated_at: '2026-07-18T02:00:00Z' }
      await route.fulfill({ json: initiative })
      return
    }
    if (path === '/api/v1/initiatives') {
      await route.fulfill({ json: { items: [initiative], total: 1 } })
      return
    }
    await route.fallback()
  })

  await page.goto('/initiatives')
  await page.getByRole('button', { name: '플랫폼 전략', exact: true }).click()
  await page.getByRole('button', { name: '기본 정보 편집' }).click()
  const form = page.getByRole('form', { name: '이니셔티브 기본 정보 편집' })
  await form.getByLabel('이니셔티브 이름').fill('2027 플랫폼 전략')
  await form.getByLabel('이니셔티브 설명').fill('프로젝트 간 전략 목표와 성공 기준')
  await form.getByLabel('이니셔티브 시작일').fill('2027-04-30')
  await form.getByLabel('이니셔티브 목표일').fill('2027-04-01')
  await expect(form.getByRole('alert')).toContainText('목표일은 시작일보다 빠를 수 없습니다')
  await expect(form.getByRole('button', { name: '저장' })).toBeDisabled()

  await form.getByLabel('이니셔티브 목표일').fill('2027-09-30')
  await form.getByRole('button', { name: '저장' }).click()
  await expect(form.getByRole('alert')).toContainText('temporary failure')
  await expect(form).toBeVisible()

  const saved = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/initiatives/${initiative.id}`),
  )
  await form.getByRole('button', { name: '저장' }).click()
  const payload = (await saved).postDataJSON()
  expect(payload).toEqual({
    name: '2027 플랫폼 전략',
    description: '프로젝트 간 전략 목표와 성공 기준',
    start_date: '2027-04-30',
    target_date: '2027-09-30',
  })
  await expect(page.getByRole('heading', { name: '2027 플랫폼 전략' })).toBeVisible()
  await expect(page.getByText('2027-04-30', { exact: true })).toBeVisible()
  await expect(page.getByText('2027-09-30', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-properties-ui/desktop-detail.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '기본 정보 편집' }).click()
  await expect(form).toBeVisible()
  await form.getByLabel('이니셔티브 이름').fill('저장하지 않을 이름')
  await form.getByRole('button', { name: '취소' }).click()
  await expect(form).toBeHidden()
  await page.getByRole('button', { name: '기본 정보 편집' }).click()
  await expect(form.getByLabel('이니셔티브 이름')).toHaveValue('2027 플랫폼 전략')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-properties-ui/mobile-edit.png',
    fullPage: true,
  })

  initiative = { ...initiative, is_mine: false }
  await page.reload()
  await expect(page.getByRole('heading', { name: '2027 플랫폼 전략' })).toBeVisible()
  await expect(page.getByRole('button', { name: '기본 정보 편집' })).toHaveCount(0)
  await expect(page.getByText('2027-09-30', { exact: true })).toBeVisible()
})

test('Initiative 상세는 상태와 헬스 수명주기를 소유자 저장과 멤버 읽기로 통합한다', async ({ page }) => {
  await mockApi(page)
  let initiative: Initiative = {
    id: '11111111-1111-4111-8111-111111111145',
    name: '수명주기 전략',
    description: '전략 상태를 상세에서 관리합니다.',
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'planned',
    start_date: '2027-01-01',
    target_date: '2027-12-31',
    health: 'at_risk',
    health_note: '일정 의존성 확인 필요',
    health_updated_by: 'me-1',
    health_updated_at: '2026-07-18T03:00:00Z',
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 0,
    is_following: false,
    labels: [],
    projects: [],
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
  }
  let failStatePatch = true
  let failHealthPatch = true

  await page.route('**/api/v1/initiatives**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/initiatives/labels') {
      await route.fulfill({ json: { items: [], total: 0 } })
      return
    }
    if (path === `/api/v1/initiatives/${initiative.id}/work-items`) {
      await route.fulfill({ json: { items: [], total: 0, connected_work_item_count: 0 } })
      return
    }
    if (path === `/api/v1/initiatives/${initiative.id}` && request.method() === 'PATCH') {
      const input = request.postDataJSON() as Partial<Initiative>
      if ('state' in input && failStatePatch) {
        failStatePatch = false
        await route.fulfill({ status: 500, json: { detail: 'state temporarily unavailable' } })
        return
      }
      if ('health' in input && failHealthPatch) {
        failHealthPatch = false
        await route.fulfill({ status: 500, json: { detail: 'health temporarily unavailable' } })
        return
      }
      initiative = {
        ...initiative,
        ...input,
        health_note: input.health === null ? null : (input.health_note ?? initiative.health_note),
        health_updated_at: 'health' in input
          ? (input.health === null ? null : '2026-07-18T04:00:00Z')
          : initiative.health_updated_at,
        updated_at: '2026-07-18T04:00:00Z',
      }
      await route.fulfill({ json: initiative })
      return
    }
    if (path === '/api/v1/initiatives') {
      await route.fulfill({ json: { items: [initiative], total: 1 } })
      return
    }
    await route.fallback()
  })

  await page.goto('/initiatives')
  const initiativeRow = page.getByRole('listitem').filter({ hasText: '수명주기 전략' })
  await expect(initiativeRow.locator('span').filter({ hasText: /^계획됨$/ }).first()).toBeVisible()
  await expect(initiativeRow.locator('span').filter({ hasText: /^주의$/ }).first()).toBeVisible()
  await expect(initiativeRow.getByLabel('수명주기 전략 상태')).toHaveCount(0)
  await expect(initiativeRow.getByLabel('수명주기 전략 상태 사유')).toHaveCount(0)

  await page.getByRole('button', { name: '수명주기 전략', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '이니셔티브 상세' })
  await expect(page.getByRole('heading', { name: '상태 및 헬스' })).toBeVisible()
  await expect(page.getByText('일정 의존성 확인 필요', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '수명주기 편집' }).click()
  const lifecycle = page.getByRole('group', { name: '이니셔티브 수명주기 편집' })

  await lifecycle.getByLabel('이니셔티브 실행 상태').selectOption('in_progress')
  await lifecycle.getByRole('button', { name: '상태 저장' }).click()
  await expect(lifecycle.getByRole('alert')).toContainText('state temporarily unavailable')
  const statePatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/initiatives/${initiative.id}`),
  )
  await lifecycle.getByRole('button', { name: '상태 저장' }).click()
  expect((await statePatch).postDataJSON()).toEqual({ state: 'in_progress' })
  await expect(drawer.locator('header').getByText('진행 중', { exact: true })).toBeVisible()

  await lifecycle.getByLabel('이니셔티브 헬스').selectOption('off_track')
  await lifecycle.getByLabel('이니셔티브 상태 사유').fill('핵심 경로 차단 해소 필요')
  await lifecycle.getByRole('button', { name: '헬스 저장' }).click()
  await expect(lifecycle.getByRole('alert')).toContainText('health temporarily unavailable')
  const healthPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/initiatives/${initiative.id}`),
  )
  await lifecycle.getByRole('button', { name: '헬스 저장' }).click()
  expect((await healthPatch).postDataJSON()).toEqual({
    health: 'off_track',
    health_note: '핵심 경로 차단 해소 필요',
  })
  await expect(drawer.locator('header').getByText('위험', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-lifecycle-ui/desktop-detail.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  const clearPatch = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/initiatives/${initiative.id}`),
  )
  await lifecycle.getByRole('button', { name: '헬스 초기화' }).click()
  expect((await clearPatch).postDataJSON()).toEqual({ health: null })
  await lifecycle.getByLabel('이니셔티브 실행 상태').selectOption('paused')
  await lifecycle.getByRole('button', { name: '취소' }).click()
  await page.getByRole('button', { name: '수명주기 편집' }).click()
  await expect(lifecycle.getByLabel('이니셔티브 실행 상태')).toHaveValue('in_progress')
  await expect(lifecycle.getByLabel('이니셔티브 헬스')).toHaveValue('')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-lifecycle-ui/mobile-detail.png',
    fullPage: true,
  })

  initiative = { ...initiative, is_mine: false }
  await page.reload()
  await expect(drawer.getByRole('heading', { name: '수명주기 전략' })).toBeVisible()
  await expect(page.getByRole('button', { name: '수명주기 편집' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '상태 및 헬스' })).toBeVisible()
  await expect(drawer.locator('header').getByText('진행 중', { exact: true })).toBeVisible()
  await expect(drawer.getByText('미설정', { exact: true }).first()).toBeVisible()
})

test('Initiative 상세 활동은 실제 이력을 페이지 단위로 복구해 표시한다', async ({ page }) => {
  await mockApi(page)
  const initiative: Initiative = {
    id: '11111111-1111-4111-8111-111111111150',
    name: '활동 전략',
    description: '전략 변경을 시간순으로 확인합니다.',
    owner_id: 'me-1',
    owner_name: 'Dev User',
    owner_active: true,
    state: 'in_progress',
    start_date: '2026-07-01',
    target_date: '2026-12-31',
    health: 'on_track',
    health_note: '정상 진행',
    health_updated_by: 'me-1',
    health_updated_at: '2026-07-18T04:00:00Z',
    is_mine: true,
    can_claim_ownership: false,
    connected_project_count: 0,
    connected_work_item_count: 0,
    follower_count: 1,
    is_following: true,
    labels: [],
    projects: [],
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T04:00:00Z',
  }
  const kinds: InitiativeActivity['kind'][] = [
    'properties_updated',
    'health_updated',
    'lifecycle_updated',
    'labels_updated',
    'project_connected',
    'work_item_connected',
    'owner_transferred',
    'project_disconnected',
    'work_item_disconnected',
    'owner_claimed',
    'properties_updated',
    'health_updated',
    'initiative_created',
  ]
  const activities: InitiativeActivity[] = kinds.map((kind, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
    actor_id: index === 11 ? null : 'me-1',
    actor_name: index === 11 ? null : 'Dev User',
    kind,
    changed_fields:
      kind === 'properties_updated'
        ? ['name', 'description']
        : kind === 'health_updated'
          ? ['health', 'health_note']
          : kind === 'lifecycle_updated'
            ? ['state']
            : [],
    created_at: `2026-07-18T${String(12 - Math.min(index, 12)).padStart(2, '0')}:00:00Z`,
  }))
  let failInitial = true
  let failNextPage = true

  await page.route('**/api/v1/initiatives**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/v1/initiatives/labels') {
      await route.fulfill({ json: { items: [], total: 0 } })
      return
    }
    if (url.pathname === `/api/v1/initiatives/${initiative.id}/work-items`) {
      await route.fulfill({ json: { items: [], total: 0, connected_work_item_count: 0 } })
      return
    }
    if (url.pathname === `/api/v1/initiatives/${initiative.id}/activities`) {
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 10)
      if (offset === 0 && failInitial) {
        failInitial = false
        await route.fulfill({ status: 500, json: { detail: 'activity temporarily unavailable' } })
        return
      }
      if (offset === 10 && failNextPage) {
        failNextPage = false
        await route.fulfill({ status: 500, json: { detail: 'next page unavailable' } })
        return
      }
      await route.fulfill({
        json: { items: activities.slice(offset, offset + limit), total: activities.length },
      })
      return
    }
    if (url.pathname === '/api/v1/initiatives') {
      await route.fulfill({ json: { items: [initiative], total: 1 } })
      return
    }
    await route.fallback()
  })

  await page.goto('/initiatives')
  await page.getByRole('button', { name: '활동 전략', exact: true }).click()
  const activitySection = page.getByRole('region', { name: '활동' })
  await expect(activitySection.getByRole('alert')).toContainText('활동을 불러오지 못했습니다')
  await activitySection.getByRole('button', { name: '재시도' }).click()
  await expect(activitySection.getByText('기본 정보를 수정했습니다.', { exact: true })).toBeVisible()
  await expect(activitySection.getByText('13건', { exact: true })).toBeVisible()
  await expect(activitySection.getByLabel('변경 필드').first()).toContainText('이름')

  await activitySection.getByRole('button', { name: '활동 더 보기' }).click()
  await expect(activitySection.getByRole('alert')).toContainText('다음 활동을 불러오지 못했습니다')
  await expect(activitySection.getByText('기본 정보를 수정했습니다.', { exact: true })).toBeVisible()
  await activitySection.getByRole('button', { name: '재시도' }).click()
  await expect(activitySection.getByText('이전 구성원', { exact: true })).toBeVisible()
  await expect(activitySection.getByText('이니셔티브를 만들었습니다.', { exact: true })).toBeVisible()
  await expect(activitySection.getByRole('button', { name: '활동 더 보기' })).toHaveCount(0)
  await activitySection.getByRole('heading', { name: '활동', exact: true }).scrollIntoViewIfNeeded()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-activity-ui/desktop-detail.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await activitySection.getByRole('heading', { name: '활동', exact: true }).scrollIntoViewIfNeeded()
  await expect(activitySection).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/initiative-activity-ui/mobile-detail.png',
    fullPage: true,
  })
})

async function mockReleasesPolicy(
  page: Page,
  options: { staleFirstPatch?: boolean; forbidden?: boolean } = {},
) {
  let enabled = true
  let revision = 1
  let patchCount = 0
  const requests: string[] = []

  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({
      json: {
        wiki: { enabled: true, revision: 1 },
        ai: {
          enabled: false,
          revision: 1,
          deployment_enabled: false,
          effective_enabled: false,
        },
        initiatives: { enabled: true, revision: 1 },
        releases: { enabled, revision },
        customers: { enabled: false, revision: 1 },
      },
    }),
  )
  await page.route('**/api/v1/admin/workspace/features/releases', async (route) => {
    if (options.forbidden) {
      await route.fulfill({ status: 403, json: { detail: 'workspace admin required' } })
      return
    }
    if (route.request().method() === 'PATCH') {
      patchCount += 1
      requests.push(route.request().headers()['if-match'] ?? '')
      const body = route.request().postDataJSON() as { enabled: boolean }
      if (options.staleFirstPatch && patchCount === 1) {
        enabled = false
        revision = 2
        await route.fulfill({
          status: 412,
          headers: { ETag: '"2"' },
          json: { detail: { code: 'stale_revision', current_revision: 2 } },
        })
        return
      }
      enabled = body.enabled
      revision += 1
    }
    await route.fulfill({
      headers: { ETag: `"${revision}"` },
      json: {
        feature_key: 'releases',
        enabled,
        revision,
        updated_by_user_id: patchCount ? 'me-1' : null,
        updated_by_name: patchCount ? 'Dev User' : null,
        updated_at: '2026-07-11T09:00:00Z',
      },
    })
  })
  return { requests }
}

test('Releases 정책은 milestone UI surface를 함께 끄고 복구한다', async ({ page }) => {
  await mockApi(page)
  const policy = await mockReleasesPolicy(page)
  await page.goto('/admin/releases')

  const toggle = page.getByRole('switch', { name: 'Releases 사용' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  expect(policy.requests).toEqual(['"1"'])

  await page.goto(`/projects/${project.id}/settings?tab=milestones`)
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/settings$`))
  await expect(page.getByRole('tab', { name: /마일스톤/ })).toHaveCount(0)

  await page.goto(`/projects/${project.id}/work-packages?milestone_id=ms-1`)
  await expect(page).not.toHaveURL(/milestone_id=/)
  await expect(page.getByLabel('마일스톤 필터')).toHaveCount(0)

  await page.goto(`/projects/${project.id}/timeline`)
  await expect(page.getByText('마일스톤', { exact: true })).toHaveCount(0)

  await page.goto('/admin/releases')
  await page.getByRole('switch', { name: 'Releases 사용' }).click()
  await expect(page.getByRole('switch', { name: 'Releases 사용' })).toBeChecked()
  expect(policy.requests).toEqual(['"1"', '"2"'])
  await page.goto(`/projects/${project.id}/settings?tab=milestones`)
  await expect(page.getByRole('tab', { name: /마일스톤/ })).toBeVisible()
})

test('Releases 정책은 stale revision을 최신 상태로 복구한다', async ({ page }) => {
  await mockApi(page)
  await mockReleasesPolicy(page, { staleFirstPatch: true })
  await page.goto('/admin/releases')
  const toggle = page.getByRole('switch', { name: 'Releases 사용' })
  await toggle.click()
  await expect(page.getByRole('alert')).toContainText('다른 관리자가 정책을 변경했습니다')
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText('정책 revision 2')).toBeVisible()
})

test('Releases 정책은 비관리자와 모바일 상태를 안전하게 처리한다', async ({ page }) => {
  await mockApi(page)
  await mockReleasesPolicy(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/releases')
  await expect(page.getByRole('heading', { name: 'Releases', exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/releases-policy-ui/mobile-settings.png',
    fullPage: true,
  })

  await page.unroute('**/api/v1/admin/workspace/features/releases')
  await mockReleasesPolicy(page, { forbidden: true })
  await page.reload()
  await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
})

async function mockCustomersSurface(page: Page) {
  let enabled = true
  let revision = 1
  const customerId = '88888888-8888-4888-8888-888888888888'
  let customers: Customer[] = [
    {
      id: customerId,
      name: '한빛 고객사',
      description: '모바일 전환 프로젝트',
      email: 'team@hanbit.test',
      url: 'https://example.com',
      tags: ['enterprise', 'mobile'],
      archived_at: null,
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
      progress: { total: 8, open: 5, done: 3, overdue: 1, project_count: 2 },
    },
  ]

  await page.route('**/api/v1/workspace/capabilities', (route) =>
    route.fulfill({
      json: {
        ...defaultWorkspaceCapabilities,
        customers: { enabled, revision },
      },
    }),
  )
  await page.route('**/api/v1/admin/workspace/features/customers', async (route) => {
    if (route.request().method() === 'PATCH') {
      enabled = (route.request().postDataJSON() as { enabled: boolean }).enabled
      revision += 1
    }
    await route.fulfill({
      headers: { ETag: `"${revision}"` },
      json: {
        feature_key: 'customers',
        enabled,
        revision,
        updated_by_user_id: revision > 1 ? 'me-1' : null,
        updated_by_name: revision > 1 ? 'Dev User' : null,
        updated_at: '2026-07-11T09:00:00Z',
      },
    })
  })
  await page.route('**/api/v1/customers**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname === '/api/v1/customers') {
      const body = request.postDataJSON() as { name: string; email?: string | null; tags?: string[] }
      customers = [
        ...customers,
        {
          id: '99999999-8888-4888-8888-888888888888',
          name: body.name,
          description: null,
          email: body.email ?? null,
          url: null,
          tags: body.tags ?? [],
          archived_at: null,
          created_at: '2026-07-11T01:00:00Z',
          updated_at: '2026-07-11T01:00:00Z',
          progress: { total: 0, open: 0, done: 0, overdue: 0, project_count: 0 },
        },
      ]
      await route.fulfill({ status: 201, json: customers.at(-1) })
      return
    }
    if (request.method() === 'PATCH' && url.pathname.startsWith('/api/v1/customers/')) {
      const id = url.pathname.split('/').at(-1)
      const body = request.postDataJSON() as Partial<Customer>
      customers = customers.map((customer) => customer.id === id ? { ...customer, ...body, updated_at: '2026-07-11T02:00:00Z' } : customer)
      await route.fulfill({ json: customers.find((customer) => customer.id === id) })
      return
    }
    const query = url.searchParams.get('query')?.toLocaleLowerCase() ?? ''
    const tag = url.searchParams.get('tag')
    const filtered = customers.filter((customer) => (!query || customer.name.toLocaleLowerCase().includes(query)) && (!tag || customer.tags.includes(tag)))
    await route.fulfill({ json: { items: filtered, total: filtered.length } })
  })
  return { customerId, isEnabled: () => enabled }
}

test('Customers surface는 고객 관리와 작업 연결을 기능적으로 제공한다', async ({ page }) => {
  await mockApi(page)
  const customers = await mockCustomersSurface(page)

  await page.goto('/customers')
  await expect(page.getByRole('heading', { name: '고객', exact: true })).toBeVisible()
  await expect(page.getByText('한빛 고객사')).toBeVisible()
  await expect(page.getByRole('button', { name: 'enterprise' })).toBeVisible()
  await expect(page.getByText('8', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '고객 만들기' }).first().click()
  await page.getByRole('textbox', { name: /^이름/ }).fill('새 고객사')
  await page.getByRole('textbox', { name: /이메일/ }).fill('new@example.com')
  await page.getByRole('textbox', { name: '태그 (선택)' }).fill('Strategic')
  await page.getByRole('form', { name: '새 고객 생성' }).getByRole('button', { name: '추가' }).click()
  await page.getByRole('button', { name: '고객 만들기' }).last().click()
  await expect(page.getByText('새 고객사')).toBeVisible()
  await expect(page.getByRole('button', { name: 'strategic' })).toBeVisible()

  await page.getByLabel('고객 태그 필터').selectOption('enterprise')
  await expect(page.getByText('한빛 고객사')).toBeVisible()
  await expect(page.getByText('새 고객사')).toHaveCount(0)
  await page.getByRole('button', { name: 'enterprise' }).click()
  await expect(page.getByText('새 고객사')).toBeVisible()

  await page.goto(`/projects/${project.id}/work-packages?customer_id=${customers.customerId}`)
  await expect(page.getByLabel('고객 필터')).toHaveValue(customers.customerId)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  await expect(page.getByLabel('고객', { exact: true })).toBeVisible()
  await page.getByLabel('고객', { exact: true }).selectOption(customers.customerId)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/customers')
  await expect(page.getByText('한빛 고객사')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/customers-ui/mobile-customers.png',
    fullPage: true,
  })

  await page.goto('/admin/customers')
  await page.getByRole('switch', { name: 'Customers 사용' }).click()
  await expect(page.getByRole('switch', { name: 'Customers 사용' })).not.toBeChecked()
  expect(customers.isEnabled()).toBe(false)
  await page.goto('/customers')
  await expect(page.getByText('고객 기능이 비활성화되어 있습니다')).toBeVisible()
})

test('OneFlow design system visual QA manifest', async ({ page }) => {
  test.setTimeout(60_000)
  test.skip(process.env.ONEFLOW_DESIGN_QA !== '1', 'opt-in screenshot manifest')
  await mockApi(page)
  await page.unroute('**/api/v1/auth/config')
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'dev',
        oidc_issuer: null,
        oidc_client_id: null,
        has_client_secret: false,
        command_palette_enabled: true,
      },
    }),
  )
  await mockCommandPaletteSearch(page)
  await page.route('**/api/v1/admin/workspace/profile', (route) =>
    route.fulfill({
      headers: { ETag: '"1"' },
      json: {
        name: 'OneFlow',
        revision: 1,
        updated_by_user_id: 'me-1',
        updated_by_name: 'Dev User',
        updated_at: '2026-07-11T09:00:00Z',
      },
    }),
  )

  const target = '../../docs/screenshots/design-system'
  const routes = [
    { slug: 'projects', path: '/projects' },
    { slug: 'all-work', path: '/work-items' },
    { slug: 'detail', path: `/projects/${project.id}/work-packages/${wpA.id}` },
    { slug: 'settings', path: '/admin/general' },
    { slug: 'empty', path: '/work-items?q=not-found' },
  ] as const

  const capture = async (slug: string, viewport: 'desktop' | 'mobile') => {
    await expect(page.locator('#root')).toBeVisible()
    await page.addStyleTag({
      content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    })
    if (slug === 'empty') {
      const visual = page.locator('img[src*="oneflow-empty-flow"]')
      await expect(visual).toBeVisible()
      await expect
        .poll(() => visual.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
    }
    if (viewport === 'mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await page.screenshot({ path: `${target}/${slug}-${viewport}.png` })
  }

  for (const viewport of ['desktop', 'mobile'] as const) {
    await page.setViewportSize(
      viewport === 'desktop' ? { width: 1440, height: 960 } : { width: 390, height: 844 },
    )
    for (const route of routes) {
      await page.goto(route.path)
      await capture(route.slug, viewport)
    }

    await page.goto('/projects')
    await page.getByRole('button', { name: '전체 검색 열기' }).click()
    const commandInput = page.getByRole('combobox', { name: '전체 검색어' })
    await commandInput.fill('워크')
    await expect(page.getByRole('listbox', { name: '검색 결과' })).toBeVisible()
    await capture('command-palette', viewport)
    await page.keyboard.press('Escape')

    await page.goto(`/projects/${project.id}/work-packages`)
    await page.getByRole('button', { name: '표시' }).click()
    await expect(page.getByText('표시 열')).toBeVisible()
    await capture('display-menu', viewport)
    await page.keyboard.press('Escape')
  }
})
