import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ProjectListItem } from '../projects/types.ts'
import { countWorkspaceRiskProjects, rankWorkspaceRiskProjects } from './workspaceRisk.ts'

function project(name: string, extra: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: name,
    key: name.toUpperCase().slice(0, 3),
    name,
    description: null,
    cover_attachment_id: null,
    budget: null,
    archived_at: null,
    health: null,
    health_note: null,
    health_updated_by: null,
    health_updated_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    work_package_count: 0,
    open_work_package_count: 0,
    overdue_count: 0,
    member_count: 0,
    current_user_role: 'owner',
    initiatives: [],
    initiative_overflow: 0,
    ...extra,
  }
}

test('위험 순위는 활성 프로젝트의 health를 기한 초과보다 우선한다', () => {
  const items = [
    project('기한 초과', { health: 'on_track', overdue_count: 9 }),
    project('주의', { health: 'at_risk', overdue_count: 1 }),
    project('위험', { health: 'off_track' }),
    project('정상'),
    project('보관', {
      archived_at: '2026-07-10T00:00:00Z',
      health: 'off_track',
      overdue_count: 99,
    }),
  ]

  assert.deepEqual(
    rankWorkspaceRiskProjects(items).map((item) => item.name),
    ['위험', '주의', '기한 초과'],
  )
  assert.equal(countWorkspaceRiskProjects(items), 3)
})

test('같은 위험 단계는 기한 초과, 열린 작업, 이름 순이며 결과를 5개로 제한한다', () => {
  const items = [
    project('바', { health: 'at_risk', overdue_count: 1, open_work_package_count: 2 }),
    project('가', { health: 'at_risk', overdue_count: 3, open_work_package_count: 1 }),
    project('나', { health: 'at_risk', overdue_count: 1, open_work_package_count: 7 }),
    project('다', { health: 'at_risk', overdue_count: 1, open_work_package_count: 7 }),
    project('라', { health: 'at_risk' }),
    project('마', { health: 'at_risk' }),
  ]
  const originalOrder = items.map((item) => item.name)

  assert.deepEqual(
    rankWorkspaceRiskProjects(items).map((item) => item.name),
    ['가', '나', '다', '바', '라'],
  )
  assert.deepEqual(items.map((item) => item.name), originalOrder)
  assert.deepEqual(rankWorkspaceRiskProjects(items, 0), [])
})
