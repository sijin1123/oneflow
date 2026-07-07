import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTimeline, dayIndex, monthLabel } from './timeline.ts'
import type { WorkPackage } from './types.ts'

function wp(id: string, start: string | null, due: string | null): WorkPackage {
  return {
    id,
    project_id: 'p',
    subject: id,
    description: null,
    type: 'task',
    status: 'todo',
    priority: 'none',
    assignee_id: null,
    parent_id: null,
    milestone_id: null,
  cycle_id: null,
  module_id: null,
    start_date: start,
    due_date: due,
    estimated_hours: null,
    created_by: null,
    version: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test('dayIndex parses YYYY-MM-DD as a UTC day index', () => {
  assert.equal(dayIndex(null), null)
  assert.equal(dayIndex('bad'), null)
  const a = dayIndex('2026-07-01')!
  const b = dayIndex('2026-07-11')!
  assert.equal(b - a, 10) // exactly 10 calendar days, timezone-independent
})

test('buildTimeline returns null when nothing is dated', () => {
  assert.equal(buildTimeline([wp('a', null, null)]), null)
})

test('buildTimeline separates dated bars from undated and pads the range', () => {
  const model = buildTimeline([
    wp('a', '2026-07-01', '2026-07-10'),
    wp('b', '2026-07-05', null), // single-date -> point
    wp('c', null, null), // undated
  ])
  assert.ok(model)
  assert.equal(model!.bars.length, 2)
  assert.equal(model!.undated.length, 1)
  assert.equal(model!.undated[0].id, 'c')
  const bBar = model!.bars.find((x) => x.wp.id === 'b')!
  assert.equal(bBar.point, true)
  assert.equal(bBar.startIdx, bBar.endIdx)
  // 2-day pad on each side
  assert.equal(model!.rangeStart, dayIndex('2026-07-01')! - 2)
  assert.equal(model!.rangeEnd, dayIndex('2026-07-10')! + 2)
})

test('buildTimeline widens the range to include extra days (milestones/today)', () => {
  const base = [wp('a', '2026-07-01', '2026-07-10')]
  const future = dayIndex('2026-08-15')! // a milestone well after the WP due date
  const model = buildTimeline(base, [future])
  assert.ok(model)
  // the range now extends to (and pads past) the milestone day
  assert.equal(model!.rangeEnd, future + 2)
  // an extra day inside the existing span doesn't shrink or move the start
  const inside = buildTimeline(base, [dayIndex('2026-07-05')!])
  assert.equal(inside!.rangeStart, dayIndex('2026-07-01')! - 2)
})

test('monthLabel formats a UTC day index', () => {
  assert.equal(monthLabel(dayIndex('2026-07-01')!), '2026.07')
})
