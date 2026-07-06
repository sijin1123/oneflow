import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCalendar, shiftMonth } from './calendar.ts'
import type { WorkPackage } from './types.ts'

function wp(id: string, due: string | null): WorkPackage {
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
    start_date: null,
    due_date: due,
    estimated_hours: null,
    version: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

test('buildCalendar builds a Sunday-first grid covering the whole month', () => {
  // 2026-07-01 is a Wednesday; July has 31 days → 5 weeks
  const cal = buildCalendar(2026, 7, [])
  assert.equal(cal.weeks.length, 5)
  assert.equal(cal.weeks[0].length, 7)
  // first row starts on Sunday 2026-06-28 (padding), first in-month cell is the 1st
  assert.equal(cal.weeks[0][0].iso, '2026-06-28')
  assert.equal(cal.weeks[0][0].inMonth, false)
  const first = cal.weeks.flat().find((d) => d.iso === '2026-07-01')!
  assert.equal(first.inMonth, true)
  assert.equal(first.day, 1)
})

test('a work package lands on its due date by string match, no TZ drift', () => {
  const cal = buildCalendar(2026, 7, [wp('a', '2026-07-15'), wp('b', '2026-07-15'), wp('c', null)])
  const cell = cal.weeks.flat().find((d) => d.iso === '2026-07-15')!
  assert.equal(cell.items.length, 2)
  // undated WP appears nowhere
  assert.ok(!cal.weeks.flat().some((d) => d.items.some((i) => i.id === 'c')))
})

test('shiftMonth normalizes year rollover in both directions', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 })
  assert.deepEqual(shiftMonth(2026, 7, 0), { year: 2026, month: 7 })
})
