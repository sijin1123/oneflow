import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sortProjects } from './sort.ts'
import type { ProjectListItem } from './types.ts'

function p(name: string, extra: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: name,
    key: name.toUpperCase().slice(0, 3),
    name,
    description: null,
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
    initiatives: [],
    initiative_overflow: 0,
    ...extra,
  }
}

test('default keeps the server order; count keys sort with name tie-break', () => {
  const items = [p('나', { overdue_count: 2 }), p('가', { overdue_count: 5 }), p('다', { overdue_count: 2 })]
  assert.deepEqual(sortProjects(items, 'default', 'asc'), items)
  assert.deepEqual(
    sortProjects(items, 'overdue_count', 'desc').map((x) => x.name),
    ['가', '나', '다'], // 5 first; the 2s tie-break by name asc
  )
})

test('health sorts unset LAST in both directions', () => {
  const items = [p('셋'), p('둘', { health: 'off_track' }), p('하나', { health: 'on_track' })]
  assert.deepEqual(sortProjects(items, 'health', 'asc').map((x) => x.name), ['하나', '둘', '셋'])
  assert.deepEqual(sortProjects(items, 'health', 'desc').map((x) => x.name), ['둘', '하나', '셋'])
})
