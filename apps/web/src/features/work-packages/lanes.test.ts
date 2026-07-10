import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLanes } from './lanes.ts'
import type { WorkPackage } from './types.ts'

function wp(id: string, assignee: string | null, priority: WorkPackage['priority']): WorkPackage {
  return {
    id,
    project_id: 'p',
    subject: id,
    description: null,
    type: 'task',
    status: 'todo',
    priority,
    assignee_id: assignee,
    parent_id: null,
    milestone_id: null,
    cycle_id: null,
    module_id: null,
    start_date: null,
    due_date: null,
    estimated_hours: null,
    created_by: null,
    version: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const name = (id: string | null) => (id === 'u1' ? '김개발' : id === 'u2' ? '이디자' : '미배정')

test('assignee lanes sort by name with unassigned last; empty lanes never appear', () => {
  const lanes = buildLanes(
    [wp('a', 'u2', 'high'), wp('b', null, 'low'), wp('c', 'u1', 'none')],
    'assignee',
    name,
  )
  assert.deepEqual(
    lanes.map((l) => l.label),
    ['김개발', '이디자', '미배정'],
  )
  assert.equal(lanes.every((l) => l.items.length > 0), true)
})

test('priority lanes follow the fixed urgency order', () => {
  const lanes = buildLanes(
    [wp('a', null, 'low'), wp('b', null, 'urgent'), wp('c', null, 'low')],
    'priority',
    name,
  )
  assert.deepEqual(
    lanes.map((l) => l.key),
    ['urgent', 'low'],
  )
  assert.equal(lanes[1].items.length, 2)
})

test("laneBy 'none' is a single unlabeled lane", () => {
  const lanes = buildLanes([wp('a', null, 'low')], 'none', name)
  assert.equal(lanes.length, 1)
  assert.equal(lanes[0].label, '')
})
