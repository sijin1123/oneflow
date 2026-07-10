/* Playwright UI smoke (PLAN §1.3 #15 / §8): app shell renders, lists show,
   drawer opens, status PATCH carries expected_version, 409 triggers the
   notify+reload path, date-only strings survive display.

   All API responses are mocked with fixtures TYPED against the app's contract
   types — contract drift fails `npm run typecheck` (PLAN §8). */

import { expect, test, type Page } from '@playwright/test'

import type { Project, ProjectList } from '../src/features/projects/types'
import type { SearchResults } from '../src/features/search/api'
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
  initiatives: [],
  initiative_overflow: 0,
}
const projects: ProjectList = { items: [{ ...project, ...projectRollups }], total: 1 }
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
      assignee_id: null,
      assignee_name: 'Dev User',
      start_date: wpA.start_date,
      due_date: wpA.due_date,
      created_at: wpA.created_at,
      updated_at: wpA.updated_at,
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
  ],
  total: 2,
}
const noComments: CommentList = { items: [], total: 0 }

async function mockApi(page: Page, opts: { conflictOnPatch?: boolean } = {}) {
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: projects }),
  )
  await page.route('**/api/v1/search/work-packages**', (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q')?.trim() ?? ''
    const items = query
      ? allWorkItems.items.filter((item) => item.subject.includes(query))
      : allWorkItems.items
    route.fulfill({ json: { query, items, total: items.length } })
  })
  // Single-project GET — the write-access gate (Pass 76) reads archived_at
  // from here; default to the unarchived fixture so owner flows stay editable.
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
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
      json: { assigned: true, watched: true, commented: true, mention: true, due_alerts: true },
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
  await page.route('**/api/v1/projects/*/documents', (route) =>
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
  await page.route(`**/api/v1/work-packages/${wpA.id}/activities`, (route) =>
    route.fulfill({ json: activities }),
  )
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
        await route.fulfill({ status: 409, json: body })
        return
      }
      const sent = request.postDataJSON() as {
        expected_version: number
        status?: string
        assignee_id?: string | null
      }
      const updated: WorkPackage = {
        ...wpA,
        status: (sent.status as WorkPackage['status']) ?? wpA.status,
        assignee_id: 'assignee_id' in sent ? sent.assignee_id! : wpA.assignee_id,
        version: sent.expected_version + 1,
      }
      await route.fulfill({ json: updated })
      return
    }
    await route.fulfill({ json: wpA })
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

test('앱 셸과 프로젝트/워크패키지 목록이 렌더링된다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Work Packages/ })).toBeVisible()
  await expect(page.getByText('OneFlow 도입', { exact: false }).first()).toBeVisible()

  await page.goto(`/projects/${project.id}/work-packages`)
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

test('모바일 앱 셸에서 사이드바가 drawer로 열린다', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/projects/${project.id}/work-packages`)

  await expect(page.getByRole('banner').getByText('Work Packages')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/view-controls/mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '사이드바 열기' }).click()

  const drawer = page.getByRole('dialog', { name: '모바일 내비게이션' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('link', { name: /Board/ })).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/ui-shell/mobile-drawer.png',
    fullPage: true,
  })

  await drawer.getByRole('link', { name: /Board/ }).click()
  await expect(drawer).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
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

test('전체 작업 그리드가 프로젝트를 가로질러 보여주고 검색·딥링크가 동작한다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/work-items')

  await expect(page.getByRole('heading', { name: '전체 작업' })).toBeVisible()
  await expect(page.getByRole('link', { name: /전체 작업/ })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '프로젝트' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '수정일' })).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('운영 개선')).toBeVisible()
  await expect(page.getByText('Dev User')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-grid/desktop.png',
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('전체 작업 검색어')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/all-work-grid/mobile.png',
    fullPage: true,
  })

  const req = page.waitForRequest(
    (r) => r.url().includes('/search/work-packages') && r.url().includes('q='),
  )
  await page.getByLabel('전체 작업 검색어').fill('보드')
  await page.getByRole('button', { name: '검색' }).click()
  await req
  await expect(page).toHaveURL(/\/work-items\?q=%EB%B3%B4%EB%93%9C/)
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeVisible()
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toHaveCount(0)

  await page.getByRole('button', { name: '보드 뷰 구현' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpB.id}`))
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

test('드로어에서 상태 변경 PATCH가 expected_version을 동봉한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const statusSelect = page.getByRole('dialog').getByLabel('상태', { exact: true })
  await expect(statusSelect).toBeVisible()
  await page.screenshot({ path: '../../docs/screenshots/web-drawer.png', fullPage: true })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/desktop.png',
    fullPage: true,
  })

  const patchRequest = page.waitForRequest(
    (req) => req.method() === 'PATCH' && req.url().includes(`/work-packages/${wpA.id}`),
  )
  await statusSelect.selectOption('in_progress')
  const req = await patchRequest
  const body = req.postDataJSON() as { expected_version: number; status: string }
  expect(body.expected_version).toBe(0) // integer token echoed exactly (§6.2)
  expect(body.status).toBe('in_progress')
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
  await page.getByRole('dialog').getByRole('link', { name: '전체 페이지' }).click()

  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/work-packages/${wpA.id}$`))
  await expect(page.getByRole('heading', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('속성')).toBeVisible()
  await expect(page.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/full-page-desktop.png',
    fullPage: true,
  })

  await page.getByRole('tab', { name: '활동' }).click()
  await expect(page.getByText('작업을 생성했습니다')).toBeVisible()
})

test('모바일 작업 상세 전체 페이지가 속성과 활동 탭을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages/${wpA.id}`)

  await expectNoHorizontalOverflow(page)
  await expect(page.getByRole('heading', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByText('속성')).toBeVisible()
  await page.getByRole('tab', { name: '활동' }).click()
  await expect(page.getByText('작업을 생성했습니다')).toBeVisible()
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/detail-ui/full-page-mobile.png',
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
  await drawer.getByLabel('상태', { exact: true }).selectOption('in_progress')
  // The failure is surfaced inline (role="alert"), not via a blocking window.alert.
  await expect(drawer.getByRole('alert')).toContainText('먼저 수정했습니다')
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
        total_work_packages: 5,
        open_work_packages: 3,
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
  let savedWidgets: string[] | null = null
  await page.route(`**/api/v1/projects/${project.id}/dashboard/layout`, async (route) => {
    if (route.request().method() === 'PUT') {
      savedWidgets = (route.request().postDataJSON() as { widgets: string[] }).widgets
      await route.fulfill({
        json: { widgets: savedWidgets, updated_at: '2026-07-07T00:00:00Z', is_default: false },
      })
      return
    }
    await route.fulfill({ json: { widgets: null, updated_at: null, is_default: true } })
  })

  await page.goto(`/projects/${project.id}/dashboard`)
  const main = page.getByRole('main')
  await expect(main.getByText('전체 작업')).toBeVisible()
  await expect(main.getByText('최근 활동')).toBeVisible()
  await expect(main.getByText('기한 초과')).toBeVisible()
  await expect(main.getByText('10.5 / 40h')).toBeVisible()
  await expect(main.getByText('상태별')).toBeVisible()
  // Type distribution widget (Pass 58): renders from the existing payload.
  await expect(main.getByText('타입별')).toBeVisible()

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

  // widget layout edit: hide the budget tiles, save → PUT carries the order
  await page.getByRole('button', { name: '위젯 편집' }).click()
  await page.getByLabel('비용/예산 타일 표시').uncheck()
  await page.getByRole('button', { name: '레이아웃 저장' }).click()
  await expect(page.getByText('비용 합계')).toBeHidden()
  expect(savedWidgets).toEqual([
    'summary',
    'progress',
    'status_distribution',
    'priority_distribution',
    'type_distribution', // Pass 58: the default set grew by one
    'recent_activity',
  ])
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
    const box = (await bar.boundingBox())!
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
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  expect(patchCount).toBe(0)
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
  const dueSoon = page.getByRole('region', { name: '기한 임박' })
  await expect(dueSoon.getByText(wpA.subject)).toBeVisible()
  await expect(page.getByRole('region', { name: '최근 활동' }).getByText(/생성/)).toBeVisible()
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
        scope: 'current_assignment',
        total_scope: 4,
        days: [
          { date: '2026-07-01', remaining: 4 },
          { date: '2026-07-02', remaining: 3 },
          { date: '2026-07-03', remaining: 1 },
        ],
      },
    }),
  )
  await page.getByRole('button', { name: /번다운$/ }).first().click()
  await expect(page.getByTestId('burndown-chart')).toBeVisible()
  await expect(page.getByText('현재 배정 기준 · 전체 4건', { exact: false })).toBeVisible()

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
  await page.getByRole('button', { name: '참여자 0' }).click()
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

  await page.goto(`/projects/${project.id}/modules`)
  const active = page.getByRole('region', { name: '진행 중' })
  await expect(active.getByText('인증 모듈')).toBeVisible()
  await expect(active.getByText('리드: Alex Kim')).toBeVisible()
  await expect(active.getByText('2/6')).toBeVisible()

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
  await page.route('**/api/v1/me/notification-settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const sent = route.request().postDataJSON() as { watched?: boolean; due_alerts?: boolean }
      await route.fulfill({
        json: {
          assigned: true,
          watched: sent.watched ?? true,
          commented: true,
          mention: true,
          due_alerts: sent.due_alerts ?? true,
        },
      })
      return
    }
    await route.fulfill({
      json: { assigned: true, watched: true, commented: true, mention: true, due_alerts: true },
    })
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

  // Due-date alerts toggle (Pass 40) sends its own key.
  const duePut = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/me/notification-settings'),
  )
  await page.getByLabel(/기한 알림/).click()
  expect(((await duePut).postDataJSON() as { due_alerts: boolean }).due_alerts).toBe(false)
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
        database: { status: 'ok', current_revision: '0060' },
        counts: { projects: 3, work_packages: 42 },
        config: {
          auth_mode: 'dev',
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
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/settings-ia/admin-users-mobile.png',
    fullPage: true,
  })

  await page.goto('/status')
  await expect(page.getByRole('heading', { name: '시스템 상태' })).toBeVisible()
  await expect(page.getByText('0060')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/settings-ia/status-mobile.png',
    fullPage: true,
  })
})

test('운영 허브는 import/export 진입을 모바일에서 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route(`**/api/v1/projects/${project.id}/work-packages/export.csv`, (route) =>
    route.fulfill({
      body: 'subject,status\n워크패키지 API 구현,todo\n보드 뷰 구현,in_progress\n',
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'x-oneflow-row-count': '2',
        'x-oneflow-checksum': 'abc123',
      },
    }),
  )

  await page.goto('/operations')
  await expect(page.getByRole('heading', { name: '운영 허브' })).toBeVisible()
  await expect(page.getByLabel('데이터 작업').getByText('OneFlow 도입')).toBeVisible()
  await expect(page.getByRole('link', { name: /시스템 상태/ })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/operations-hub/mobile.png',
    fullPage: true,
  })

  await page.getByRole('link', { name: /가져오기/ }).click()
  await expect(page).toHaveURL(/ops=import/)
  await expect(page.getByRole('dialog', { name: 'CSV 가져오기' })).toBeVisible()
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page).not.toHaveURL(/ops=import/)

  await page.goto('/operations')
  const exportReq = page.waitForRequest((req) => req.url().includes('/work-packages/export.csv'))
  await page.getByRole('button', { name: /내보내기/ }).click()
  await exportReq
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
  await expect(page.getByText('위험 구역')).toBeVisible()

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
    state: 'in_progress',
    start_date: null,
    target_date: null,
    health: 'at_risk',
    health_note: '일정 검토 필요',
    health_updated_by: 'me-1',
    health_updated_at: '2026-07-08T00:00:00Z',
    is_mine: true,
    connected_project_count: 1,
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
  await page.route('**/api/v1/initiatives', (route) =>
    route.fulfill({ json: { items: [ini], total: 1 } }),
  )
  await page.route('**/api/v1/initiatives/ini-1/projects', (route) =>
    route.fulfill({ json: ini }),
  )
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

  // Health (Pass 44): chip renders; the creator report row PATCHes the pair.
  await expect(active.getByTitle('일정 검토 필요')).toHaveText('주의')
  const healthPatch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/initiatives/ini-1'),
  )
  await page.route('**/api/v1/initiatives/ini-1', (route) =>
    route.fulfill({ json: { ...ini, health: 'off_track' } }),
  )
  await page.getByLabel('플랫폼 개편 헬스').selectOption('off_track')
  await page.getByLabel('플랫폼 개편 상태 사유').fill('차단 발생')
  await page.getByRole('button', { name: '상태 보고' }).click()
  const healthSent = (await healthPatch).postDataJSON() as {
    health: string
    health_note: string
  }
  expect(healthSent).toEqual({ health: 'off_track', health_note: '차단 발생' })

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/initiatives/ini-1/projects'),
  )
  await page.getByLabel('플랫폼 개편에 프로젝트 연결').selectOption('p-2')
  const sent = (await post).postDataJSON() as { project_id: string }
  expect(sent.project_id).toBe('p-2')
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
  await page.getByLabel('지난 스프린트 미완료 이월').selectOption('cy-new')
  const sent = (await post).postDataJSON() as { target_cycle_id: string }
  expect(sent.target_cycle_id).toBe('cy-new')
  expect(dialogs[0]).toContain('미완료 작업 2건')
})

test('타입 관리에서 라벨을 바꾸고 비활성화하면 PATCH가 간다', async ({ page }) => {
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
    { id: 'pt-1', project_id: project.id, key: 'task', name: '작업', position: 0, is_active: true },
    { id: 'pt-2', project_id: project.id, key: 'bug', name: '버그', position: 1, is_active: true },
  ]
  await page.route(`**/api/v1/projects/${project.id}/types`, (route) =>
    route.fulfill({ json: { items: types, total: 2 } }),
  )
  await page.route(`**/api/v1/projects/${project.id}/types/pt-2`, (route) =>
    route.fulfill({ json: { ...types[1], name: '결함' } }),
  )

  await page.goto(`/projects/${project.id}/settings?tab=workflow`)
  await expect(page.getByText('워크 아이템 타입')).toBeVisible()

  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/types/pt-2'),
  )
  await page.getByLabel('bug 타입 이름').fill('결함')
  await page.getByLabel('bug 타입 이름').blur()
  expect(((await patch).postDataJSON() as { name: string }).name).toBe('결함')

  const toggle = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/types/pt-2'),
  )
  await page.getByLabel('bug 타입 활성').click()
  expect(((await toggle).postDataJSON() as { is_active: boolean }).is_active).toBe(false)
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
        errors: [{ row: 2, message: 'status: 허용되지 않는 값', raw: '나쁜 행,zzz' }],
        notes: [],
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

test('Jira CSV 가져오기: 소스 선택 시 jira 엔드포인트로 보내고 노트를 표시한다', async ({
  page,
}) => {
  await mockApi(page)
  const result: CsvImportResult = {
    dry_run: true,
    total_rows: 3,
    valid: 3,
    invalid: 0,
    inserted: 0,
    checksum: 'f1e2d3c4b5a6f7e8d9c0',
    errors: [],
    notes: [
      'Assignee/Reporter 값 2건은 매핑되지 않았습니다(계정 매칭 불가).',
      '무시된 열: Sprint',
    ],
  }
  await page.route(
    `**/api/v1/projects/${project.id}/work-packages/import/jira`,
    (route) => route.fulfill({ json: result }),
  )

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '가져오기', exact: true }).click()

  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('가져오기 소스').selectOption('jira')
  await drawer
    .getByLabel('CSV 붙여넣기')
    .fill('Issue key,Summary,Status,Assignee,Sprint\nPROJ-1,로그인 버그,In Progress,alice,S3\n')

  const jiraPost = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/work-packages/import/jira'),
  )
  await drawer.getByRole('button', { name: /미리보기/ }).click()
  expect(((await jiraPost).postDataJSON() as { dry_run: boolean }).dry_run).toBe(true)

  // adapter advisories: unmapped assignees and ignored columns surface as notes
  await expect(drawer.getByText('미리보기 (저장 안 됨)')).toBeVisible()
  await expect(drawer.getByText('Assignee/Reporter 값 2건', { exact: false })).toBeVisible()
  await expect(drawer.getByText('무시된 열: Sprint', { exact: false })).toBeVisible()

  // Linear source posts to /import/linear with the same request shape
  await page.route(`**/api/v1/projects/${project.id}/work-packages/import/linear`, (route) =>
    route.fulfill({ json: result }),
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
  await expect(page.getByRole('button', { name: '워크패키지 API 구현' })).toBeVisible()
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeVisible()

  // collapsing the parent removes the child row from view ('접기' exact to avoid
  // matching the '모두 접기' toolbar button)
  await page.getByRole('button', { name: '접기', exact: true }).click()
  await expect(page.getByRole('button', { name: '보드 뷰 구현' })).toBeHidden()
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
    ],
    total: 3,
    unread: 2,
  }
  await page.route('**/api/v1/me/notifications/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route('**/api/v1/me/notifications', (route) => route.fulfill({ json: inbox }))

  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '알림 2건 읽지 않음' }).click()
  await page.getByRole('button', { name: /인박스 열기/ }).click()
  await expect(page).toHaveURL(/\/inbox$/)

  await expect(page.getByRole('heading', { name: '인박스' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '읽지 않음' })).toBeVisible()
  await expect(page.getByText(/회원님을 배정했습니다/)).toBeVisible()
  await expect(page.getByText(/멘션했습니다/)).toBeVisible()
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/documents/d-77/work-package-links', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )

  await page.goto('/search')
  await page.getByLabel('전체 검색어').fill('구현')
  await page.getByRole('button', { name: '검색', exact: true }).click()

  // grouped sections with truncation notice on documents
  await expect(page.getByText('작업 1건')).toBeVisible()
  await expect(page.getByRole('button', { name: /워크패키지 API 구현/ })).toBeVisible()
  await expect(page.getByText('문서 1건')).toBeVisible()
  // content match (Pass 39): badge + plain-text snippet render as text nodes
  await expect(page.getByText('본문', { exact: true })).toBeVisible()
  await expect(page.getByText('배포 구현 절차를 정리한 본문입니다', { exact: false })).toBeVisible()
  await expect(page.getByText('더 있음', { exact: false })).toBeVisible()
  await expect(page.getByText('회의', { exact: true })).toBeHidden() // empty group hidden

  // navigation contract: a document result opens the editor
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
  await expect(page.getByText('배포 구현 절차를 정리한 본문입니다')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/search-discovery-ui/mobile.png',
    fullPage: true,
  })
})

test('커맨드 팔레트는 flag OFF에서 렌더링되지 않는다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/projects')
  await expect(page.getByRole('button', { name: '전체 검색 열기' })).toHaveCount(0)
  await page.keyboard.press('/')
  await expect(page.getByRole('dialog', { name: '전체 검색' })).toHaveCount(0)
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

test('커맨드 팔레트 단축키는 편집 필드를 침범하지 않는다', async ({ page }) => {
  await mockApi(page)
  await enableCommandPalette(page)
  await mockCommandPaletteSearch(page)
  await page.goto(`/projects/${project.id}/work-packages`)

  await page.getByLabel('워크패키지 검색').focus()
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

  await page.getByRole('button', { name: '현재 보기 초기화' }).click()
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

test('드로어에서 담당자를 배정하면 PATCH에 assignee_id가 담긴다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  // The list has an assignee column.
  await expect(page.getByRole('columnheader', { name: '담당자' })).toBeVisible()
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')
  const patch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes(`/work-packages/${wpA.id}`),
  )
  await drawer.getByLabel('담당자').selectOption({ label: 'Alex Kim' })
  const req = await patch
  expect((req.postDataJSON() as { assignee_id?: string }).assignee_id).toBe('u-alex')
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
  await expect(page.getByRole('region', { name: '워크플로우 거버넌스' })).toBeVisible()
  await expect(page.getByLabel('in_review 상태 이름')).toHaveValue('검토 중')
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
    route.fulfill({ json: { items: [doc], total: 1 } }),
  )
  await page.route('**/api/v1/documents/d1', (route) =>
    route.fulfill({ json: { ...doc, body: '<p>온보딩 가이드</p>' } }),
  )
  await page.route('**/api/v1/documents/d1/comments', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
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
  await expect(page.getByText('Content surface')).toBeVisible()
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
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
  await page.route(`**/api/v1/projects/${project.id}/documents`, (route) =>
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
  await expect(page.getByText('조건에 맞는 작업이 없습니다')).toBeVisible()
  await expect(page.getByText('필터를 조정하거나 새 작업을 만들어 보세요.')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '../../docs/screenshots/web-empty.png', fullPage: true })
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/states-mobile/empty-list.png',
    fullPage: true,
  })
})

test('목록 로딩 스켈레톤은 모바일에서 콘텐츠 폭을 넘지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/v1/projects/*/work-packages**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750))
    await route.fulfill({ json: workPackages })
  })

  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByRole('status', { name: '불러오는 중' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/states-mobile/list-skeleton.png',
    fullPage: true,
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
  await page.screenshot({
    path: '../../docs/screenshots/redevelopment/states-mobile/error-list.png',
    fullPage: true,
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
  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByText('두 번째 페이지 작업')).toBeVisible()
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
  // Minimal mocks for the create-then-navigate target page.
  await page.route('**/api/v1/projects/p-new/work-packages**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies WorkPackageList }),
  )
  await page.route('**/api/v1/projects/p-new/saved-filters', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/projects/p-new/statuses', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
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
  await expect(page).toHaveURL(/\/projects\/p-new\/work-packages/)
})

test('마일스톤 패널이 진행 바와 삭제 확인 문구를 보여준다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
    }),
  )
  await page.route(`**/api/v1/projects/${project.id}`, (route) =>
    route.fulfill({ json: project }),
  )
  await page.route(`**/api/v1/projects/${project.id}/milestones`, (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'ms-1',
            project_id: project.id,
            name: '1차 출시',
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
  await expect(page.getByText('1차 출시')).toBeVisible()
  await expect(page.getByText('3/4')).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '1차 출시 진행률' })).toBeVisible()

  // delete confirm carries the assignment-release wording (never silent)
  const dialogs: string[] = []
  page.once('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  await page.getByLabel('1차 출시 삭제').click()
  await expect
    .poll(() => dialogs[0] ?? '')
    .toContain('연결된 작업 4건은 삭제되지 않고 배정만 해제됩니다')
})

test('시스템 상태 페이지가 버전과 구성 카드를 보여준다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/ops/status', (route) =>
    route.fulfill({
      json: {
        version: '0.1.0',
        database: { status: 'ok', current_revision: '0039' },
        counts: { projects: 3, work_packages: 42 },
        config: {
          auth_mode: 'dev',
          ai_summary_enabled: false,
          storage_backend: 'local',
          upload_max_bytes: 10485760,
          project_storage_quota_bytes: 1073741824,
        },
      },
    }),
  )
  await page.goto('/status')
  await expect(page.getByRole('heading', { name: '시스템 상태' })).toBeVisible()
  await expect(page.getByText('0.1.0')).toBeVisible()
  await expect(page.getByText('0039')).toBeVisible()
  await expect(page.getByText('42')).toBeVisible()
  await expect(page.getByText('10 MiB')).toBeVisible()
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

test('로그인 화면에서 이메일 로그인 후 이동하고 OIDC 모드는 안내만 보인다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      json: { user_id: 'me-1', email: 'dev@oneflow.local', display_name: 'Dev User' },
    }),
  )

  await page.goto('/login?next=/projects')
  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/auth/login'),
  )
  await page.getByLabel('이메일').fill('dev@oneflow.local')
  await page.getByRole('button', { name: '로그인' }).click()
  expect(((await post).postDataJSON() as { email: string }).email).toBe('dev@oneflow.local')
  await expect(page).toHaveURL(/\/projects$/)

  // OIDC mode: guidance only, no form (real IdP not wired — 501 policy).
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'oidc',
        oidc_issuer: 'https://idp.example.com',
        oidc_client_id: 'oneflow',
        has_client_secret: true,
        command_palette_enabled: false,
      },
    }),
  )
  await page.goto('/login')
  await expect(page.getByText('SSO(OIDC) 인증 모드입니다.')).toBeVisible()
  await expect(page.getByText('발급자: https://idp.example.com')).toBeVisible()
  await expect(page.getByLabel('이메일')).toBeHidden()
})

test('Topbar 계정 메뉴가 계정을 보여주고 로그아웃 POST 후 로그인으로 이동한다', async ({
  page,
}) => {
  await mockApi(page)
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }))

  await page.goto('/projects')
  await page.getByLabel('계정 메뉴').click()
  await expect(page.getByRole('menu', { name: '계정' })).toBeVisible()
  await expect(page.getByRole('menu', { name: '계정' }).getByText('dev@oneflow.local')).toBeVisible()

  const post = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().includes('/auth/logout'),
  )
  await page.getByRole('menuitem', { name: '로그아웃' }).click()
  await post
  await expect(page).toHaveURL(/\/login/)
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
  await page.getByRole('link', { name: '사용자 관리' }).click()
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
  await page.getByRole('button', { name: '전체' }).click()

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
            state: 'in_progress',
            start_date: null,
            target_date: null,
            health: null,
            health_note: null,
            health_updated_by: null,
            health_updated_at: null,
            is_mine: true,
            connected_project_count: 1,
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
  await expect(page.getByRole('heading', { name: '프로젝트' })).toBeVisible()
  await expect(page.getByLabel('프로젝트 요약')).toContainText('열린 작업')
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
  await page.getByRole('link', { name: '리포트' }).click()
  await expect(page.getByRole('heading', { name: '포트폴리오 리포트' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'OneFlow 도입' })).toBeVisible()
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
            state: 'in_progress',
            start_date: null,
            target_date: null,
            health: 'at_risk',
            health_note: '일정 검토 필요',
            health_updated_by: 'me-1',
            health_updated_at: '2026-07-08T00:00:00Z',
            is_mine: true,
            connected_project_count: 2,
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
