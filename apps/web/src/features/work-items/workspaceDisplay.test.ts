import assert from 'node:assert/strict'
import test from 'node:test'

import type { SearchResultItem } from '@/features/search/api'

import {
  DEFAULT_WORKSPACE_COLUMNS,
  buildWorkspaceGroups,
  parseWorkspaceColumns,
  serializeWorkspaceColumns,
  workspaceBoardGroupKey,
  workspaceBoardTarget,
} from './workspaceDisplay.ts'

function item(overrides: Partial<SearchResultItem>): SearchResultItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    project_id: 'project-1',
    project_key: 'ONE',
    project_name: 'OneFlow',
    subject: '작업',
    status: 'todo',
    priority: 'medium',
    type: 'task',
    due_date: null,
    matched_in: 'primary',
    snippet: null,
    ...overrides,
    version: overrides.version ?? 0,
    current_user_can_write: overrides.current_user_can_write ?? false,
  }
}

test('workspace columns preserve first valid URL occurrence order', () => {
  assert.deepEqual(parseWorkspaceColumns('due,status,status,unknown,project,due'), ['due', 'status', 'project'])
  assert.deepEqual(parseWorkspaceColumns('unknown'), DEFAULT_WORKSPACE_COLUMNS)
  assert.deepEqual(parseWorkspaceColumns(''), DEFAULT_WORKSPACE_COLUMNS)
  assert.equal(serializeWorkspaceColumns(['status', 'due']), 'status,due')
})

test('workspace groups honor empty state groups and dynamic assignees', () => {
  const items = [
    item({ status: 'todo', assignee_id: 'user-1', assignee_name: '김민지' }),
    item({ id: '2', status: 'done', priority: 'urgent' }),
  ]
  assert.deepEqual(buildWorkspaceGroups(items, 'state', false).map((group) => group.key), ['unstarted', 'completed'])
  assert.equal(buildWorkspaceGroups(items, 'state', true).length, 4)
  assert.deepEqual(buildWorkspaceGroups(items, 'assignee', false).map((group) => group.label), ['김민지', '미배정'])
})

test('every workspace grouping preserves each authorized result exactly once', () => {
  const items = [
    item({ id: '1', status: 'backlog', priority: 'low', assignee_id: 'user-1', assignee_name: '김민지' }),
    item({ id: '2', project_id: 'project-2', project_name: '운영', status: 'in_review', priority: 'urgent' }),
    item({ id: '3', status: 'done', priority: 'none' }),
  ]
  for (const groupBy of ['state', 'priority', 'project', 'assignee', 'none'] as const) {
    const ids = buildWorkspaceGroups(items, groupBy, false)
      .flatMap((group) => group.items.map((entry) => entry.id))
      .sort()
    assert.deepEqual(ids, ['1', '2', '3'])
  }
})

test('workspace board maps only truthful state and priority drop targets', () => {
  const review = item({ status: 'in_review', priority: 'high' })
  assert.equal(workspaceBoardGroupKey(review, 'state'), 'started')
  assert.equal(workspaceBoardGroupKey(review, 'priority'), 'high')
  assert.equal(workspaceBoardGroupKey(review, 'project'), null)

  assert.deepEqual(workspaceBoardTarget('state', 'backlog'), { property: 'status', value: 'backlog' })
  assert.deepEqual(workspaceBoardTarget('state', 'started'), { property: 'status', value: 'in_progress' })
  assert.deepEqual(workspaceBoardTarget('state', 'completed'), { property: 'status', value: 'done' })
  assert.deepEqual(workspaceBoardTarget('priority', 'low'), { property: 'priority', value: 'low' })
  assert.equal(workspaceBoardTarget('state', 'unknown'), null)
  assert.equal(workspaceBoardTarget('project', 'project-1'), null)
  assert.equal(workspaceBoardTarget('assignee', 'user-1'), null)
})
