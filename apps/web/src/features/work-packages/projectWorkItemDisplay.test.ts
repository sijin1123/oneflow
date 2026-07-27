import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkPackage } from './types.ts'
import {
  buildProjectWorkItemGroups,
  parseProjectWorkItemGroup,
  serializeProjectWorkItemGroup,
} from './projectWorkItemDisplay.ts'

const items = [
  workItem('a', 'backlog', 'high'),
  workItem('b', 'in_progress', 'low'),
  workItem('c', 'backlog', 'high'),
]

test('project work item grouping canonicalizes invalid and default URL values', () => {
  assert.equal(parseProjectWorkItemGroup(null), 'status')
  assert.equal(parseProjectWorkItemGroup('priority'), 'priority')
  assert.equal(parseProjectWorkItemGroup('unknown'), 'status')
  assert.equal(serializeProjectWorkItemGroup('status'), null)
  assert.equal(serializeProjectWorkItemGroup('none'), 'none')
})

test('status grouping keeps canonical empty groups and every item exactly once', () => {
  const groups = buildProjectWorkItemGroups(items, 'status', (status) => `상태:${status}`)
  assert.deepEqual(groups.map((group) => group.key), [
    'backlog',
    'todo',
    'in_progress',
    'in_review',
    'done',
    'cancelled',
  ])
  assert.deepEqual(groups[0].items.map((item) => item.id), ['a', 'c'])
  assert.equal(groups[1].items.length, 0)
  assert.deepEqual(groups.flatMap((group) => group.items).map((item) => item.id).sort(), [
    'a',
    'b',
    'c',
  ])
  assert.deepEqual(groups[0].prefill, { status: 'backlog' })
})

test('priority and ungrouped layouts preserve server result order', () => {
  const priority = buildProjectWorkItemGroups(items, 'priority', String)
  assert.deepEqual(priority.find((group) => group.key === 'high')?.items.map((item) => item.id), [
    'a',
    'c',
  ])
  assert.deepEqual(priority.find((group) => group.key === 'high')?.prefill, { priority: 'high' })
  assert.deepEqual(
    buildProjectWorkItemGroups(items, 'none', String)[0].items.map((item) => item.id),
    ['a', 'b', 'c'],
  )
})

function workItem(
  id: string,
  status: WorkPackage['status'],
  priority: WorkPackage['priority'],
): WorkPackage {
  return {
    id,
    project_id: 'project',
    subject: id,
    description: null,
    type: 'task',
    status,
    priority,
    assignee_id: null,
    parent_id: null,
    milestone_id: null,
    customer_id: null,
    cycle_id: null,
    module_id: null,
    start_date: null,
    due_date: null,
    estimated_hours: null,
    created_by: null,
    version: 1,
    created_at: '2026-07-27T00:00:00Z',
    updated_at: '2026-07-27T00:00:00Z',
  }
}
