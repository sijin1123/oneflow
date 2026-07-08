/* Playwright UI smoke (PLAN §1.3 #15 / §8): app shell renders, lists show,
   drawer opens, status PATCH carries expected_version, 409 triggers the
   notify+reload path, date-only strings survive display.

   All API responses are mocked with fixtures TYPED against the app's contract
   types — contract drift fails `npm run typecheck` (PLAN §8). */

import { expect, test, type Page } from '@playwright/test'

import type { Project, ProjectList } from '../src/features/projects/types'
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
  created_by: 'u-dev',
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
  ],
  total: 1,
}
const noComments: CommentList = { items: [], total: 0 }

async function mockApi(page: Page, opts: { conflictOnPatch?: boolean } = {}) {
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: projects }),
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
      json: { auth_mode: 'dev', oidc_issuer: null, oidc_client_id: null, has_client_secret: false },
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
          { user_id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', role: 'owner' },
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

  const patchRequest = page.waitForRequest(
    (req) => req.method() === 'PATCH' && req.url().includes(`/work-packages/${wpA.id}`),
  )
  await statusSelect.selectOption('in_progress')
  const req = await patchRequest
  const body = req.postDataJSON() as { expected_version: number; status: string }
  expect(body.expected_version).toBe(0) // integer token echoed exactly (§6.2)
  expect(body.status).toBe('in_progress')
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
  await expect(drawer.getByText('작업을 생성했습니다')).toBeVisible() // activity feed
  await expect(drawer.getByText('만든 사람: Dev User', { exact: false })).toBeVisible()

  const commentPost = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes(`/work-packages/${wpA.id}/comments`),
  )
  await drawer.getByLabel('댓글 입력').fill('검토 완료했습니다')
  await drawer.getByRole('button', { name: '댓글 추가' }).click()
  const req = await commentPost
  expect((req.postDataJSON() as { body: string }).body).toBe('검토 완료했습니다')

  // 첨부 section shows the anchored file with a download affordance
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

test('댓글 멘션: 멤버 체크 후 작성하면 mentioned_user_ids를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  await page.getByRole('button', { name: '워크패키지 API 구현' }).click()
  const drawer = page.getByRole('dialog')

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
        type_counts: [],
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
  await expect(page.getByText('전체 작업')).toBeVisible()
  await expect(page.getByText('최근 활동')).toBeVisible()
  await expect(page.getByText('기한 초과')).toBeVisible()
  await expect(page.getByText('10.5 / 40h')).toBeVisible()
  await expect(page.getByText('상태별')).toBeVisible()

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
    'recent_activity',
  ])
})

test('타임라인이 일정이 있는 작업을 막대로 그린다', async ({ page }) => {
  await mockApi(page)
  // one drawable dependency + one whose endpoint has no bar (omitted note)
  await page.route(`**/api/v1/projects/${project.id}/relations**`, (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'rel-1', source_id: wpA.id, target_id: wpB.id, relation_type: 'precedes' },
          { id: 'rel-2', source_id: wpA.id, target_id: 'ghost-wp', relation_type: 'blocks' },
        ],
        total: 2,
        truncated: false,
      },
    }),
  )
  await page.goto(`/projects/${project.id}/timeline`)
  await expect(page.getByRole('button', { name: '워크패키지 API 구현 일정' })).toBeVisible()
  await expect(page.getByTestId('dep-connector')).toHaveCount(1)
  await expect(page.getByText('일정 미정으로 표시되지 않은 의존 1건', { exact: false })).toBeVisible()
  await expect(page.getByText('2026.07')).toBeVisible() // month header from start/due dates

  // Zoom (Pass 36): fixed levels set an explicit content width; the choice
  // survives a reload via localStorage.
  const content = page.getByTestId('timeline-content')
  await expect(content).not.toHaveAttribute('style', /width/)
  await page.getByRole('button', { name: '일', exact: true }).click()
  await expect(content).toHaveAttribute('style', /width/)
  await page.reload()
  await expect(page.getByTestId('timeline-content')).toHaveAttribute('style', /width/)
  await page.getByRole('button', { name: '자동', exact: true }).click()
  await expect(page.getByTestId('timeline-content')).not.toHaveAttribute('style', /width/)
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
  await mockApi(page)
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
  const dueSoon = page.getByRole('region', { name: '기한 임박' })
  await expect(dueSoon.getByText(wpA.subject)).toBeVisible()
  await expect(page.getByRole('region', { name: '최근 활동' }).getByText(/생성/)).toBeVisible()

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
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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

test('모듈 페이지가 상태 그룹·리드·진행률을 보여주고 소유자가 생성한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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

test('설정 알림 탭에서 토글이 PUT을 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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

  await page.goto(`/projects/${project.id}/settings?tab=notifications`)
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

test('위험 구역에서 보관 확인 후 POST /archive를 보낸다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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

test('설정 필드 탭에서 드롭다운 필드를 정의한다', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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
  await page.getByLabel('멤버 열 표시').uncheck()
  await expect(page.getByText('멤버 1')).toBeHidden()
  await page.reload()
  await expect(page.getByText('2건')).toBeVisible()
  await expect(page.getByText('멤버 1')).toBeHidden() // restored from storage
  await page.getByLabel('멤버 열 표시').check()

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
  await page.getByRole('button', { name: '검색' }).click()

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
  await page.getByRole('button', { name: '표시 열' }).click()
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
            name: '검수 시 긴급',
            trigger_type: 'status_changed_to',
            trigger_value: 'in_review',
            action_type: 'set_priority',
            action_value: 'urgent',
            is_active: true,
            last_fired_at: '2026-07-06T09:00:00Z',
            fired_count: 3,
          },
        ],
        total: 1,
      },
    })
  })
  await page.route(`**/api/v1/projects/${project.id}/automation-rules/r1`, (route) =>
    route.fulfill({ json: { id: 'r1' } }),
  )
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

  // inline edit sends a partial PATCH with the changed value only
  const rulePatch = page.waitForRequest(
    (r) => r.method() === 'PATCH' && r.url().includes('/automation-rules/r1'),
  )
  await page.getByLabel('검수 시 긴급 우선순위 값').selectOption('high')
  expect(((await rulePatch).postDataJSON() as { action_value: string }).action_value).toBe('high')

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

test('제목순 정렬 선택이 목록 쿼리에 sort=subject를 반영한다', async ({ page }) => {
  await mockApi(page)
  await page.goto(`/projects/${project.id}/work-packages`)
  const req = page.waitForRequest(
    (r) => r.url().includes('/work-packages') && r.url().includes('sort=subject'),
  )
  await page.getByLabel('정렬').selectOption('subject')
  await req
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

test('문서 트리가 계층을 들여쓰기로 보여주고 상위 페이지 변경을 저장한다', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: /설치 방법/ })).toBeVisible()

  // collapsing the root hides its child ('접기' toggle exists only on branches)
  await page.getByRole('button', { name: '접기' }).click()
  await expect(page.getByRole('button', { name: /설치 방법/ })).toBeHidden()
  await page.getByRole('button', { name: '펼치기' }).click()
  await expect(page.getByRole('button', { name: /설치 방법/ })).toBeVisible()

  // editor: parent select excludes the doc itself and saves parent_id
  await page.getByRole('button', { name: /회의록/ }).click()
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
  await page.getByRole('button', { name: /스프린트 회의/ }).click()

  await expect(page.getByLabel('회의 제목')).toHaveValue('스프린트 회의')
  await expect(page.getByText('배포 점검')).toBeVisible()
  await expect(page.getByLabel('안건')).toBeVisible()

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

test('빈 목록은 빈 상태를 보여준다', async ({ page }) => {
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { items: [{ ...project, ...projectRollups }], total: 1 } satisfies ProjectList }),
  )
  await page.route('**/api/v1/projects/*/work-packages**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } satisfies WorkPackageList }),
  )
  await page.route('**/api/v1/projects/*/saved-filters', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/api/v1/me/notifications', (route) =>
    route.fulfill({ json: { items: [], total: 0, unread: 0 } }),
  )
  await page.goto(`/projects/${project.id}/work-packages`)
  await expect(page.getByText('조건에 맞는 작업이 없습니다')).toBeVisible()
  await page.screenshot({ path: '../../docs/screenshots/web-empty.png', fullPage: true })
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
      json: { id: 'u-dev', email: 'dev@oneflow.local', display_name: 'Dev User', is_active: true },
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
  const names = page.locator('ul > li p.truncate')
  await expect(names.first()).toContainText('알파') // server order by default

  await page.getByLabel('프로젝트 정렬').selectOption('overdue_count')
  await page.getByLabel(/정렬 방향/).click() // asc → desc
  await expect(names.first()).toContainText('베타') // 5 overdue first
  await page.getByLabel(/정렬 방향/).click() // back to asc
  await expect(names.first()).toContainText('알파')
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
  await page.getByLabel('이니셔티브 열 표시').check()
  await expect(page.getByRole('button', { name: '플랫폼 전략' })).toBeVisible()
  await expect(page.getByText('외 2')).toBeVisible()

  await page.getByRole('button', { name: '플랫폼 전략' }).click()
  await expect(page).toHaveURL(/\/initiatives\?highlight=ini-9/)
  // The target card carries the highlight ring.
  await expect(page.locator('li.ring-1', { hasText: '플랫폼 전략' })).toBeVisible()
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
